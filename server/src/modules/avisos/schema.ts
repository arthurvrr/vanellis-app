// Histórico da central de avisos (RF68): início e fim de cada problema de sistema (backup, cópia
// externa) e as ações na loja (pausar pedidos, ocultar preços, revisão marcada). Guardado 1 ano.

import { sql } from 'drizzle-orm';
import { index, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const avisoEvento = pgTable(
  'aviso_evento',
  {
    id: serial('id').primaryKey(),
    /** Tipo do aviso (TipoAviso) ou da ação ('revisao-marcada'). */
    tipo: varchar('tipo', { length: 40 }).notNull(),
    /** Igual à chave do aviso ativo; no máximo um registro aberto por chave. */
    chave: varchar('chave', { length: 80 }).notNull(),
    gravidade: varchar('gravidade', { length: 10 }).notNull(),
    titulo: text('titulo').notNull(),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    /** `null` = ainda valendo. */
    fim: timestamp('fim', { withTimezone: true }),
    /** Quem fez a ação (ou abriu o registro); `null` nos problemas de sistema. */
    conta: varchar('conta', { length: 50 }),
    contaFim: varchar('conta_fim', { length: 50 }),
    /** Quem marcou Ciente num aviso vermelho (RN72). */
    cientePor: varchar('ciente_por', { length: 50 }),
    cienteEm: timestamp('ciente_em', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('aviso_evento_aberto').on(t.chave).where(sql`${t.fim} is null`),
    index('aviso_evento_inicio').on(t.inicio),
  ],
);
