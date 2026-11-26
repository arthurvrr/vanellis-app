import { describe, expect, it } from 'vitest';
import {
  duplicateProduct,
  emptyGroup,
  pdvWarning,
  emptyOption,
  productFromTemplate,
  validateProduct,
  type GroupForm,
  type ProductForm,
} from './produtoForm';

const base = (p: Partial<ProductForm> = {}): ProductForm => ({
  ...productFromTemplate(null, 1),
  name: 'Coxinha',
  basePrice: 1.6,
  minQuantity: 25,
  pdvCode: '1001',
  imageUrl: '/p.webp',
  ...p,
});
const opt = (name: string, o: Partial<ReturnType<typeof emptyOption>> = {}) => ({ ...emptyOption(), name, ...o });

describe('validação do cadastro de produto', () => {
  it('produto simples válido, sem avisos', () => {
    expect(validateProduct(base())).toEqual({ errors: [], warnings: [] });
  });

  it('sem código PDV e sem foto são só avisos', () => {
    const r = validateProduct(base({ pdvCode: null, imageUrl: null }));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['Produto sem código PDV', 'Produto sem foto']);
  });

  it('C55: produto por quilo sem peso não salva', () => {
    const r = validateProduct(base({ saleUnit: 'KG', basePrice: 79.9 }));
    expect(r.errors.join()).toContain('precisa de faixa de peso');
  });

  it('C56: grupo de tamanhos com peso resolve o peso do produto por quilo', () => {
    const tamanho = {
      ...emptyGroup(),
      name: 'Tamanho',
      hasWeight: true,
      options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 1.2 }), opt('Grande', { weightMinKg: 2.5, weightMaxKg: 3 })],
    };
    expect(validateProduct(base({ saleUnit: 'KG', basePrice: 79.9, groups: [tamanho] })).errors).toEqual([]);
    const semPeso = { ...tamanho, options: [opt('Mini')] };
    expect(validateProduct(base({ saleUnit: 'KG', basePrice: 79.9, groups: [semPeso] })).errors).toContain(
      'Grupo 1 (Tamanho), opção Mini: informe a faixa de peso',
    );
  });

  it('C57: grupo que troca o preço dispensa o preço base e exige preço nas opções', () => {
    const tamanho = { ...emptyGroup(), name: 'Tamanho', priceMode: 'replace' as const, options: [opt('Mini', { price: 4.9 }), opt('Tradicional')] };
    const r = validateProduct(base({ basePrice: null, groups: [tamanho] }));
    expect(r.errors).toEqual(['Grupo 1 (Tamanho), opção Tradicional: informe o preço']);
  });

  it('C58: regras dos grupos', () => {
    const g = (name: string, x: Partial<ReturnType<typeof emptyGroup>>) => ({ ...emptyGroup(), name, options: [opt('A', { price: 1 })], ...x });
    const r = validateProduct(
      base({
        groups: [
          g('Tamanho', { priceMode: 'replace', controlsImage: true }),
          g('Sabor', { priceMode: 'replace', controlsImage: true }),
          g('Vazio', { options: [] }),
          g('Dupla', { options: [opt('Chocolate'), opt('chocolate')] }),
          g('Escolhas', { minSelect: 3, maxSelect: 2 }),
        ],
      }),
    );
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'Só um grupo pode trocar o preço',
        'Só um grupo pode trocar a foto',
        'Grupo 3 (Vazio): adicione ao menos uma opção',
        'Grupo 4 (Dupla): duas opções com o nome "chocolate"',
        'Grupo 5 (Escolhas): o mínimo de escolhas é maior que o máximo',
      ]),
    );
  });

  it('C54: código repetido no mesmo produto e formato inválido', () => {
    const sabor = { ...emptyGroup(), name: 'Sabor', hasPdv: true, options: [opt('A', { pdvCode: '1001' })] };
    expect(validateProduct(base({ groups: [sabor] })).errors).toContain('Código PDV 1001 repetido neste produto');
    expect(validateProduct(base({ pdvCode: 'cód 1' })).errors[0]).toContain('inválido');
  });

  it('produto por quilo não aceita código nas opções', () => {
    const tamanho = { ...emptyGroup(), name: 'Tamanho', hasWeight: true, hasPdv: true, options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 1.2 })] };
    expect(validateProduct(base({ saleUnit: 'KG', groups: [tamanho] })).errors).toContain(
      'Grupo 1 (Tamanho): produto por quilo usa um código só, no produto',
    );
  });

  it('C60: modelo "Quilo com tamanho" vem por quilo com o grupo de peso', () => {
    const p = productFromTemplate(
      { saleUnit: 'KG', groups: [{ name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, controlsImage: false, hasWeight: true, definesPdvCode: false }] },
      2,
    );
    expect(p).toMatchObject({ saleUnit: 'KG', categoryId: 2, groups: [{ name: 'Tamanho', hasWeight: true, options: [] }] });
  });

  it('C61: duplicar tira ids e códigos e deixa indisponível', () => {
    const p = base({ groups: [{ ...emptyGroup(), id: 7, name: 'Sabor', hasPdv: true, options: [opt('A', { id: 9, pdvCode: '2001', price: null })] }] });
    const c = duplicateProduct(p);
    expect(c).toMatchObject({ name: 'Coxinha (cópia)', pdvCode: null, available: false });
    expect(c.groups[0]).not.toHaveProperty('id');
    expect(c.groups[0]!.options[0]).not.toHaveProperty('id');
    expect(c.groups[0]!.options[0]!.pdvCode).toBeNull();
  });
});

