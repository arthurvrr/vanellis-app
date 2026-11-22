// Cenários C24–C35 (Etapa 2 — Agenda). "Agora" fixo: domingo, 22/11/2026, 10h.
// Cada cenário muda a agenda pelo painel e confere o que o site recebe em /api/agenda.

import type { AgendaDTO, AvailableDay } from '@vanellis/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { blockedDate, closedPeriod, openingHours, pickupRestriction, specialDate, weeklySchedule } from './schema';

const NOW = '2026-11-22T10:00';
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;

// Seg a sáb 7h30–19h, domingo 7h30–12h.
const SEMANA = [
  { weekday: 0, open: '07:30', close: '12:00' },
  ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
];

beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());
beforeEach(async () => {
  for (const t of [openingHours, weeklySchedule, pickupRestriction, blockedDate, closedPeriod, specialDate]) {
    await app.db.delete(t);
  }
  await op('PUT', '/api/painel/agenda/regras', { minLeadHours: 2, windowMonths: 4 });
  await op('PUT', '/api/painel/agenda/horario-atual', { hours: SEMANA });
});

async function site(): Promise<AgendaDTO> {
  return (await app.browser()('GET', '/api/agenda/disponibilidade')).body;
}
const day = (a: AgendaDTO, date: string): AvailableDay | undefined => a.days.find((d) => d.date === date);

describe('Horário semanal', () => {
  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/agenda')).status).toBe(401);
  });

  it('C24: editar o horário em vigor muda o site a partir de hoje', async () => {
    const hours = SEMANA.map((h) => (h.weekday === 5 ? { ...h, close: '18:00' } : h));
    const res = await op('PUT', '/api/painel/agenda/horario-atual', { hours });
    expect(res.body.current.hours.find((h: { weekday: number }) => h.weekday === 5).close).toBe('18:00');
    expect(day(await site(), '2026-11-27')!.times.at(-1)).toBe('17:30');
  });

  it('C25: dia sem horário fica fechado', async () => {
    await op('PUT', '/api/painel/agenda/horario-atual', { hours: SEMANA.filter((h) => h.weekday !== 0) });
    expect((await site()).days.some((d) => d.weekday === 0)).toBe(false);
  });

  it('C26: mudança permanente programada vale só a partir da data', async () => {
    const res = await op('POST', '/api/painel/agenda/mudancas', {
      validFrom: '2027-02-01',
      hours: SEMANA.filter((h) => h.weekday !== 1),
    });
    expect(res.status).toBe(200);
    expect(res.body.upcoming.map((s: { validFrom: string }) => s.validFrom)).toEqual(['2027-02-01']);
    const a = await site();
    expect(day(a, '2027-01-25')).toBeDefined(); // segunda antes
    expect(day(a, '2027-02-01')).toBeUndefined(); // segunda depois
    expect(day(a, '2027-02-08')).toBeUndefined();
  });

  it('C27: mudança temporária termina e o horário normal volta sozinho', async () => {
    await op('POST', '/api/painel/agenda/mudancas', {
      validFrom: '2026-12-15',
      validUntil: '2027-02-28',
      hours: SEMANA.map((h) => (h.weekday === 0 ? h : { ...h, close: '21:00' })),
    });
    const a = await site();
    expect(day(a, '2026-12-18')!.times.at(-1)).toBe('20:30');
    expect(day(a, '2027-03-05')!.times.at(-1)).toBe('18:30');
  });

  it('C28: cancelar uma mudança que não começou', async () => {
    const res = await op('POST', '/api/painel/agenda/mudancas', {
      validFrom: '2026-12-15',
      hours: SEMANA.map((h) => ({ ...h, close: '12:00' })),
    });
    const id = res.body.upcoming[0].id;
    const del = await op('DELETE', `/api/painel/agenda/mudancas/${id}`, {});
    expect(del.body.upcoming).toEqual([]);
    expect(day(await site(), '2026-12-18')!.times.at(-1)).toBe('18:30');
  });

  it('C29: recusa fechamento antes da abertura e mudança começando hoje ou antes', async () => {
    const ruim = await op('PUT', '/api/painel/agenda/horario-atual', {
      hours: [{ weekday: 1, open: '19:00', close: '07:30' }],
    });
    expect(ruim.status).toBe(400);
    expect(ruim.body.error).toContain('fechamento');
    const passado = await op('POST', '/api/painel/agenda/mudancas', { validFrom: '2026-11-22', hours: SEMANA });
    expect(passado.status).toBe(400);
    expect(passado.body.error).toContain('depois de hoje');
    const fim = await op('POST', '/api/painel/agenda/mudancas', {
      validFrom: '2026-12-10',
      validUntil: '2026-12-01',
      hours: SEMANA,
    });
    expect(fim.status).toBe(400);
  });
});

