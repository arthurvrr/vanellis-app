// Produto em vários cardápios (RF64, RF65, RN68–RN70; C128–C135): o que o site recebe, a
// retirada e o painel. A Quiche está em Tortas e, por um vínculo a mais, na Ceia de Natal (24/12,
// prazo 22/12); o Chester só na Ceia.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { openingHours, specialDate, weeklySchedule } from '../agenda/schema';
import { category, product, productCategory } from './schema';
import { inserirProdutos } from '../../test/produtos';

let now = '2026-12-10T10:00';
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
const ids: Record<string, number> = {};

beforeAll(async () => {
  app = await startTestApp({ now: () => now });
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
  const [s] = await app.db.insert(weeklySchedule).values({ validFrom: '2026-01-01' }).returning({ id: weeklySchedule.id });
  await app.db
    .insert(openingHours)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ scheduleId: s!.id, weekday, openTime: '07:30', closeTime: '19:00' })));
  await app.db.insert(specialDate).values({ date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22' });
});
afterAll(() => app.stop());

beforeEach(async () => {
  now = '2026-12-10T10:00';
  await app.db.delete(product);
  await app.db.delete(category);
  const cats = await app.db
    .insert(category)
    .values([
      { name: 'Tortas', slug: 'tortas', position: 0 },
      {
        name: 'Ceia de Natal',
        slug: 'ceia-de-natal',
        position: 1,
        special: true,
        visibleFrom: '2026-12-01',
        pickupDates: ['2026-12-24'],
      },
    ])
    .returning({ id: category.id, name: category.name });
  for (const c of cats) ids[c.name] = c.id;
  const prods = await inserirProdutos(app.db, [
      { categoryId: ids.Tortas!, name: 'Torta de Limão', saleUnit: 'UN', basePrice: '50.00', position: 0 },
      { categoryId: ids.Tortas!, name: 'Quiche', saleUnit: 'UN', basePrice: '60.00', position: 1 },
      { categoryId: ids['Ceia de Natal']!, name: 'Chester', saleUnit: 'UN', basePrice: '120.00', position: 0 },
    ]);
  for (const p of prods) ids[p.name] = p.id;
});

const site = async () => (await app.browser()('GET', '/api/catalogo')).body;
const produtoNoSite = async (nome: string) =>
  (await site()).produtos.find((p: { name: string }) => p.name === nome);
const datas = async (...nomes: string[]) =>
  (await app.browser()('GET', `/api/agenda/disponibilidade?produtos=${nomes.map((n) => ids[n]).join(',')}`)).body.days.map(
    (d: { date: string }) => d.date,
  );
const naCeia = () =>
  app.db.insert(productCategory).values({ productId: ids.Quiche!, categoryId: ids['Ceia de Natal']!, position: 1 });

describe('produto em vários cardápios no site', () => {
  it('C128: a Quiche aparece em Tortas e na Ceia, com um cadastro só, na ordem de cada cardápio', async () => {
    await naCeia();
    const s = await site();
    const quiche = s.produtos.filter((p: { name: string }) => p.name === 'Quiche');
    expect(quiche).toHaveLength(1);
    const porNumero = (a: number, b: number) => a - b;
    expect([...quiche[0].categoryIds].sort(porNumero)).toEqual([ids.Tortas!, ids['Ceia de Natal']!].sort(porNumero));
    const ceia = s.categorias.find((c: { name: string }) => c.name === 'Ceia de Natal');
    expect(ceia.productIds).toEqual([ids.Chester, ids.Quiche]);
    const tortas = s.categorias.find((c: { name: string }) => c.name === 'Tortas');
    expect(tortas.productIds).toEqual([ids['Torta de Limão'], ids.Quiche]);
  });

  it('C129: a Quiche, também em Tortas, segue a retirada normal; com o Chester, só 24/12 (RN68)', async () => {
    await naCeia();
    expect((await datas('Quiche')).length).toBeGreaterThan(30);
    expect(await datas('Quiche', 'Chester')).toEqual(['2026-12-24']);
  });

  it('C131: com a Ceia encerrada, a Quiche continua em Tortas e o Chester sai do site (RN69)', async () => {
    await naCeia();
    now = '2026-12-22T19:00';
    expect((await produtoNoSite('Quiche')).categoryIds).toEqual([ids.Tortas]);
    expect(await produtoNoSite('Chester')).toBeUndefined();
  });

  it('o "Prazo encerrado" de um cardápio especial não vale para quem está num cardápio regular', async () => {
    // A Ceia passa a ter só uma data normal, 11/12, que um item de 48h não alcança mais.
    await app.db.update(category).set({ pickupDates: ['2026-12-11'] }).where(eq(category.id, ids['Ceia de Natal']!));
    await app.db.update(product).set({ leadTimeHours: 48 }).where(eq(product.id, ids.Quiche!));
    await naCeia();
    expect((await produtoNoSite('Quiche')).orderClosed).toBe(false);
    // Só na Ceia, ela ficaria com o prazo encerrado.
    await app.db
      .delete(productCategory)
      .where(and(eq(productCategory.productId, ids.Quiche!), eq(productCategory.categoryId, ids.Tortas!)));
    expect((await produtoNoSite('Quiche')).orderClosed).toBe(true);
  });
});

