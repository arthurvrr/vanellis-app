// Antecedência do produto menor que a padrão (RF70; cenários C151–C155). A antecedência cadastrada
// no produto vale no lugar da padrão da loja, para mais ou para menos; vazia = a padrão. No
// carrinho, vale a maior entre os itens.
import { describe, expect, it } from 'vitest';
import { agendaForCart, leadNotice, productLeadHours, scanDays, type AgendaInput, type WeeklySchedule } from './agenda';
import { closedMenuProducts, menuPickups } from './cardapioEspecial';
import { category, product } from './test-utils';

// Loja aberta todos os dias das 7h às 21h; antecedência padrão de 24h, como na padaria hoje.
const todoDia: WeeklySchedule = {
  validFrom: '2026-01-01',
  validUntil: null,
  hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:00', close: '21:00' })),
};
const loja: AgendaInput = {
  schedules: [todoDia],
  restrictions: [],
  blockedDates: [],
  closedPeriods: [],
  specialDates: [],
  minLeadHours: 24,
  windowMonths: 4,
};
const salgados = category({ id: 1, name: 'Salgados' });
const coxinha = product({ id: 1, name: 'Coxinha', leadTimeHours: 2 });
const empadinha = product({ id: 2, name: 'Empadinha', leadTimeHours: null });
const vulcao = product({ id: 3, name: 'Bolo Vulcão', leadTimeHours: 48 });
const catalogo = { categorias: [salgados], produtos: [coxinha, empadinha, vulcao] };
const AGORA = '2026-11-23T10:00'; // segunda, 10h

describe('productLeadHours', () => {
  it('a do produto, para mais ou para menos; vazia = a padrão (RF70)', () => {
    expect(productLeadHours(loja, coxinha)).toBe(2);
    expect(productLeadHours(loja, vulcao)).toBe(48);
    expect(productLeadHours(loja, empadinha)).toBe(24);
    expect(productLeadHours(loja, product({ leadTimeHours: 0 }))).toBe(0);
  });
});

describe('agendaForCart com antecedência menor que a padrão', () => {
  it('C151: só Coxinhas (2h) → hoje às 12h, e nenhum motivo fala em 24h', () => {
    const agenda = agendaForCart(loja, false, AGORA, catalogo, [1]);
    expect(agenda.leadHours).toBe(2);
    expect(agenda.days[0]).toMatchObject({ date: '2026-11-23' });
    expect(agenda.days[0]?.times[0]).toBe('12:00');
    expect(agenda.limit).toBeNull();
    const motivos = [...agenda.blocked, ...agenda.blockedTimes].map((b) => b.reason);
    expect(motivos.length).toBeGreaterThan(0);
    for (const m of motivos) expect(m).not.toContain('24h');
    expect(motivos).toContain('é preciso encomendar com 2h de antecedência');
  });

  it('C152: com um item sem antecedência própria, vale a padrão (24h) → amanhã às 10h', () => {
    const agenda = agendaForCart(loja, false, AGORA, catalogo, [1, 2]);
    expect(agenda.leadHours).toBe(24);
    expect(agenda.days[0]?.date).toBe('2026-11-24');
    expect(agenda.days[0]?.times[0]).toBe('10:00');
  });

  it('C153: com um item de 48h, vale 48h e ele é o que limita', () => {
    const agenda = agendaForCart(loja, false, AGORA, catalogo, [1, 3]);
    expect(agenda.leadHours).toBe(48);
    expect(agenda.days[0]?.date).toBe('2026-11-25');
    expect(agenda.limit).toMatchObject({ name: 'Bolo Vulcão', hours: 48 });
  });

  it('carrinho vazio: a padrão', () => {
    expect(agendaForCart(loja, false, AGORA, catalogo, []).leadHours).toBe(24);
  });
});

describe('scanDays', () => {
  it('sem antecedência informada (null), vale a padrão; com ela, vale a informada', () => {
    expect(scanDays(loja, AGORA, null).days[0]?.date).toBe('2026-11-24');
    expect(scanDays(loja, AGORA, 2).days[0]?.times[0]).toBe('12:00');
  });
});

describe('leadNotice (RF58, C154)', () => {
  it('C154: produto com antecedência menor que a padrão também mostra a primeira retirada', () => {
    const p = { ...coxinha, firstPickup: { date: '2026-11-23', weekday: 1, time: '12:00' } };
    expect(leadNotice(p)).toBe('Encomende com 2h de antecedência: retirada a partir de seg 23/11, 12h');
  });

  it('produto sem antecedência própria não repete a faixa do site', () => {
    const p = product({ leadTimeHours: null, firstPickup: { date: '2026-11-23', weekday: 1, time: '10:00' } });
    expect(leadNotice(p)).toBeNull();
  });

  it('sem antecedência nenhuma (0h), só a primeira retirada', () => {
    const p = product({ leadTimeHours: 0, firstPickup: { date: '2026-11-23', weekday: 1, time: '10:00' } });
    expect(leadNotice(p)).toBe('Sem antecedência: retirada a partir de seg 23/11, 10h');
  });
});

describe('cardápio especial com retirada em data comum (C155)', () => {
  // Retirada na terça 24/11 (não é data especial); último horário 20h30.
  const AGORA_TARDE = '2026-11-23T21:00'; // segunda, depois do fechamento

  it('C155: a Coxinha (2h) continua no cardápio; o item de 24h fica com o prazo encerrado', () => {
    const pickups = menuPickups(loja, AGORA_TARDE, ['2026-11-24'], [coxinha.leadTimeHours, empadinha.leadTimeHours]);
    expect(pickups[0]).toMatchObject({ open: true });
    expect(closedMenuProducts(loja, AGORA_TARDE, pickups, [coxinha, empadinha])).toEqual([2]);
  });

  it('C155: o "Encomendas até" considera a menor antecedência dos itens', () => {
    expect(menuPickups(loja, AGORA, ['2026-11-24'], [2, null])[0]?.until).toEqual({ date: '2026-11-24', time: '18:30' });
    expect(menuPickups(loja, AGORA, ['2026-11-24'], [null])[0]?.until).toEqual({ date: '2026-11-23', time: '20:30' });
  });
});
