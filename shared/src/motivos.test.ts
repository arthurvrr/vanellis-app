// Motivo de cada dia e horário indisponível e primeira retirada (RF58, RF59, RF62; C96,
// C105–C108). Semana de teste: segunda a sábado 7h30–19h, domingo fechado. 2026: 24/11 é terça,
// 29/11 domingo; o Bolo de Nozes pede 72h.
import { describe, expect, it } from 'vitest';
import {
  agendaForCart,
  conflictText,
  leadNotice,
  limitText,
  scanDays,
  type AgendaInput,
  type WeeklySchedule,
} from './agenda';
import { category, product } from './test-utils';

const semana: WeeklySchedule = {
  validFrom: '2026-01-01',
  validUntil: null,
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
};
const base: AgendaInput = {
  schedules: [semana],
  restrictions: [],
  blockedDates: [],
  closedPeriods: [],
  specialDates: [],
  minLeadHours: 2,
  windowMonths: 1,
};
const BOLO = 'Bolo de Nozes precisa de 72h de antecedência';
const motivo = (r: ReturnType<typeof scanDays>, date: string) => r.blocked.find((b) => b.date === date)?.reason;
const motivoHora = (r: ReturnType<typeof scanDays>, date: string, time: string) =>
  r.blockedTimes.find((b) => b.date === date && b.time === time)?.reason;

describe('scanDays: os dias disponíveis e o motivo dos outros', () => {
  const bolo = { name: 'Bolo de Nozes', hours: 72 };

  it('C107: antecedência de um item e loja fechada', () => {
    const r = scanDays(base, '2026-11-24T10:00', 72, null, { leadItem: bolo, menus: [] });
    expect(motivo(r, '2026-11-24')).toBe(BOLO);
    expect(motivo(r, '2026-11-26')).toBe(BOLO);
    expect(motivo(r, '2026-11-29')).toBe('a padaria está fechada');
    expect(r.days[0]).toMatchObject({ date: '2026-11-27' });
    expect(r.days[0]!.times[0]).toBe('10:00');
    // Os horários da manhã de sexta também dizem por quê.
    expect(motivoHora(r, '2026-11-27', '07:30')).toBe(BOLO);
    expect(motivoHora(r, '2026-11-27', '09:30')).toBe(BOLO);
    expect(motivoHora(r, '2026-11-27', '10:00')).toBeUndefined();
  });

  it('a mesma lista de dias de availableDays: um dia ou está disponível, ou tem motivo', () => {
    const r = scanDays(base, '2026-11-24T10:00', 72, null, { leadItem: bolo, menus: [] });
    const disponiveis = new Set(r.days.map((d) => d.date));
    for (const b of r.blocked) expect(disponiveis.has(b.date)).toBe(false);
    // Hoje até o fim da janela (1 mês): 24/11 a 24/12, inclusive.
    expect(r.days.length + r.blocked.length).toBe(31);
  });

  it('sem item de antecedência longa, o motivo é a antecedência da loja', () => {
    const r = scanDays(base, '2026-11-24T18:00', 0, null, { leadItem: null, menus: [] });
    expect(motivo(r, '2026-11-24')).toBe('é preciso encomendar com 2h de antecedência');
  });

  it('data bloqueada, horários lotados e restrições', () => {
    const input: AgendaInput = {
      ...base,
      blockedDates: ['2026-11-26'],
      closedPeriods: [
        { date: '2026-11-27', start: '07:00', end: '19:00' },
        { date: '2026-11-28', start: '09:00', end: '10:00' },
      ],
      restrictions: [{ weekday: null, start: '12:00', end: '14:00' }],
    };
    const r = scanDays(input, '2026-11-24T10:00', 0, null, { leadItem: null, menus: [] });
    expect(motivo(r, '2026-11-26')).toBe('a padaria não abre neste dia');
    expect(motivo(r, '2026-11-27')).toBe('os horários deste dia estão lotados');
    expect(motivoHora(r, '2026-11-28', '09:30')).toBe('horário lotado');
    expect(motivoHora(r, '2026-11-28', '12:00')).toBe('sem retirada neste horário');
    expect(motivoHora(r, '2026-11-28', '14:00')).toBeUndefined();
  });

  it('dia em que as restrições tiram todos os horários', () => {
    const input = { ...base, restrictions: [{ weekday: 3, start: '00:00', end: '23:59' }] };
    const r = scanDays(input, '2026-11-24T10:00', 0, null, { leadItem: null, menus: [] });
    expect(motivo(r, '2026-11-25')).toBe('não há retirada neste dia');
  });

  it('C96: data especial depois do prazo diz quando as encomendas se encerraram', () => {
    const input: AgendaInput = {
      ...base,
      specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22', chooseTime: false, window: null }],
    };
    const r = scanDays(input, '2026-12-23T08:00', 0, null, { leadItem: null, menus: [] });
    expect(motivo(r, '2026-12-24')).toBe('as encomendas para 24/12 se encerraram em 22/12');
  });

  it('data especial em que o cliente escolhe o horário, sem horário nenhum (C104)', () => {
    const input: AgendaInput = {
      ...base,
      specialDates: [{ date: '2026-11-29', name: 'Domingo especial', deadline: null, chooseTime: true, window: null }],
    };
    const r = scanDays(input, '2026-11-24T10:00', 0, null, { leadItem: null, menus: [] });
    expect(motivo(r, '2026-11-29')).toBe('não há horário para escolher neste dia');
  });

  it('horários de uma data especial com intervalo próprio: só o lotado tem motivo', () => {
    const input: AgendaInput = {
      ...base,
      closedPeriods: [{ date: '2026-12-24', start: '08:00', end: '08:30' }],
      specialDates: [
        { date: '2026-12-24', name: 'Véspera', deadline: '2026-12-22', chooseTime: true, window: { start: '08:00', end: '10:00' } },
      ],
    };
    const r = scanDays(input, '2026-12-20T10:00', 72, null, { leadItem: bolo, menus: [] });
    expect(motivoHora(r, '2026-12-24', '08:00')).toBe('horário lotado');
    expect(r.blockedTimes.filter((b) => b.date === '2026-12-24')).toHaveLength(1);
  });

  it('fora das datas do cardápio especial do carrinho', () => {
    const r = scanDays(base, '2026-11-24T10:00', 0, ['2026-11-28'], {
      leadItem: null,
      menus: [{ name: 'Festival de Tortas', pickupDates: ['2026-11-28'] }],
    });
    expect(motivo(r, '2026-11-27')).toBe('fora das datas de retirada de Festival de Tortas (28/11)');
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-28']);
  });
});

