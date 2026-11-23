// Esquema da agenda de retirada: horário de funcionamento com vigência, restrições de retirada,
// datas bloqueadas, períodos fechados por lotação, datas especiais e configuração geral
// (RN11–RN15, RN20, RN31, RN51, RN52).

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
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

/**
 * Um período de funcionamento num dia da semana (0 = domingo). Dia sem linha = fechado (RN32);
 * várias linhas no mesmo dia = intervalo, como o almoço (C67). Sobreposição é validada na API.
 */
export const openingHours = pgTable(
  'opening_hours',
  {
    id: serial('id').primaryKey(),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => weeklySchedule.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    openTime: time('open_time').notNull(),
    closeTime: time('close_time').notNull(),
  },
  (t) => [
    unique('opening_hours_period_unique').on(t.scheduleId, t.weekday, t.openTime),
    check('opening_hours_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('opening_hours_time_check', sql`${t.closeTime} > ${t.openTime}`),
  ],
);

/**
 * Intervalo sem retirada, num dia da semana ou em todos (`weekday` nulo) (RN52).
 * "Retirada só a partir das 8h30" = intervalo de 00:00 a 08:30.
 */
export const pickupRestriction = pgTable(
  'pickup_restriction',
  {
    id: serial('id').primaryKey(),
    weekday: integer('weekday'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    label: varchar('label', { length: 60 }),
  },
  (t) => [
    check('pickup_restriction_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('pickup_restriction_time_check', sql`${t.endTime} > ${t.startTime}`),
  ],
);

/** Data sem retirada (feriado, folga). */
export const blockedDate = pgTable('blocked_date', {
  date: date('date', { mode: 'string' }).primaryKey(),
  reason: varchar('reason', { length: 100 }),
});

/** Período fechado num dia específico, quando lota: um horário ou vários (RN15, RF22). */
export const closedPeriod = pgTable(
  'closed_period',
  {
    id: serial('id').primaryKey(),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [check('closed_period_time_check', sql`${t.endTime} > ${t.startTime}`)],
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
    /** Até quantos meses à frente o cliente pode agendar (RN53). */
    windowMonths: integer('window_months').notNull().default(4),
    /** Pausa o recebimento de novos pedidos (RN11). */
    ordersPaused: boolean('orders_paused').notNull().default(false),
  },
  (t) => [
    check('agenda_config_single_row', sql`${t.id} = 1`),
    check('agenda_config_lead_check', sql`${t.minLeadHours} >= 0`),
    check('agenda_config_window_check', sql`${t.windowMonths} between 1 and 12`),
  ],
);

export const weeklyScheduleRelations = relations(weeklySchedule, ({ many }) => ({
  hours: many(openingHours),
}));

export const openingHoursRelations = relations(openingHours, ({ one }) => ({
  schedule: one(weeklySchedule, { fields: [openingHours.scheduleId], references: [weeklySchedule.id] }),
}));
