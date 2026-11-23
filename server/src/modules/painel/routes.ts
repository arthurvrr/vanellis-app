// Início do painel: pausar pedidos (RF24) e ocultar preços (RF39), cenários C9–C14.

import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { requireUser } from '../acesso/sessao';
import { agendaConfig } from '../agenda/schema';
import { storeSettings } from '../configuracoes/schema';

export interface PainelStatusDTO {
  ordersPaused: boolean;
  pricesHidden: boolean;
  /** Produtos sem código PDV no produto nem em opção (RN41, cenário C46). */
  pdvMissing: number;
}

const statusBody = z
  .object({ ordersPaused: z.boolean().optional(), pricesHidden: z.boolean().optional() })
  .strict();

async function readStatus(db: DB): Promise<PainelStatusDTO> {
  const [agenda] = await db.select({ ordersPaused: agendaConfig.ordersPaused }).from(agendaConfig).limit(1);
  const [settings] = await db.select({ pricesHidden: storeSettings.pricesHidden }).from(storeSettings).limit(1);
  const pdv = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from product p
    where p.pdv_code is null
      and not exists (
        select 1 from option o join option_group g on g.id = o.group_id
        where g.product_id = p.id and o.pdv_code is not null
      )`);
  const rows = (pdv as unknown as { rows?: { n: number }[] }).rows ?? (pdv as unknown as { n: number }[]);
  return {
    ordersPaused: agenda?.ordersPaused ?? false,
    pricesHidden: settings?.pricesHidden ?? false,
    pdvMissing: Number(rows[0]?.n ?? 0),
  };
}

export function painelRouter(db: DB) {
  const router = Router();
  router.use(requireUser(db));

  router.get('/status', async (_req, res) => {
    res.json(await readStatus(db));
  });

  router.put('/status', async (req, res) => {
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos' });
      return;
    }
    const { ordersPaused, pricesHidden } = parsed.data;
    if (ordersPaused !== undefined) {
      await db
        .insert(agendaConfig)
        .values({ id: 1, ordersPaused })
        .onConflictDoUpdate({ target: agendaConfig.id, set: { ordersPaused } });
    }
    if (pricesHidden !== undefined) {
      await db.update(storeSettings).set({ pricesHidden });
    }
    res.json(await readStatus(db));
  });

  return router;
}
