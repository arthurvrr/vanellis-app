// Exporta catálogo, agenda e configurações do banco para client/src/demo/dados.json.
// A versão de teste (GitHub Pages) não tem servidor: lê esse arquivo e calcula os
// horários no navegador com as mesmas funções do servidor (pacote shared).
// Rode depois de mudar o catálogo ou a agenda: npm run demo:export

import { writeFileSync } from 'node:fs';
import type { DemoData } from '@vanellis/shared';
import { db, pool } from '../src/db/client';
import { getAgendaInput } from '../src/modules/agenda/repository';
import { getCatalogo } from '../src/modules/catalogo/repository';
import { storeSettings } from '../src/modules/configuracoes/schema';

const [settings] = await db.select().from(storeSettings).limit(1);
if (!settings) throw new Error('Configurações da loja não cadastradas (rode npm run db:seed)');
const { input, paused } = await getAgendaInput(db);

const data: DemoData = {
  catalogo: await getCatalogo(db),
  agenda: { input, paused },
  configuracoes: {
    whatsappNumber: settings.whatsappNumber,
    instagramUrl: settings.instagramUrl,
    contactPhone: settings.contactPhone,
  },
};

const out = new URL('../../client/src/demo/dados.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Dados da versão de teste exportados: ${data.catalogo.produtos.length} produtos.`);
await pool.end();
