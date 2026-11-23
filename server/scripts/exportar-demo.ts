// Exporta catálogo, agenda e configurações do banco para client/src/demo/dados.json.
// A versão de teste (GitHub Pages) não tem servidor: lê esse arquivo e calcula os
// horários no navegador com as mesmas funções do servidor (pacote shared).
// Rode depois de mudar o catálogo ou a agenda: npm run demo:export

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { inArray } from 'drizzle-orm';
import { nowInBrasilia, type DemoData } from '@vanellis/shared';
import { db, pool } from '../src/db/client';
import { getAgendaInput } from '../src/modules/agenda/repository';
import { getCatalogo } from '../src/modules/catalogo/repository';
import { getSettings, toPublicSettings } from '../src/modules/configuracoes/repository';
import { storedImageId } from '../src/modules/imagens/imagens';
import { storedImage } from '../src/modules/imagens/schema';

const settings = await getSettings(db);
if (!settings) throw new Error('Configurações da loja não cadastradas (rode npm run db:seed)');
const { input, paused } = await getAgendaInput(db);

const data: DemoData = {
  catalogo: await getCatalogo(db, nowInBrasilia().slice(0, 10)),
  agenda: { input, paused },
  configuracoes: toPublicSettings(settings),
};

// Fotos enviadas pelo painel ficam no banco (RN56); a versão de teste não tem servidor, então
// elas viram arquivos em public/images/enviadas e os endereços são trocados.
const fotosDir = new URL('../../client/public/images/enviadas/', import.meta.url);
rmSync(fotosDir, { recursive: true, force: true });
const usadas = new Set<number>();
const troca = (url: string | null) => {
  const id = storedImageId(url);
  if (!id) return url;
  usadas.add(id);
  return `/images/enviadas/${id}.webp`;
};
data.catalogo.categorias = data.catalogo.categorias.map((c) => ({ ...c, coverImageUrl: troca(c.coverImageUrl) }));
data.catalogo.produtos = data.catalogo.produtos.map((p) => ({
  ...p,
  imageUrl: troca(p.imageUrl),
  groups: p.groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, imageUrl: troca(o.imageUrl) })) })),
}));
if (usadas.size) {
  mkdirSync(fotosDir, { recursive: true });
  const fotos = await db.select().from(storedImage).where(inArray(storedImage.id, [...usadas]));
  for (const f of fotos) writeFileSync(new URL(`${f.id}.webp`, fotosDir), f.data);
}

const out = new URL('../../client/src/demo/dados.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Dados da versão de teste exportados: ${data.catalogo.produtos.length} produtos, ${usadas.size} fotos enviadas.`);
await pool.end();
