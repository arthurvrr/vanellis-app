// Central de avisos de ponta a ponta (RF66–RF68, RN72; C139, C142, C143). O servidor dos testes lê
// a pasta e2e/.backups (e2e/servidor.sh): mudar a data do arquivo de lá simula um backup atrasado.
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { entrarNoPainel } from './ajuda';

const PASTA = 'e2e/.backups';
const ARQUIVO = `${PASTA}/vanellis-e2e.sql.gz`;

/** O último backup bom foi feito `horas` atrás. */
async function backupHa(horas: number) {
  await mkdir(PASTA, { recursive: true });
  await writeFile(ARQUIVO, 'x');
  const t = new Date(Date.now() - horas * 3_600_000);
  await utimes(ARQUIVO, t, t);
}

const sino = (page: Page) => page.getByRole('link', { name: /^Avisos/ });
const agora = (page: Page) => page.getByRole('region', { name: 'Agora' });
const historico = (page: Page) => page.getByRole('region', { name: 'Histórico' });

test.afterEach(async ({ page }) => {
  await backupHa(0);
  await page.request.put('/api/painel/status', { data: { ordersPaused: false, pricesHidden: false } });
});

test('C142: o sino conta os avisos e a tela Avisos lista cada um com o atalho', async ({ page }) => {
  await entrarNoPainel(page, '#avisos');
  // A tela só aparece com os avisos carregados: aí o sino já tem o número certo.
  await expect(agora(page)).toBeVisible();
  const antes = Number((await sino(page).textContent())?.match(/\d+/)?.[0] ?? 0);
  await page.request.put('/api/painel/status', { data: { pricesHidden: true } });
  await page.reload();
  await expect(sino(page)).toContainText(String(antes + 1));
  const item = agora(page).getByRole('listitem').filter({ hasText: 'Preços ocultos' });
  await expect(item).toContainText('O cardápio do site está sem valores.');
  await item.getByRole('link', { name: 'Mostrar preços' }).click();
  await expect(page).toHaveURL(/#inicio$/);
  await expect(page.getByRole('button', { name: 'Mostrar preços' })).toBeVisible();
});

test('C139: backup atrasado deixa o sino vermelho; resolvido, fica no histórico até o Ciente', async ({ page }) => {
  await backupHa(30);
  await entrarNoPainel(page, '#avisos');
  await expect(agora(page).getByText('Backup do banco atrasado')).toBeVisible();
  await expect(sino(page)).toHaveAccessibleName(/problema de sistema/);

  await backupHa(0);
  await page.reload();
  await expect(agora(page).getByText('Backup do banco atrasado')).toHaveCount(0);
  // Resolvido sozinho: continua no sino até alguém marcar Ciente (RN72).
  await expect(sino(page)).toHaveAccessibleName(/problema de sistema/);
  const registro = historico(page).getByRole('listitem').filter({ hasText: 'Backup do banco atrasado' });
  await registro.getByRole('button', { name: 'Ciente' }).click();
  await expect(registro).toContainText('visto por e2e');
  await expect(sino(page)).not.toHaveAccessibleName(/problema de sistema/);
});

test('C143: o Início resume os avisos, mantém os interruptores e leva para a tela; a pausa vai para o histórico', async ({
  page,
}) => {
  await entrarNoPainel(page, '#inicio');
  await page.getByRole('button', { name: 'Pausar pedidos' }).click();
  const resumo = page.getByRole('region', { name: 'Avisos' });
  await expect(resumo.getByText('Pedidos pausados')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retomar pedidos' })).toBeVisible();
  await resumo.getByRole('link', { name: /Ver todos os avisos/ }).click();
  await expect(page).toHaveURL(/#avisos$/);
  await expect(historico(page).getByText(/Pedidos pausados por e2e/)).toBeVisible();
});