// Grupo pronto para os testes abaixo: nome, uma opção com preço e o resto do emptyGroup().
const grupo = (name: string, x: Partial<GroupForm> = {}): GroupForm => ({
  ...emptyGroup(),
  name,
  options: [opt('A', { price: 1 })],
  ...x,
});
const erros = (p: Partial<ProductForm>) => validateProduct(base(p)).errors;
const avisos = (p: Partial<ProductForm>) => validateProduct(base(p)).warnings;

describe('formulários vazios e modelo de produto', () => {
  it('opção e grupo novos começam com os valores padrão', () => {
    expect(emptyOption()).toEqual({
      name: '',
      description: null,
      imageUrl: null,
      price: null,
      weightMinKg: null,
      weightMaxKg: null,
      pdvCode: null,
      available: true,
    });
    expect(emptyGroup()).toEqual({
      name: '',
      minSelect: 1,
      maxSelect: 1,
      controlsImage: false,
      priceMode: null,
      hasWeight: false,
      hasPdv: false,
      options: [],
    });
  });

  it('sem modelo, o produto novo é por unidade, disponível e sem grupos', () => {
    expect(productFromTemplate(null, 3)).toEqual({
      categoryId: 3,
      name: '',
      description: null,
      imageUrl: null,
      imageAlt: null,
      pdvCode: null,
      saleUnit: 'UN',
      basePrice: null,
      weightMinKg: null,
      weightMaxKg: null,
      minQuantity: 1,
      leadTimeHours: null,
      available: true,
      groups: [],
    });
  });

  it('modelo copia todas as características de cada grupo, sem opções', () => {
    const p = productFromTemplate(
      {
        saleUnit: 'UN',
        groups: [
          { name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: 'replace', controlsImage: true, hasWeight: false, definesPdvCode: true },
          { name: 'Adicionais', minSelect: 0, maxSelect: 3, priceMode: 'add', controlsImage: false, hasWeight: true, definesPdvCode: false },
        ],
      },
      5,
    );
    expect(p.saleUnit).toBe('UN');
    expect(p.groups).toEqual([
      { name: 'Tamanho', minSelect: 1, maxSelect: 1, controlsImage: true, priceMode: 'replace', hasWeight: false, hasPdv: true, options: [] },
      { name: 'Adicionais', minSelect: 0, maxSelect: 3, controlsImage: false, priceMode: 'add', hasWeight: true, hasPdv: false, options: [] },
    ]);
  });
});

describe('duplicar produto', () => {
  it('mantém o resto do produto, dos grupos e das opções', () => {
    const p = base({
      description: 'Frita na hora',
      groups: [grupo('Sabor', { id: 7, hasPdv: true, options: [opt('Frango', { id: 9, price: 2, pdvCode: '2001', imageUrl: '/f.webp' })] })],
    });
    expect(duplicateProduct(p)).toEqual({
      ...p,
      name: 'Coxinha (cópia)',
      pdvCode: null,
      available: false,
      groups: [
        {
          ...emptyGroup(),
          name: 'Sabor',
          hasPdv: true,
          options: [{ ...emptyOption(), name: 'Frango', price: 2, imageUrl: '/f.webp' }],
        },
      ],
    });
  });

  it('nome da cópia fica em até 100 caracteres', () => {
    const c = duplicateProduct(base({ name: 'x'.repeat(95) }));
    expect(c.name).toBe(`${'x'.repeat(95)} (cóp`);
    expect(c.name).toHaveLength(100);
  });
});