describe('Exceções no calendário', () => {
  it('C30: bloquear e desbloquear uma data', async () => {
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-11-30', reason: 'Folga' });
    expect(day(await site(), '2026-11-30')).toBeUndefined();
    await op('DELETE', '/api/painel/agenda/datas-bloqueadas/2026-11-30', {});
    expect(day(await site(), '2026-11-30')).toBeDefined();
  });

  it('C31: data especial sem escolha de horário', async () => {
    await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-31', name: 'Véspera de Ano Novo' });
    expect(day(await site(), '2026-12-31')).toMatchObject({ special: 'Véspera de Ano Novo', times: [] });
  });

  it('C32: fechar um período lotado só naquele dia', async () => {
    await op('POST', '/api/painel/agenda/horarios-fechados', { date: '2026-11-28', start: '09:00', end: '11:00' });
    const a = await site();
    const sab = day(a, '2026-11-28')!.times;
    for (const t of ['09:00', '09:30', '10:00', '10:30']) expect(sab).not.toContain(t);
    expect(sab).toContain('11:00');
    expect(day(a, '2026-12-05')!.times).toContain('09:30');
    const { body } = await op('GET', '/api/painel/agenda');
    await op('DELETE', `/api/painel/agenda/horarios-fechados/${body.closedPeriods[0].id}`, {});
    expect(day(await site(), '2026-11-28')!.times).toContain('09:30');
  });

  it('C33: a mesma data não pode ser bloqueada e especial', async () => {
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-25', reason: 'Natal' });
    const res = await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-25', name: 'Natal' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('bloqueada');
    await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal' });
    expect((await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-24' })).status).toBe(409);
  });

  it('recusa datas no passado', async () => {
    expect((await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-11-21' })).status).toBe(400);
  });
});

describe('Regras gerais', () => {
  it('C34: restrição "só a partir das 8h30" e remoção', async () => {
    const res = await op('POST', '/api/painel/agenda/restricoes', {
      weekday: null,
      start: '00:00',
      end: '08:30',
      label: 'Retirada a partir das 8h30',
    });
    expect(day(await site(), '2026-11-24')!.times[0]).toBe('08:30');
    await op('DELETE', `/api/painel/agenda/restricoes/${res.body.restrictions[0].id}`, {});
    expect(day(await site(), '2026-11-24')!.times[0]).toBe('07:30');
  });

  it('C35: antecedência e prazo de agendamento', async () => {
    await op('PUT', '/api/painel/agenda/regras', { minLeadHours: 4, windowMonths: 6 });
    const a = await site();
    expect(a.leadHours).toBe(4);
    expect(a.days.at(-1)!.date >= '2027-05-01').toBe(true);
    // Hoje (domingo) fecha às 12h: com 4h de antecedência a partir das 10h, não sobra horário.
    expect(day(a, '2026-11-22')).toBeUndefined();
    expect((await op('PUT', '/api/painel/agenda/regras', { windowMonths: 13 })).status).toBe(400);
  });
});
