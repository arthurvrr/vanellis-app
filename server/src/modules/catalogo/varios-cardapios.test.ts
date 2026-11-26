// Produto em vários cardápios (RF64, RN68, RN69; C128–C131): o que o site recebe e a retirada.
// A Quiche está em Tortas e, por um vínculo a mais, na Ceia de Natal (24/12, prazo 22/12); o
// Chester só na Ceia. Até o PR E3 o painel edita só o cardápio principal; os vínculos a mais
// entram direto no banco.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { openingHours, specialDate, weeklySchedule } from '../agenda/schema';
import { category, product, productCategory } from './schema';

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
        visibleUntil: '2026-12-24',
        pickupDates: ['2026-12-24'],
      },
    ])
    .returning({ id: category.id, name: category.name });
  for (const c of cats) ids[c.name] = c.id;
  const prods = await app.db
    .insert(product)
    .values([
      { categoryId: ids.Tortas!, name: 'Torta de Limão', saleUnit: 'UN', basePrice: '50.00', position: 0 },
      { categoryId: ids.Tortas!, name: 'Quiche', saleUnit: 'UN', basePrice: '60.00', position: 1 },
      { categoryId: ids['Ceia de Natal']!, name: 'Chester', saleUnit: 'UN', basePrice: '120.00', position: 0 },
    ])
    .returning({ id: product.id, name: product.name });
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

describe('vínculo do cardápio principal (gatilho da migração 0018)', () => {
  const vinculos = (productId: number) =>
    app.db.select().from(productCategory).where(eq(productCategory.productId, productId));

  it('produto novo ganha o vínculo do seu cardápio, na sua posição', async () => {
    expect(await vinculos(ids.Quiche!)).toEqual([{ productId: ids.Quiche!, categoryId: ids.Tortas!, position: 1 }]);
  });

  it('mudar a posição ou o cardápio principal acompanha; os outros vínculos ficam', async () => {
    await naCeia();
    await app.db.update(product).set({ position: 5 }).where(eq(product.id, ids.Quiche!));
    expect(await vinculos(ids.Quiche!)).toContainEqual({ productId: ids.Quiche!, categoryId: ids.Tortas!, position: 5 });
    const [outra] = await app.db.insert(category).values({ name: 'Salgados', slug: 'salgados', position: 2 }).returning();
    await app.db.update(product).set({ categoryId: outra!.id }).where(eq(product.id, ids.Quiche!));
    const depois = await vinculos(ids.Quiche!);
    const porNumero = (a: number, b: number) => a - b;
    expect(depois.map((v) => v.categoryId).sort(porNumero)).toEqual([ids['Ceia de Natal']!, outra!.id].sort(porNumero));
    expect(depois.find((v) => v.categoryId === ids['Ceia de Natal'])?.position).toBe(1);
  });

  it('excluir o produto apaga os vínculos dele', async () => {
    await naCeia();
    await app.db.delete(product).where(eq(product.id, ids.Quiche!));
    expect(await vinculos(ids.Quiche!)).toEqual([]);
  });
});

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