describe('validação: dados gerais', () => {
  it('nome em branco pede o nome; nome de 100 caracteres passa e de 101 não', () => {
    expect(erros({ name: '   ' })).toEqual(['Informe o nome do produto']);
    expect(erros({ name: ` ${'n'.repeat(100)} ` })).toEqual([]);
    expect(erros({ name: 'n'.repeat(101) })).toEqual(['Nome: até 100 caracteres']);
  });

  it('quantidade mínima inteira de 1 a 999', () => {
    for (const q of [1, 999]) expect(erros({ minQuantity: q })).toEqual([]);
    for (const q of [0, 1000, 1.5]) expect(erros({ minQuantity: q })).toEqual(['Quantidade mínima: de 1 a 999']);
  });

  it('antecedência opcional, inteira de 0 a 720 horas', () => {
    for (const h of [null, 0, 720]) expect(erros({ leadTimeHours: h })).toEqual([]);
    for (const h of [-1, 721, 2.5]) expect(erros({ leadTimeHours: h })).toEqual(['Antecedência: de 0 a 720 horas']);
  });

  it('preço base pela mesma regra da tela de Preços: maior que zero, até 99999, dois dígitos (G03)', () => {
    for (const v of [0.01, 99999, 12.9]) expect(erros({ basePrice: v })).toEqual([]);
    expect(erros({ basePrice: null })).toEqual(['Informe o preço do produto']);
    expect(erros({ basePrice: 0 })).toEqual(['Preço do produto: o preço precisa ser maior que zero']);
    expect(erros({ basePrice: 1.999 })).toEqual(['Preço do produto: use no máximo dois dígitos após a vírgula']);
    expect(erros({ basePrice: -0.01 })).toEqual(['Preço do produto: o preço não pode ser negativo']);
    expect(erros({ basePrice: 100000 })).toEqual(['Preço do produto: preço alto demais']);
    for (const v of [Infinity, NaN]) expect(erros({ basePrice: v })).toEqual(['Preço do produto: use só números, ex: 12,90']);
  });

  it('com grupo que troca o preço, o preço base é opcional, mas se vier precisa ser válido', () => {
    const tamanho = grupo('Tamanho', { priceMode: 'replace' });
    expect(erros({ basePrice: null, groups: [tamanho] })).toEqual([]);
    expect(erros({ basePrice: -1, groups: [tamanho] })).toEqual(['Preço do produto: o preço não pode ser negativo']);
    // Grupo que só soma não dispensa o preço base.
    expect(erros({ basePrice: null, groups: [grupo('Extra', { priceMode: 'add' })] })).toEqual(['Informe o preço do produto']);
  });

  it('um grupo de cada tipo especial é permitido; dois não', () => {
    expect(erros({ groups: [grupo('Tamanho', { priceMode: 'replace', controlsImage: true }), grupo('Extra', { priceMode: 'add' })] })).toEqual([]);
    expect(erros({ groups: [grupo('A', { controlsImage: true }), grupo('B', { controlsImage: true })] })).toEqual(['Só um grupo pode trocar a foto']);
    expect(erros({ groups: [grupo('A', { priceMode: 'replace' }), grupo('B', { priceMode: 'replace' })] })).toEqual(['Só um grupo pode trocar o preço']);
    const peso = (n: string) => grupo(n, { hasWeight: true, options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 2 })] });
    expect(erros({ saleUnit: 'KG', groups: [peso('A'), peso('B')] })).toEqual(['Só um grupo pode ter faixa de peso']);
    // G18: com dois, a mensagem do pedido levaria só o código do primeiro grupo escolhido.
    const pdv = (n: string, c: string) => grupo(n, { hasPdv: true, options: [opt('X', { pdvCode: c })] });
    expect(erros({ groups: [pdv('A', '2001'), pdv('B', '2002')] })).toEqual(['Só um grupo pode ter código PDV']);
  });
});

