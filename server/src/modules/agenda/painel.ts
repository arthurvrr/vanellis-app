// Tela Agenda do painel (RF20, RF21, RF22, RF35; cenários C24–C35).
// Toda mudança responde com a agenda inteira, para a tela redesenhar de uma vez.

import {
  deliveryProblem,
  scheduleFor,
  weekHoursProblem,
  type DeliveryConfig,
  type OpeningHours,
  type WeeklySchedule,
} from '@vanellis/shared';
import { and, asc, eq, gt, gte } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { hm } from '../../db/conversao';
import { inTransaction } from '../../db/transacao';
import { requireUser } from '../acesso/sessao';
import {
  agendaConfig,
  blockedDate,
  closedPeriod,
  openingHours,
  pickupRestriction,
  specialDate,
  weeklySchedule,
} from './schema';


export interface ScheduleDTO extends WeeklySchedule {
  id: number;
}

export interface AgendaPainelDTO {
  today: string;
  /** Horário semanal que vale hoje; `null` se nenhum foi cadastrado. */
  current: ScheduleDTO | null;
  /** Mudanças que começam depois de hoje (RF35). */
  upcoming: ScheduleDTO[];
  restrictions: { id: number; weekday: number | null; start: string; end: string; label: string | null }[];
  blockedDates: { date: string; reason: string | null }[];
  specialDates: { date: string; name: string }[];
  closedPeriods: { id: number; date: string; start: string; end: string }[];
  config: { minLeadHours: number; windowMonths: number };
  /** Tele-entrega (RF44, RN43, RN44). */
  delivery: DeliveryConfig;
}

// ---------- validação ----------

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM)');
const weekday = z.number().int().min(0).max(6);

