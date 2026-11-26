// Fluxos principais, de ponta a ponta, num navegador de verdade: os caminhos que, se
// quebrarem, fazem a padaria perder pedidos. As regras em detalhe ficam nos testes de
// shared/ e server/; aqui conferimos que as telas as ligam do jeito certo.
import { expect, test } from '@playwright/test';
import {
  adicionar,
  capturarWhatsApp,
  diaBrasilia,
  entrarNoPainel,
  escolherPrimeiroDia,
  mensagemEnviada,
  preencherCliente,
} from './ajuda';

test.beforeEach(async ({ page }) => {
  await capturarWhatsApp(page);
});

test('1. pedido com retirada chega completo ao WhatsApp', async ({ page }) => {
  await adicionar(page, 'salgados', 'Coxinha');
  await adicionar(page, 'tortas', 'Torta Macron', ['Mini']);

  await page.goto('/#carrinho');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retirada e seus dados' })).toBeVisible();
  await escolherPrimeiroDia(page);
  await preencherCliente(page);
  await page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();

  const msg = await mensagemEnviada(page);
  expect(msg).toMatch(/^\*Pedido VNL-[A-Z0-9]{5}\*/);
  expect(msg).toContain('25x Coxinha');
  expect(msg).toContain('1x Torta Macron (Mini)');
  expect(msg).toContain('Total estimado:');
  expect(msg).toMatch(/\*Retirada:\* \S+ \d{2}\/\d{2} às \d{2}:\d{2}/);
  expect(msg).toContain('*Nome:* Maria Teste da Silva');
  expect(msg).toContain('*CPF:* 529.982.247-25');
  expect(msg).toContain('*Telefone:* (51) 99999-9999');
  // O carrinho esvazia depois do envio (RN50).
  await expect(page.getByRole('heading', { name: 'Pedido pronto para envio' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vanellis:carrinho:v1'))).toBe('[]');
});

test('2. pedido com tele-entrega leva o endereço e o aviso de taxa', async ({ page }) => {
  await adicionar(page, 'salgados', 'Coxinha');
  await page.goto('/#dados');

  await page.getByRole('radio', { name: 'Tele-entrega' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega e seus dados' })).toBeVisible();
  await escolherPrimeiroDia(page);
  await page.getByLabel('Rua').fill('Rua das Flores');
  await page.getByLabel('Número', { exact: true }).fill('123');
  await page.getByLabel('Bairro').fill('Centro');
  await page.getByLabel('Cidade').fill('Xangri-lá');
  await expect(page.getByText('A taxa de entrega será informada pela padaria')).toBeVisible();
  await preencherCliente(page);
  await page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();

  const msg = await mensagemEnviada(page);
  expect(msg).toMatch(/\*Entrega:\* \S+ \d{2}\/\d{2} às \d{2}:\d{2}/);
  expect(msg).toContain('*Endereço:* Rua das Flores, 123 - Centro, Xangri-lá');
  expect(msg).not.toContain('*Retirada:*');
});

test('3. cardápio especial só deixa retirar na data dele', async ({ page }) => {
  // O operador monta a "Ceia E2E", visível desde hoje, com retirada só daqui a 10 dias.
  await entrarNoPainel(page);
  const retirada = diaBrasilia(10);
  const api = page.request;
  const cats = await api.post('/api/painel/catalogo/categorias', {
    data: {
      name: 'Ceia E2E',
      description: 'Ceia de teste',
      coverImageUrl: null,
      special: { visibleFrom: diaBrasilia(0), visibleUntil: diaBrasilia(8), pickupDates: [retirada] },
    },
  });
  expect(cats.ok()).toBeTruthy();
  const ceia = (await cats.json()).find((c: { name: string }) => c.name === 'Ceia E2E');

  // Um produto da ceia: cópia da Coxinha, movida para a nova categoria.
  const produtos = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = produtos.find((p: { name: string }) => p.name === 'Coxinha');
  const { id } = await (await api.post(`/api/painel/catalogo/produtos/${coxinha.id}/duplicar`, { data: {} })).json();
  const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
  const salvo = await api.put(`/api/painel/catalogo/produtos/${id}`, {
    data: { ...form, name: 'Chester E2E', categoryId: ceia.id, available: true },
  });
  expect(salvo.ok()).toBeTruthy();

  // O cliente vê a ceia em destaque e só consegue escolher a data dela.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Cardápio especial.*Ceia E2E/ })).toBeVisible();
  await adicionar(page, 'ceia-e2e', 'Chester E2E');
  await adicionar(page, 'salgados', 'Coxinha');
  await page.goto('/#dados');

  const [, mes, dia] = retirada.split('-');
  await expect(page.getByText(`Ceia E2E: retirada só em ${dia}/${mes}`)).toBeVisible();
  const dias = page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button');
  await expect(dias).toHaveCount(1);
  await expect(dias.first()).toHaveAccessibleName(new RegExp(`^\\S+, ${Number(dia)} de `));
});

test('4. reajuste de preço no painel aparece no cardápio', async ({ page }) => {
  await entrarNoPainel(page, '#precos');
  const campo = page.getByLabel('Preço de Beijinho');
  await campo.fill('2,35');
  await page.getByRole('button', { name: 'Salvar 1 alteração' }).click();
  await expect(page.getByText('1 preço salvo')).toBeVisible();

  await page.goto('/#doces');
  await expect(page.getByRole('button', { name: /Beijinho/ }).first()).toContainText('R$ 2,35');
});

test('5. pedidos pausados no painel bloqueiam o envio no site', async ({ page }) => {
  await entrarNoPainel(page, '#inicio');
  await page.getByRole('button', { name: 'Pausar pedidos' }).click();
  await expect(page.getByText('Pedidos pausados.')).toBeVisible();
  try {
    await adicionar(page, 'salgados', 'Coxinha');
    await page.goto('/#dados');
    await expect(page.getByText('No momento a padaria não está recebendo novos pedidos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' })).toHaveCount(0);
  } finally {
    // Devolve a loja ao normal, mesmo se o teste falhar.
    await page.request.put('/api/painel/status', { data: { ordersPaused: false } });
  }
});

test('6. item que sai do cardápio com a página aberta bloqueia a retirada até sair do carrinho (C115)', async ({
  page,
}) => {
  // Um produto novo, cópia da Coxinha, com nome próprio.
  await entrarNoPainel(page);
  const api = page.request;
  const produtos = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = produtos.find((p: { name: string }) => p.name === 'Coxinha');
  const { id } = await (await api.post(`/api/painel/catalogo/produtos/${coxinha.id}/duplicar`, { data: {} })).json();
  const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
  expect((await api.put(`/api/painel/catalogo/produtos/${id}`, { data: { ...form, name: 'Pastel G36', available: true } })).ok()).toBeTruthy();

  // O cliente monta o carrinho com o site aberto.
  await page.goto('/');
  await adicionar(page, 'salgados', 'Pastel G36');
  await adicionar(page, 'salgados', 'Coxinha');

  // Enquanto isso, o produto sai do cardápio (aqui: indisponível; vale igual para cardápio encerrado).
  expect((await api.put(`/api/painel/catalogo/produtos/${id}/disponivel`, { data: { available: false } })).ok()).toBeTruthy();

  // Sem recarregar a página, o cliente segue para a retirada.
  await page.goto('/#dados');
  const aviso = page.getByRole('alert').filter({ hasText: 'Pastel G36 não está mais disponível para pedido' });
  await expect(aviso).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Dia da retirada' })).toHaveCount(0);

  // Ao tirar o item, os dias voltam para o resto do pedido.
  await aviso.getByRole('button', { name: 'Tirar do carrinho' }).click();
  await expect(aviso).toHaveCount(0);
  await expect(page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button').first()).toBeVisible();
});

test('7. data especial em que o cliente escolhe o horário leva o horário na mensagem (C102, C119)', async ({ page }) => {
  await entrarNoPainel(page);
  const data = diaBrasilia(2);
  const criada = await page.request.post('/api/painel/agenda/datas-especiais', {
    data: { date: data, name: 'Especial C119', deadline: null, chooseTime: true, window: { start: '08:00', end: '10:00' } },
  });
  expect(criada.ok()).toBeTruthy();
  try {
    await page.goto('/');
    await adicionar(page, 'salgados', 'Coxinha');
    await page.goto('/#dados');
    const calendario = page.getByRole('grid', { name: 'Dia da retirada' });
    await expect(calendario.getByRole('button').first()).toBeVisible();
    const dia = calendario.getByRole('button', { name: /Especial C119/ });
    // O dia pode cair no mês seguinte ao primeiro mostrado.
    if (!(await dia.count())) await page.getByRole('button', { name: 'Próximo mês' }).click();
    await dia.click();
    // Só os horários do intervalo próprio, até 30 minutos antes do fim.
    await expect(page.getByRole('radio', { name: /^\d{2}:\d{2}$/ })).toHaveText(['08:00', '08:30', '09:00', '09:30']);
    await page.getByRole('radio', { name: '09:00' }).click();
    await preencherCliente(page);
    await page.getByRole('button', { name: 'Enviar pedido pelo WhatsApp' }).click();
    expect(await mensagemEnviada(page)).toMatch(/\*Retirada:\* \S+ \d{2}\/\d{2} \(Especial C119\) às 09:00/);
  } finally {
    await page.request.delete(`/api/painel/agenda/datas-especiais/${data}`, { data: {} });
  }
});
