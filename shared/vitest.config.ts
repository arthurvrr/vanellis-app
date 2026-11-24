import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .stryker-tmp: cópias temporárias dos testes de mutação, se uma execução for interrompida.
    exclude: [...configDefaults.exclude, '**/.stryker-tmp*/**'],
    // Cobertura mínima (RQ04): o CI falha se cair abaixo do piso. Quando a cobertura subir,
    // o piso sobe junto e nunca desce.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-utils.ts', 'src/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 90, functions: 90, branches: 75, statements: 90 },
    },
  },
});
