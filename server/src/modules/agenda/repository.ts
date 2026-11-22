import type { AgendaInput } from '@vanellis/shared';
import { inArray, max } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { product } from '../catalogo/schema';
import { agendaConfig, blockedDate, closedSlot, specialDate, weeklySchedule } from './schema';

// O PostgreSQL devolve `time` como 'HH:MM:SS'; a agenda trabalha com 'HH:MM'.
const hm = (t: string) => t.slice(0, 5);

export async function getAgendaInput(db: DB): Promise<{ input: AgendaInput; paused: boolean }> {
  const [config] = await db.select().from(agendaConfig).limit(1);
  const schedules = await db.query.weeklySchedule.findMany({ with: { slots: true } });
  const blocked = await db.select({ date: blockedDate.date }).from(blockedDate);
  const closed = await db.select().from(closedSlot);
  const special = await db.select().from(specialDate);

  return {
    paused: config?.ordersPaused ?? false,
    input: {
      minLeadHours: config?.minLeadHours ?? 2,
      windowDays: config?.windowDays ?? 30,
      schedules: schedules.map((s) => ({
        validFrom: s.validFrom,
        validUntil: s.validUntil,
        slots: s.slots.map((x) => ({ weekday: x.weekday, start: hm(x.startTime), end: hm(x.endTime) })),
      })),
      blockedDates: blocked.map((b) => b.date),
      closedSlots: closed.map((c) => ({ date: c.date, start: hm(c.startTime) })),
      specialDates: special.map((s) => ({ date: s.date, name: s.name })),
    },
  };
}

/** Maior antecedência exigida entre os produtos do carrinho (RN14); 0 se nenhum exige. */
export async function itemsLeadHours(db: DB, productIds: number[]): Promise<number> {
  if (!productIds.length) return 0;
  const [row] = await db
    .select({ lead: max(product.leadTimeHours) })
    .from(product)
    .where(inArray(product.id, productIds));
  return row?.lead ?? 0;
}
