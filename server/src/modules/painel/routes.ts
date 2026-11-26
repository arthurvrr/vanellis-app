// Início do painel: pausar pedidos (RF24) e ocultar preços (RF39), cenários C9–C14.

import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { inTransaction } from '../../db/transacao';
import { requireUser } from '../acesso/sessao';
import { agendaConfig } from '../agenda/schema';
import { productsMissingPdv } from '../catalogo/repository';
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
  return {
    ordersPaused: agenda?.ordersPaused ?? false,
    pricesHidden: settings?.pricesHidden ?? false,
    pdvMissing: (await productsMissingPdv(db)).size,
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
    // As duas mudanças pedidas juntas valem juntas, ou nenhuma (G10).
    await inTransaction(db, async (tx) => {
      if (ordersPaused !== undefined) {
        await tx
          .insert(agendaConfig)
          .values({ id: 1, ordersPaused })
          .onConflictDoUpdate({ target: agendaConfig.id, set: { ordersPaused } });
      }
      if (pricesHidden !== undefined) {
        await tx.update(storeSettings).set({ pricesHidden });
      }
    });
    res.json(await readStatus(db));
  });

  return router;
}
