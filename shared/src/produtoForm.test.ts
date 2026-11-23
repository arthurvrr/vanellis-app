import { describe, expect, it } from 'vitest';
import {
  duplicateProduct,
  emptyGroup,
  emptyOption,
  productFromTemplate,
  validateProduct,
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
