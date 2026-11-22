// Carga inicial do catálogo a partir de catalogo.json (gerado por scripts/converter-prototipo.ts).
// ATENÇÃO: apaga e recria categorias, produtos e modelos. Use só em desenvolvimento
// ou na primeira carga de produção.

import { readFileSync } from 'node:fs';
import { db, pool } from '../client';
import { loadCatalogo } from './load';
import type { SeedCatalogo } from './types';

const seed = JSON.parse(
  readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'),
) as SeedCatalogo;

await loadCatalogo(db, seed);

const pendentes = seed.produtos.filter((p) => p.pending.length).length;
console.log(
  `Carga concluída: ${seed.categorias.length} categorias, ${seed.produtos.length} produtos, ${seed.modelos.length} modelos.`,
);
console.log(`${pendentes} produtos com pendências (pesos provisórios ou fotos). Códigos PDV ainda vazios.`);
await pool.end();