describe('painel: cardápios do produto, ordem e exclusão (RF64, RF65, RN70)', () => {
  const cadastro = async (nome: string) => (await op('GET', `/api/painel/catalogo/produtos/${ids[nome]}/cadastro`)).body;
  const salvar = async (nome: string, categoryIds: number[]) =>
    op('PUT', `/api/painel/catalogo/produtos/${ids[nome]}`, { ...(await cadastro(nome)), categoryIds });
  const ordem = async (cat: string) =>
    (await op('GET', '/api/painel/catalogo/categorias')).body.find((c: { name: string }) => c.name === cat).productIds;

  it('C128: o editor vincula a Quiche também à Ceia; o cadastro traz os dois, o principal primeiro', async () => {
    const res = await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    expect(res.status).toBe(200);
    expect((await cadastro('Quiche')).categoryIds).toEqual([ids.Tortas, ids['Ceia de Natal']]);
    // Entra no fim da Ceia; em Tortas, continua onde estava.
    expect(await ordem('Ceia de Natal')).toEqual([ids.Chester, ids.Quiche]);
    expect(await ordem('Tortas')).toEqual([ids['Torta de Limão'], ids.Quiche]);
    expect((await produtoNoSite('Quiche')).categoryIds).toHaveLength(2);
  });

  it('tirar o cardápio principal: o primeiro dos outros vira o principal, no mesmo lugar', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    await salvar('Quiche', [ids['Ceia de Natal']!]);
    expect((await cadastro('Quiche')).categoryIds).toEqual([ids['Ceia de Natal']]);
    expect(await ordem('Tortas')).toEqual([ids['Torta de Limão']]);
    expect(await ordem('Ceia de Natal')).toEqual([ids.Chester, ids.Quiche]);
  });

  it('C135: o produto pode ficar sem cardápio: continua cadastrado, fora do site, no grupo do painel', async () => {
    const res = await salvar('Chester', []);
    expect(res.status).toBe(200);
    expect((await cadastro('Chester')).categoryIds).toEqual([]);
    expect(await produtoNoSite('Chester')).toBeUndefined();
    const lista = (await op('GET', '/api/painel/catalogo/produtos')).body;
    expect(lista.find((p: { name: string }) => p.name === 'Chester')).toMatchObject({ categoryIds: [] });
    // Sem cardápio, não há ordem para mudar.
    expect((await op('POST', `/api/painel/catalogo/produtos/${ids.Chester}/mover`, { direcao: 'subir' })).status).toBe(400);
    // Vincular de novo traz de volta ao site.
    await salvar('Chester', [ids['Ceia de Natal']!]);
    expect(await produtoNoSite('Chester')).toBeDefined();
  });

  it('produto novo pode nascer sem cardápio', async () => {
    const form = { ...(await cadastro('Chester')), name: 'Rabanada', categoryIds: [], pdvCode: null, groups: [] };
    const res = await op('POST', '/api/painel/catalogo/produtos', form);
    expect(res.status).toBe(201);
    expect((await op('GET', `/api/painel/catalogo/produtos/${res.body.id}/cadastro`)).body.categoryIds).toEqual([]);
  });

  it('C134: subir a Quiche na Ceia não muda a ordem dela em Tortas', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/mover`, { direcao: 'subir', categoryId: ids['Ceia de Natal'] });
    expect(await ordem('Ceia de Natal')).toEqual([ids.Quiche, ids.Chester]);
    expect(await ordem('Tortas')).toEqual([ids['Torta de Limão'], ids.Quiche]);
    const emTortas = { direcao: 'subir', categoryId: ids.Tortas };
    await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/mover`, emTortas);
    expect(await ordem('Tortas')).toEqual([ids.Quiche, ids['Torta de Limão']]);
    // Na ponta, não sai do lugar.
    await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/mover`, emTortas);
    expect(await ordem('Tortas')).toEqual([ids.Quiche, ids['Torta de Limão']]);
    // Sem dizer o cardápio, não há o que mover (não existe mais cardápio principal).
    expect((await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/mover`, { direcao: 'subir' })).status).toBe(400);
  });

  it('duplicar: a cópia vai para os mesmos cardápios, logo depois do original em cada um', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/mover`, { direcao: 'subir', categoryId: ids['Ceia de Natal'] });
    const copia = (await op('POST', `/api/painel/catalogo/produtos/${ids.Quiche}/duplicar`, {})).body.id;
    expect(await ordem('Tortas')).toEqual([ids['Torta de Limão'], ids.Quiche, copia]);
    expect(await ordem('Ceia de Natal')).toEqual([ids.Quiche, copia, ids.Chester]);
  });

  it('C132: excluir a Ceia desvincula a Quiche, que continua em Tortas; nenhum produto é excluído', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    // O Chester sai da Ceia antes, para nenhum produto ficar sem cardápio.
    await salvar('Chester', [ids.Tortas!]);
    const res = await op('DELETE', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}`, {});
    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Tortas']);
    expect((await cadastro('Quiche')).categoryIds).toEqual([ids.Tortas]);
    expect(await app.db.select({ id: product.id }).from(product)).toHaveLength(3);
  });

  it('C132: o Chester, na Ceia e no fim de Tortas, fica em Tortas sem sair do lugar', async () => {
    await salvar('Chester', [ids['Ceia de Natal']!, ids.Tortas!]);
    // Os cardápios do produto vêm na ordem dos cardápios, não na ordem em que foram escolhidos.
    expect((await cadastro('Chester')).categoryIds).toEqual([ids.Tortas, ids['Ceia de Natal']]);
    const res = await op('DELETE', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}`, {});
    expect(res.status).toBe(200);
    expect((await cadastro('Chester')).categoryIds).toEqual([ids.Tortas]);
    expect(await ordem('Tortas')).toEqual([ids['Torta de Limão'], ids.Quiche, ids.Chester]);
  });

  it('C133: excluir a Ceia com o Chester só nela: o Chester fica sem cardápio, a Quiche continua em Tortas', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    const antes = (await op('GET', '/api/painel/catalogo/categorias')).body.find((c: { name: string }) => c.name === 'Ceia de Natal');
    expect(antes).toMatchObject({ productCount: 2, exclusiveCount: 1 });
    const res = await op('DELETE', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}`, {});
    expect(res.status).toBe(200);
    expect((await cadastro('Chester')).categoryIds).toEqual([]);
    expect((await cadastro('Quiche')).categoryIds).toEqual([ids.Tortas]);
    expect(await app.db.select({ id: product.id }).from(product)).toHaveLength(3);
  });

  it('a lista de produtos do painel traz os cardápios e a posição em cada um', async () => {
    await salvar('Quiche', [ids.Tortas!, ids['Ceia de Natal']!]);
    const lista = (await op('GET', '/api/painel/catalogo/produtos')).body;
    const quiche = lista.find((p: { name: string }) => p.name === 'Quiche');
    expect(quiche.categoryIds.sort((a: number, b: number) => a - b)).toEqual(
      [ids.Tortas!, ids['Ceia de Natal']!].sort((a, b) => a - b),
    );
    expect(quiche.posicoes).toEqual({ [ids.Tortas!]: 1, [ids['Ceia de Natal']!]: 1 });
  });
});
