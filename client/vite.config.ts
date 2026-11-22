import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => ({
  // A versão de teste fica em https://<usuário>.github.io/vanellis-app/.
  base: mode === 'demo' ? '/vanellis-app/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Duas páginas: o site do cliente e o painel (/painel/). A versão de teste não tem
      // servidor, então fica só com o site do cliente.
      input:
        mode === 'demo'
          ? { site: page('index.html') }
          : { site: page('index.html'), painel: page('painel/index.html') },
    },
  },
  server: {
    // Em desenvolvimento, as chamadas /api vão para o servidor Express.
    proxy: { '/api': 'http://localhost:3000' },
  },
}));
