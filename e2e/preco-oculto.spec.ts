// Preço oculto por produto, de ponta a ponta (RF69, RN76–RN78; C146–C149). O operador liga a
// opção no cadastro pelo painel; o cliente pede o produto junto com Coxinhas e a mensagem diz que
// o valor dele fica a informar.
import { expect, test, type Page } from '@playwright/test';
import { adicionar, capturarWhatsApp, entrarNoPainel, escolherPrimeiroDia, mensagemEnviada, preencherCliente } from './ajuda';

const NOME = 'Bolo Vulcão E2E';
const AVISO = `O valor de ${NOME} não entra no total; a padaria informa pelo WhatsApp`;
let vulcao: number;
let coxinha: { basePrice: number; minQuantity: number };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

/** Uma cópia da Coxinha vira o Bolo Vulcão E2E, a R$ 120,00, ainda com o preço visível. */
async function montar(page: Page) {
  await entrarNoPainel(page);
  const api = page.request;
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const original = lista.find((p: { name: string }) => p.name === 'Coxinha');
  coxinha = await (await api.get(`/api/painel/catalogo/produtos/${original.id}/cadastro`)).json();
  const { id } = await (await api.post(`/api/painel/catalogo/produtos/${original.id}/duplicar`, { data: {} })).json();
  const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
  const r = await api.put(`/api/painel/catalogo/produtos/${id}`, {
    data: { ...form, name: NOME, basePrice: 120, minQuantity: 1, available: true, priceHidden: false },
  });
  expect(r.ok()).toBeTruthy();
  vulcao = id;
}

test.beforeEach(async ({ page }) => {
  await capturarWhatsApp(page);
  await montar(page);
});
test.afterEach(async ({ page }) => {
  await page.request.delete(`/api/painel/catalogo/produtos/${vulcao}`, { data: {} });
});

/** Liga "Ocultar o preço no site" no cadastro, como o operador faz. */
async function ocultarPreco(page: Page) {
  await page.goto(`/painel/#produto/${vulcao}`);
  await page.getByLabel('Ocultar o preço no site').check();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(`${NOME} salvo.`)).toBeVisible();
}

test('C146–C149: o produto de preço oculto é pedido junto com outros e o valor dele fica a informar', async ({ page }) => {
  await ocultarPreco(page);
  // C146: a lista do painel marca o produto.
  await page.goto('/painel/#produtos');
  const linha = page.getByRole('listitem').filter({ hasText: NOME });
  await expect(linha.getByText('Preço oculto')).toBeVisible();

  // C146: no site, o card e o detalhe não têm o valor.
  await page.goto('/#salgados');
  const card = page.getByRole('button', { name: new RegExp(NOME) });
  await expect(card).toContainText('Preço informado pelo WhatsApp');
  await expect(card).not.toContainText('R$');
  await adicionar(page, 'salgados', NOME);
  await adicionar(page, 'salgados', 'Coxinha');
  const total = coxinha.basePrice * coxinha.minQuantity;

  // C147: no carrinho e no checkout, o total é só o das Coxinhas, com o aviso.
  await page.goto('/#carrinho');
  const item = page.getByRole('listitem').filter({ hasText: NOME });
  await expect(item).toContainText('Preço informado pelo WhatsApp');
  await expect(page.locator('.cart__total')).toContainText(brl(total));
  await expect(page.getByText(AVISO)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.checkout-summary')).toContainText(`Total ${brl(total)}`);
  await expect(page.getByText(AVISO)).toBeVisible();

  // C149: a mensagem marca o item e diz que ele ficou de fora do total.
  await escolherPrimeiroDia(page);
  await preencherCliente(page);
  await page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();
  const msg = await mensagemEnviada(page);
  expect(msg).toContain(`• 1x ${NOME} — (preço a informar)`);
  expect(msg).toContain(`Total: ${brl(total)} (sem ${NOME}, preço a informar)`);
});

test('C148: só o produto de preço oculto no carrinho → total informado pelo WhatsApp', async ({ page }) => {
  await ocultarPreco(page);
  await adicionar(page, 'salgados', NOME);
  await page.goto('/#dados');
  await expect(page.locator('.checkout-summary')).toContainText('Total informado pelo WhatsApp');
  await escolherPrimeiroDia(page);
  await preencherCliente(page);
  await page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();
  expect(await mensagemEnviada(page)).toContain('Total: a informar');
});
