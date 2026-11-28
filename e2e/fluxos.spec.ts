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
      special: { visibleFrom: diaBrasilia(0), pickupDates: [retirada] },
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
    data: { ...form, name: 'Chester E2E', categoryIds: [ceia.id], available: true },
  });
  expect(salvo.ok()).toBeTruthy();

  // O cliente vê a ceia em destaque, com o anúncio pela data de retirada (dia normal: só o dia,
  // RN62), e só consegue escolher a data dela.
  await page.goto('/');
  const [, mes, dia] = retirada.split('-');
  const cartao = page.getByRole('button', { name: /Cardápio especial.*Ceia E2E/ });
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText(`Retirada em ${dia}/${mes}`);
  await adicionar(page, 'ceia-e2e', 'Chester E2E');
  await adicionar(page, 'salgados', 'Coxinha');
  await page.goto('/#dados');

  await expect(page.getByText(`Ceia E2E: retirada só em ${dia}/${mes}`)).toBeVisible();
  const dias = page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button', { disabled: false });
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
  await expect(page.getByRole('region', { name: 'Avisos' }).getByText('Pedidos pausados')).toBeVisible();
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
  await expect(page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button', { disabled: false }).first()).toBeVisible();
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
    await expect(calendario.getByRole('button', { disabled: false }).first()).toBeVisible();
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

test('8. item de antecedência longa: o card, a linha do limite e o motivo do dia indisponível (C105–C107)', async ({ page }) => {
  await entrarNoPainel(page);
  const api = page.request;
  const produtos = await (await api.get('/api/painel/catalogo/produtos')).json();
  const coxinha = produtos.find((p: { name: string }) => p.name === 'Coxinha');
  const { id } = await (await api.post(`/api/painel/catalogo/produtos/${coxinha.id}/duplicar`, { data: {} })).json();
  try {
    const form = await (await api.get(`/api/painel/catalogo/produtos/${id}/cadastro`)).json();
    // O calendário abre no mês do primeiro dia livre. Se ele cair no dia 1, os dias apagados
    // ficam no mês anterior e o C107 não tem o que testar: aí a antecedência sobe um dia.
    let horas = 0;
    for (const h of [72, 96]) {
      horas = h;
      const salvo = await api.put(`/api/painel/catalogo/produtos/${id}`, {
        data: { ...form, name: 'Bolo E2E', available: true, leadTimeHours: h, minQuantity: 1 },
      });
      expect(salvo.ok()).toBeTruthy();
      const { days } = await (await api.get(`/api/agenda/disponibilidade?produtos=${id}`)).json();
      if (!days[0].date.endsWith('-01')) break;
    }
    // C105: o card avisa a antecedência e a primeira retirada.
    await page.goto('/#salgados');
    await page.getByRole('button', { name: /Bolo E2E/ }).first().click();
    await expect(page.getByText(new RegExp(`Encomende com ${horas}h de antecedência: retirada a partir de \\S+ \\d{2}/\\d{2}`))).toBeVisible();
    await adicionar(page, 'salgados', 'Bolo E2E');
    await page.goto('/#dados');
    // C106: a linha fixa acima do calendário.
    await expect(page.getByText(`Bolo E2E precisa de ${horas}h de antecedência: a retirada é a partir de`)).toBeVisible();
    // C107: um dia apagado continua clicável e diz por quê, sem escolher nada.
    const calendario = page.getByRole('grid', { name: 'Dia da retirada' });
    await expect(calendario.getByRole('button', { disabled: false }).first()).toBeVisible();
    // Pelo teclado, como pede o C107 (o dia apagado continua focável).
    await calendario.locator('button[aria-disabled="true"]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: `Bolo E2E precisa de ${horas}h de antecedência` })).toBeVisible();
    await expect(page.getByText(/^Retirada em /)).toHaveCount(0);
  } finally {
    await api.delete(`/api/painel/catalogo/produtos/${id}`, { data: {} });
  }
});

test('9. tele-entrega só em algumas datas: o outro dia aparece com o motivo, em vez de sumir (C126)', async ({ page }) => {
  await entrarNoPainel(page);
  const api = page.request;
  const antes = (await (await api.get('/api/painel/agenda')).json()).delivery;
  const comEntrega = diaBrasilia(5);
  await api.put('/api/painel/agenda/entrega', { data: { enabled: true, allDays: false, dates: [comEntrega] } });
  try {
    await page.goto('/');
    await adicionar(page, 'salgados', 'Coxinha');
    await page.goto('/#dados');
    await page.getByRole('radio', { name: 'Tele-entrega' }).click();
    const calendario = page.getByRole('grid', { name: 'Dia da retirada' });
    await expect(calendario.getByRole('button', { disabled: false })).toHaveCount(1);
    // Um dia que tem retirada, mas não entrega, continua no calendário e diz por quê.
    const alvo = page.getByRole('button', { name: /indisponível, sem tele-entrega nesta data/ }).first();
    await expect(alvo).toBeVisible();
    await alvo.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'sem tele-entrega nesta data; disponível para retirada' })).toBeVisible();
  } finally {
    await api.put('/api/painel/agenda/entrega', { data: antes });
  }
});
