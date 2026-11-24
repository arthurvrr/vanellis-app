// Passos repetidos pelos testes de ponta a ponta, escritos como o cliente e o operador agem.
import { expect, type Page } from '@playwright/test';

export const SENHA = process.env.E2E_SENHA ?? 'senha-e2e-local-123';

/** Hoje + n dias, 'AAAA-MM-DD', no horário de Brasília (o mesmo do servidor). */
export function diaBrasilia(n = 0): string {
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * O site abre o WhatsApp com window.open; nos testes, guardamos o link em vez de abrir,
 * para conferir a mensagem sem sair da página.
 */
export async function capturarWhatsApp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __whatsapp: string[] }).__whatsapp = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { __whatsapp: string[] }).__whatsapp.push(String(url));
      return null;
    };
  });
}

/** Texto da mensagem que iria para o WhatsApp. */
export async function mensagemEnviada(page: Page): Promise<string> {
  const urls = await page.evaluate(() => (window as unknown as { __whatsapp: string[] }).__whatsapp);
  expect(urls, 'o site deveria ter aberto o WhatsApp').toHaveLength(1);
  const url = new URL(urls[0]!);
  expect(url.hostname).toBe('wa.me');
  return url.searchParams.get('text') ?? '';
}

/** Abre a categoria, escolhe o produto, marca as opções e adiciona ao carrinho. */
export async function adicionar(page: Page, categoria: string, produto: string, opcoes: string[] = []) {
  await page.goto(`/#${categoria}`);
  await page.getByRole('button', { name: new RegExp(produto) }).first().click();
  const detalhe = page.locator('.detail').filter({ has: page.getByRole('heading', { name: produto, exact: true }) });
  for (const o of opcoes) await detalhe.getByRole('button', { name: o, exact: true }).click();
  await detalhe.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByText(`${produto} adicionado ao carrinho`)).toBeVisible();
}

/** Na tela de retirada: o primeiro dia disponível e, se houver escolha, o primeiro horário. */
export async function escolherPrimeiroDia(page: Page) {
  const dias = page.getByRole('grid', { name: 'Dia da retirada' }).getByRole('button');
  await dias.first().click();
  const horarios = page.getByRole('radio', { name: /^\d{2}:\d{2}$/ });
  if (await horarios.count()) await horarios.first().click();
}

/** Dados do cliente (fictícios; CPF válido só no formato) e "Li e concordo". */
export async function preencherCliente(page: Page) {
  await page.getByLabel('Nome completo').fill('Maria Teste da Silva');
  await page.getByLabel('CPF').fill('52998224725');
  await page.getByLabel('Telefone com DDD').fill('51999999999');
  await page.getByLabel('Li e concordo').check();
}

/** Entra no painel pela tela de login, com a conta criada só para os testes. */
export async function entrarNoPainel(page: Page, tela = '') {
  await page.goto(`/painel/${tela}`);
  await page.getByLabel('Usuário').fill('e2e');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}
