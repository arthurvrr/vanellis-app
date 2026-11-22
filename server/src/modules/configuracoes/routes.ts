import type { PublicSettingsDTO } from '@vanellis/shared';
import { Router } from 'express';
import { db } from '../../db/client';
import { storeSettings } from './schema';

export const configuracoesRouter = Router();

// Configurações que o site público usa: WhatsApp dos pedidos e atalhos de contato.
configuracoesRouter.get('/publicas', async (_req, res) => {
  const [row] = await db.select().from(storeSettings).limit(1);
  if (!row) {
    res.status(503).json({ error: 'Configurações da loja não cadastradas' });
    return;
  }
  const body: PublicSettingsDTO = {
    whatsappNumber: row.whatsappNumber,
    instagramUrl: row.instagramUrl,
    contactPhone: row.contactPhone,
  };
  res.json(body);
});
