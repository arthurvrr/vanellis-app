import type { AgendaInput } from '@vanellis/shared';
import type { DB } from '../../db/client';
import {
  agendaConfig,
  blockedDate,
  closedPeriod,
  pickupRestriction,
  specialDate,
} from './schema';

// O PostgreSQL devolve `time` como 'HH:MM:SS'; a agenda trabalha com 'HH:MM'.
const hm = (t: string) => t.slice(0, 5);

export async function getAgendaInput(db: DB): Promise<{ input: AgendaInput; paused: boolean }> {
  const [config] = await db.select().from(agendaConfig).limit(1);
  const schedules = await db.query.weeklySchedule.findMany({ with: { hours: true } });
  const restrictions = await db.select().from(pickupRestriction);
  const blocked = await db.select({ date: blockedDate.date }).from(blockedDate);
  const closed = await db.select().from(closedPeriod);
  const special = await db.select().from(specialDate);

  return {
    paused: config?.ordersPaused ?? false,
    input: {
      minLeadHours: config?.minLeadHours ?? 2,
      windowMonths: config?.windowMonths ?? 4,
      delivery: {
        enabled: config?.deliveryEnabled ?? false,
        allDays: config?.deliveryAllDays ?? true,
        dates: config?.deliveryDates ?? [],
      },
      schedules: schedules.map((s) => ({
        validFrom: s.validFrom,
        validUntil: s.validUntil,
        hours: s.hours.map((h) => ({ weekday: h.weekday, open: hm(h.openTime), close: hm(h.closeTime) })),
      })),
      restrictions: restrictions.map((r) => ({ weekday: r.weekday, start: hm(r.startTime), end: hm(r.endTime) })),
      blockedDates: blocked.map((b) => b.date),
      closedPeriods: closed.map((c) => ({ date: c.date, start: hm(c.startTime), end: hm(c.endTime) })),
      specialDates: special.map((s) => ({ date: s.date, name: s.name })),
    },
  };
}
