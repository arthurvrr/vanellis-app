// Painel: mudanças não salvas não se perdem sem aviso (itens G21 e G22 da revisão externa, C65).
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { diaBrasilia, entrarNoPainel } from './ajuda';

/** Responde à próxima pergunta do navegador (window.confirm) e devolve o texto dela. */
function responderPergunta(page: Page, aceitar: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', (d) => {
      resolve(d.message());
      void (aceitar ? d.accept() : d.dismiss());
    });
  });
}

test('G21: regra editada sem salvar e data bloqueada cadastrada: a regra editada continua na tela', async ({ page }) => {
  await entrarNoPainel(page, '#agenda');
  const antecedencia = page.getByLabel('Antecedência mínima (horas)');
  const nova = (await antecedencia.inputValue()) === '7' ? '8' : '7';
  await antecedencia.fill(nova);

  const data = diaBrasilia(40);
  await page.locator('#bl-data').fill(data);
  await page.getByRole('button', { name: 'Bloquear' }).click();
  try {
    await expect(page.getByText('Data bloqueada.')).toBeVisible();
    await expect(antecedencia).toHaveValue(nova);
  } finally {
    await page.request.delete(`/api/painel/agenda/datas-bloqueadas/${data}`, { data: {} });
  }
});

test('G21: agenda com mudança não salva pergunta antes de trocar de tela; as subseções não perguntam', async ({
  page,
}) => {
  await entrarNoPainel(page, '#agenda');
  const antecedencia = page.getByLabel('Antecedência mínima (horas)');
  const nova = (await antecedencia.inputValue()) === '7' ? '8' : '7';
  await antecedencia.fill(nova);

  // Ir a outra seção da própria Agenda é só rolar a tela: sem pergunta.
  let perguntou = false;
  const marcar = () => (perguntou = true);
  page.on('dialog', marcar);
  await page.getByRole('link', { name: 'Datas especiais' }).click();
  await expect(page).toHaveURL(/#agenda\/especiais$/);
  page.off('dialog', marcar);
  expect(perguntou).toBe(false);

  // Trocar de tela pergunta; ficando, a mudança continua.
  const pergunta = responderPergunta(page, false);
  await page.getByRole('link', { name: 'Início' }).click();
  expect(await pergunta).toContain('não foram salvas');
  await expect(antecedencia).toHaveValue(nova);
});

test('G22: produto editado sem salvar, clique em Agenda: pergunta antes de sair', async ({ page }) => {
  await entrarNoPainel(page, '#produtos');
  const lista = await (await page.request.get('/api/painel/catalogo/produtos')).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha');
  await page.locator(`a[href="#produto/${coxinha.id}"]`).click();
  const nome = page.getByLabel('Nome', { exact: true });
  await expect(nome).toHaveValue('Coxinha');
  await nome.fill('Coxinha sem salvar');

  const fica = responderPergunta(page, false);
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  expect(await fica).toContain('Sair sem salvar');
  await expect(nome).toHaveValue('Coxinha sem salvar');

  // Confirmando, sai e nada foi gravado.
  const sai = responderPergunta(page, true);
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await sai;
  await expect(page.getByRole('heading', { name: 'Agenda de retirada' })).toBeVisible();
  const produtos = await (await page.request.get('/api/painel/catalogo/produtos')).json();
  expect(produtos.some((p: { name: string }) => p.name === 'Coxinha sem salvar')).toBe(false);
});

test('G22: salvar o produto volta à lista sem perguntar nada', async ({ page }) => {
  await entrarNoPainel(page, '#produtos');
  const api = page.request;
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = lista.find((p: { name: string }) => p.name === 'Coxinha');
  const original = await (await api.get(`/api/painel/catalogo/produtos/${coxinha.id}/cadastro`)).json();
  let perguntou = false;
  page.on('dialog', (d) => {
    perguntou = true;
    void d.dismiss();
  });
  try {
    await page.locator(`a[href="#produto/${coxinha.id}"]`).click();
    await page.getByLabel('Nome', { exact: true }).fill('Coxinha G22');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Coxinha G22 salvo.')).toBeVisible();
    await expect(page).toHaveURL(/#produtos$/);
    expect(perguntou).toBe(false);
  } finally {
    await api.put(`/api/painel/catalogo/produtos/${coxinha.id}`, { data: original });
  }
});

test('C123: data especial sem prazo é salva com o aviso da véspera; o prazo depois da data é recusado', async ({ page }) => {
  await entrarNoPainel(page, '#agenda/especiais');
  const data = diaBrasilia(50);
  try {
    await page.locator('#es-data').fill(data);
    await page.locator('#es-nome').fill('Data C123');
    // Prazo no próprio dia: recusado já na tela (C125).
    await page.locator('#es-prazo').fill(data);
    await expect(page.getByRole('alert').filter({ hasText: 'O prazo precisa ser antes da própria data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar' })).toBeDisabled();

    await page.locator('#es-prazo').fill('');
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByText('Data especial cadastrada.')).toBeVisible();
    const item = page.locator('#agenda-especiais li').filter({ hasText: 'Data C123' });
    await expect(item).toContainText('(véspera)');
    await expect(item).toContainText('Sem prazo, qualquer produto do site');
  } finally {
    await page.request.delete(`/api/painel/agenda/datas-especiais/${data}`, { data: {} });
  }
});

// Foto PNG de 1x1 pixel, suficiente para o servidor aceitar e converter.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('foto de um sabor: durante o envio não dá para salvar, e a foto fica gravada no sabor', async ({ page }) => {
  await entrarNoPainel(page, '#produtos');
  const api = page.request;
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const torta = lista.find((p: { name: string }) => p.name === 'Torta Baixa');
  const original = await (await api.get(`/api/painel/catalogo/produtos/${torta.id}/cadastro`)).json();
  // Envio lento, como o de uma foto grande pela internet da padaria.
  await page.route('**/api/painel/imagens', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  try {
    await page.locator(`a[href="#produto/${torta.id}"]`).click();
    const sabores = original.groups.find((g: { name: string }) => g.name === 'Sabor');
    const indice = sabores.options.findIndex((o: { name: string }) => o.name === 'Banoffee');
    await page.getByLabel('Foto da opção').nth(indice).setInputFiles({ name: 'banoffee.png', mimeType: 'image/png', buffer: PNG });
    // Enquanto envia, não dá para salvar (antes, salvava sem a foto e dizia que tinha salvo).
    await expect(page.getByText('Enviando…')).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar|Enviando/ }).last()).toBeDisabled();
    // Uma mudança feita durante o envio não se perde quando a foto chega.
    await page.getByLabel('Descrição', { exact: true }).fill('Descrição mudada durante o envio');
    await expect(page.getByText('Enviando…')).toHaveCount(0);
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Descrição mudada durante o envio');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Torta Baixa salvo.')).toBeVisible();
    const salvo = await (await api.get(`/api/painel/catalogo/produtos/${torta.id}/cadastro`)).json();
    const banoffee = salvo.groups.find((g: { name: string }) => g.name === 'Sabor').options[indice];
    expect(banoffee.imageUrl).toMatch(/^\/api\/imagens\/\d+$/);
    expect(salvo.description).toBe('Descrição mudada durante o envio');
  } finally {
    await page.unroute('**/api/painel/imagens');
    await api.put(`/api/painel/catalogo/produtos/${torta.id}`, { data: original });
  }
});

