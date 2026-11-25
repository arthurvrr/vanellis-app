import { describe, expect, it } from 'vitest';
import {
  agendaForCart,
  availableDays,
  deliveryProblem,
  nowInBrasilia,
  storeInfo,
  statusLabel,
  storeStatus,
  weekSummary,
  lastBookableDate,
  formatDay,
  pickupTimes,
  weekHoursProblem,
  type AgendaInput,
  type PickupRestriction,
  type WeeklySchedule,
} from './agenda';
import { category, product } from './test-utils';

// Segunda a sábado das 7h30 às 19h; domingo fechado.
const semana: WeeklySchedule = {
  validFrom: '2026-01-01',
  validUntil: null,
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
};

// Os dois exemplos da padaria: retirada só a partir das 8h30 e sem retirada no almoço.
const restricoes: PickupRestriction[] = [
  { weekday: null, start: '00:00', end: '08:30' },
  { weekday: null, start: '12:00', end: '14:00' },
];

const base: AgendaInput = {
  schedules: [semana],
  restrictions: [],
  blockedDates: [],
  closedPeriods: [],
  specialDates: [],
  minLeadHours: 2,
  windowMonths: 4,
};

describe('pickupTimes', () => {
  const dia = { weekday: 1, open: '07:30', close: '19:00' };

  it('vai da abertura a 30 minutos antes do fechamento, de 30 em 30 (RN51)', () => {
    const times = pickupTimes(dia, [], []);
    expect(times[0]).toBe('07:30');
    expect(times.at(-1)).toBe('18:30');
    expect(times).toHaveLength(23);
  });

  it('segue o fechamento definido pelo operador', () => {
    expect(pickupTimes({ ...dia, close: '17:00' }, [], []).at(-1)).toBe('16:30');
  });

  it('aplica "retirada a partir de" e intervalo sem retirada (RN52)', () => {
    const times = pickupTimes(dia, restricoes, []);
    expect(times.slice(0, 2)).toEqual(['08:30', '09:00']);
    expect(times).toContain('11:30');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('13:30');
    expect(times).toContain('14:00');
  });

  it('restrição de um dia da semana não afeta os outros', () => {
    const sabado: PickupRestriction = { weekday: 6, start: '15:00', end: '19:00' };
    expect(pickupTimes({ ...dia, weekday: 6 }, [sabado], []).at(-1)).toBe('14:30');
    expect(pickupTimes(dia, [sabado], []).at(-1)).toBe('18:30');
  });

  it('tira o período fechado por lotação, de um horário ou de vários (RN15)', () => {
    const times = pickupTimes(dia, [], [
      { start: '09:30', end: '10:00' },
      { start: '15:00', end: '16:30' },
    ]);
    expect(times).toContain('09:00');
    expect(times).not.toContain('09:30');
    expect(times).toContain('10:00');
    expect(times.filter((t) => t >= '15:00' && t < '16:30')).toEqual([]);
    expect(times).toContain('16:30');
  });

  it('abertura fora do passo começa no próximo horário cheio ou meia', () => {
    expect(pickupTimes({ ...dia, open: '07:15' }, [], [])[0]).toBe('07:30');
  });
});

