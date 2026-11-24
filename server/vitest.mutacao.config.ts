// Vitest dos testes de mutação do servidor (RQ21): só os testes de unidade (*.unidade.test.ts),
// sem servidor nem banco. Os testes de API sobem um Postgres em memória por arquivo e levariam
// horas multiplicados pelas centenas de mutações; eles continuam rodando no CI normal.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.unidade.test.ts'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp*/**'],
  },
});