describe('agendaForCart: motivos, limite e conflito', () => {
  const catalogo = {
    categorias: [
      category({ id: 1, name: 'Bolos' }),
      category({ id: 2, name: 'Ceia de Natal', special: { pickupDates: ['2026-12-24'], announcement: '', closedProducts: [] } }),
      category({ id: 3, name: 'Ceia de Ano Novo', special: { pickupDates: ['2026-12-31'], announcement: '', closedProducts: [] } }),
    ],
    produtos: [
      product({ id: 1, categoryId: 1, name: 'Bolo de Nozes', leadTimeHours: 72 }),
      product({ id: 2, categoryId: 1, name: 'Pão', leadTimeHours: null }),
      product({ id: 3, categoryId: 2, name: 'Chester' }),
      product({ id: 4, categoryId: 3, name: 'Lombo' }),
    ],
  };

  it('C106: o item que limita e a primeira retirada', () => {
    const a = agendaForCart(base, false, '2026-11-24T10:00', catalogo, [1, 2]);
    expect(a.limit).toEqual({ name: 'Bolo de Nozes', hours: 72, from: { date: '2026-11-27', weekday: 5, time: '10:00' } });
    expect(limitText(a.limit!)).toBe('Bolo de Nozes precisa de 72h de antecedência: a retirada é a partir de sex 27/11, 10h');
    expect(a.blocked.find((b) => b.date === '2026-11-25')?.reason).toBe(BOLO);
    expect(a.blockedTimes.length).toBeGreaterThan(0);
  });

  it('sem item de antecedência maior que a da loja, não há linha de limite', () => {
    expect(agendaForCart(base, false, '2026-11-24T10:00', catalogo, [2]).limit).toBeNull();
  });

  it('C108: sem data em comum, o texto diz quais cardápios e o que fazer', () => {
    const a = agendaForCart(base, false, '2026-11-24T10:00', catalogo, [3, 4]);
    expect(a.days).toEqual([]);
    expect(a.blocked).toEqual([]);
    expect(conflictText(a.rule!)).toBe('Ceia de Natal é retirada em 24/12 e Ceia de Ano Novo em 31/12: faça dois pedidos');
  });

  it('pausado ou com item fora do cardápio: nenhum dia e nenhum motivo de dia', () => {
    expect(agendaForCart(base, true, '2026-11-24T10:00', catalogo, [2])).toMatchObject({ days: [], blocked: [], blockedTimes: [] });
  });
});

