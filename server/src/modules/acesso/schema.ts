// Contas do painel e sessões abertas (RF13, RN54).

import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/** Operador: telas do dia a dia. Admin (superusuário): tudo, mais as ações da RN54. */
export const userRole = pgEnum('user_role', ['operador', 'admin']);

export const appUser = pgTable('app_user', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 40 }).notNull().unique(),
  /** scrypt, no formato de senha.ts. A senha nunca é guardada. */
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSession = pgTable('user_session', {
  /** SHA-256 do token do cookie: quem lê o banco não consegue usar a sessão. */
  tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