describe('validação: peso', () => {
  const peso = (o: { weightMinKg: number | null; weightMaxKg: number | null }) => grupo('Tamanho', { hasWeight: true, options: [opt('Mini', o)] });

  it('produto por unidade não aceita grupo com faixa de peso', () => {
    expect(erros({ groups: [peso({ weightMinKg: 1, weightMaxKg: 2 })] })).toEqual(['Faixa de peso só vale para produto vendido por quilo']);
  });

  it('faixa no próprio produto por quilo: mínimo > 0, máximo >= mínimo e até 100 kg', () => {
    const kg = (min: number | null, max: number | null) => erros({ saleUnit: 'KG', weightMinKg: min, weightMaxKg: max });
    const invalida = ['Faixa de peso do produto inválida (mínimo maior que zero e máximo maior ou igual)'];
    expect(kg(1, 1)).toEqual([]);
    expect(kg(0.5, 100)).toEqual([]);
    for (const [min, max] of [[0, 1], [2, 1.5], [1, 100.5], [1, null], [null, 1]] as const) expect(kg(min, max)).toEqual(invalida);
  });

  it('faixa de cada opção do grupo de tamanhos segue a mesma regra', () => {
    const kg = (min: number | null, max: number | null) => erros({ saleUnit: 'KG', groups: [peso({ weightMinKg: min, weightMaxKg: max })] });
    expect(kg(1, 1)).toEqual([]);
    for (const [min, max] of [[0, 1], [2, 1.5], [1, 101], [null, 1], [1, null]] as const)
      expect(kg(min, max)).toEqual(['Grupo 1 (Tamanho), opção Mini: informe a faixa de peso']);
  });
});

describe('validação: grupos e opções', () => {
  it('rótulo do grupo usa o nome sem espaços, ou só o número se estiver em branco', () => {
    expect(erros({ groups: [grupo('  Sabor  ', { options: [] })] })).toEqual(['Grupo 1 (Sabor): adicione ao menos uma opção']);
    expect(erros({ groups: [grupo('Sabor'), grupo(' ')] })).toEqual(['Grupo 2: informe o nome']);
  });

  it('nomes de grupo repetidos, ignorando maiúsculas e espaços', () => {
    expect(erros({ groups: [grupo('Sabor'), grupo(' sabor ')] })).toEqual(['Grupo 2 (sabor): já existe outro grupo com esse nome']);
    // Dois grupos sem nome já acusam a falta do nome, não a repetição.
    expect(erros({ groups: [grupo(''), grupo('')] })).toEqual(['Grupo 1: informe o nome', 'Grupo 2: informe o nome']);
  });

  it('mínimo e máximo de escolhas', () => {
    const r = (x: Partial<GroupForm>) => erros({ groups: [grupo('G', { options: [opt('A'), opt('B')], ...x })] });
    expect(r({ minSelect: 0, maxSelect: 1 })).toEqual([]);
    expect(r({ minSelect: 2, maxSelect: 2 })).toEqual([]);
    expect(r({ minSelect: -1 })).toEqual(['Grupo 1 (G): mínimo de escolhas inválido']);
    expect(r({ minSelect: 0.5 })).toEqual(['Grupo 1 (G): mínimo de escolhas inválido']);
    expect(r({ minSelect: 0, maxSelect: 0 })).toEqual(['Grupo 1 (G): o máximo de escolhas precisa ser ao menos 1']);
    expect(r({ minSelect: 0, maxSelect: 1.5 })).toEqual(['Grupo 1 (G): o máximo de escolhas precisa ser ao menos 1']);
    expect(r({ minSelect: 2, maxSelect: 1 })).toEqual(['Grupo 1 (G): o mínimo de escolhas é maior que o máximo']);
    expect(r({ minSelect: 3, maxSelect: 3 })).toEqual(['Grupo 1 (G): o mínimo de escolhas é maior que o número de opções']);
  });

  it('grupo sem opções só acusa a falta de opções, não o mínimo de escolhas', () => {
    expect(erros({ groups: [grupo('G', { options: [] })] })).toEqual(['Grupo 1 (G): adicione ao menos uma opção']);
  });

  it('código PDV nas opções é permitido em produto por unidade', () => {
    expect(erros({ groups: [grupo('Sabor', { hasPdv: true, options: [opt('A', { pdvCode: '2001' })] })] })).toEqual([]);
  });

  it('opção sem nome usa o número no rótulo; nomes repetidos ignoram maiúsculas e espaços', () => {
    const g = grupo('Sabor', { priceMode: 'add', options: [opt('Frango', { price: 1 }), opt('  '), opt(' frango ', { price: 1 })] });
    expect(erros({ groups: [g] })).toEqual([
      'Grupo 1 (Sabor): opção 2 sem nome',
      'Grupo 1 (Sabor), opção 2: informe o preço',
      'Grupo 1 (Sabor): duas opções com o nome "frango"',
    ]);
  });

  it('preço das opções pela mesma regra da tela de Preços: zero só no grupo que soma (G03)', () => {
    const r = (priceMode: GroupForm['priceMode'], price: number | null) => erros({ groups: [grupo('G', { priceMode, options: [opt('A', { price })] })] });
    expect(r(null, null)).toEqual([]);
    expect(r('add', 0)).toEqual([]);
    expect(r('add', null)).toEqual(['Grupo 1 (G), opção A: informe o preço']);
    expect(r('add', -1)).toEqual(['Grupo 1 (G), opção A: o preço não pode ser negativo']);
    const troca = (price: number | null) =>
      erros({ basePrice: null, groups: [grupo('G', { priceMode: 'replace', options: [opt('A', { price })] })] });
    expect(troca(5)).toEqual([]);
    expect(troca(0)).toEqual(['Grupo 1 (G), opção A: o preço precisa ser maior que zero']);
    expect(troca(1.999)).toEqual(['Grupo 1 (G), opção A: use no máximo dois dígitos após a vírgula']);
  });

  it('grupo que troca a foto avisa sobre opção sem foto', () => {
    const g = grupo('Cor', { controlsImage: true, options: [opt('Azul', { imageUrl: '/a.webp' }), opt('Rosa')] });
    expect(validateProduct(base({ groups: [g] }))).toEqual({
      errors: [],
      warnings: ['Grupo 1 (Cor), opção Rosa: sem foto (o card usa a foto do produto)'],
    });
    expect(avisos({ groups: [grupo('Cor', { options: [opt('Rosa')] })] })).toEqual([]);
  });
});

