// Cenários C77–C83 (etapa 6): tele-entrega.
import { describe, expect, it } from 'vitest';
import { availableDays, deliveryProblem, type AgendaInput } from './agenda';
import { emptyAddress, formatAddress, validateAddress } from './cliente';
import { buildOrderMessage } from './mensagem';

const base: AgendaInput = {
  schedules: [
    {
      validFrom: '2026-01-01',
      validUntil: null,
      hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
    },
  ],
  restrictions: [],
  blockedDates: [],
  closedPeriods: [],
  specialDates: [{ date: '2026-12-24', name: 'Véspera de Natal', deadline: null, chooseTime: false, window: null }],
  minLeadHours: 2,
  windowMonths: 4,
};
const NOW = '2026-12-10T10:00';
const comEntrega = (d: AgendaInput['delivery']) => availableDays({ ...base, delivery: d }, NOW);

describe('C77–C79: em quais dias a entrega vale', () => {
  it('desligada (ou sem configuração): nenhum dia com entrega', () => {
    expect(availableDays(base, NOW).some((d) => d.delivery)).toBe(false);
    expect(comEntrega({ enabled: false, allDays: true, dates: [] }).some((d) => d.delivery)).toBe(false);
  });
  it('todos os dias com retirada, inclusive data especial', () => {
    expect(comEntrega({ enabled: true, allDays: true, dates: [] }).every((d) => d.delivery)).toBe(true);
  });
  it('só nas datas marcadas', () => {
    const dias = comEntrega({ enabled: true, allDays: false, dates: ['2026-12-24', '2026-12-31'] });
    expect(dias.filter((d) => d.delivery).map((d) => d.date)).toEqual(['2026-12-24', '2026-12-31']);
    // A retirada continua em todos os dias.
    expect(dias.length).toBeGreaterThan(30);
  });
});

describe('C83: configuração inválida', () => {
  it('só em datas, sem nenhuma data', () => {
    expect(deliveryProblem({ enabled: true, allDays: false, dates: [] })).toMatch(/ao menos uma data/);
    expect(deliveryProblem({ enabled: false, allDays: false, dates: [] })).toBeNull();
    expect(deliveryProblem({ enabled: true, allDays: true, dates: [] })).toBeNull();
  });
});

const endereco = {
  street: 'Rua das Flores',
  number: '123',
  complement: 'ap 2',
  district: 'Centro',
  city: 'Xangri-lá',
  reference: 'perto da praça',
};

describe('C80: endereço', () => {
  it('rua, número, bairro e cidade obrigatórios', () => {
    expect(Object.keys(validateAddress(emptyAddress)).sort()).toEqual(['city', 'district', 'number', 'street']);
    expect(validateAddress({ ...endereco, complement: '', reference: '' })).toEqual({});
  });
  it('formata em uma linha', () => {
    expect(formatAddress(endereco)).toBe('Rua das Flores, 123, ap 2 - Centro, Xangri-lá (ref.: perto da praça)');
    expect(formatAddress({ ...endereco, complement: '', reference: '' })).toBe('Rua das Flores, 123 - Centro, Xangri-lá');
  });
});

describe('C81: mensagem com entrega', () => {
  const input = {
    code: 'VNL-ABCDE',
    lines: [],
    pickup: { date: '2026-12-12', weekday: 6, time: '10:00', special: null },
    customer: { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(51) 99999-9999', note: '' },
  };
  it('traz "Entrega" e o endereço', () => {
    const msg = buildOrderMessage({ ...input, delivery: endereco });
    expect(msg).toContain('*Entrega:* Sáb 12/12 às 10:00');
    expect(msg).toContain('*Endereço:* Rua das Flores, 123, ap 2 - Centro, Xangri-lá (ref.: perto da praça)');
    expect(msg).not.toContain('*Retirada:*');
  });
  it('sem entrega continua "Retirada"', () => {
    const msg = buildOrderMessage(input);
    expect(msg).toContain('*Retirada:* Sáb 12/12 às 10:00');
    expect(msg).not.toContain('Endereço');
  });
});
