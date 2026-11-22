// Sessões do painel: token aleatório no cookie (httpOnly), só o hash dele no banco.

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from '../../db/client';
import { appUser, userSession } from './schema';

export const SESSION_COOKIE = 'vnl_sessao';
export const SESSION_DAYS = 7;

export type Role = 'operador' | 'admin';
export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(db: DB, userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  // Aproveita para apagar as sessões vencidas.
  await db.delete(userSession).where(lt(userSession.expiresAt, new Date()));
  await db.insert(userSession).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function findSession(db: DB, token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: appUser.id, username: appUser.username, role: appUser.role })
    .from(userSession)
    .innerJoin(appUser, eq(appUser.id, userSession.userId))
    .where(and(eq(userSession.tokenHash, hashToken(token)), gt(userSession.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.delete(userSession).where(eq(userSession.tokenHash, hashToken(token)));
}

/** Encerra todas as sessões de um usuário (troca de senha, RN54). */
export async function deleteUserSessions(db: DB, userId: number): Promise<void> {
  await db.delete(userSession).where(eq(userSession.userId, userId));
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/api', expires: expiresAt });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/api' });
}

/**
 * Exige login (e, se pedido, o papel admin). O usuário fica em `res.locals.user`.
 * Pedidos que mudam dados precisam vir como JSON: um formulário de outro site não consegue
 * mandar JSON com o cookie sem passar pela checagem do navegador (proteção contra CSRF).
 */
export function requireUser(db: DB, role?: 'admin') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      res.status(415).json({ error: 'Envie os dados como JSON' });
      return;
    }
    const token = readSessionCookie(req);
    const user = token ? await findSession(db, token) : null;
    if (!user) {
      res.status(401).json({ error: 'Entre no painel para continuar' });
      return;
    }
    if (role === 'admin' && user.role !== 'admin') {
      res.status(403).json({ error: 'Só o superusuário pode fazer isso' });
      return;
    }
    res.locals.user = user;
    next();
  };
}
