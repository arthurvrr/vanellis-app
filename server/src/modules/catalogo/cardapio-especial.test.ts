// Cenários C70–C76 (etapa 6) e C109–C114, C121, C125 (fim pelo prazo das datas): cardápios
// especiais pelo painel e o que o site recebe. 24/12 é data especial com prazo em 22/12.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { openingHours, specialDate, weeklySchedule } from '../agenda/schema';
import { category, product } from './schema';

let now = '2026-12-10T10:00';
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
const ids: Record<string, number> = {};

const NATAL = { visibleFrom: '2026-12-01', pickupDates: ['2026-12-24'] };
const ANO_NOVO = { visibleFrom: '2026-12-01', pickupDates: ['2026-12-31'] };

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
      { name: 'Pães', slug: 'paes', position: 0 },
      { name: 'Ceia de Natal', slug: 'ceia-de-natal', position: 1 },
      { name: 'Ceia de Ano Novo', slug: 'ceia-de-ano-novo', position: 2 },
    ])
    .returning({ id: category.id, name: category.name });
  for (const c of cats) ids[c.name] = c.id;
  const prods = await app.db
    .insert(product)
    .values([
      { categoryId: ids['Pães']!, name: 'Pão de Queijo', saleUnit: 'UN', basePrice: '1.00' },
      { categoryId: ids['Ceia de Natal']!, name: 'Chester', saleUnit: 'UN', basePrice: '120.00' },
      { categoryId: ids['Ceia de Ano Novo']!, name: 'Lombo', saleUnit: 'UN', basePrice: '90.00' },
    ])
    .returning({ id: product.id, name: product.name });
  for (const p of prods) ids[p.name] = p.id;
});

const especial = (cat: string, special: object | null) =>
  op('PUT', `/api/painel/catalogo/categorias/${ids[cat]}`, { special });
const site = async () => (await app.browser()('GET', '/api/catalogo')).body;
const nomes = async () => (await site()).categorias.map((c: { name: string }) => c.name);
const datas = async (...produtos: string[]) =>
  (await app.browser()('GET', `/api/agenda/disponibilidade?produtos=${produtos.map((p) => ids[p]).join(',')}`)).body;

describe('Item de cardápio encerrado (C115, RN64, G36)', () => {
  it('o item da ceia encerrada não vira item regular: nenhum dia e o item é apontado', async () => {
    await especial('Ceia de Natal', NATAL);
    now = '2026-12-22T18:55';
    expect((await datas('Chester')).days.map((d: { date: string }) => d.date)).toEqual(['2026-12-24']);
    // A ceia sai do site depois de 22/12; o cliente ainda tem o Chester no carrinho, com a página aberta.
    now = '2026-12-23T08:00';
    const agenda = await datas('Chester', 'Pão de Queijo');
    expect(agenda.unavailable).toEqual([ids['Chester']]);
    expect(agenda.days).toEqual([]);
  });

  it('sem itens encerrados, a lista vem vazia', async () => {
    expect((await datas('Pão de Queijo')).unavailable).toEqual([]);
  });
});