test('foto grande do celular é reduzida no navegador antes do envio, e passa mesmo acima de 10 MB', async ({ page }) => {
  // 3000 × 2000 com ruído: um PNG bem acima de 10 MB, como uma foto de câmera sem compressão.
  const grande = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: '#c08040', noise: { type: 'gaussian', mean: 128, sigma: 60 } },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  expect(grande.length).toBeGreaterThan(10 * 1024 * 1024);

  await entrarNoPainel(page, '#produtos');
  const api = page.request;
  const lista = await (await api.get('/api/painel/catalogo/produtos')).json();
  const torta = lista.find((p: { name: string }) => p.name === 'Torta Baixa');
  const original = await (await api.get(`/api/painel/catalogo/produtos/${torta.id}/cadastro`)).json();
  try {
    await page.locator(`a[href="#produto/${torta.id}"]`).click();
    const envio = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/painel/imagens'));
    await page.getByLabel('Foto', { exact: true }).setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: grande });
    const cabecalhos = await (await envio).allHeaders();
    // Saiu do navegador já convertida e reduzida: JPEG, bem menor que o original.
    expect(cabecalhos['content-type']).toBe('image/jpeg');
    expect(Number(cabecalhos['content-length'])).toBeGreaterThan(0);
    expect(Number(cabecalhos['content-length'])).toBeLessThan(grande.length / 4);
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Torta Baixa salvo.')).toBeVisible();
    const salvo = await (await api.get(`/api/painel/catalogo/produtos/${torta.id}/cadastro`)).json();
    expect(salvo.imageUrl).toMatch(/^\/api\/imagens\/\d+$/);
  } finally {
    await api.put(`/api/painel/catalogo/produtos/${torta.id}`, { data: original });
  }
});
