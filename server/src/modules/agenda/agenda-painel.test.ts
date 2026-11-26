// Cenários C24–C35 (Etapa 2 — Agenda). "Agora" fixo: domingo, 22/11/2026, 10h.
// Cada cenário muda a agenda pelo painel e confere o que o site recebe em /api/agenda.

import type { AgendaDTO, AvailableDay } from '@vanellis/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startTestApp } from '../../test/app';
import { category, product } from '../catalogo/schema';
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
  await op('PUT', '/api/painel/agenda/entrega', { enabled: false, allDays: true, dates: [] });
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

  it('C67: dia com intervalo de almoço oferece os dois períodos', async () => {
    const almoco = [
      ...SEMANA.filter((h) => h.weekday !== 1),
      { weekday: 1, open: '14:00', close: '18:30' },
      { weekday: 1, open: '07:30', close: '12:00' },
    ];
    const res = await op('PUT', '/api/painel/agenda/horario-atual', { hours: almoco });
    expect(res.status).toBe(200);
    // O painel devolve os períodos do dia em ordem de abertura.
    expect(res.body.current.hours.filter((h: { weekday: number }) => h.weekday === 1)).toEqual([
      { weekday: 1, open: '07:30', close: '12:00' },
      { weekday: 1, open: '14:00', close: '18:30' },
    ]);
    const segunda = day(await site(), '2026-11-23')!.times;
    expect(segunda).toContain('11:30');
    expect(segunda).not.toContain('12:00');
    expect(segunda).not.toContain('13:30');
    expect(segunda).toContain('14:00');
    expect(segunda.at(-1)).toBe('18:00');
    // Também numa mudança programada.
    const mudanca = await op('POST', '/api/painel/agenda/mudancas', { validFrom: '2027-01-04', hours: almoco });
    expect(mudanca.status).toBe(200);
    expect(day(await site(), '2027-01-04')!.times).not.toContain('12:30');
  });

  it('C68: recusa períodos que se sobrepõem no mesmo dia', async () => {
    const res = await op('PUT', '/api/painel/agenda/horario-atual', {
      hours: [
        { weekday: 2, open: '07:30', close: '12:00' },
        { weekday: 2, open: '11:00', close: '18:00' },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Na terça, os períodos se sobrepõem/);
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

  it('C116: bloquear uma data especial é aceito; desbloquear a devolve com o mesmo prazo (RN60)', async () => {
    await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22' });
    const bloqueio = await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-24', reason: 'Produção cheia' });
    expect(bloqueio.status).toBe(200);
    expect(day(await site(), '2026-12-24')).toBeUndefined();
    expect(bloqueio.body.specialDates).toMatchObject([{ date: '2026-12-24', deadline: '2026-12-22' }]);
    await op('DELETE', '/api/painel/agenda/datas-bloqueadas/2026-12-24', {});
    expect(day(await site(), '2026-12-24')).toMatchObject({ special: 'Véspera de Natal' });
    // E o contrário: uma data bloqueada pode virar especial, e continua fora até desbloquear.
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-31', reason: 'Folga' });
    expect((await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-31', name: 'Ano Novo' })).status).toBe(200);
    expect(day(await site(), '2026-12-31')).toBeUndefined();
  });

  it('C123: data especial sem prazo é salva com o aviso da véspera; com prazo, mostra até quando vai', async () => {
    const sem = await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal' });
    expect(sem.status).toBe(200);
    expect(sem.body.specialDates[0]).toMatchObject({
      deadline: null,
      closing: 'Encomendas até qua 23/12 às 19h (véspera)',
      warnings: [expect.stringContaining('Sem prazo, qualquer produto do site')],
    });
    const com = await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22' });
    expect(com.body.specialDates[0]).toMatchObject({ deadline: '2026-12-22', closing: 'Encomendas até ter 22/12 às 19h', warnings: [] });
  });

  it('C117: prazo num dia em que a loja não abre: o painel avisa o recuo', async () => {
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-22', reason: 'Folga' });
    const res = await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22' });
    expect(res.body.specialDates[0]).toMatchObject({
      closing: 'Encomendas até seg 21/12 às 19h',
      warnings: ['A loja não abre em ter 22/12: o prazo recua para seg 21/12 às 19h.'],
    });
  });

  it('C119: o cliente escolhe o horário, com intervalo próprio que ignora as restrições gerais', async () => {
    await op('POST', '/api/painel/agenda/restricoes', { weekday: null, start: '00:00', end: '08:30', label: null });
    const res = await op('POST', '/api/painel/agenda/datas-especiais', {
      date: '2026-12-24',
      name: 'Véspera de Natal',
      deadline: '2026-12-22',
      chooseTime: true,
      window: { start: '07:00', end: '13:00' },
    });
    expect(res.status).toBe(200);
    expect(res.body.specialDates[0]).toMatchObject({ chooseTime: true, window: { start: '07:00', end: '13:00' } });
    const d = day(await site(), '2026-12-24')!;
    expect(d.special).toBe('Véspera de Natal');
    expect(d.times[0]).toBe('07:00');
    expect(d.times.at(-1)).toBe('12:30');
  });

  it('C116: bloquear e desbloquear mantém o modo de horário e o intervalo', async () => {
    await op('POST', '/api/painel/agenda/datas-especiais', {
      date: '2026-12-24',
      name: 'Véspera de Natal',
      deadline: '2026-12-22',
      chooseTime: true,
      window: { start: '08:00', end: '12:00' },
    });
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-12-24' });
    await op('DELETE', '/api/painel/agenda/datas-bloqueadas/2026-12-24', {});
    expect(day(await site(), '2026-12-24')!.times[0]).toBe('08:00');
  });

  it('intervalo próprio: o fim depois do início; no modo "a combinar" ele não é guardado', async () => {
    const ruim = await op('POST', '/api/painel/agenda/datas-especiais', {
      date: '2026-12-24',
      name: 'Véspera de Natal',
      chooseTime: true,
      window: { start: '12:00', end: '08:00' },
    });
    expect(ruim.status).toBe(400);
    expect(ruim.body.error).toBe('O fim do intervalo precisa ser depois do início');
    const combinar = await op('POST', '/api/painel/agenda/datas-especiais', {
      date: '2026-12-24',
      name: 'Véspera de Natal',
      chooseTime: false,
      window: { start: '08:00', end: '12:00' },
    });
    expect(combinar.body.specialDates[0]).toMatchObject({ chooseTime: false, window: null });
    expect(day(await site(), '2026-12-24')!.times).toEqual([]);
  });

  it('RF58, RF62 (C105–C107): primeira retirada no catálogo, item que limita e motivo de cada dia', async () => {
    // "Agora" é domingo 22/11, 10h; a semana do teste abre todos os dias.
    const [cat] = await app.db.insert(category).values({ name: 'Bolos RF58', slug: 'bolos-rf58', position: 98 }).returning();
    const [bolo] = await app.db
      .insert(product)
      .values({ categoryId: cat!.id, name: 'Bolo de Nozes', saleUnit: 'UN', basePrice: '90.00', leadTimeHours: 72 })
      .returning();
    try {
      await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-11-26', reason: 'Folga' });
      const catalogo = (await app.browser()('GET', '/api/catalogo')).body;
      expect(catalogo.produtos.find((p: { id: number }) => p.id === bolo!.id).firstPickup).toEqual({
        date: '2026-11-25',
        weekday: 3,
        time: '10:00',
      });
      const a = (await app.browser()('GET', `/api/agenda/disponibilidade?produtos=${bolo!.id}`)).body;
      expect(a.limit).toEqual({ name: 'Bolo de Nozes', hours: 72, from: { date: '2026-11-25', weekday: 3, time: '10:00' } });
      const motivo = (d: string) => a.blocked.find((b: { date: string }) => b.date === d)?.reason;
      expect(motivo('2026-11-23')).toBe('Bolo de Nozes precisa de 72h de antecedência');
      expect(motivo('2026-11-26')).toBe('a padaria não abre neste dia');
      expect(a.blockedTimes.find((b: { date: string; time: string }) => b.date === '2026-11-25' && b.time === '09:30')).toEqual({
        date: '2026-11-25',
        time: '09:30',
        reason: 'Bolo de Nozes precisa de 72h de antecedência',
      });
    } finally {
      await app.db.delete(product).where(eq(product.id, bolo!.id));
      await app.db.delete(category).where(eq(category.id, cat!.id));
    }
  });

  it('C125: o prazo precisa ser antes da própria data', async () => {
    for (const deadline of ['2026-12-24', '2026-12-25']) {
      const res = await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-12-24', name: 'Véspera de Natal', deadline });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('O prazo precisa ser antes da própria data');
    }
  });

  it('C94: com prazo, o site oferece a data especial mesmo para produto de antecedência longa', async () => {
    // "Agora" é 22/11; um bolo de 72h só chegaria a 25/11, mas 24/11 é data especial com prazo em 23/11.
    const [cat] = await app.db.insert(category).values({ name: 'Bolos C94', slug: 'bolos-c94', position: 99 }).returning();
    const [bolo] = await app.db
      .insert(product)
      .values({ categoryId: cat!.id, name: 'Bolo de Nozes', saleUnit: 'UN', basePrice: '90.00', leadTimeHours: 72 })
      .returning();
    try {
      await op('POST', '/api/painel/agenda/datas-especiais', { date: '2026-11-24', name: 'Encomenda especial', deadline: '2026-11-23' });
      const res = await app.browser()('GET', `/api/agenda/disponibilidade?produtos=${bolo!.id}`);
      expect(day(res.body, '2026-11-24')).toMatchObject({ special: 'Encomenda especial' });
      // C99: o dia normal seguinte continua preso à antecedência.
      expect(day(res.body, '2026-11-23')).toBeUndefined();
    } finally {
      await app.db.delete(product).where(eq(product.id, bolo!.id));
      await app.db.delete(category).where(eq(category.id, cat!.id));
    }
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

describe('Situação da loja no site', () => {
  it('mostra aberta e o horário em vigor, e reflete mudanças do painel', async () => {
    const info = (await app.browser()('GET', '/api/agenda/loja')).body;
    expect(info.status).toEqual({ open: true, closesAt: '12:00', nextOpen: null }); // domingo 10h
    expect(info.week).toHaveLength(7);
    await op('POST', '/api/painel/agenda/datas-bloqueadas', { date: '2026-11-22', reason: 'Folga' });
    const fechado = (await app.browser()('GET', '/api/agenda/loja')).body;
    expect(fechado.status.open).toBe(false);
    expect(fechado.status.nextOpen).toMatchObject({ date: '2026-11-23', time: '07:30' });
  });
});

describe('Tele-entrega', () => {
  const entrega = (body: object) => op('PUT', '/api/painel/agenda/entrega', body);

  it('C77: ligada para todos os dias, todo dia disponível aceita entrega', async () => {
    expect((await site()).days.some((d) => d.delivery)).toBe(false);
    const r = await entrega({ enabled: true, allDays: true, dates: [] });
    expect(r.status).toBe(200);
    expect(r.body.delivery).toEqual({ enabled: true, allDays: true, dates: [] });
    expect((await site()).days.every((d) => d.delivery)).toBe(true);
  });

  it('C78: só nas datas marcadas; a retirada continua em todos os dias', async () => {
    await entrega({ enabled: true, allDays: false, dates: ['2026-12-31', '2026-12-24', '2026-12-24'] });
    const a = await site();
    expect(a.days.filter((d) => d.delivery).map((d) => d.date)).toEqual(['2026-12-24', '2026-12-31']);
    expect(a.days.length).toBeGreaterThan(30);
  });

  it('C79: desligada, nenhum dia com entrega', async () => {
    await entrega({ enabled: true, allDays: true, dates: [] });
    await entrega({ enabled: false, allDays: true, dates: [] });
    expect((await site()).days.some((d) => d.delivery)).toBe(false);
  });

  it('C83: só em datas, sem nenhuma data, é recusado', async () => {
    const r = await entrega({ enabled: true, allDays: false, dates: [] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/ao menos uma data/);
  });
});