// Um dia pode ter vários períodos, como o intervalo de almoço (C67), sem sobreposição (C68).
const hoursList = z
  .array(z.object({ weekday, open: time, close: time }))
  .max(28)
  .superRefine((list, ctx) => {
    const problem = weekHoursProblem(list);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

const endAfterStart = (v: { start: string; end: string }) => v.end > v.start;
const END_AFTER_START = 'O fim precisa ser depois do início';

const bodies = {
  currentHours: z.object({ hours: hoursList }),
  change: z
    .object({ validFrom: date, validUntil: date.nullable().default(null), hours: hoursList })
    .refine((v) => v.validUntil === null || v.validUntil >= v.validFrom, 'A data de fim precisa ser depois do início'),
  restriction: z
    .object({
      weekday: weekday.nullable(),
      start: time,
      end: time,
      label: z.string().trim().max(60).nullable().default(null),
    })
    .refine(endAfterStart, END_AFTER_START),
  blocked: z.object({ date, reason: z.string().trim().max(100).nullable().default(null) }),
  special: z.object({ date, name: z.string().trim().min(1, 'Informe o nome da data').max(60) }),
  closed: z.object({ date, start: time, end: time }).refine(endAfterStart, END_AFTER_START),
  rules: z
    .object({
      minLeadHours: z.number().int().min(0, 'Antecedência mínima: 0 a 168 horas').max(168, 'Antecedência mínima: 0 a 168 horas'),
      windowMonths: z.number().int().min(1, 'Prazo: de 1 a 12 meses').max(12, 'Prazo: de 1 a 12 meses'),
    })
    .partial()
    .strict(),
  delivery: z.object({ enabled: z.boolean(), allDays: z.boolean(), dates: z.array(date).max(60, 'No máximo 60 datas') }),
};

// ---------- leitura ----------

async function readAgenda(db: DB, today: string): Promise<AgendaPainelDTO> {
  const schedules = await db.query.weeklySchedule.findMany({
    with: { hours: true },
    orderBy: [asc(weeklySchedule.validFrom)],
  });
  const all: ScheduleDTO[] = schedules.map((s) => ({
    id: s.id,
    validFrom: s.validFrom,
    validUntil: s.validUntil,
    hours: s.hours
      .map((h) => ({ weekday: h.weekday, open: hm(h.openTime), close: hm(h.closeTime) }))
      .sort((a, b) => a.weekday - b.weekday || a.open.localeCompare(b.open)),
  }));
  const [config] = await db.select().from(agendaConfig).limit(1);

  return {
    today,
    current: (scheduleFor(all, today) as ScheduleDTO | null) ?? null,
    upcoming: all.filter((s) => s.validFrom > today),
    restrictions: (await db.select().from(pickupRestriction).orderBy(asc(pickupRestriction.startTime))).map((r) => ({
      id: r.id,
      weekday: r.weekday,
      start: hm(r.startTime),
      end: hm(r.endTime),
      label: r.label,
    })),
    blockedDates: await db.select().from(blockedDate).where(gte(blockedDate.date, today)).orderBy(asc(blockedDate.date)),
    specialDates: await db.select().from(specialDate).where(gte(specialDate.date, today)).orderBy(asc(specialDate.date)),
    closedPeriods: (
      await db
        .select()
        .from(closedPeriod)
        .where(gte(closedPeriod.date, today))
        .orderBy(asc(closedPeriod.date), asc(closedPeriod.startTime))
    ).map((c) => ({ id: c.id, date: c.date, start: hm(c.startTime), end: hm(c.endTime) })),
    config: { minLeadHours: config?.minLeadHours ?? 2, windowMonths: config?.windowMonths ?? 4 },
    delivery: {
      enabled: config?.deliveryEnabled ?? false,
      allDays: config?.deliveryAllDays ?? true,
      // Datas que já passaram não interessam mais ao painel.
      dates: (config?.deliveryDates ?? []).filter((d) => d >= today).sort(),
    },
  };
}

async function replaceHours(db: DB, scheduleId: number, hours: OpeningHours[]) {
  await db.delete(openingHours).where(eq(openingHours.scheduleId, scheduleId));
  if (hours.length) {
    await db
      .insert(openingHours)
      .values(hours.map((h) => ({ scheduleId, weekday: h.weekday, openTime: h.open, closeTime: h.close })));
  }
}

// ---------- rotas ----------

/** `today` devolve 'AAAA-MM-DD' no horário de Brasília (fixo nos testes). */
export function agendaPainelRouter(db: DB, today: () => string) {
  const router = Router();
  router.use(requireUser(db));

  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Dados inválidos';
  const respond = async (res: Response) => res.json(await readAgenda(db, today()));

  router.get('/', async (_req, res) => respond(res));

  // Editar o horário em vigor: vale a partir de agora (C24, C25).
  router.put('/horario-atual', async (req, res) => {
    const parsed = bodies.currentHours.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { current } = await readAgenda(db, today());
    // Apagar os horários e gravar os novos numa transação só (G10): se a gravação falhar, o
    // horário anterior continua valendo em vez de a loja ficar sem horário.
    await inTransaction(db, async (tx) => {
      const id =
        current?.id ??
        (await tx.insert(weeklySchedule).values({ validFrom: today() }).returning({ id: weeklySchedule.id }))[0]!.id;
      await replaceHours(tx, id, parsed.data.hours);
    });
    return respond(res);
  });

  // Programar uma mudança, permanente ou com data de fim (C26, C27, C29).
  router.post('/mudancas', async (req, res) => {
    const parsed = bodies.change.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { validFrom, validUntil, hours } = parsed.data;
    if (validFrom <= today()) {
      return fail(res, 400, 'A mudança precisa começar depois de hoje. Para mudar já, edite o horário em vigor.');
    }
    const [same] = await db.select().from(weeklySchedule).where(eq(weeklySchedule.validFrom, validFrom)).limit(1);
    if (same) return fail(res, 409, 'Já existe uma mudança começando nessa data. Remova a outra antes.');
    // A mudança e os horários dela juntos (G10): nunca uma mudança sem horário (loja fechada).
    await inTransaction(db, async (tx) => {
      const [s] = await tx.insert(weeklySchedule).values({ validFrom, validUntil }).returning({ id: weeklySchedule.id });
      await replaceHours(tx, s!.id, hours);
    });
    return respond(res);
  });

  // Cancelar uma mudança que ainda não começou (C28).
  router.delete('/mudancas/:id', async (req, res) => {
    const id = Number(req.params.id);
    const removed = await db
      .delete(weeklySchedule)
      .where(and(eq(weeklySchedule.id, id), gt(weeklySchedule.validFrom, today())))
      .returning({ id: weeklySchedule.id });
    if (!removed.length) return fail(res, 404, 'Mudança não encontrada ou já em vigor');
    return respond(res);
  });

  // Restrições de retirada (C34).
  router.post('/restricoes', async (req, res) => {
    const parsed = bodies.restriction.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { weekday: wd, start, end, label } = parsed.data;
    await db.insert(pickupRestriction).values({ weekday: wd, startTime: start, endTime: end, label });
    return respond(res);
  });
  router.delete('/restricoes/:id', async (req, res) => {
    await db.delete(pickupRestriction).where(eq(pickupRestriction.id, Number(req.params.id)));
    return respond(res);
  });

  // Datas bloqueadas e especiais (C30, C31, C33).
  router.post('/datas-bloqueadas', async (req, res) => {
    const parsed = bodies.blocked.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { date: d, reason } = parsed.data;
    if (d < today()) return fail(res, 400, 'Escolha uma data a partir de hoje');
    const [sp] = await db.select().from(specialDate).where(eq(specialDate.date, d)).limit(1);
    if (sp) return fail(res, 409, `Essa data já é a data especial "${sp.name}". Remova-a antes de bloquear.`);
    await db.insert(blockedDate).values({ date: d, reason }).onConflictDoUpdate({ target: blockedDate.date, set: { reason } });
    return respond(res);
  });
  router.delete('/datas-bloqueadas/:date', async (req, res) => {
    await db.delete(blockedDate).where(eq(blockedDate.date, req.params.date));
    return respond(res);
  });

  router.post('/datas-especiais', async (req, res) => {
    const parsed = bodies.special.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { date: d, name } = parsed.data;
    if (d < today()) return fail(res, 400, 'Escolha uma data a partir de hoje');
    const [bl] = await db.select().from(blockedDate).where(eq(blockedDate.date, d)).limit(1);
    if (bl) return fail(res, 409, 'Essa data está bloqueada. Desbloqueie antes de torná-la especial.');
    await db.insert(specialDate).values({ date: d, name }).onConflictDoUpdate({ target: specialDate.date, set: { name } });
    return respond(res);
  });
  router.delete('/datas-especiais/:date', async (req, res) => {
    await db.delete(specialDate).where(eq(specialDate.date, req.params.date));
    return respond(res);
  });

  // Horários fechados por lotação num dia (C32).
  router.post('/horarios-fechados', async (req, res) => {
    const parsed = bodies.closed.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const { date: d, start, end } = parsed.data;
    if (d < today()) return fail(res, 400, 'Escolha uma data a partir de hoje');
    await db.insert(closedPeriod).values({ date: d, startTime: start, endTime: end });
    return respond(res);
  });
  router.delete('/horarios-fechados/:id', async (req, res) => {
    await db.delete(closedPeriod).where(eq(closedPeriod.id, Number(req.params.id)));
    return respond(res);
  });

  // Antecedência mínima e prazo de agendamento (C35).
  router.put('/regras', async (req, res) => {
    const parsed = bodies.rules.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    if (Object.keys(parsed.data).length) {
      await db
        .insert(agendaConfig)
        .values({ id: 1, ...parsed.data })
        .onConflictDoUpdate({ target: agendaConfig.id, set: parsed.data });
    }
    return respond(res);
  });

  // Tele-entrega: ligar, desligar e em quais datas vale (RF44, RN43, RN44; C77–C79, C83).
  router.put('/entrega', async (req, res) => {
    const parsed = bodies.delivery.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, firstIssue(parsed.error));
    const d = { ...parsed.data, dates: [...new Set(parsed.data.dates)].sort() };
    const problem = deliveryProblem(d);
    if (problem) return fail(res, 400, problem);
    const set = { deliveryEnabled: d.enabled, deliveryAllDays: d.allDays, deliveryDates: d.dates };
    await db
      .insert(agendaConfig)
      .values({ id: 1, ...set })
      .onConflictDoUpdate({ target: agendaConfig.id, set });
    return respond(res);
  });

  return router;
}
