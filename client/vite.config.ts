import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // A versão de teste fica em https://<usuário>.github.io/vanellis-app/.
  base: mode === 'demo' ? '/vanellis-app/' : '/',
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas /api vão para o servidor Express.
    proxy: { '/api': 'http://localhost:3000' },
  },
}));
