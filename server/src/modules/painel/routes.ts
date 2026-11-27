// Início do painel: pausar pedidos (RF24) e ocultar preços (RF39), cenários C9–C14.

import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { inTransaction } from '../../db/transacao';
import { instanteBrasilia } from '@vanellis/shared';
import { requireUser, type SessionUser } from '../acesso/sessao';
import { registrarSituacao } from '../avisos/registro';
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

export async function readStatus(db: DB): Promise<PainelStatusDTO> {
  const [agenda] = await db.select({ ordersPaused: agendaConfig.ordersPaused }).from(agendaConfig).limit(1);
  const [settings] = await db.select({ pricesHidden: storeSettings.pricesHidden }).from(storeSettings).limit(1);
  return {
    ordersPaused: agenda?.ordersPaused ?? false,
    pricesHidden: settings?.pricesHidden ?? false,
    pdvMissing: (await productsMissingPdv(db)).size,
  };
}

export function painelRouter(db: DB, now: () => string) {
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
    const conta = (res.locals.user as SessionUser).username;
    const agora = new Date(instanteBrasilia(now()));
    // As duas mudanças pedidas juntas valem juntas, ou nenhuma (G10), e entram no histórico de
    // avisos junto (RF68): só o que mudou de fato abre ou fecha um registro.
    await inTransaction(db, async (tx) => {
      const antes = await readStatus(tx);
      if (ordersPaused !== undefined) {
        await tx
          .insert(agendaConfig)
          .values({ id: 1, ordersPaused })
          .onConflictDoUpdate({ target: agendaConfig.id, set: { ordersPaused } });
        if (ordersPaused !== antes.ordersPaused)
          await registrarSituacao(tx, { chave: 'pedidos-pausados', titulo: 'Pedidos pausados', ligado: ordersPaused, conta, agora });
      }
      if (pricesHidden !== undefined) {
        await tx.update(storeSettings).set({ pricesHidden });
        if (pricesHidden !== antes.pricesHidden)
          await registrarSituacao(tx, { chave: 'precos-ocultos', titulo: 'Preços ocultos', ligado: pricesHidden, conta, agora });
      }
    });
    res.json(await readStatus(db));
  });

  return router;
}