describe('leadNotice: a primeira retirada no card do produto (RF58, C105)', () => {
  it('só para produto com antecedência maior que a da loja', () => {
    const bolo = product({ name: 'Bolo de Nozes', leadTimeHours: 72, firstPickup: { date: '2026-11-27', weekday: 5, time: '10:00' } });
    expect(leadNotice(bolo)).toBe('Encomende com 72h de antecedência: retirada a partir de sex 27/11, 10h');
    expect(leadNotice({ ...bolo, firstPickup: { date: '2026-12-24', weekday: 4, time: null } })).toBe(
      'Encomende com 72h de antecedência: retirada a partir de qui 24/12',
    );
    expect(leadNotice(product({ leadTimeHours: 72 }))).toBeNull();
    expect(leadNotice(product({ leadTimeHours: null }))).toBeNull();
  });
});

describe('motivos: casos de borda', () => {
  const sem = { leadItem: null, menus: [] };

  it('um dia todo aberto não tem horário indisponível', () => {
    expect(scanDays(base, '2026-11-24T00:00', 0, null, sem).blockedTimes).toEqual([]);
  });

  it('o lotado vai do início, inclusive, ao fim, exclusive; antes e depois vale o outro motivo', () => {
    const input = { ...base, closedPeriods: [{ date: '2026-11-28', start: '09:00', end: '10:00' }] };
    // Sábado 28/11 às 8h30 + 2h: o primeiro horário livre seria 10:30.
    const r = scanDays(input, '2026-11-28T08:30', 0, null, sem);
    expect(motivoHora(r, '2026-11-28', '08:30')).toBe('é preciso encomendar com 2h de antecedência');
    expect(motivoHora(r, '2026-11-28', '09:00')).toBe('horário lotado');
    expect(motivoHora(r, '2026-11-28', '10:00')).toBe('é preciso encomendar com 2h de antecedência');
  });

  it('data especial "a combinar" não tem horários, nem indisponíveis', () => {
    const input: AgendaInput = {
      ...base,
      specialDates: [{ date: '2026-12-24', name: 'Véspera', deadline: '2026-12-22', chooseTime: false, window: null }],
    };
    const r = scanDays(input, '2026-12-20T10:00', 0, null, sem);
    expect(r.blockedTimes.filter((b) => b.date === '2026-12-24')).toEqual([]);
  });

  it('data especial sem intervalo próprio: as restrições gerais dizem "sem retirada neste horário"', () => {
    const input: AgendaInput = {
      ...base,
      restrictions: [{ weekday: null, start: '12:00', end: '14:00' }],
      specialDates: [{ date: '2026-12-24', name: 'Véspera', deadline: '2026-12-22', chooseTime: true, window: null }],
    };
    const r = scanDays(input, '2026-12-20T10:00', 0, null, sem);
    expect(motivoHora(r, '2026-12-24', '12:00')).toBe('sem retirada neste horário');
  });

  it('dois cardápios no carrinho: o motivo "fora das datas" cita os dois', () => {
    const r = scanDays(base, '2026-11-24T10:00', 0, ['2026-11-28'], {
      leadItem: null,
      menus: [
        { name: 'Festival', pickupDates: ['2026-11-28', '2026-11-29'] },
        { name: 'Tortas', pickupDates: ['2026-11-28'] },
      ],
    });
    expect(motivo(r, '2026-11-27')).toBe('fora das datas de retirada de Festival e Tortas (28/11)');
  });

  it('C108 com três cardápios: pedidos separados', () => {
    const rule = {
      menus: [
        { name: 'Natal', pickupDates: ['2026-12-24'] },
        { name: 'Ano Novo', pickupDates: ['2026-12-31'] },
        { name: 'Reis', pickupDates: ['2027-01-06'] },
      ],
    };
    expect(conflictText(rule)).toBe('Natal é retirada em 24/12, Ano Novo em 31/12 e Reis em 06/01: faça pedidos separados');
  });

  it('o item que limita é o de maior antecedência, em qualquer posição; igual à da loja não limita', () => {
    const catalogo = {
      categorias: [category({ id: 1, name: 'Bolos' })],
      produtos: [
        product({ id: 1, categoryId: 1, name: 'Pão', leadTimeHours: 2 }),
        product({ id: 2, categoryId: 1, name: 'Torta', leadTimeHours: 24 }),
        product({ id: 3, categoryId: 1, name: 'Bolo de Nozes', leadTimeHours: 72 }),
      ],
    };
    expect(agendaForCart(base, false, '2026-11-24T10:00', catalogo, [1, 2, 3]).limit?.name).toBe('Bolo de Nozes');
    expect(agendaForCart(base, false, '2026-11-24T10:00', catalogo, [1]).limit).toBeNull();
  });
});
