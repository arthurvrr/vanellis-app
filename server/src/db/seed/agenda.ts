// Carga inicial da agenda de retirada. PROVISÓRIA: horários de exemplo até a padaria
// informar os reais; depois serão mantidos pelo painel (RF20, RF21, RF35).

import { sql } from 'drizzle-orm';
import type { DB } from '../client';
import {
  agendaConfig,
  blockedDate,
  closedPeriod,
  openingHours,
  pickupRestriction,
  specialDate,
  weeklySchedule,
} from '../schema';

export async function loadAgenda(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE ${openingHours}, ${weeklySchedule}, ${pickupRestriction}, ${blockedDate}, ${closedPeriod}, ${specialDate}, ${agendaConfig} RESTART IDENTITY CASCADE`,
    );

    await tx.insert(agendaConfig).values({ id: 1, minLeadHours: 2, windowMonths: 4, ordersPaused: false });

    const [schedule] = await tx
      .insert(weeklySchedule)
      .values({ validFrom: '2026-01-01', validUntil: null })
      .returning({ id: weeklySchedule.id });

    // Segunda a sábado das 7h30 às 19h; domingo das 7h30 ao meio-dia.
    await tx.insert(openingHours).values([
      { scheduleId: schedule!.id, weekday: 0, openTime: '07:30', closeTime: '12:00' },
      ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
        scheduleId: schedule!.id,
        weekday,
        openTime: '07:30',
        closeTime: '19:00',
      })),
    ]);

    // Os dois exemplos da padaria (RN52), valendo para todos os dias.
    await tx.insert(pickupRestriction).values([
      { weekday: null, startTime: '00:00', endTime: '08:30', label: 'Retirada a partir das 8h30' },
      { weekday: null, startTime: '12:00', endTime: '14:00', label: 'Almoço da produção' },
    ]);

    await tx.insert(specialDate).values([
      { date: '2026-12-24', name: 'Véspera de Natal' },
      { date: '2026-12-31', name: 'Véspera de Ano Novo' },
    ]);
    await tx.insert(blockedDate).values([
      { date: '2026-12-25', reason: 'Natal' },
      { date: '2027-01-01', reason: 'Ano Novo' },
    ]);
  });
}
