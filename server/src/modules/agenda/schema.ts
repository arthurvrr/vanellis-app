// Esquema da agenda de retirada: horário semanal com vigência, faixas, datas bloqueadas,
// faixas fechadas por lotação, datas especiais e configuração geral (RN11–RN15, RN20, RN31).

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  time,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

/** Horário semanal em vigor a partir de uma data e, opcionalmente, até outra (RN31). */
export const weeklySchedule = pgTable(
  'weekly_schedule',
  {
    id: serial('id').primaryKey(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validUntil: date('valid_until', { mode: 'string' }),
  },
  (t) => [check('weekly_schedule_period_check', sql`${t.validUntil} >= ${t.validFrom}`)],
);

/** Faixa de retirada num dia da semana (0 = domingo). Dia sem faixas = fechado (RN32). */
export const weeklySlot = pgTable(
  'weekly_slot',
  {
    id: serial('id').primaryKey(),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => weeklySchedule.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    unique('weekly_slot_unique').on(t.scheduleId, t.weekday, t.startTime),
    check('weekly_slot_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('weekly_slot_time_check', sql`${t.endTime} > ${t.startTime}`),
  ],
);

/** Data sem retirada (feriado, folga). */
export const blockedDate = pgTable('blocked_date', {
  date: date('date', { mode: 'string' }).primaryKey(),
  reason: varchar('reason', { length: 100 }),
});

/** Faixa fechada num dia específico, quando lota (RN15, RF22). */
export const closedSlot = pgTable(
  'closed_slot',
  {
    date: date('date', { mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.startTime] })],
);

/** Data especial: o cliente escolhe só o dia e o horário é combinado (RN20, RN21). */
export const specialDate = pgTable('special_date', {
  date: date('date', { mode: 'string' }).primaryKey(),
  name: varchar('name', { length: 60 }).notNull(),
});

/** Configuração da agenda: linha única (id = 1). */
export const agendaConfig = pgTable(
  'agenda_config',
  {
    id: integer('id').primaryKey().default(1),
    minLeadHours: integer('min_lead_hours').notNull().default(2),
    windowDays: integer('window_days').notNull().default(30),
    /** Pausa o recebimento de novos pedidos (RN11). */
    ordersPaused: boolean('orders_paused').notNull().default(false),
  },
  (t) => [
    check('agenda_config_single_row', sql`${t.id} = 1`),
    check('agenda_config_lead_check', sql`${t.minLeadHours} >= 0`),
    check('agenda_config_window_check', sql`${t.windowDays} between 1 and 365`),
  ],
);

export const weeklyScheduleRelations = relations(weeklySchedule, ({ many }) => ({
  slots: many(weeklySlot),
}));

export const weeklySlotRelations = relations(weeklySlot, ({ one }) => ({
  schedule: one(weeklySchedule, { fields: [weeklySlot.scheduleId], references: [weeklySchedule.id] }),
}));
