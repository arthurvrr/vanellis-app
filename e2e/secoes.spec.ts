// Seções dentro do cardápio no site, de ponta a ponta (RF73, RN80, RN83; C159–C161). O cardápio e
// as seções são montados pela API do painel; as telas do painel para isso vêm no PR seguinte.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { entrarNoPainel } from './ajuda';

const BASE = '/api/painel/catalogo';
let categoria: number;
const produtos: number[] = [];

async function novoProduto(api: APIRequestContext, origem: number, name: string, sectionId: number | null) {
  const { id } = await (await api.post(`${BASE}/produtos/${origem}/duplicar`, { data: {} })).json();
  produtos.push(id);
  const form = await (await api.get(`${BASE}/produtos/${id}/cadastro`)).json();
  const r = await api.put(`${BASE}/produtos/${id}`, {
    data: {
      ...form,
      name,
      available: true,
      categoryIds: [categoria],
      sectionIds: sectionId === null ? {} : { [categoria]: sectionId },
    },
  });
  expect(r.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await entrarNoPainel(page);
  const api = page.request;
  const cats = await (await api.post(`${BASE}/categorias`, { data: { name: 'Ano Novo E2E' } })).json();
  categoria = cats.find((c: { name: string }) => c.name === 'Ano Novo E2E').id;
  for (const name of ['Sobremesas', 'Prato principal', 'Bebidas']) {
    expect((await api.post(`${BASE}/categorias/${categoria}/secoes`, { data: { name } })).status()).toBe(201);
  }
  const secoes = (await (await api.get(`${BASE}/categorias`)).json()).find((c: { id: number }) => c.id === categoria)
    .sections as { id: number; name: string }[];
  const secao = (nome: string) => secoes.find((s) => s.name === nome)!.id;
  // O operador põe Prato principal antes de Sobremesas (C156); Bebidas fica vazia (C161).
  await api.post(`${BASE}/secoes/${secao('Prato principal')}/mover`, { data: { direcao: 'subir' } });
  const lista = await (await api.get(`${BASE}/produtos`)).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha').id;
  await novoProduto(api, coxinha, 'Champanhe E2E', null);
  await novoProduto(api, coxinha, 'Pudim E2E', secao('Sobremesas'));
  await novoProduto(api, coxinha, 'Pernil E2E', secao('Prato principal'));
  await novoProduto(api, coxinha, 'Lombo E2E', secao('Prato principal'));
});

test.afterEach(async ({ page }) => {
  for (const id of produtos.splice(0)) await page.request.delete(`${BASE}/produtos/${id}`, { data: {} });
  await page.request.delete(`${BASE}/categorias/${categoria}`, { data: {} });
});

test('C159–C161: o cardápio mostra as seções na ordem do operador e os produtos sem seção no fim', async ({ page }) => {
  await page.goto('/#ano-novo-e2e');
  await expect(page.getByRole('heading', { name: 'Ano Novo E2E' })).toBeVisible();
  // C159: as seções na ordem do operador; C161: Bebidas, sem produtos, não aparece.
  await expect(page.locator('.menu-secao__titulo')).toHaveText(['Prato principal', 'Sobremesas']);
  const prato = page.getByRole('region', { name: 'Prato principal' });
  await expect(prato.locator('.mcard__name')).toHaveText(['Pernil E2E', 'Lombo E2E']);
  await expect(page.getByRole('region', { name: 'Sobremesas' }).locator('.mcard__name')).toHaveText(['Pudim E2E']);
  // RN80: o produto sem seção vem por último, fora das seções.
  const ultimo = page.locator('.menu-secao').last();
  await expect(ultimo).toHaveClass(/menu-secao--sem-nome/);
  await expect(ultimo.locator('.mcard__name')).toHaveText(['Champanhe E2E']);
});

test('C160: um cardápio sem seções continua como antes', async ({ page }) => {
  await page.goto('/#salgados');
  await expect(page.locator('.mcard__name').first()).toBeVisible();
  await expect(page.locator('.menu-secao__titulo')).toHaveCount(0);
  await expect(page.locator('.menu-secao')).toHaveCount(1);
});
