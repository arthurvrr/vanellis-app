// Produto em vários cardápios, de ponta a ponta (RF64, RF65, RN68–RN70; C128–C133). O cenário é
// montado como o operador faria: cardápios e produtos pelo painel. A Quiche E2E está em Salgados
// (regular) e na Ceia E2E (especial, retirada daqui a 10 dias); o Chester E2E só na Ceia E2E; o
// Panetone E2E só nas duas ceias (a Ceia 2 E2E retira daqui a 12 dias).
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { adicionar, capturarWhatsApp, diaBrasilia, entrarNoPainel } from './ajuda';

interface Montagem {
  salgados: number;
  ceia: number;
  ceia2: number;
  quiche: number;
  chester: number;
  panetone: number;
}

const CEIA = diaBrasilia(10);
const CEIA2 = diaBrasilia(12);

async function categoria(api: APIRequestContext, name: string, special: object | null): Promise<number> {
  const r = await api.post('/api/painel/catalogo/categorias', { data: { name, description: null, coverImageUrl: null, special } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).find((c: { name: string }) => c.name === name).id;
}

/** Copia a Coxinha com outro nome, cardápios e antecedência. */
async function produto(api: APIRequestContext, coxinha: number, name: string, categoryIds: number[], leadTimeHours: number | null = null) {
  const { id } = await (await api.post(`/api/painel/catalogo/produtos/${coxinha}/duplicar`, { data: {} })).json();
  const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
  const r = await api.put(`/api/painel/catalogo/produtos/${id}`, {
    data: { ...form, name, categoryIds, available: true, leadTimeHours, minQuantity: 1 },
  });
  expect(r.ok()).toBeTruthy();
  return id as number;
}

async function montar(page: Page): Promise<Montagem> {
  await entrarNoPainel(page);
  const api = page.request;
  const cats = await (await api.get('/api/painel/catalogo/categorias')).json();
  const salgados = cats.find((c: { slug: string }) => c.slug === 'salgados').id;
  const ceia = await categoria(api, 'Ceia E2E', { visibleFrom: diaBrasilia(0), pickupDates: [CEIA] });
  const ceia2 = await categoria(api, 'Ceia 2 E2E', { visibleFrom: diaBrasilia(0), pickupDates: [CEIA2] });
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha').id;
  return {
    salgados,
    ceia,
    ceia2,
    quiche: await produto(api, coxinha, 'Quiche E2E', [salgados, ceia]),
    chester: await produto(api, coxinha, 'Chester E2E', [ceia]),
    panetone: await produto(api, coxinha, 'Panetone E2E', [ceia, ceia2]),
  };
}

async function desmontar(page: Page, m: Montagem) {
  const api = page.request;
  for (const id of [m.quiche, m.chester, m.panetone]) await api.delete(`/api/painel/catalogo/produtos/${id}`, { data: {} });
  for (const id of [m.ceia, m.ceia2]) await api.delete(`/api/painel/catalogo/categorias/${id}`, { data: {} });
}

const diasDisponiveis = (page: Page) => page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button', { disabled: false });

test.beforeEach(async ({ page }) => {
  await capturarWhatsApp(page);
});

test('C128: a Quiche aparece em Salgados e na Ceia, com um cadastro só', async ({ page }) => {
  const m = await montar(page);
  try {
    for (const slug of ['salgados', 'ceia-e2e']) {
      await page.goto(`/#${slug}`);
      await expect(page.getByRole('button', { name: /Quiche E2E/ })).toHaveCount(1);
    }
    // O Chester só na Ceia.
    await page.goto('/#salgados');
    await expect(page.getByRole('button', { name: /Chester E2E/ })).toHaveCount(0);
  } finally {
    await desmontar(page, m);
  }
});

test('C129: a Quiche, também num cardápio regular, segue a retirada normal; com o Chester, só a data da Ceia', async ({
  page,
}) => {
  const m = await montar(page);
  try {
    await adicionar(page, 'ceia-e2e', 'Quiche E2E');
    await page.goto('/#dados');
    await expect(diasDisponiveis(page).first()).toBeVisible();
    expect(await diasDisponiveis(page).count()).toBeGreaterThan(1);

    await adicionar(page, 'ceia-e2e', 'Chester E2E');
    await page.goto('/#dados');
    await expect(diasDisponiveis(page)).toHaveCount(1);
    await expect(diasDisponiveis(page)).toHaveAccessibleName(new RegExp(`, ${Number(CEIA.slice(8))} de `));
  } finally {
    await desmontar(page, m);
  }
});

test('C130: o Panetone, só em cardápios especiais, pode ser retirado na data de qualquer um deles', async ({ page }) => {
  const m = await montar(page);
  try {
    await adicionar(page, 'ceia-e2e', 'Panetone E2E');
    await page.goto('/#dados');
    await expect(diasDisponiveis(page)).toHaveCount(2);
  } finally {
    await desmontar(page, m);
  }
});

test('C131: com a Ceia oculta, a Quiche continua em Salgados e o Chester sai do site', async ({ page }) => {
  const m = await montar(page);
  try {
    await page.request.put(`/api/painel/catalogo/categorias/${m.ceia}/oculto`, { data: { hidden: true } });
    await page.goto('/#salgados');
    await expect(page.getByRole('button', { name: /Quiche E2E/ })).toHaveCount(1);
    const site = await (await page.request.get('/api/catalogo')).json();
    expect(site.produtos.some((p: { name: string }) => p.name === 'Chester E2E')).toBe(false);
    expect(site.produtos.some((p: { name: string }) => p.name === 'Panetone E2E')).toBe(true);
  } finally {
    await desmontar(page, m);
  }
});

test('"Prazo encerrado" não vale para quem também está num cardápio regular (RN67, RN68)', async ({ page }) => {
  const m = await montar(page);
  const api = page.request;
  try {
    // A Ceia passa a retirar amanhã (dia normal); Quiche e Chester pedem 72h e não chegam lá.
    await api.put(`/api/painel/catalogo/categorias/${m.ceia}`, { data: { special: { visibleFrom: diaBrasilia(0), pickupDates: [diaBrasilia(1)] } } });
    for (const id of [m.quiche, m.chester]) {
      const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
      await api.put(`/api/painel/catalogo/produtos/${id}`, { data: { ...form, leadTimeHours: 72 } });
    }
    await page.goto('/#ceia-e2e');
    await expect(page.getByRole('button', { name: /Chester E2E.*Prazo encerrado para este item/ })).toBeVisible();
    const quiche = page.getByRole('button', { name: /Quiche E2E/ }).first();
    await expect(quiche).toBeVisible();
    await expect(quiche).not.toHaveAccessibleName(/Prazo encerrado/);
  } finally {
    await desmontar(page, m);
  }
});

test('pelo painel: o editor acrescenta e tira cardápios; excluir um cardápio deixa quem só estava nele sem cardápio (C128, C132, C133, C135)', async ({
  page,
}) => {
  const m = await montar(page);
  try {
    // O Chester ganha Salgados pelo menu "Adicionar a um cardápio", sem sair da Ceia.
    await page.goto(`/painel/#produto/${m.chester}`);
    await page.getByLabel('Adicionar a um cardápio').selectOption({ label: 'Salgados' });
    await expect(page.getByRole('button', { name: 'Tirar de Salgados' })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Chester E2E salvo.')).toBeVisible();
    let form = await (await page.request.get(`/api/painel/catalogo/produtos/${m.chester}/cadastro`)).json();
    // Os cardápios vêm na ordem dos cardápios: Salgados antes da Ceia.
    expect(form.categoryIds).toEqual([m.salgados, m.ceia]);

    // Tirar todos os cardápios é permitido (C135): o Chester sai do site.
    await page.goto(`/painel/#produto/${m.chester}`);
    await page.getByRole('button', { name: 'Tirar de Ceia E2E' }).click();
    await page.getByRole('button', { name: 'Tirar de Salgados' }).click();
    await expect(page.getByText('Sem cardápio: o produto fica fora do site até ser vinculado.')).toBeVisible();
    // A mensagem "salvo" da primeira gravação ainda está na tela: espera a resposta desta.
    const gravou = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/produtos/${m.chester}`));
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    expect((await gravou).ok()).toBeTruthy();
    form = await (await page.request.get(`/api/painel/catalogo/produtos/${m.chester}/cadastro`)).json();
    expect(form.categoryIds).toEqual([]);
    const site = await (await page.request.get('/api/catalogo')).json();
    expect(site.produtos.some((p: { name: string }) => p.name === 'Chester E2E')).toBe(false);

    // Excluir a Ceia: Quiche e Panetone estão em outros cardápios e continuam (C132).
    await page.goto('/painel/#categorias');
    page.once('dialog', (d) => {
      expect(d.message()).toContain('2 produtos continuam nos outros cardápios');
      expect(d.message()).not.toContain('sem cardápio');
      void d.accept();
    });
    await page.getByRole('listitem').filter({ hasText: 'Ceia E2E' }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Categoria Ceia E2E excluída.')).toBeVisible();
    const quiche = await (await page.request.get(`/api/painel/catalogo/produtos/${m.quiche}/cadastro`)).json();
    expect(quiche.categoryIds).toEqual([m.salgados]);

    // Agora o Panetone só está na Ceia 2: excluí-la o deixa sem cardápio, com aviso (C133).
    page.once('dialog', (d) => {
      expect(d.message()).toContain('1 produto fica sem cardápio e sai do site');
      void d.accept();
    });
    await page.getByRole('listitem').filter({ hasText: 'Ceia 2 E2E' }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Categoria Ceia 2 E2E excluída.')).toBeVisible();
    const panetone = await (await page.request.get(`/api/painel/catalogo/produtos/${m.panetone}/cadastro`)).json();
    expect(panetone.categoryIds).toEqual([]);

    // Os sem cardápio aparecem num grupo próprio da lista de produtos.
    await page.goto('/painel/#produtos');
    const sem = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sem cardápio' }) });
    await expect(sem.getByText('Chester E2E')).toBeVisible();
    await expect(sem.getByText('Panetone E2E')).toBeVisible();
  } finally {
    await desmontar(page, m);
  }
});
