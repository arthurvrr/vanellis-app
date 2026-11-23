// Cenários C62–C64 (etapa 4): lista de preços e reajuste em lote.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { category, option, optionGroup, product } from './schema';

let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
const ids: Record<string, number> = {};

beforeAll(async () => {
  app = await startTestApp();
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());

beforeEach(async () => {
  await app.db.delete(product);
  await app.db.delete(category);
  const [s, d] = await app.db
    .insert(category)
    .values([
      { name: 'Salgados', slug: 'salgados', position: 0 },
      { name: 'Doces', slug: 'doces', position: 1 },
    ])
    .returning({ id: category.id });
  const prods = await app.db
    .insert(product)
    .values([
      { categoryId: s!.id, name: 'Coxinha', saleUnit: 'UN', basePrice: '1.60', position: 0 },
      { categoryId: d!.id, name: 'Brigadeiro', saleUnit: 'UN', basePrice: '1.70', position: 0 },
      { categoryId: d!.id, name: 'Cupcake', saleUnit: 'UN', basePrice: null, position: 1 },
      { categoryId: s!.id, name: 'Torta Macron', saleUnit: 'KG', basePrice: '79.90', position: 1 },
    ])
    .returning({ id: product.id, name: product.name });
  for (const p of prods) ids[p.name] = p.id;

  const [tamanho, adicional, sabor] = await app.db
    .insert(optionGroup)
    .values([
      { productId: ids.Cupcake!, name: 'Tamanho', minSelect: 1, priceMode: 'replace', position: 0 },
      { productId: ids.Cupcake!, name: 'Adicional', priceMode: 'add', position: 1 },
      { productId: ids['Torta Macron']!, name: 'Tamanho', minSelect: 1, hasWeight: true, position: 0 },
    ])
    .returning({ id: optionGroup.id });
  const opts = await app.db
    .insert(option)
    .values([
      { groupId: tamanho!.id, name: 'Mini', priceMode: 'replace', price: '4.90', position: 0 },
      { groupId: tamanho!.id, name: 'Tradicional', priceMode: 'replace', price: '8.00', position: 1 },
      { groupId: adicional!.id, name: 'Granulado', priceMode: 'add', price: '1.00', position: 0 },
      { groupId: sabor!.id, name: 'Mini 1kg', weightMinKg: '1.0', weightMaxKg: '1.2', position: 0 },
    ])
    .returning({ id: option.id, name: option.name });
  for (const o of opts) ids[o.name] = o.id;
});

const precos = async () => (await op('GET', '/api/painel/precos')).body;
const site = async () => (await app.browser()('GET', '/api/catalogo')).body;
const sitePrice = async (name: string) =>
  (await site()).produtos.find((p: { name: string }) => p.name === name).basePrice;

describe('C62: lista de preços', () => {
  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/precos')).status).toBe(401);
  });

  it('mostra por categoria cada produto e só as opções com preço', async () => {
    const cats = await precos();
    expect(cats.map((c: { name: string }) => c.name)).toEqual(['Salgados', 'Doces']);
    const [salgados, doces] = cats;
    expect(salgados.produtos.map((p: { name: string }) => p.name)).toEqual(['Coxinha', 'Torta Macron']);
    expect(salgados.produtos[0]).toMatchObject({ price: 1.6, saleUnit: 'UN', options: [] });
    // A opção de tamanho da torta não tem preço próprio: não aparece.
    expect(salgados.produtos[1]).toMatchObject({ price: 79.9, saleUnit: 'KG', options: [] });
    const cupcake = doces.produtos.find((p: { name: string }) => p.name === 'Cupcake');
    expect(cupcake.price).toBeNull();
    expect(cupcake.options).toEqual([
      { id: ids.Mini, groupName: 'Tamanho', name: 'Mini', priceMode: 'replace', price: 4.9 },
      { id: ids.Tradicional, groupName: 'Tamanho', name: 'Tradicional', priceMode: 'replace', price: 8 },
      { id: ids.Granulado, groupName: 'Adicional', name: 'Granulado', priceMode: 'add', price: 1 },
    ]);
  });
});

describe('C63: reajustar vários preços de uma vez', () => {
  it('grava produtos e opções e o cardápio mostra os preços novos', async () => {
    const r = await op('PUT', '/api/painel/precos', {
      produtos: [
        { id: ids.Coxinha, price: 1.8 },
        { id: ids.Brigadeiro, price: 1.9 },
      ],
      opcoes: [{ id: ids.Tradicional, price: 8.5 }],
    });
    expect(r.status).toBe(200);
    expect(await sitePrice('Coxinha')).toBe(1.8);
    expect(await sitePrice('Brigadeiro')).toBe(1.9);
    const cupcake = (await site()).produtos.find((p: { name: string }) => p.name === 'Cupcake');
    const tradicional = cupcake.groups[0].options.find((o: { name: string }) => o.name === 'Tradicional');
    expect(tradicional.price).toBe(8.5);
    // A resposta já traz a lista atualizada para a tela.
    expect(r.body[0].produtos[0].price).toBe(1.8);
  });

  it('adicional que soma pode ficar em R$ 0,00', async () => {
    const r = await op('PUT', '/api/painel/precos', { opcoes: [{ id: ids.Granulado, price: 0 }] });
    expect(r.status).toBe(200);
  });
});

describe('C64: preço inválido', () => {
  it('recusa zero, negativo e três casas, sem gravar nenhuma alteração', async () => {
    for (const price of [0, -1, 1.805, 100000]) {
      const r = await op('PUT', '/api/painel/precos', {
        produtos: [
          { id: ids.Brigadeiro, price: 2.5 },
          { id: ids.Coxinha, price },
        ],
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/^Coxinha: /);
    }
    expect(await sitePrice('Brigadeiro')).toBe(1.7);
    expect(await sitePrice('Coxinha')).toBe(1.6);
  });

  it('recusa opção que troca o preço com zero', async () => {
    const r = await op('PUT', '/api/painel/precos', { opcoes: [{ id: ids.Mini, price: 0 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Cupcake · Mini: O preço precisa ser maior que zero');
  });

  it('não cria preço onde não existe', async () => {
    const semBase = await op('PUT', '/api/painel/precos', { produtos: [{ id: ids.Cupcake, price: 5 }] });
    expect(semBase.status).toBe(400);
    expect(semBase.body.error).toMatch(/cadastro do produto/);
    const semPreco = await op('PUT', '/api/painel/precos', { opcoes: [{ id: ids['Mini 1kg'], price: 5 }] });
    expect(semPreco.status).toBe(400);
    expect(semPreco.body.error).toMatch(/não tem preço próprio/);
  });

  it('recusa produto excluído e dados mal formados', async () => {
    const r = await op('PUT', '/api/painel/precos', { produtos: [{ id: 999999, price: 2 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Recarregue/);
    expect((await op('PUT', '/api/painel/precos', { produtos: [{ id: ids.Coxinha, price: '2' }] })).status).toBe(400);
  });
});
