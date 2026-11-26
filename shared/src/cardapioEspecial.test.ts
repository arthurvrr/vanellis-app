// Cenários C70–C76 (etapa 6): cardápios especiais.
import { describe, expect, it } from 'vitest';
import { agendaForCart, type AgendaInput } from './agenda';
import {
  closedMenuProducts,
  formatDates,
  menuAnnouncement,
  menuEnd,
  menuPickups,
  pickupRule,
  specialMenuProblem,
  specialMenuState,
  specialMenuWarnings,
  type SpecialMenu,
} from './cardapioEspecial';
import { visibleCategories, type CategoryDTO } from './catalogo';
import { category, product } from './test-utils';

const natal: SpecialMenu = {
  visibleFrom: '2026-12-01',
  hidden: false,
  pickupDates: ['2026-12-24'],
};

const cat = (id: number, name: string, pickupDates?: string[]): CategoryDTO =>
  category({ id, name, special: pickupDates ? { pickupDates, announcement: '', closedProducts: [] } : null });
const categorias = [cat(1, 'Pães'), cat(2, 'Ceia de Natal', ['2026-12-24']), cat(3, 'Ceia de Ano Novo', ['2026-12-31'])];
const produtos = [
  product({ id: 10, categoryId: 1 }),
  product({ id: 20, categoryId: 2 }),
  product({ id: 30, categoryId: 3 }),
];

describe('C70, C71: quando o cardápio aparece', () => {
  const aberta = [{ date: '2026-12-24', special: true, open: true, until: { date: '2026-12-22', time: '19:00' } }];
  const fechada = [{ ...aberta[0]!, open: false }];

  it('a partir do início, se não estiver oculto e enquanto alguma data aceitar pedidos (RN63)', () => {
    expect(specialMenuState(natal, aberta, '2026-11-30')).toBe('em-breve');
    expect(specialMenuState(natal, aberta, '2026-12-01')).toBe('visivel');
    expect(specialMenuState(natal, fechada, '2026-12-23')).toBe('encerrado');
    expect(specialMenuState({ ...natal, hidden: true }, aberta, '2026-12-10')).toBe('oculto');
    // Oculto pelo operador vale mesmo encerrado; antes do início vale "em breve".
    expect(specialMenuState({ ...natal, hidden: true }, fechada, '2026-12-23')).toBe('oculto');
    expect(specialMenuState(natal, fechada, '2026-11-30')).toBe('em-breve');
  });

  it('em destaque, antes das categorias regulares', () => {
    expect(visibleCategories({ categorias, produtos }).map((c) => c.name)).toEqual([
      'Ceia de Natal',
      'Ceia de Ano Novo',
      'Pães',
    ]);
    expect(formatDates(['2026-12-31', '2026-12-24', '2026-12-25'])).toBe('24/12, 25/12 e 31/12');
  });
});

describe('C72: dados inválidos', () => {
  it('recusa período invertido, sem datas e data antes do início', () => {
    expect(specialMenuProblem(natal)).toBeNull();
    expect(specialMenuProblem({ ...natal, pickupDates: [] })).toMatch(/ao menos uma data/);
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-11-20'] })).toMatch(/a partir do início/);
    expect(specialMenuProblem({ ...natal, visibleFrom: '' })).toBe('Informe o início');
  });
});

describe('C73–C76: datas de retirada do carrinho', () => {
  it('C76: só regular, sem restrição', () => {
    expect(pickupRule({ categorias, produtos }, [10])).toEqual({ menus: [], dates: null, conflict: false });
  });
  it('C73, C74: com a ceia, só 24/12, mesmo com pães junto', () => {
    expect(pickupRule({ categorias, produtos }, [20])).toMatchObject({ dates: ['2026-12-24'], conflict: false });
    expect(pickupRule({ categorias, produtos }, [10, 20])).toMatchObject({ dates: ['2026-12-24'], conflict: false });
  });
  it('C75: Natal e Ano Novo juntos não têm data em comum', () => {
    const r = pickupRule({ categorias, produtos }, [20, 30]);
    expect(r.conflict).toBe(true);
    expect(r.menus.map((m) => m.name)).toEqual(['Ceia de Natal', 'Ceia de Ano Novo']);
  });

  it('a agenda do carrinho oferece só as datas do cardápio', () => {
    const input: AgendaInput = {
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
    const now = '2026-12-10T10:00';
    const comCeia = agendaForCart(input, false, now, { categorias, produtos }, [10, 20]);
    expect(comCeia.days.map((d) => d.date)).toEqual(['2026-12-24']);
    expect(comCeia.days[0]!.special).toBe('Véspera de Natal');
    expect(agendaForCart(input, false, now, { categorias, produtos }, [20, 30]).days).toEqual([]);
    expect(agendaForCart(input, false, now, { categorias, produtos }, [10]).days.length).toBeGreaterThan(30);
  });
});

describe('C72: mensagens e formato das datas', () => {
  it('mostra a mensagem certa para cada problema', () => {
    expect(specialMenuProblem({ ...natal, visibleFrom: '01/12/2026' })).toBe('Informe o início');
    expect(specialMenuProblem({ ...natal, pickupDates: [] })).toBe('Informe ao menos uma data de retirada');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-24', '24/12'] })).toBe('Data de retirada inválida');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-24', '2026-11-30'] })).toBe(
      'As datas de retirada precisam ser a partir do início do período',
    );
  });

  it('aceita período de um dia só e retirada no primeiro dia', () => {
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-01'] })).toBeNull();
  });

  it('exige data completa AAAA-MM-DD, sem nada antes ou depois', () => {
    expect(specialMenuProblem({ ...natal, visibleFrom: '26-12-01' })).toBe('Informe o início');
    expect(specialMenuProblem({ ...natal, visibleFrom: '2026-12-01x' })).toBe('Informe o início');
    expect(specialMenuProblem({ ...natal, visibleFrom: 'x2026-12-01' })).toBe('Informe o início');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-24 '] })).toBe('Data de retirada inválida');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-1-24'] })).toBe('Data de retirada inválida');
  });
});