describe('Cadastro', () => {
  it('C70: aparece só dentro do período, antes das regulares, com as datas de retirada', async () => {
    const r = await especial('Ceia de Natal', NATAL);
    expect(r.status).toBe(200);
    const painel = r.body.find((c: { name: string }) => c.name === 'Ceia de Natal');
    expect(painel.special).toEqual({ ...NATAL, hidden: false });
    expect(painel.specialState).toBe('visivel');
    // C113: o fim calculado, sem campo "até".
    expect(painel.specialEnd).toEqual({ date: '2026-12-22', time: '19:00' });
    expect(painel.specialAnnouncement).toBe('Retirada em 24/12. Encomendas até 22/12');

    const cat = (await site()).categorias.find((c: { name: string }) => c.name === 'Ceia de Natal');
    expect(cat.special).toEqual({
      pickupDates: ['2026-12-24'],
      announcement: 'Retirada em 24/12. Encomendas até 22/12',
      closedProducts: [],
    });

    now = '2026-11-30T10:00';
    expect(await nomes()).not.toContain('Ceia de Natal');
    expect((await site()).produtos.map((p: { name: string }) => p.name)).not.toContain('Chester');
    now = '2026-12-23T10:00';
    expect(await nomes()).not.toContain('Ceia de Natal');
  });

  it('C71: ocultar some do site na hora; reexibir volta', async () => {
    await especial('Ceia de Natal', NATAL);
    const oculto = await op('PUT', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}/oculto`, { hidden: true });
    expect(oculto.body.find((c: { name: string }) => c.name === 'Ceia de Natal').specialState).toBe('oculto');
    expect(await nomes()).not.toContain('Ceia de Natal');
    // O carrinho perde o item: o produto não vem mais no cardápio.
    expect((await site()).produtos.some((p: { id: number }) => p.id === ids.Chester)).toBe(false);
    await op('PUT', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}/oculto`, { hidden: false });
    expect(await nomes()).toContain('Ceia de Natal');
    // Só cardápio especial pode ser ocultado.
    expect((await op('PUT', `/api/painel/catalogo/categorias/${ids['Pães']}/oculto`, { hidden: true })).status).toBe(404);
  });

  it('C72: recusa dados inválidos', async () => {
    const inicio = await especial('Ceia de Natal', { ...NATAL, visibleFrom: '' });
    expect(inicio.status).toBe(400);
    expect(inicio.body.error).toBe('Informe o início');
    expect((await especial('Ceia de Natal', { ...NATAL, pickupDates: [] })).body.error).toMatch(/ao menos uma data/);
    expect((await especial('Ceia de Natal', { ...NATAL, pickupDates: ['2026-11-20'] })).body.error).toMatch(
      /a partir do início/,
    );
  });

  it('renomear não desfaz o cardápio especial; special: null volta a ser regular', async () => {
    await especial('Ceia de Natal', NATAL);
    const r = await op('PUT', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}`, { name: 'Natal' });
    expect(r.body.find((c: { name: string }) => c.name === 'Natal').special).not.toBeNull();
    const regular = await especial('Ceia de Natal', null);
    expect(regular.body.find((c: { name: string }) => c.name === 'Natal')).toMatchObject({ special: null, specialState: null });
  });
});

describe('Fim pelo prazo das datas (RF60, RN62, RN63, RN67)', () => {
  it('C112: depois do último prazo some do site e fica Encerrado no painel, ainda editável', async () => {
    await especial('Ceia de Natal', NATAL);
    now = '2026-12-22T18:59';
    expect(await nomes()).toContain('Ceia de Natal');
    now = '2026-12-22T19:00';
    expect(await nomes()).not.toContain('Ceia de Natal');
    const lista = (await op('GET', '/api/painel/catalogo/categorias')).body;
    expect(lista.find((c: { name: string }) => c.name === 'Ceia de Natal')).toMatchObject({
      specialState: 'encerrado',
      specialAnnouncement: null,
    });
  });

  it('C114: uma data nova ainda aberta traz o cardápio de volta; oculto pelo operador continua oculto', async () => {
    await especial('Ceia de Natal', NATAL);
    now = '2026-12-23T10:00';
    expect(await nomes()).not.toContain('Ceia de Natal');
    // 26/12 é um dia normal: vale a antecedência dos itens, e o anúncio diz só a data.
    await especial('Ceia de Natal', { ...NATAL, pickupDates: ['2026-12-24', '2026-12-26'] });
    const cat = (await site()).categorias.find((c: { name: string }) => c.name === 'Ceia de Natal');
    expect(cat.special).toMatchObject({ pickupDates: ['2026-12-26'], announcement: 'Retirada em 26/12' });
    await op('PUT', `/api/painel/catalogo/categorias/${ids['Ceia de Natal']}/oculto`, { hidden: true });
    expect(await nomes()).not.toContain('Ceia de Natal');
  });

  it('C121: item que não chega mais à data normal do cardápio vem com o prazo encerrado', async () => {
    const [torta] = await app.db
      .insert(product)
      .values({ categoryId: ids['Ceia de Ano Novo']!, name: 'Torta Especial', saleUnit: 'UN', basePrice: '80.00', leadTimeHours: 48 })
      .returning({ id: product.id });
    await especial('Ceia de Ano Novo', { visibleFrom: '2026-12-01', pickupDates: ['2026-12-12'] });
    now = '2026-12-11T10:00';
    const cat = (await site()).categorias.find((c: { name: string }) => c.name === 'Ceia de Ano Novo');
    expect(cat.special).toEqual({ pickupDates: ['2026-12-12'], announcement: 'Retirada em 12/12', closedProducts: [torta!.id] });
  });

  it('C125: o painel avisa que o cardápio começaria no site já encerrado', async () => {
    const r = await especial('Ceia de Natal', { visibleFrom: '2026-12-23', pickupDates: ['2026-12-24'] });
    expect(r.status).toBe(200);
    expect(r.body.find((c: { name: string }) => c.name === 'Ceia de Natal').specialWarnings).toEqual([
      'O cardápio começaria no site já encerrado: o último prazo (22/12) é antes do início (23/12).',
    ]);
  });

  it('o campo antigo visible_until guarda a última data de retirada, para a volta à versão anterior', async () => {
    await especial('Ceia de Natal', { visibleFrom: '2026-12-01', pickupDates: ['2026-12-31', '2026-12-24'] });
    const [c] = await app.db.select().from(category).where(eq(category.id, ids['Ceia de Natal']!));
    expect(c!.visibleUntil).toBe('2026-12-31');
  });
});

describe('Retirada no carrinho', () => {
  beforeEach(async () => {
    await especial('Ceia de Natal', NATAL);
    await especial('Ceia de Ano Novo', ANO_NOVO);
  });

  it('C73: com a ceia, só 24/12, sem escolha de horário por ser data especial', async () => {
    const a = await datas('Chester');
    expect(a.days.map((d: { date: string }) => d.date)).toEqual(['2026-12-24']);
    expect(a.days[0].special).toBe('Véspera de Natal');
    expect(a.rule.menus).toEqual([{ name: 'Ceia de Natal', pickupDates: ['2026-12-24'] }]);
  });

  it('C74: pães junto com a ceia vão em 24/12', async () => {
    expect((await datas('Chester', 'Pão de Queijo')).days.map((d: { date: string }) => d.date)).toEqual(['2026-12-24']);
  });

  it('C75: Natal e Ano Novo sem data em comum', async () => {
    const a = await datas('Chester', 'Lombo');
    expect(a.days).toEqual([]);
    expect(a.rule.conflict).toBe(true);
  });

  it('C76: só regular continua com todos os dias', async () => {
    const a = await datas('Pão de Queijo');
    expect(a.days.length).toBeGreaterThan(30);
    expect(a.rule).toEqual({ menus: [], dates: null, conflict: false });
  });
});
