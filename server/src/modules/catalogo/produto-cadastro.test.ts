// Cenários C52–C61 (Etapa 3, parte 2): cadastro, grupos de opção, modelos e duplicação.

import { productFromTemplate, emptyGroup, emptyOption, type ProductForm } from '@vanellis/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { agendaConfig, openingHours, weeklySchedule } from '../agenda/schema';
import { category, product, productTemplate } from './schema';

const NOW = '2026-11-23T10:00'; // segunda, 10h
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
let salgados: number;
let tortas: number;

beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
  const [s] = await app.db.insert(weeklySchedule).values({ validFrom: '2026-01-01' }).returning({ id: weeklySchedule.id });
  await app.db.insert(openingHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ scheduleId: s!.id, weekday, openTime: '07:30', closeTime: '19:00' })));
  await app.db.update(agendaConfig).set({ minLeadHours: 2 });
  await app.db.insert(productTemplate).values([
    { name: 'Unidade simples', saleUnit: 'UN', groups: [] },
    {
      name: 'Quilo com tamanho',
      saleUnit: 'KG',
      groups: [{ name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, controlsImage: false, hasWeight: true, definesPdvCode: false }],
    },
  ]);
});
afterAll(() => app.stop());

beforeEach(async () => {
  await app.db.delete(product);
  await app.db.delete(category);
  const [s, t] = await app.db
    .insert(category)
    .values([
      { name: 'Salgados', slug: 'salgados', position: 0 },
      { name: 'Tortas', slug: 'tortas', position: 1 },
    ])
    .returning({ id: category.id });
  salgados = s!.id;
  tortas = t!.id;
});

const opt = (name: string, o: object = {}) => ({ ...emptyOption(), name, ...o });
const coxinha = (): ProductForm => ({
  ...productFromTemplate(null, salgados),
  name: 'Coxinha',
  basePrice: 1.6,
  minQuantity: 25,
});
const torta = (): ProductForm => ({
  ...productFromTemplate(null, tortas),
  name: 'Torta Macron',
  saleUnit: 'KG',
  basePrice: 80,
  groups: [
    {
      ...emptyGroup(),
      name: 'Tamanho',
      hasWeight: true,
      options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 1.2 }), opt('Grande', { weightMinKg: 2.5, weightMaxKg: 3 })],
    },
  ],
});
const criar = async (f: ProductForm) => (await op('POST', '/api/painel/catalogo/produtos', f)).body.id as number;
const site = async () => (await app.browser()('GET', '/api/catalogo')).body;
const noSite = async (id: number) => (await site()).produtos.find((p: { id: number }) => p.id === id);
const cadastro = async (id: number): Promise<ProductForm> => (await op('GET', `/api/painel/catalogo/produtos/${id}/cadastro`)).body;

describe('Endereço da foto (G08)', () => {
  it('recusa foto de produto ou de opção com endereço de fora do site', async () => {
    const produto = await op('POST', '/api/painel/catalogo/produtos', {
      ...coxinha(),
      imageUrl: 'https://outro-site.com/foto.jpg',
    });
    expect(produto.status).toBe(400);
    const t = torta();
    const opcao = await op('POST', '/api/painel/catalogo/produtos', {
      ...t,
      groups: [{ ...t.groups[0]!, options: [opt('Mini', { weightMinKg: 1, weightMaxKg: 1.2, imageUrl: 'javascript:alert(1)' })] }],
    });
    expect(opcao.status).toBe(400);
  });

  it('aceita foto guardada pelo painel ou do próprio site', async () => {
    const doSite = await op('POST', '/api/painel/catalogo/produtos', {
      ...coxinha(),
      imageUrl: '/images/card-images/coxinha-frango.webp',
    });
    expect(doSite.status).toBeLessThan(300);
    const guardada = await op('POST', '/api/painel/catalogo/produtos', {
      ...coxinha(),
      name: 'Coxinha de Queijo',
      imageUrl: '/api/imagens/1',
    });
    expect(guardada.status).toBeLessThan(300);
  });
});

