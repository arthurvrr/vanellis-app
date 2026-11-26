// Cenários C70–C76 (etapa 6): cardápios especiais.
import { describe, expect, it } from 'vitest';
import { agendaForCart, type AgendaInput } from './agenda';
import {
  formatDates,
  pickupLabel,
  pickupRule,
  specialMenuProblem,
  specialMenuState,
  type SpecialMenu,
} from './cardapioEspecial';
import { visibleCategories, type CategoryDTO } from './catalogo';
import { category, product } from './test-utils';

const natal: SpecialMenu = {
  visibleFrom: '2026-12-01',
  visibleUntil: '2026-12-22',
  hidden: false,
  pickupDates: ['2026-12-24'],
};

const cat = (id: number, name: string, pickupDates?: string[]): CategoryDTO =>
  category({ id, name, special: pickupDates ? { visibleUntil: '2026-12-22', pickupDates } : null });
const categorias = [cat(1, 'Pães'), cat(2, 'Ceia de Natal', ['2026-12-24']), cat(3, 'Ceia de Ano Novo', ['2026-12-31'])];
const produtos = [
  product({ id: 10, categoryId: 1 }),
  product({ id: 20, categoryId: 2 }),
  product({ id: 30, categoryId: 3 }),
];

describe('C70, C71: quando o cardápio aparece', () => {
  it('só dentro do período e se não estiver oculto', () => {
    expect(specialMenuState(natal, '2026-11-30')).toBe('em-breve');
    expect(specialMenuState(natal, '2026-12-01')).toBe('visivel');
    expect(specialMenuState(natal, '2026-12-22')).toBe('visivel');
    expect(specialMenuState(natal, '2026-12-23')).toBe('encerrado');
    expect(specialMenuState({ ...natal, hidden: true }, '2026-12-10')).toBe('oculto');
  });

  it('em destaque, antes das categorias regulares', () => {
    expect(visibleCategories({ categorias, produtos }).map((c) => c.name)).toEqual([
      'Ceia de Natal',
      'Ceia de Ano Novo',
      'Pães',
    ]);
    expect(pickupLabel(categorias[1]!.special!)).toBe('Retirada em 24/12');
    expect(formatDates(['2026-12-31', '2026-12-24', '2026-12-25'])).toBe('24/12, 25/12 e 31/12');
  });
});

describe('C72: dados inválidos', () => {
  it('recusa período invertido, sem datas e data antes do início', () => {
    expect(specialMenuProblem(natal)).toBeNull();
    expect(specialMenuProblem({ ...natal, visibleUntil: '2026-11-30' })).toMatch(/fim do período/);
    expect(specialMenuProblem({ ...natal, pickupDates: [] })).toMatch(/ao menos uma data/);
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-11-20'] })).toMatch(/a partir do início/);
    expect(specialMenuProblem({ ...natal, visibleFrom: '' })).toMatch(/início e o fim/);
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
    expect(specialMenuProblem({ ...natal, visibleUntil: '22/12/2026' })).toBe('Informe o início e o fim do período');
    expect(specialMenuProblem({ ...natal, visibleUntil: '2026-11-30' })).toBe(
      'O fim do período precisa ser depois do início',
    );
    expect(specialMenuProblem({ ...natal, pickupDates: [] })).toBe('Informe ao menos uma data de retirada');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-24', '24/12'] })).toBe('Data de retirada inválida');
    expect(specialMenuProblem({ ...natal, pickupDates: ['2026-12-24', '2026-11-30'] })).toBe(
      'As datas de retirada precisam ser a partir do início do período',
    );
  });

  it('aceita período de um dia só e retirada no primeiro dia', () => {
    expect(specialMenuProblem({ ...natal, visibleUntil: '2026-12-01', pickupDates: ['2026-12-01'] })).toBeNull();
  });

  it('exige data completa AAAA-MM-DD, sem nada antes ou depois', () => {
    expect(specialMenuProblem({ ...natal, visibleFrom: '26-12-01' })).toMatch(/início e o fim/);
    expect(specialMenuProblem({ ...natal, visibleFrom: '2026-12-01x' })).toMatch(/início e o fim/);
    expect(specialMenuProblem({ ...natal, visibleFrom: 'x2026-12-01' })).toMatch(/início e o fim/);
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

  it('rótulo da retirada com várias datas', () => {
    expect(pickupLabel({ visibleUntil: '2026-12-22', pickupDates: ['2026-12-25', '2026-12-24'] })).toBe(
      'Retirada em 24/12 e 25/12',
    );
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
