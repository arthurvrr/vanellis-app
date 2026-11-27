// Antecedência do produto menor que a padrão, de ponta a ponta (RF70; C151, C154). A padrão da loja
// vai para 24h; o operador cadastra 1h numa cópia da Coxinha pelo painel. O checkout usa 1h, não 24h.
import { expect, test, type Page } from '@playwright/test';
import { adicionar, entrarNoPainel } from './ajuda';

const NOME = 'Coxinha RF70';
let id: number;

async function montar(page: Page) {
  await entrarNoPainel(page);
  const api = page.request;
  expect((await api.put('/api/painel/agenda/regras', { data: { minLeadHours: 24, windowMonths: 4 } })).ok()).toBeTruthy();
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha');
  ({ id } = await (await api.post(`/api/painel/catalogo/produtos/${coxinha.id}/duplicar`, { data: {} })).json());
  const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
  const r = await api.put(`/api/painel/catalogo/produtos/${id}`, {
    data: { ...form, name: NOME, available: true, minQuantity: 1, leadTimeHours: null },
  });
  expect(r.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => montar(page));
test.afterEach(async ({ page }) => {
  await page.request.delete(`/api/painel/catalogo/produtos/${id}`, { data: {} });
  await page.request.put('/api/painel/agenda/regras', { data: { minLeadHours: 2, windowMonths: 4 } });
});

test('C151, C154: com a padrão em 24h, o produto de 1h é oferecido com 1h de antecedência', async ({ page }) => {
  // O operador cadastra a antecedência própria pelo painel.
  await page.goto(`/painel/#produto/${id}`);
  await page.getByLabel('Antecedência própria').fill('1');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(`${NOME} salvo.`)).toBeVisible();

  // C154: o card expandido mostra a antecedência menor e a primeira retirada.
  await page.goto('/#salgados');
  await page.getByRole('button', { name: new RegExp(NOME) }).first().click();
  await expect(page.locator('.detail').getByText(/^Encomende com 1h de antecedência: retirada a partir de /)).toBeVisible();

  // C151: o checkout pede a agenda para o carrinho e recebe 1h, não 24h.
  await adicionar(page, 'salgados', NOME);
  const agenda = page.waitForResponse((r) => r.url().includes('/api/agenda/disponibilidade'));
  await page.goto('/#dados');
  const corpo = await (await agenda).json();
  expect(corpo.leadHours).toBe(1);
  await expect(page.getByText('24h de antecedência')).toHaveCount(0);
});
