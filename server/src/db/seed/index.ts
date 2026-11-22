// Carga inicial do catálogo (catalogo.json, gerado por scripts/converter-prototipo.ts)
// e da agenda de retirada (provisória).
// ATENÇÃO: apaga e recria catálogo e agenda. Use só em desenvolvimento ou na primeira carga.

import { readFileSync } from 'node:fs';
import { db, pool } from '../client';
import { loadAgenda } from './agenda';
import { loadCatalogo } from './load';
import type { SeedCatalogo } from './types';

const seed = JSON.parse(
  readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'),
) as SeedCatalogo;

await loadCatalogo(db, seed);
await loadAgenda(db);

const pendentes = seed.produtos.filter((p) => p.pending.length).length;
console.log(
  `Carga concluída: ${seed.categorias.length} categorias, ${seed.produtos.length} produtos, ${seed.modelos.length} modelos e agenda provisória.`,
);
console.log(`${pendentes} produtos com pendências (pesos provisórios ou fotos). Códigos PDV ainda vazios.`);
await pool.end();
