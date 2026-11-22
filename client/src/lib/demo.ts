// Versão de teste (GitHub Pages): build com `vite build --mode demo`. Sem servidor, os dados
// vêm de src/demo/dados.json (npm run demo:export) e o pedido aparece na tela em vez de
// abrir o WhatsApp da padaria.
export const IS_DEMO = import.meta.env.MODE === 'demo';

/** Caminho de arquivo de public/ respeitando a base do site (no Pages, /vanellis-app/). */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
