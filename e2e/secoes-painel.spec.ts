// Seções do cardápio pelo painel, de ponta a ponta (RF71, RF72, RF74, RN81, RN82; C156–C158,
// C162–C164). O operador monta as seções do Ano Novo, põe os produtos nelas pelo editor e vê a lista
// agrupada; o site mostra o resultado.
import { expect, test, type Page } from '@playwright/test';
import { entrarNoPainel } from './ajuda';

const BASE = '/api/painel/catalogo';
const CARDAPIO = 'Ano Novo Painel';
let categoria: number;
const ids: Record<string, number> = {};

test.beforeEach(async ({ page }) => {
  await entrarNoPainel(page);
  const api = page.request;
  const cats = await (await api.post(`${BASE}/categorias`, { data: { name: CARDAPIO } })).json();
  categoria = cats.find((c: { name: string }) => c.name === CARDAPIO).id;
  const lista = await (await api.get(`${BASE}/produtos`)).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha').id;
  for (const name of ['Champanhe P', 'Pernil P', 'Pudim P']) {
    const { id } = await (await api.post(`${BASE}/produtos/${coxinha}/duplicar`, { data: {} })).json();
    ids[name] = id;
    const form = await (await api.get(`${BASE}/produtos/${id}/cadastro`)).json();
    await api.put(`${BASE}/produtos/${id}`, { data: { ...form, name, available: true, categoryIds: [categoria] } });
  }
});

test.afterEach(async ({ page }) => {
  for (const id of Object.values(ids)) await page.request.delete(`${BASE}/produtos/${id}`, { data: {} });
  await page.request.delete(`${BASE}/categorias/${categoria}`, { data: {} });
});

const secoesNaTela = (page: Page) => page.getByRole('list', { name: `Seções de ${CARDAPIO}` }).locator('.secao__nome');

async function salvarProdutoNaSecao(page: Page, produto: string, secao: string) {
  await page.goto(`/painel/#produto/${ids[produto]}`);
  await page.getByLabel(`Seção em ${CARDAPIO}`).selectOption({ label: secao });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(`${produto} salvo.`)).toBeVisible();
}

test('C156–C158, C162–C164: o operador monta as seções, põe os produtos e exclui uma seção', async ({ page }) => {
  await page.goto('/painel/#categorias');
  await page.getByRole('button', { name: `Seções de ${CARDAPIO}` }).click();
  const nova = page.getByLabel(`Nova seção em ${CARDAPIO}`);
  // C156: criar em qualquer ordem e reordenar.
  for (const nome of ['Sobremesas', 'Prato principal', 'Bebidas']) {
    await nova.fill(nome);
    await page.getByRole('button', { name: 'Incluir seção' }).click();
    await expect(secoesNaTela(page).filter({ hasText: nome })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Subir seção Prato principal' }).click();
  await expect(secoesNaTela(page)).toHaveText(['Prato principal', 'Sobremesas', 'Bebidas']);
  // C157: nome repetido no mesmo cardápio é recusado, sem diferenciar maiúsculas.
  await nova.fill('sobremesas');
  await page.getByRole('button', { name: 'Incluir seção' }).click();
  await expect(page.getByRole('alert')).toHaveText('Já existe a seção "Sobremesas" neste cardápio');
  // Renomear.
  await page.getByRole('button', { name: 'Renomear seção Bebidas' }).click();
  await page.getByLabel('Novo nome de Bebidas').fill('Bebidas e espumantes');
  await page.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(secoesNaTela(page)).toHaveText(['Prato principal', 'Sobremesas', 'Bebidas e espumantes']);

  // C158: o produto vai para a seção pelo editor; só os cardápios com seções mostram a escolha.
  await page.goto(`/painel/#produto/${ids['Pudim P']}`);
  await expect(page.getByLabel(`Seção em ${CARDAPIO}`)).toHaveValue('');
  await expect(page.getByLabel('Seção em Salgados')).toHaveCount(0);
  await salvarProdutoNaSecao(page, 'Pudim P', 'Sobremesas');
  await salvarProdutoNaSecao(page, 'Pernil P', 'Prato principal');
  await salvarProdutoNaSecao(page, 'Champanhe P', 'Bebidas e espumantes');

  // C164: a lista de produtos agrupa o cardápio por seção, na ordem do site.
  await page.goto('/painel/#produtos');
  const grupo = page.locator('.plist').filter({ has: page.getByRole('heading', { name: CARDAPIO, exact: true }) });
  await expect(grupo.locator('.plist__secao')).toHaveText(['Prato principal', 'Sobremesas', 'Bebidas e espumantes']);
  await expect(grupo.getByText('sem seção')).toHaveCount(0);

  // C163: excluir a seção pede confirmação com a contagem; o produto fica sem seção.
  await page.goto('/painel/#categorias');
  await page.getByRole('button', { name: `Seções de ${CARDAPIO}` }).click();
  let pergunta = '';
  page.once('dialog', (d) => {
    pergunta = d.message();
    void d.accept();
  });
  await page.getByRole('button', { name: 'Excluir seção Bebidas e espumantes' }).click();
  await expect(secoesNaTela(page)).toHaveText(['Prato principal', 'Sobremesas']);
  expect(pergunta).toBe(
    'Excluir a seção Bebidas e espumantes? 1 produto fica sem seção e continua no cardápio. Isso não pode ser desfeito.',
  );
  await page.goto('/painel/#produtos');
  await expect(grupo.getByText('1 produto sem seção')).toBeVisible();
  await expect(grupo.locator('.plist__secao')).toHaveText(['Prato principal', 'Sobremesas', 'Sem seção']);

  // O site mostra as seções e o Champanhe sem seção no fim.
  await page.goto('/#ano-novo-painel');
  await expect(page.locator('.menu-secao__titulo')).toHaveText(['Prato principal', 'Sobremesas']);
  await expect(page.locator('.menu-secao').last().locator('.mcard__name')).toHaveText(['Champanhe P']);
});
