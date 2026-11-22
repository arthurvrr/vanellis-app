import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes usam PGlite (PostgreSQL em memória); a URL só satisfaz a validação do env.
    // Subir o PGlite e aplicar as migrações leva alguns segundos.
    hookTimeout: 60_000,
    env: { DATABASE_URL: 'postgresql://teste', NODE_ENV: 'test' },
  },
});