describe('availableDays', () => {
  it('só mostra horários depois da antecedência mínima (RN13)', () => {
    // Segunda 23/11, 9h10 + 2h = 11h10: o primeiro horário é 11h30.
    const [segunda] = availableDays({ ...base, restrictions: restricoes }, '2026-11-23T09:10');
    expect(segunda?.date).toBe('2026-11-23');
    expect(segunda?.times[0]).toBe('11:30');
    expect(segunda?.times[1]).toBe('14:00');
  });

  it('usa a antecedência maior exigida pelos itens (RN14) e pula o domingo fechado (RN32)', () => {
    // Sábado 28/11 às 18h + 24h = domingo 18h: domingo fechado, segunda inteira.
    const days = availableDays(base, '2026-11-28T18:00', 24);
    expect(days[0]?.date).toBe('2026-11-30');
    expect(days[0]?.times[0]).toBe('07:30');
  });

  it('tira datas bloqueadas e aplica a mudança programada só no período dela (RN31)', () => {
    const terçaCurta: WeeklySchedule = {
      validFrom: '2026-11-24',
      validUntil: '2026-11-24',
      hours: [{ weekday: 2, open: '08:00', close: '12:00' }],
    };
    const days = availableDays(
      { ...base, schedules: [semana, terçaCurta], blockedDates: ['2026-11-25'] },
      '2026-11-23T07:00',
    );
    expect(days.slice(0, 3).map((d) => d.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-26']);
    expect(days[1]?.times.at(-1)).toBe('11:30');
  });

  it('data especial aparece sem horários, se der tempo até o início do dia (RN20)', () => {
    const input: AgendaInput = { ...base, specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal' }] };
    expect(availableDays(input, '2026-12-22T10:00').find((d) => d.date === '2026-12-24')).toEqual({
      date: '2026-12-24',
      weekday: 4,
      special: 'Véspera de Natal',
      times: [],
      delivery: false,
    });
    expect(availableDays(input, '2026-12-22T10:00', 48).map((d) => d.date)).not.toContain('2026-12-24');
  });

  it('vai até 4 meses a partir de hoje, inclusive (RN53)', () => {
    const days = availableDays(base, '2026-11-23T07:00');
    expect(days.at(-1)?.date).toBe('2027-03-23');
    expect(days.map((d) => d.date)).toContain('2026-12-24');
  });
});

describe('lastBookableDate', () => {
  it('soma meses de calendário (RN53)', () => {
    expect(lastBookableDate('2026-11-22', 4)).toBe('2027-03-22');
    expect(lastBookableDate('2026-01-15', 1)).toBe('2026-02-15');
  });

  it('usa o último dia do mês quando o dia não existe nele', () => {
    expect(lastBookableDate('2026-10-31', 4)).toBe('2027-02-28');
    expect(lastBookableDate('2027-10-31', 4)).toBe('2028-02-29');
  });
});

describe('formatDay', () => {
  it('mostra dia da semana e data', () => {
    expect(formatDay({ date: '2026-11-28', weekday: 6 })).toBe('Sáb 28/11');
  });
});

describe('situação da loja na entrada', () => {
  const semanaComDomingo = {
    validFrom: '2026-01-01',
    validUntil: null,
    hours: [
      { weekday: 0, open: '07:30', close: '12:00' },
      ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
    ],
  };
  const input = { schedules: [semanaComDomingo], blockedDates: ['2026-11-25'] };

  it('aberta: mostra até quando', () => {
    const s = storeStatus(input, '2026-11-23T10:00');
    expect(s).toEqual({ open: true, closesAt: '19:00', nextOpen: null });
    expect(statusLabel(s, '2026-11-23')).toBe('Aberto agora · fecha às 19h');
  });

  it('antes de abrir: abre hoje', () => {
    expect(statusLabel(storeStatus(input, '2026-11-23T06:00'), '2026-11-23')).toBe('Fechado · abre hoje às 7h30');
  });

  it('depois de fechar: abre amanhã', () => {
    expect(statusLabel(storeStatus(input, '2026-11-23T19:00'), '2026-11-23')).toBe('Fechado · abre amanhã às 7h30');
  });

  it('pula data bloqueada', () => {
    // Terça 24 à noite: quarta 25 está bloqueada, abre quinta.
    expect(statusLabel(storeStatus(input, '2026-11-24T20:00'), '2026-11-24')).toBe('Fechado · abre qui às 7h30');
  });

  it('todos os dias fechados: temporariamente fechado', () => {
    const fechada = { ...input, schedules: input.schedules.map((sc) => ({ ...sc, hours: [] })) };
    expect(statusLabel(storeStatus(fechada, '2026-11-23T10:00'), '2026-11-23')).toBe('Temporariamente fechado');
  });

  it('resume a semana juntando dias iguais', () => {
    expect(weekSummary(semanaComDomingo.hours)).toBe('Seg a sáb 7h30–19h · Dom 7h30–12h');
    expect(weekSummary(semanaComDomingo.hours.filter((h) => h.weekday !== 0))).toBe('Seg a sáb 7h30–19h');
    expect(weekSummary([{ weekday: 6, open: '08:00', close: '13:00' }, { weekday: 0, open: '08:00', close: '13:00' }])).toBe(
      'Sáb e dom 8h–13h',
    );
  });
});

describe('C67: horário com intervalo de almoço', () => {
  // Segunda a sexta 7h30–12h e 14h–18h30; sábado 8h–12h.
  const dias = [1, 2, 3, 4, 5];
  const comAlmoco: WeeklySchedule = {
    validFrom: '2026-01-01',
    validUntil: null,
    hours: [
      ...dias.map((weekday) => ({ weekday, open: '14:00', close: '18:30' })),
      ...dias.map((weekday) => ({ weekday, open: '07:30', close: '12:00' })),
      { weekday: 6, open: '08:00', close: '12:00' },
    ],
  };
  const input = { ...base, schedules: [comAlmoco], minLeadHours: 0 };

  it('oferece retirada nos dois períodos, sem o intervalo', () => {
    const [segunda] = availableDays(input, '2026-11-23T06:00');
    expect(segunda!.times).toEqual([
      '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00',
    ]);
  });

  it('no intervalo, a loja está fechada e abre hoje às 14h', () => {
    expect(statusLabel(storeStatus(input, '2026-11-23T10:00'), '2026-11-23')).toBe('Aberto agora · fecha às 12h');
    expect(statusLabel(storeStatus(input, '2026-11-23T12:30'), '2026-11-23')).toBe('Fechado · abre hoje às 14h');
    expect(statusLabel(storeStatus(input, '2026-11-23T15:00'), '2026-11-23')).toBe('Aberto agora · fecha às 18h30');
    expect(statusLabel(storeStatus(input, '2026-11-23T19:00'), '2026-11-23')).toBe('Fechado · abre amanhã às 7h30');
  });

  it('o resumo da semana mostra os dois períodos', () => {
    expect(weekSummary(comAlmoco.hours)).toBe('Seg a sex 7h30–12h e 14h–18h30 · Sáb 8h–12h');
  });
});

describe('C68: períodos que se sobrepõem', () => {
  it('recusa sobreposição e fechamento antes da abertura', () => {
    expect(
      weekHoursProblem([
        { weekday: 2, open: '07:30', close: '12:00' },
        { weekday: 2, open: '11:00', close: '18:00' },
      ]),
    ).toMatch(/^Na terça, os períodos se sobrepõem/);
    expect(weekHoursProblem([{ weekday: 1, open: '12:00', close: '08:00' }])).toMatch(/depois da abertura/);
  });

  it('aceita períodos encostados e em dias diferentes', () => {
    expect(
      weekHoursProblem([
        { weekday: 2, open: '07:30', close: '12:00' },
        { weekday: 2, open: '12:00', close: '18:00' },
        { weekday: 3, open: '07:30', close: '19:00' },
      ]),
    ).toBeNull();
  });
});

describe('pickupTimes: casos de borda', () => {
  it('sem período no dia, nenhum horário', () => {
    expect(pickupTimes([], restricoes, [])).toEqual([]);
  });

  it('devolve os horários em ordem mesmo com os períodos fora de ordem', () => {
    const periodos = [
      { weekday: 1, open: '14:00', close: '15:00' },
      { weekday: 1, open: '08:00', close: '09:00' },
    ];
    expect(pickupTimes(periodos, [], [])).toEqual(['08:00', '08:30', '14:00', '14:30']);
  });
});

describe('availableDays: casos de borda', () => {
  it('horário exatamente no limite da antecedência ainda vale (RN13)', () => {
    // Segunda 23/11, 9h + 2h = 11h em ponto.
    expect(availableDays(base, '2026-11-23T09:00')[0]?.times[0]).toBe('11:00');
    expect(availableDays(base, '2026-11-23T09:01')[0]?.times[0]).toBe('11:30');
  });

  it('data especial vale se a antecedência termina exatamente à meia-noite do dia (RN20)', () => {
    const input: AgendaInput = { ...base, specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal' }] };
    // 23/12 às 22h + 2h = 24/12 à 0h.
    expect(availableDays(input, '2026-12-23T22:00').map((d) => d.date)).toContain('2026-12-24');
    expect(availableDays(input, '2026-12-23T22:01').map((d) => d.date)).not.toContain('2026-12-24');
  });

  it('só a data especial fica sem horários; os outros dias seguem normais', () => {
    const input: AgendaInput = { ...base, specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal' }] };
    const [primeiro] = availableDays(input, '2026-12-22T10:00');
    expect(primeiro).toMatchObject({ date: '2026-12-22', special: null });
    expect(primeiro!.times[0]).toBe('12:00');
  });

  it('período fechado por lotação vale só na data dele (RN15)', () => {
    const input: AgendaInput = {
      ...base,
      minLeadHours: 0,
      closedPeriods: [{ date: '2026-11-24', start: '07:30', end: '12:00' }],
    };
    const [segunda, terça] = availableDays(input, '2026-11-23T00:00');
    expect(segunda?.times[0]).toBe('07:30');
    expect(terça?.date).toBe('2026-11-24');
    expect(terça?.times[0]).toBe('12:00');
  });

  it('dias sem horário semanal em vigor ficam de fora (RN31)', () => {
    const futura: WeeklySchedule = { ...semana, validFrom: '2026-11-25' };
    const days = availableDays({ ...base, schedules: [futura] }, '2026-11-23T07:00');
    expect(days[0]?.date).toBe('2026-11-25');
  });

  it('virada de ano: segue para janeiro sem pular dias', () => {
    const days = availableDays({ ...base, minLeadHours: 0 }, '2026-12-30T07:00');
    expect(days.slice(0, 3).map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});

describe('C68: mensagens do horário semanal', () => {
  it('fechamento igual à abertura também é recusado', () => {
    expect(weekHoursProblem([{ weekday: 1, open: '08:00', close: '08:00' }])).toBe(
      'O fechamento precisa ser depois da abertura',
    );
  });

  it.each([
    [0, 'No domingo'],
    [1, 'Na segunda'],
    [2, 'Na terça'],
    [3, 'Na quarta'],
    [4, 'Na quinta'],
    [5, 'Na sexta'],
    [6, 'No sábado'],
  ])('sobreposição no dia %i diz qual é o dia, com o artigo certo (%s)', (weekday, nome) => {
    const problema = weekHoursProblem([
      { weekday, open: '08:00', close: '12:00' },
      { weekday, open: '11:00', close: '18:00' },
    ]);
    expect(problema).toBe(`${nome}, os períodos se sobrepõem: o seguinte precisa começar depois que o anterior termina`);
  });
});

describe('deliveryProblem (C83)', () => {
  const entrega = { enabled: true, allDays: false, dates: ['2026-12-24'] };

  it('entrega só em datas exige ao menos uma data', () => {
    expect(deliveryProblem({ ...entrega, dates: [] })).toBe('Marque ao menos uma data com entrega');
    expect(deliveryProblem({ ...entrega, enabled: false, dates: [] })).toBeNull();
    expect(deliveryProblem({ ...entrega, allDays: true, dates: [] })).toBeNull();
    expect(deliveryProblem(entrega)).toBeNull();
  });

  it.each(['2026-12-1', '26-12-24', 'x2026-12-24', '2026-12-24x', 'aaaa-12-24', '2026-aa-24', '2026-12-aa', '2026-1-24'])(
    'recusa data fora do formato AAAA-MM-DD: %s',
    (data) => {
      expect(deliveryProblem({ ...entrega, dates: ['2026-12-24', data] })).toBe('Data inválida');
    },
  );
});

describe('nowInBrasilia', () => {
  it('converte para o horário de Brasília, inclusive na virada do dia', () => {
    expect(nowInBrasilia(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23T23:30');
    expect(nowInBrasilia(new Date('2026-11-24T03:05:00Z'))).toBe('2026-11-24T00:05');
    expect(nowInBrasilia(new Date('2026-11-24T15:45:00Z'))).toBe('2026-11-24T12:45');
  });

  it('usa o fuso de verdade, não um deslocamento fixo (horário de verão de 2019)', () => {
    expect(nowInBrasilia(new Date('2019-01-15T12:00:00Z'))).toBe('2019-01-15T10:00');
  });

  it('sem argumento, usa o momento atual', () => {
    expect(nowInBrasilia()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('formatDay: todos os dias da semana', () => {
  it.each([
    ['2026-11-22', 0, 'Dom 22/11'],
    ['2026-11-23', 1, 'Seg 23/11'],
    ['2026-11-24', 2, 'Ter 24/11'],
    ['2026-11-25', 3, 'Qua 25/11'],
    ['2026-11-26', 4, 'Qui 26/11'],
    ['2026-11-27', 5, 'Sex 27/11'],
  ])('%s', (date, weekday, texto) => {
    expect(formatDay({ date, weekday })).toBe(texto);
  });
});

describe('situação da loja: casos de borda', () => {
  const soSegunda: WeeklySchedule = {
    validFrom: '2026-01-01',
    validUntil: null,
    hours: [{ weekday: 1, open: '07:30', close: '19:00' }],
  };

  it('no minuto exato da abertura, já está aberta', () => {
    expect(storeStatus({ schedules: [semana], blockedDates: [] }, '2026-11-23T07:30').open).toBe(true);
    expect(storeStatus({ schedules: [semana], blockedDates: [] }, '2026-11-23T07:29').open).toBe(false);
  });

  it('procura a próxima abertura até 14 dias à frente, inclusive', () => {
    // Segunda 23/11 à noite; segunda 30/11 bloqueada: a próxima é 07/12, 14 dias depois.
    const s = storeStatus({ schedules: [soSegunda], blockedDates: ['2026-11-30'] }, '2026-11-23T20:00');
    expect(s.nextOpen).toEqual({ date: '2026-12-07', weekday: 1, time: '07:30' });
    expect(statusLabel(s, '2026-11-23')).toBe('Fechado · abre seg às 7h30');
  });

  it('sem abertura em 14 dias: fechada e sem próxima abertura', () => {
    const s = storeStatus(
      { schedules: [soSegunda], blockedDates: ['2026-11-30', '2026-12-07'] },
      '2026-11-23T20:00',
    );
    expect(s).toEqual({ open: false, closesAt: null, nextOpen: null });
  });

  it('antes de o horário semanal entrar em vigor, abre no primeiro dia dele', () => {
    const futura: WeeklySchedule = { ...semana, validFrom: '2026-11-25' };
    const s = storeStatus({ schedules: [futura], blockedDates: [] }, '2026-11-23T10:00');
    expect(s.nextOpen).toEqual({ date: '2026-11-25', weekday: 3, time: '07:30' });
  });

  it('"amanhã" vale também na virada do mês e do ano', () => {
    const amanha = (today: string, date: string) =>
      statusLabel({ open: false, closesAt: null, nextOpen: { date, weekday: 2, time: '07:30' } }, today);
    expect(amanha('2026-11-30', '2026-12-01')).toBe('Fechado · abre amanhã às 7h30');
    expect(amanha('2026-12-31', '2027-01-01')).toBe('Fechado · abre amanhã às 7h30');
  });
});

describe('weekSummary: dias da semana e agrupamento', () => {
  it('nomeia cada dia, de segunda a domingo', () => {
    // Cada dia fecha numa hora diferente, para nenhum se juntar.
    const horas = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '08:00', close: `1${weekday}:00` }));
    expect(weekSummary(horas)).toBe(
      'Seg 8h–11h · Ter 8h–12h · Qua 8h–13h · Qui 8h–14h · Sex 8h–15h · Sáb 8h–16h · Dom 8h–10h',
    );
  });

  it('só junta dias seguidos: um dia fechado ou diferente no meio separa os grupos', () => {
    const manha = (weekday: number) => ({ weekday, open: '08:00', close: '12:00' });
    expect(weekSummary([manha(1), manha(3)])).toBe('Seg 8h–12h · Qua 8h–12h');
    expect(weekSummary([manha(1), { weekday: 2, open: '08:00', close: '13:00' }, manha(3)])).toBe(
      'Seg 8h–12h · Ter 8h–13h · Qua 8h–12h',
    );
  });
});

describe('storeInfo', () => {
  it('junta hoje, pausa, antecedência, situação e horário da semana', () => {
    expect(storeInfo(base, true, '2026-11-23T10:00')).toEqual({
      today: '2026-11-23',
      paused: true,
      minLeadHours: 2,
      status: { open: true, closesAt: '19:00', nextOpen: null },
      week: semana.hours,
    });
  });

  it('sem horário semanal em vigor hoje, a semana fica vazia', () => {
    const futura: WeeklySchedule = { ...semana, validFrom: '2026-11-25' };
    expect(storeInfo({ ...base, schedules: [futura] }, false, '2026-11-23T10:00').week).toEqual([]);
  });
});

describe('agendaForCart: antecedência dos itens e pausa', () => {
  const pães = category({ id: 1, name: 'Pães', slug: 'paes' });
  const catalogo = {
    categorias: [pães],
    produtos: [
      product({ id: 1, categoryId: 1, leadTimeHours: null }),
      product({ id: 2, categoryId: 1, leadTimeHours: 24 }),
      product({ id: 3, categoryId: 1, leadTimeHours: 48 }),
    ],
  };
  const now = '2026-11-23T09:10';

  it('item sem antecedência própria usa a padrão; itens fora do carrinho não contam (RN13, RN14)', () => {
    const agenda = agendaForCart(base, false, now, catalogo, [1]);
    expect(agenda.leadHours).toBe(2);
    expect(agenda.days[0]?.times[0]).toBe('11:30');
  });

  it('usa a maior antecedência entre os itens do carrinho (RN14)', () => {
    const agenda = agendaForCart(base, false, now, catalogo, [1, 2]);
    expect(agenda.leadHours).toBe(24);
    // Segunda 9h10 + 24h = terça 9h10: o primeiro horário é terça 9h30.
    expect(agenda.days[0]?.date).toBe('2026-11-24');
    expect(agenda.days[0]?.times[0]).toBe('09:30');
  });

  it('C115/RN64: item que não está mais no catálogo visível bloqueia a retirada e é apontado', () => {
    // O item 9 saiu do catálogo (cardápio encerrado, oculto ou produto excluído) com a página aberta.
    const agenda = agendaForCart(base, false, now, catalogo, [1, 9]);
    expect(agenda.unavailable).toEqual([9]);
    expect(agenda.days).toEqual([]);
  });

  it('RN64: item indisponível também bloqueia; sem itens assim, nada muda', () => {
    const esgotado = { ...catalogo, produtos: [...catalogo.produtos, product({ id: 4, categoryId: 1, available: false })] };
    expect(agendaForCart(base, false, now, esgotado, [4, 1, 3]).unavailable).toEqual([4]);
    expect(agendaForCart(base, false, now, esgotado, [4, 1, 3]).days).toEqual([]);
    const tudoOk = agendaForCart(base, false, now, catalogo, [1, 2]);
    expect(tudoOk.unavailable).toEqual([]);
    expect(tudoOk.days.length).toBeGreaterThan(0);
  });

  it('RN64: vários itens fora do catálogo vêm em ordem', () => {
    expect(agendaForCart(base, false, now, catalogo, [12, 1, 9]).unavailable).toEqual([9, 12]);
  });

  it('pedidos pausados: nenhum dia, mas a antecedência continua informada (RN11)', () => {
    const agenda = agendaForCart(base, true, now, catalogo, [2]);
    expect(agenda).toMatchObject({ paused: true, leadHours: 24, days: [] });
    expect(agendaForCart(base, false, now, catalogo, [2]).days.length).toBeGreaterThan(0);
  });
});
