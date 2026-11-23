import { availableDays, storeInfo, type AgendaDTO } from '@vanellis/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { getAgendaInput, itemsLeadHours } from './repository';

const query = z.object({
  produtos: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
});

/**
 * Dias e faixas de retirada disponíveis para os produtos do carrinho (RF05).
 * `now` devolve 'AAAA-MM-DDTHH:MM' no horário de Brasília (fixo nos testes).
 */
export function agendaRouter(db: DB, now: () => string) {
  const router = Router();
  router.get('/disponibilidade', async (req, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parâmetro produtos inválido' });
      return;
    }
    const { input, paused } = await getAgendaInput(db);
    const lead = await itemsLeadHours(db, parsed.data.produtos);
    const body: AgendaDTO = {
      paused,
      leadHours: Math.max(input.minLeadHours, lead),
      days: paused ? [] : availableDays(input, now(), lead),
    };
    res.json(body);
  });
  // Situação da loja e horário da semana, para a entrada e o rodapé do site.
  router.get('/loja', async (_req, res) => {
    const { input, paused } = await getAgendaInput(db);
    res.json(storeInfo(input, paused, now()));
  });

  return router;
}