describe('datas no formato curto', () => {
  it('nenhuma, uma e duas datas', () => {
    expect(formatDates([])).toBe('');
    expect(formatDates(['2026-12-24'])).toBe('24/12');
    expect(formatDates(['2026-12-25', '2026-12-24'])).toBe('24/12 e 25/12');
  });

  it('não altera a lista recebida ao ordenar', () => {
    const datas = ['2026-12-31', '2026-12-24'];
    formatDates(datas);
    expect(datas).toEqual(['2026-12-31', '2026-12-24']);
  });

});

describe('pickupRule: datas comuns entre cardápios', () => {
  const cats = [
    cat(1, 'Pães'),
    cat(2, 'Ceia', ['2026-12-31', '2026-12-24', '2026-12-25']),
    cat(3, 'Panetones', ['2026-12-25', '2026-12-24']),
  ];
  const prods = [product({ id: 10, categoryId: 1 }), product({ id: 20, categoryId: 2 }), product({ id: 30, categoryId: 3 })];

  it('fica só com as datas que todos os cardápios do carrinho têm, em ordem', () => {
    expect(pickupRule({ categorias: cats, produtos: prods }, [20, 30, 10])).toEqual({
      menus: [
        { name: 'Ceia', pickupDates: ['2026-12-24', '2026-12-25', '2026-12-31'] },
        { name: 'Panetones', pickupDates: ['2026-12-24', '2026-12-25'] },
      ],
      dates: ['2026-12-24', '2026-12-25'],
      conflict: false,
    });
  });

  it('com um só cardápio especial usa todas as datas dele, ordenadas', () => {
    expect(pickupRule({ categorias: cats, produtos: prods }, [20])).toEqual({
      menus: [{ name: 'Ceia', pickupDates: ['2026-12-24', '2026-12-25', '2026-12-31'] }],
      dates: ['2026-12-24', '2026-12-25', '2026-12-31'],
      conflict: false,
    });
  });

  it('não conta cardápio de produto que não está no carrinho', () => {
    expect(pickupRule({ categorias: cats, produtos: prods }, [30]).menus.map((m) => m.name)).toEqual(['Panetones']);
    expect(pickupRule({ categorias: cats, produtos: prods }, [])).toEqual({ menus: [], dates: null, conflict: false });
  });

  it('não altera as datas do catálogo ao ordenar', () => {
    pickupRule({ categorias: cats, produtos: prods }, [20]);
    expect(cats[1]!.special!.pickupDates).toEqual(['2026-12-31', '2026-12-24', '2026-12-25']);
  });
});

// ---------- Fim do cardápio pelo prazo das datas (RF60, RN62, RN63, RN67; C109–C114, C121, C122, C125) ----------
// Semana: segunda a sábado 7h30–19h, domingo fechado. Festas: retirada em 24/12 (prazo 22/12) e
// 31/12 (prazo 29/12), as duas datas especiais. 22/12 e 29/12 de 2026 são terças.