describe('Dados do produto', () => {
  it('C52: editar preço, mínimo, descrição, foto e código', async () => {
    const id = await criar(coxinha());
    const f = await cadastro(id);
    const res = await op('PUT', `/api/painel/catalogo/produtos/${id}`, {
      ...f,
      basePrice: 1.7,
      minQuantity: 30,
      description: 'Massa de batata',
      imageUrl: '/images/card-images/coxinha-frango.webp',
      pdvCode: '1002',
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
    expect(await noSite(id)).toMatchObject({ basePrice: 1.7, minQuantity: 30, description: 'Massa de batata', pdvCode: '1002' });
  });

  it('avisa, sem impedir, quando falta código PDV ou foto', async () => {
    const res = await op('POST', '/api/painel/catalogo/produtos', coxinha());
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual(['Produto sem código PDV', 'Produto sem foto']);
  });

  it('C53: antecedência do produto limita o calendário', async () => {
    const id = await criar({ ...coxinha(), leadTimeHours: 48 });
    const dias = (await app.browser()('GET', `/api/agenda/disponibilidade?produtos=${id}`)).body.days;
    expect(dias[0].date).toBe('2026-11-25'); // segunda 10h + 48h = quarta 10h
    expect(dias[0].times[0]).toBe('10:00');
  });

  it('C54: código PDV em uso em outro produto ou opção é recusado', async () => {
    await criar({ ...coxinha(), pdvCode: '1001' });
    const res = await op('POST', '/api/painel/catalogo/produtos', { ...coxinha(), name: 'Bolinha', pdvCode: '1001' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Código PDV 1001 já está em uso em Coxinha');
  });

  it('C55: produto por quilo sem peso não salva', async () => {
    const res = await op('POST', '/api/painel/catalogo/produtos', { ...torta(), groups: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('faixa de peso');
  });
});

describe('Grupos de opção', () => {
  it('C56: tamanhos com peso aparecem no site com a estimativa', async () => {
    const id = await criar(torta());
    const p = await noSite(id);
    expect(p.groups[0].options.map((o: { name: string; weightMinKg: number }) => [o.name, o.weightMinKg])).toEqual([
      ['Mini', 1],
      ['Grande', 2.5],
    ]);
  });

  it('C57: opção que troca o preço e adicional que soma', async () => {
    const id = await criar({
      ...coxinha(),
      name: 'Cupcake',
      basePrice: null,
      minQuantity: 10,
      groups: [
        { ...emptyGroup(), name: 'Tamanho', priceMode: 'replace', options: [opt('Mini', { price: 4.9 }), opt('Tradicional', { price: 8 })] },
        { ...emptyGroup(), name: 'Adicional', priceMode: 'add', minSelect: 0, options: [opt('Granulado', { price: 1 })] },
      ],
    });
    const p = await noSite(id);
    expect(p.groups[0].options[1]).toMatchObject({ priceMode: 'replace', price: 8 });
    expect(p.groups[1].options[0]).toMatchObject({ priceMode: 'add', price: 1 });
  });

  it('C69: descrição de cada opção aparece no site quando escolhida', async () => {
    const id = await criar({
      ...coxinha(),
      name: 'Cupcake',
      basePrice: null,
      groups: [
        {
          ...emptyGroup(),
          name: 'Tamanho',
          priceMode: 'replace',
          options: [
            opt('Mini', { price: 4.9, description: 'Aproximadamente 50 gramas' }),
            opt('Tradicional', { price: 8, description: '  ' }),
          ],
        },
        { ...emptyGroup(), name: 'Sabor', options: [opt('Cenoura', { description: ' Massa fofinha de cenoura. ' })] },
      ],
    });
    const p = await noSite(id);
    expect(p.groups[0].options.map((o: { description: string | null }) => o.description)).toEqual([
      'Aproximadamente 50 gramas',
      null, // só espaços = sem descrição
    ]);
    expect(p.groups[1].options[0].description).toBe('Massa fofinha de cenoura.');
    // O cadastro devolve a descrição para editar.
    expect((await cadastro(id)).groups[1]!.options[0]!.description).toBe('Massa fofinha de cenoura.');
  });

  it('C58: regras dos grupos impedem salvar', async () => {
    const res = await op('POST', '/api/painel/catalogo/produtos', {
      ...coxinha(),
      groups: [
        { ...emptyGroup(), name: 'Sabor', options: [] },
        { ...emptyGroup(), name: 'Tamanho', minSelect: 2, maxSelect: 1, options: [opt('A')] },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining(['Grupo 1 (Sabor): adicione ao menos uma opção', 'Grupo 2 (Tamanho): o mínimo de escolhas é maior que o máximo']),
    );
  });

  it('C59: editar preço, ordem e nomes mantém os ids das opções (carrinhos continuam valendo)', async () => {
    const id = await criar(torta());
    const f = await cadastro(id);
    const [mini, grande] = f.groups[0]!.options;
    f.groups[0]!.options = [
      { ...grande!, name: 'Mini' }, // troca de nomes entre opções não colide
      { ...mini!, name: 'Grande', weightMaxKg: 1.3 },
    ];
    f.basePrice = 85;
    expect((await op('PUT', `/api/painel/catalogo/produtos/${id}`, f)).status).toBe(200);
    const depois = (await cadastro(id)).groups[0]!.options;
    expect(depois.map((o) => o.id)).toEqual([grande!.id, mini!.id]);
    expect(depois.map((o) => o.name)).toEqual(['Mini', 'Grande']);
    // remover uma opção tira só ela
    f.groups[0]!.options = [depois[0]!];
    await op('PUT', `/api/painel/catalogo/produtos/${id}`, f);
    expect((await cadastro(id)).groups[0]!.options.map((o) => o.id)).toEqual([grande!.id]);
  });
});

describe('Novo produto', () => {
  it('C60: modelos disponíveis para criar produto', async () => {
    const modelos = (await op('GET', '/api/painel/catalogo/modelos')).body;
    expect(modelos.map((m: { name: string }) => m.name)).toEqual(['Unidade simples', 'Quilo com tamanho']);
    expect(modelos[1]).toMatchObject({ saleUnit: 'KG', groups: [{ name: 'Tamanho', hasWeight: true }] });
  });

  it('C61: duplicar copia grupos e preços, indisponível e sem códigos, logo depois do original', async () => {
    const id = await criar({ ...torta(), pdvCode: '3001' });
    await criar({ ...coxinha(), categoryId: tortas, name: 'Torta de Nozes' });
    const res = await op('POST', `/api/painel/catalogo/produtos/${id}/duplicar`, {});
    expect(res.status).toBe(201);
    const copia = await cadastro(res.body.id);
    expect(copia).toMatchObject({ name: 'Torta Macron (cópia)', pdvCode: null, available: false, basePrice: 80 });
    expect(copia.groups[0]!.options.map((o) => o.name)).toEqual(['Mini', 'Grande']);
    const ordem = (await op('GET', '/api/painel/catalogo/produtos')).body
      .filter((p: { categoryId: number }) => p.categoryId === tortas)
      .map((p: { name: string }) => p.name);
    expect(ordem).toEqual(['Torta Macron', 'Torta Macron (cópia)', 'Torta de Nozes']);
  });
});
