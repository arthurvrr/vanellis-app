// Carga inicial da agenda de retirada. PROVISÓRIA: horários de exemplo até a padaria
// informar os reais; depois serão mantidos pelo painel (RF20, RF21, RF35).

import { sql } from 'drizzle-orm';
import type { DB } from '../client';
import {
  agendaConfig,
  blockedDate,
  closedSlot,
  specialDate,
  weeklySchedule,
  weeklySlot,
} from '../schema';

const faixasSemana = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['14:00', '16:00'],
  ['16:00', '18:00'],
];
const faixasDomingo = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
];

export async function loadAgenda(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE ${weeklySlot}, ${weeklySchedule}, ${blockedDate}, ${closedSlot}, ${specialDate}, ${agendaConfig} RESTART IDENTITY CASCADE`,
    );

    await tx.insert(agendaConfig).values({ id: 1, minLeadHours: 2, windowDays: 30, ordersPaused: false });

    const [schedule] = await tx
      .insert(weeklySchedule)
      .values({ validFrom: '2026-01-01', validUntil: null })
      .returning({ id: weeklySchedule.id });

    const slots = [
      ...faixasDomingo.map(([start, end]) => ({ weekday: 0, start, end })),
      ...[1, 2, 3, 4, 5, 6].flatMap((weekday) => faixasSemana.map(([start, end]) => ({ weekday, start, end }))),
    ];
    await tx.insert(weeklySlot).values(
      slots.map((s) => ({ scheduleId: schedule!.id, weekday: s.weekday, startTime: s.start!, endTime: s.end! })),
    );

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
