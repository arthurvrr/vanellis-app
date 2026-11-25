import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .stryker-tmp: cópias temporárias dos testes de mutação, se uma execução for interrompida.
    exclude: [...configDefaults.exclude, '**/.stryker-tmp*/**'],
    // Os testes usam PGlite (PostgreSQL em memória); a URL só satisfaz a validação do env.
    // Subir o PGlite e aplicar as migrações leva alguns segundos.
    hookTimeout: 60_000,
    env: { DATABASE_URL: 'postgresql://teste', NODE_ENV: 'test' },
    // Cobertura mínima (RQ04): o CI falha se cair abaixo do piso. Quando a cobertura subir,
    // o piso sobe junto e nunca desce. O piso fica no número inteiro abaixo do medido no GitHub,
    // que varia umas poucas instruções em relação à máquina local. Ficam de fora a inicialização (index, migrate), a carga
    // inicial e o apoio aos testes, verificados pelo teste do Docker e pelos testes de ponta a ponta.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/index.ts', 'src/db/migrate.ts', 'src/db/seed/**'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 94, functions: 93, branches: 76, statements: 90 },
    },
  },
});
