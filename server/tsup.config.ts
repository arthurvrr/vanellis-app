import { copyFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Build de produção: o servidor e os comandos que rodam no servidor, sem precisar do
// TypeScript nem das ferramentas de desenvolvimento:
//   dist/index.js          o servidor
//   dist/migrate.js        aplica as migrações (roda a cada início do container)
//   dist/seed.js           carga inicial do catálogo (só no primeiro deploy)
//   dist/usuario-senha.js  cria contas do painel e troca senhas (RN55)
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed/index.ts',
    'usuario-senha': 'scripts/usuario-senha.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  // O pacote shared é TypeScript sem build próprio: entra no bundle do servidor.
  noExternal: ['@vanellis/shared'],
  // A carga inicial lê o catálogo ao lado do script compilado.
  onSuccess: async () => {
    copyFileSync('src/db/seed/catalogo.json', 'dist/catalogo.json');
  },
});
