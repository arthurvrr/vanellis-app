import { availableDays, nowInBrasilia, type AgendaDTO } from '@vanellis/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { getAgendaInput, itemsLeadHours } from './repository';

export const agendaRouter = Router();

const query = z.object({
  produtos: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
});

// Dias e faixas de retirada disponíveis para os produtos do carrinho (RF05).
agendaRouter.get('/disponibilidade', async (req, res) => {
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
    days: paused ? [] : availableDays(input, nowInBrasilia(), lead),
  };
  res.json(body);
});
