import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
