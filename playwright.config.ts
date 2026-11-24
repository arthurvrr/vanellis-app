// Testes de ponta a ponta (Playwright): um navegador de verdade percorre os fluxos que mais
// importam para a padaria, contra o sistema completo num banco só de teste (e2e/servidor.sh).
//   npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Conta criada só no banco de teste, recriado a cada execução.
process.env.E2E_SENHA ??= 'senha-e2e-local-123';

export default defineConfig({
  testDir: './e2e',
  // Os testes mexem em estado da loja (pausar pedidos, preços): um de cada vez, na ordem.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'bash e2e/servidor.sh',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    env: { E2E_PORT: String(PORT), E2E_SENHA: process.env.E2E_SENHA },
  },
});
