// Login, sessão e senha do operador (RF13, RN54, cenários C1–C8).

import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import type { DB } from '../../db/client';
import { inTransaction } from '../../db/transacao';
import { appUser } from './schema';
import { DUMMY_HASH, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './senha';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  readSessionCookie,
  requireUser,
  setSessionCookie,
  type SessionUser,
} from './sessao';
import { lockedMinutes, registerFailure, registerSuccess } from './tentativas';

const loginBody = z.object({
  usuario: z.string().trim().toLowerCase().min(1).max(40),
  senha: z.string().min(1).max(200),
});

const passwordBody = z.object({
  senha: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`)
    .max(200),
});

const toDTO = (u: SessionUser) => ({ usuario: u.username, papel: u.role });

export function acessoRouter(db: DB) {
  const router = Router();
  const secure = env.NODE_ENV === 'production';

  router.post('/login', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Envie os dados como JSON' });
      return;
    }
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Informe usuário e senha' });
      return;
    }
    const { usuario, senha } = parsed.data;
    // Com o Caddy na frente, o Express lê o IP do cliente no X-Forwarded-For (trust proxy, app.ts).
    const ip = req.ip ?? '';

    // Antes de verificar a senha: um IP ou usuário bloqueado não chega a rodar o scrypt (G07).
    const wait = lockedMinutes(ip, usuario);
    if (wait) {
      res.status(429).json({ error: `Muitas tentativas erradas. Tente de novo em ${wait} min.` });
      return;
    }

    const [user] = await db.select().from(appUser).where(eq(appUser.username, usuario)).limit(1);
    // Mesmo sem usuário, verifica uma senha qualquer: a resposta demora igual e não revela quem existe.
    const ok = await verifyPassword(senha, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      registerFailure(ip, usuario);
      res.status(401).json({ error: 'Usuário ou senha incorretos' });
      return;
    }

    registerSuccess(ip, usuario);
    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(res, token, expiresAt, secure);
    res.json(toDTO(user));
  });

  router.post('/logout', async (req, res) => {
    const token = readSessionCookie(req);
    if (token) await deleteSession(db, token);
    clearSessionCookie(res, secure);
    res.status(204).end();
  });

  router.get('/sessao', requireUser(db), (_req, res) => {
    res.json(toDTO(res.locals.user as SessionUser));
  });

  // Superusuário redefine a senha do operador e encerra as sessões dele (RN54, C6).
  router.put('/operador/senha', requireUser(db, 'admin'), async (req, res) => {
    const parsed = passwordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Senha inválida' });
      return;
    }
    const [operador] = await db.select().from(appUser).where(eq(appUser.role, 'operador')).limit(1);
    if (!operador) {
      res.status(404).json({ error: 'Conta de operador não cadastrada (use npm run usuario:senha)' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.senha);
    // Senha nova e sessões antigas encerradas juntas (G10): nunca a senha trocada com as sessões
    // de antes ainda valendo.
    await inTransaction(db, async (tx) => {
      await tx.update(appUser).set({ passwordHash }).where(eq(appUser.id, operador.id));
      await deleteUserSessions(tx, operador.id);
    });
    res.json({ usuario: operador.username });
  });

  return router;
}