describe('validação: códigos PDV', () => {
  it('aceita letras, números, ponto e hífen, até 20 caracteres', () => {
    for (const c of ['aZ09.-', 'A'.repeat(20), '7']) expect(erros({ pdvCode: c })).toEqual([]);
  });

  it('recusa outro caractere ou mais de 20, avisando qual código', () => {
    for (const c of ['ab cd', 'A'.repeat(21), 'x_1', 'ç'])
      expect(erros({ pdvCode: c })).toEqual([`Código PDV "${c}" inválido: use letras, números, ponto ou hífen`]);
  });

  it('confere também os códigos das opções e acusa a repetição entre elas', () => {
    const g = grupo('Sabor', { hasPdv: true, options: [opt('A', { pdvCode: '20 1' }), opt('B', { pdvCode: '3001' }), opt('C', { pdvCode: '3001' })] });
    expect(erros({ groups: [g] })).toEqual([
      'Código PDV "20 1" inválido: use letras, números, ponto ou hífen',
      'Código PDV 3001 repetido neste produto',
    ]);
  });

  it('código em branco conta como sem código: só avisa, não é inválido', () => {
    expect(validateProduct(base({ pdvCode: '' }))).toEqual({ errors: [], warnings: ['Produto sem código PDV'] });
  });

  it('opções sem código não contam como códigos repetidos', () => {
    const g = grupo('Sabor', { options: [opt('A'), opt('B')] });
    expect(validateProduct(base({ pdvCode: null, groups: [g] })).errors).toEqual([]);
  });
});

describe('validação: avisos de código PDV e foto', () => {
  const sabor = (...codes: (string | null)[]) =>
    grupo('Sabor', { hasPdv: true, options: codes.map((c, i) => opt(`S${i}`, { pdvCode: c })) });

  it('grupo com código próprio: conta as opções sem código e dispensa o código do produto', () => {
    expect(avisos({ pdvCode: null, groups: [sabor('2001', '2002')] })).toEqual([]);
    expect(avisos({ pdvCode: null, groups: [sabor('2001', null)] })).toEqual(['1 opção de Sabor sem código PDV']);
    expect(avisos({ groups: [sabor(null, null)] })).toEqual(['2 opções de Sabor sem código PDV']);
    expect(avisos({ groups: [{ ...sabor(null), name: '' }] })).toEqual(['1 opção de grupo sem código PDV']);
  });

  it('a mesma regra serve ao aviso do Início e da lista (pdvWarning, G35)', () => {
    expect(pdvWarning(base({ pdvCode: null, groups: [sabor('2001', null)] }))).toBe('1 opção de Sabor sem código PDV');
    expect(pdvWarning(base({ pdvCode: null, groups: [sabor('2001', '2002')] }))).toBeNull();
    expect(pdvWarning(base({ pdvCode: '1001' }))).toBeNull();
    expect(pdvWarning(base({ pdvCode: null }))).toBe('Produto sem código PDV');
  });

  it('produto por quilo usa o código do produto, mesmo com grupo marcado', () => {
    const tamanho = grupo('Tamanho', { hasWeight: true, hasPdv: true, options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 2, pdvCode: '2001' })] });
    expect(avisos({ saleUnit: 'KG', pdvCode: null, groups: [tamanho] })).toEqual(['Produto sem código PDV']);
    expect(avisos({ saleUnit: 'KG', groups: [tamanho] })).toEqual([]);
  });
});
