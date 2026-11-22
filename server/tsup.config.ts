import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  // O pacote shared é TypeScript sem build próprio: entra no bundle do servidor.
  noExternal: ['@vanellis/shared'],
});