describe('cardápio especial: datas abertas, anúncio e fim', () => {
  const agenda: AgendaInput = {
    schedules: [
      {
        validFrom: '2026-01-01',
        validUntil: null,
        hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' })),
      },
    ],
    restrictions: [],
    blockedDates: [],
    closedPeriods: [],
    specialDates: [
      { date: '2026-12-24', name: 'Véspera de Natal', deadline: '2026-12-22', chooseTime: false, window: null },
      { date: '2026-12-31', name: 'Véspera de Ano Novo', deadline: '2026-12-29', chooseTime: false, window: null },
    ],
    minLeadHours: 2,
    windowMonths: 4,
  };
  const festas: SpecialMenu = { visibleFrom: '2026-12-01', hidden: false, pickupDates: ['2026-12-31', '2026-12-24'] };
  const datas = (now: string, leads = [0]) => menuPickups(agenda, now, festas.pickupDates, leads);

  it('cada data de retirada, em ordem, com o prazo efetivo da data especial', () => {
    expect(datas('2026-12-20T10:00')).toEqual([
      { date: '2026-12-24', special: true, open: true, until: { date: '2026-12-22', time: '19:00' } },
      { date: '2026-12-31', special: true, open: true, until: { date: '2026-12-29', time: '19:00' } },
    ]);
  });

  it('C109: o anúncio mostra o prazo de cada data', () => {
    expect(menuAnnouncement(datas('2026-12-20T10:00'))).toBe(
      'Retirada em 24/12 (encomendas até 22/12) e 31/12 (encomendas até 29/12)',
    );
  });

  it('C110: a data encerrada sai do anúncio', () => {
    const d = datas('2026-12-23T10:00');
    expect(d.map((x) => x.open)).toEqual([false, true]);
    expect(menuAnnouncement(d)).toBe('Retirada em 31/12. Encomendas até 29/12');
  });

  it('C111 e C112: o cardápio fica no site até o último prazo, exclusive', () => {
    for (const now of ['2026-12-23T10:00', '2026-12-28T10:00', '2026-12-29T18:00', '2026-12-29T18:59'])
      expect(specialMenuState(festas, datas(now), now.slice(0, 10))).toBe('visivel');
    expect(specialMenuState(festas, datas('2026-12-29T19:00'), '2026-12-29')).toBe('encerrado');
  });

  it('C113: o fim calculado é o prazo da última data de retirada', () => {
    expect(menuEnd(datas('2026-12-20T10:00'))).toEqual({ date: '2026-12-29', time: '19:00' });
    expect(menuEnd([])).toBeNull();
    const p = (date: string, until: { date: string; time: string | null } | null) => ({ date, special: true, open: true, until });
    // Em qualquer ordem, ignorando data sem prazo; o fim do dia vem depois de qualquer hora dele.
    expect(menuEnd([p('2026-12-31', { date: '2026-12-29', time: '19:00' }), p('2026-12-24', { date: '2026-12-22', time: '19:00' })])).toEqual({
      date: '2026-12-29',
      time: '19:00',
    });
    expect(menuEnd([p('2026-12-26', null), p('2026-12-24', { date: '2026-12-22', time: '19:00' })])).toEqual({
      date: '2026-12-22',
      time: '19:00',
    });
    expect(menuEnd([p('2026-12-24', { date: '2026-12-22', time: '19:00' }), p('2026-12-26', null)])).toEqual({
      date: '2026-12-22',
      time: '19:00',
    });
    expect(menuEnd([p('2026-12-24', { date: '2026-12-22', time: '19:00' }), p('2026-12-25', { date: '2026-12-22', time: null })])).toEqual({
      date: '2026-12-22',
      time: null,
    });
  });

  it('item com uma data já fechada e outra aberta não fica com o prazo encerrado', () => {
    const now = '2026-12-23T10:00';
    const d = datas(now, [72]);
    expect(d.map((x) => x.open)).toEqual([false, true]);
    expect(closedMenuProducts(agenda, now, d, [{ id: 6, leadTimeHours: 72, available: true }])).toEqual([]);
  });

  it('C114: uma data nova ainda aberta traz o cardápio de volta', () => {
    const comNova: AgendaInput = {
      ...agenda,
      specialDates: [
        ...agenda.specialDates,
        { date: '2027-01-06', name: 'Reis', deadline: '2027-01-04', chooseTime: false, window: null },
      ],
    };
    const now = '2026-12-30T10:00';
    expect(specialMenuState(festas, menuPickups(comNova, now, festas.pickupDates, [0]), '2026-12-30')).toBe('encerrado');
    const depois = menuPickups(comNova, now, [...festas.pickupDates, '2027-01-06'], [0]);
    expect(specialMenuState(festas, depois, '2026-12-30')).toBe('visivel');
    expect(menuAnnouncement(depois)).toBe('Retirada em 06/01. Encomendas até 04/01');
  });

  it('data especial bloqueada não está aberta (RN60)', () => {
    const bloqueada = { ...agenda, blockedDates: ['2026-12-24'] };
    expect(menuPickups(bloqueada, '2026-12-20T10:00', ['2026-12-24'], [0])[0]).toMatchObject({ open: false });
  });

  describe('data de retirada que não é data especial (RN67)', () => {
    // Festival de Tortas: retirada só no sábado 28/11 (dia normal).
    const festival = ['2026-11-28'];
    const simples = { id: 1, leadTimeHours: 2, available: true };
    const especial = { id: 2, leadTimeHours: 48, available: true };

    it('C121: o anúncio só diz a data; o item que não chega mais a ela fica com o prazo encerrado', () => {
      const now = '2026-11-27T10:00';
      const d = menuPickups(agenda, now, festival, [2, 48]);
      expect(d).toEqual([{ date: '2026-11-28', special: false, open: true, until: { date: '2026-11-28', time: '16:30' } }]);
      expect(menuAnnouncement(d)).toBe('Retirada em 28/11');
      expect(closedMenuProducts(agenda, now, d, [simples, especial])).toEqual([2]);
    });

    it('C122: sem nenhum item disponível que chegue à data, o cardápio fica encerrado', () => {
      const now = '2026-11-27T10:00';
      const d = menuPickups(agenda, now, festival, [48]);
      expect(d[0]!.open).toBe(false);
      expect(specialMenuState({ visibleFrom: '2026-11-20', hidden: false }, d, '2026-11-27')).toBe(
        'encerrado',
      );
      // Sem nenhum item disponível, também, e sem fim calculado.
      expect(menuPickups(agenda, now, festival, [])[0]).toMatchObject({ open: false, until: null });
    });

    it('o fim de uma data normal é o último horário dela menos a menor antecedência', () => {
      // Último horário de sábado: 18:30; menor antecedência entre os itens: 24h → sexta 18:30.
      expect(menuPickups(agenda, '2026-11-20T10:00', festival, [24, 48])[0]!.until).toEqual({
        date: '2026-11-27',
        time: '18:30',
      });
      // Horário lotado no próprio dia corta o fim; lotação em outro dia, não.
      const lotado = { ...agenda, closedPeriods: [{ date: '2026-11-28', start: '18:00', end: '19:00' }] };
      expect(menuPickups(lotado, '2026-11-20T10:00', festival, [24])[0]!.until).toEqual({ date: '2026-11-27', time: '17:30' });
      const outroDia = { ...agenda, closedPeriods: [{ date: '2026-11-27', start: '18:00', end: '19:00' }] };
      expect(menuPickups(outroDia, '2026-11-20T10:00', festival, [24])[0]!.until).toEqual({ date: '2026-11-27', time: '18:30' });
      // A antecedência padrão da loja (2h) vale quando é maior que a dos itens.
      expect(menuPickups(agenda, '2026-11-20T10:00', festival, [0])[0]!.until).toEqual({ date: '2026-11-28', time: '16:30' });
      // Dia sem horário: sem fim e fechado.
      expect(menuPickups(agenda, '2026-11-20T10:00', ['2026-11-29'], [0])[0]).toEqual({
        date: '2026-11-29',
        special: false,
        open: false,
        until: null,
      });
    });

    it('item numa data especial aberta nunca fica com o prazo encerrado (a antecedência não vale lá)', () => {
      const d = menuPickups(agenda, '2026-12-20T10:00', ['2026-12-24'], [72]);
      expect(closedMenuProducts(agenda, '2026-12-20T10:00', d, [{ id: 3, leadTimeHours: 72, available: true }])).toEqual([]);
    });

    it('item indisponível não entra na lista de prazo encerrado (ele já some do cardápio)', () => {
      const now = '2026-11-27T10:00';
      const d = menuPickups(agenda, now, festival, [2]);
      expect(closedMenuProducts(agenda, now, d, [{ id: 4, leadTimeHours: 48, available: false }])).toEqual([]);
    });

    it('item sem antecedência própria usa a padrão da loja', () => {
      const now = '2026-11-28T16:00';
      const d = menuPickups(agenda, now, festival, [0]);
      expect(closedMenuProducts(agenda, now, d, [{ id: 5, leadTimeHours: null, available: true }])).toEqual([]);
    });
  });

  it('anúncio com data especial e data normal juntas', () => {
    const d = menuPickups(agenda, '2026-12-20T10:00', ['2026-12-26', '2026-12-24'], [0]);
    expect(menuAnnouncement(d)).toBe('Retirada em 24/12 (encomendas até 22/12) e 26/12');
    expect(menuAnnouncement([])).toBe('');
  });

  it('C125: o painel avisa quando o cardápio começaria no site já encerrado', () => {
    const d = datas('2026-12-20T10:00');
    expect(specialMenuWarnings({ ...festas, visibleFrom: '2026-12-30' }, d)).toEqual([
      'O cardápio começaria no site já encerrado: o último prazo (29/12) é antes do início (30/12).',
    ]);
    expect(specialMenuWarnings({ ...festas, visibleFrom: '2026-12-29' }, d)).toEqual([]);
    expect(specialMenuWarnings(festas, [])).toEqual([]);
  });
});
