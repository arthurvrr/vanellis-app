// Carga inicial do catálogo (catalogo.json, gerado por scripts/converter-prototipo.ts)
// e da agenda de retirada (provisória).
// ATENÇÃO: apaga e recria catálogo, agenda e configurações. Use só em desenvolvimento ou na
// primeira carga. Se já houver produtos, recusa, a menos que receba --sobrescrever.

import { readFileSync } from 'node:fs';
import { count } from 'drizzle-orm';
import { db, pool } from '../client';
import { product } from '../schema';
import { loadAgenda } from './agenda';
import { loadConfiguracoes } from './configuracoes';
import { loadCatalogo } from './load';
import type { SeedCatalogo } from './types';

const seed = JSON.parse(
  readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'),
) as SeedCatalogo;

const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(product);
if (Number(n) > 0 && !process.argv.includes('--sobrescrever')) {
  console.error(
    `O banco já tem ${n} produtos. A carga inicial apagaria catálogo, agenda e configurações.\n` +
      'Se é isso mesmo que você quer, rode de novo com --sobrescrever.',
  );
  await pool.end();
  process.exit(1);
}

await loadCatalogo(db, seed);
await loadAgenda(db);
await loadConfiguracoes(db);

const pendentes = seed.produtos.filter((p) => p.pending.length).length;
console.log(
  `Carga concluída: ${seed.categorias.length} categorias, ${seed.produtos.length} produtos, ${seed.modelos.length} modelos, agenda e configurações provisórias.`,
);
console.log(`${pendentes} produtos com pendências (pesos provisórios ou fotos). Códigos PDV ainda vazios.`);
await pool.end();
