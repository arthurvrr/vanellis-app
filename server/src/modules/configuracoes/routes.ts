import { Router } from 'express';
import type { DB } from '../../db/client';
import { requireUser, type SessionUser } from '../acesso/sessao';
import { getSettings, toPublicSettings } from './repository';
import { storeSettings } from './schema';
import { settingsPatch } from './validacao';

// Configurações que o site público usa: WhatsApp dos pedidos, contatos e localização.
export function configuracoesRouter(db: DB) {
  const router = Router();
  router.get('/publicas', async (_req, res) => {
    const row = await getSettings(db);
    if (!row) {
      res.status(503).json({ error: 'Configurações da loja não cadastradas' });
      return;
    }
    res.json(toPublicSettings(row));
  });
  return router;
}

// Tela Configurações do painel (RF23, RF34). O operador muda contatos e localização; o
// número que recebe os pedidos só o superusuário muda (RN54).
export function configuracoesPainelRouter(db: DB) {
  const router = Router();
  router.use(requireUser(db));

  router.get('/', async (_req, res) => {
    const row = await getSettings(db);
    if (!row) {
      res.status(503).json({ error: 'Configurações da loja não cadastradas' });
      return;
    }
    res.json(toPublicSettings(row));
  });

  router.put('/', async (req, res) => {
    const parsed = settingsPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const user = res.locals.user as SessionUser;
    if (parsed.data.whatsappNumber !== undefined && user.role !== 'admin') {
      res.status(403).json({ error: 'Só o superusuário pode trocar o WhatsApp que recebe os pedidos' });
      return;
    }
    if (Object.keys(parsed.data).length) await db.update(storeSettings).set(parsed.data);
    const row = await getSettings(db);
    res.json(row ? toPublicSettings(row) : null);
  });

  return router;
}
