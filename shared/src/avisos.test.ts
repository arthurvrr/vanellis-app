import { describe, expect, it } from 'vitest';
import {
  HORAS_SEM_BACKUP,
  avisosDeBackup,
  dataHora,
  instanteBrasilia,
  montarAvisos,
  ordenarAvisos,
  paraOperador,
  proximaRevisao,
  type AvisoDTO,
  type EntradaAvisos,
  type EstadoCopia,
} from './avisos';
import { reminderStatus, type ReminderWithStatus } from './lembretes';

const H = 3_600_000;
// 27/11/2026 10:00 em Brasília.
const AGORA = instanteBrasilia('2026-11-27T10:00');
const copiaOk: EstadoCopia = { ultimaOk: AGORA - 3 * H, ultimaTentativa: AGORA - 3 * H, falhaDesde: null, erro: null };

const lembrete = (kind: ReminderWithStatus['kind'], lastReviewed: string | null, everyDays = 30): ReminderWithStatus => {
  const dto = { kind, everyDays, lastReviewed };
  return { ...dto, status: reminderStatus(dto, '2026-11-27') };
};
const entrada = (e: Partial<EntradaAvisos>): EntradaAvisos => ({
  backup: null,
  pdvMissing: 0,
  ordersPaused: false,
  pricesHidden: false,
  lembretes: [],
  cardapios: [],
  ...e,
});
const aviso = (a: Partial<AvisoDTO> & Pick<AvisoDTO, 'chave' | 'gravidade'>): AvisoDTO => ({
  tipo: 'sem-pdv',
  titulo: a.chave,
  detalhe: null,
  desde: null,
  acao: null,
  ...a,
});

describe('horário de Brasília', () => {
  it('instanteBrasilia lê o relógio de Brasília (UTC-3) e dataHora mostra de volta', () => {
    expect(new Date(AGORA).toISOString()).toBe('2026-11-27T13:00:00.000Z');
    expect(dataHora(AGORA)).toBe('27/11 10:00');
    expect(dataHora(instanteBrasilia('2026-01-05T03:07'))).toBe('05/01 03:07');
  });
});

describe('avisos de backup (RF67, C136–C138)', () => {
  it('C136: último backup bom há mais de 26 horas → vermelho, desde que passou do prazo', () => {
    const ultimo = AGORA - 27 * H;
    expect(avisosDeBackup({ ultimoBackup: ultimo, copia: null }, AGORA)).toEqual([
      {
        chave: 'backup-atrasado',
        tipo: 'backup-atrasado',
        gravidade: 'vermelho',
        titulo: 'Backup do banco atrasado',
        detalhe: 'Último backup bom: 26/11 07:00.',
        desde: ultimo + HORAS_SEM_BACKUP * H,
        acao: null,
      },
    ]);
  });

  it('C137: backup em dia e cópia desligada → nenhum aviso; exatamente 26 horas ainda está em dia', () => {
    expect(avisosDeBackup({ ultimoBackup: AGORA - 20 * H, copia: null }, AGORA)).toEqual([]);
    expect(avisosDeBackup({ ultimoBackup: AGORA - 26 * H, copia: null }, AGORA)).toEqual([]);
    expect(avisosDeBackup({ ultimoBackup: AGORA - 26 * H - 1, copia: null }, AGORA)).toHaveLength(1);
  });

  it('nenhum backup no servidor → vermelho, sem data de início', () => {
    expect(avisosDeBackup({ ultimoBackup: null, copia: null }, AGORA)).toMatchObject([
      {
        chave: 'backup-atrasado',
        titulo: 'Backup do banco atrasado',
        detalhe: 'Nenhum backup encontrado no servidor.',
        desde: null,
      },
    ]);
  });

  it('C138: a última tentativa de cópia falhou → vermelho com o erro, desde a primeira falha', () => {
    const copia = { ...copiaOk, ultimaTentativa: AGORA - H, falhaDesde: AGORA - 2 * H, erro: 'não foi possível enviar' };
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia }, AGORA)).toEqual([
      {
        chave: 'copia-externa',
        tipo: 'copia-externa',
        gravidade: 'vermelho',
        titulo: 'Cópia do backup no Drive falhando',
        detalhe: 'Última cópia boa: 27/11 07:00. Erro: não foi possível enviar',
        desde: AGORA - 2 * H,
        acao: null,
      },
    ]);
  });

  it('falha sem a data da primeira falha usa a da tentativa; sem cópia boa ainda, diz isso', () => {
    const copia = { ultimaOk: null, ultimaTentativa: AGORA - H, falhaDesde: null, erro: 'sem rede' };
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia }, AGORA)).toMatchObject([
      { chave: 'copia-externa', detalhe: 'Nenhuma cópia boa ainda. Erro: sem rede', desde: AGORA - H },
    ]);
  });

  it('cópia sem sucesso há mais de 26 horas (o serviço parou) → vermelho, desde que passou do prazo', () => {
    const copia = { ...copiaOk, ultimaOk: AGORA - 30 * H, ultimaTentativa: AGORA - 30 * H };
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia }, AGORA)).toMatchObject([
      {
        chave: 'copia-externa',
        detalhe: 'Nenhuma cópia nas últimas 26 horas. Última cópia boa: 26/11 04:00.',
        desde: AGORA - 4 * H,
      },
    ]);
    const exato = { ...copiaOk, ultimaOk: AGORA - 26 * H };
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia: exato }, AGORA)).toEqual([]);
  });

  it('cópia ligada que nunca deu certo, sem erro registrado → vermelho sem data de início', () => {
    const copia = { ultimaOk: null, ultimaTentativa: null, falhaDesde: null, erro: null };
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia }, AGORA)).toMatchObject([
      { chave: 'copia-externa', detalhe: 'Nenhuma cópia boa ainda.', desde: null },
    ]);
  });

  it('cópia em dia → nenhum aviso; backup e cópia com problema → os dois', () => {
    expect(avisosDeBackup({ ultimoBackup: AGORA - H, copia: copiaOk }, AGORA)).toEqual([]);
    const ruim = { ...copiaOk, erro: 'x', falhaDesde: AGORA - H };
    expect(avisosDeBackup({ ultimoBackup: AGORA - 30 * H, copia: ruim }, AGORA).map((a) => a.chave)).toEqual([
      'backup-atrasado',
      'copia-externa',
    ]);
  });
});

describe('montarAvisos (RF66, RN71, C142, C145)', () => {
  it('sem nada pendente e backup não monitorado → nenhum aviso', () => {
    expect(montarAvisos(entrada({ lembretes: [lembrete('precos', '2026-11-20')] }), AGORA)).toEqual([]);
  });

  it('C142: sem PDV, preços ocultos e revisão vencida, na ordem e com os atalhos', () => {
    const avisos = montarAvisos(
      entrada({ pdvMissing: 1, pricesHidden: true, lembretes: [lembrete('precos', '2026-10-25')] }),
      AGORA,
    );
    expect(avisos).toEqual([
      {
        chave: 'revisao-vencida:precos',
        tipo: 'revisao-vencida',
        gravidade: 'amarelo',
        titulo: 'Revisão de preços vencida há 3 dias',
        detalhe: 'Conferir se os preços batem com o PDV.',
        desde: instanteBrasilia('2026-11-24T00:00'),
        acao: { rotulo: 'Abrir preços', href: '#precos' },
      },
      {
        chave: 'precos-ocultos',
        tipo: 'precos-ocultos',
        gravidade: 'azul',
        titulo: 'Preços ocultos',
        detalhe: 'O cardápio do site está sem valores.',
        desde: null,
        acao: { rotulo: 'Mostrar preços', href: '#inicio' },
      },
      {
        chave: 'sem-pdv',
        tipo: 'sem-pdv',
        gravidade: 'azul',
        titulo: '1 produto sem código PDV',
        detalhe: 'Eles continuam no cardápio, mas a mensagem do pedido vai sem o código.',
        desde: null,
        acao: { rotulo: 'Ver produtos', href: '#produtos-sem-pdv' },
      },
    ]);
  });

  it('vários sem PDV no plural; pedidos pausados com o atalho para retomar', () => {
    const avisos = montarAvisos(entrada({ pdvMissing: 3, ordersPaused: true }), AGORA);
    expect(avisos.map((a) => a.titulo)).toEqual(['Pedidos pausados', '3 produtos sem código PDV']);
    expect(avisos[0]).toEqual({
      chave: 'pedidos-pausados',
      tipo: 'pedidos-pausados',
      gravidade: 'azul',
      titulo: 'Pedidos pausados',
      detalhe: 'O site não está aceitando novos pedidos.',
      desde: null,
      acao: { rotulo: 'Retomar pedidos', href: '#inicio' },
    });
  });

  it('cada revisão vencida vira um aviso; a que vence hoje também', () => {
    const avisos = montarAvisos(
      entrada({ lembretes: [lembrete('cardapio', '2026-11-20', 7), lembrete('horario', null, 15)] }),
      AGORA,
    );
    expect(avisos.map((a) => [a.chave, a.titulo, a.acao?.rotulo])).toEqual([
      ['revisao-vencida:cardapio', 'Revisão de produtos do cardápio vence hoje', 'Abrir lista de produtos'],
      ['revisao-vencida:horario', 'Revisão de horário de funcionamento vence hoje', 'Abrir agenda'],
    ]);
  });

  it('C145: cardápio especial com aviso → amarelo com o nome e o atalho; sem aviso, nada', () => {
    const avisos = montarAvisos(
      entrada({
        cardapios: [
          { id: 7, name: 'Ceia de Natal', warnings: ['O cardápio começaria no site já encerrado.', 'Outro aviso.'] },
          { id: 8, name: 'Páscoa', warnings: [] },
        ],
      }),
      AGORA,
    );
    expect(avisos).toEqual([
      {
        chave: 'cardapio-especial:7',
        tipo: 'cardapio-especial',
        gravidade: 'amarelo',
        titulo: 'Cardápio Ceia de Natal',
        detalhe: 'O cardápio começaria no site já encerrado. Outro aviso.',
        desde: null,
        acao: { rotulo: 'Abrir cardápios', href: '#categorias' },
      },
    ]);
  });

  it('o backup monitorado entra antes de tudo', () => {
    const avisos = montarAvisos(
      entrada({ backup: { ultimoBackup: AGORA - 30 * H, copia: null }, pdvMissing: 1 }),
      AGORA,
    );
    expect(avisos.map((a) => a.chave)).toEqual(['backup-atrasado', 'sem-pdv']);
  });
});

describe('ordenarAvisos (RN71)', () => {
  it('vermelho, amarelo, azul; dentro da cor, o mais antigo primeiro; sem data no fim; empate pela chave', () => {
    const lista = [
      aviso({ chave: 'z-azul', gravidade: 'azul' }),
      aviso({ chave: 'b-amarelo-sem-data', gravidade: 'amarelo' }),
      aviso({ chave: 'a-amarelo-sem-data', gravidade: 'amarelo' }),
      aviso({ chave: 'amarelo-novo', gravidade: 'amarelo', desde: 20 }),
      aviso({ chave: 'amarelo-velho', gravidade: 'amarelo', desde: 10 }),
      aviso({ chave: 'vermelho', gravidade: 'vermelho', desde: 30 }),
    ];
    expect(ordenarAvisos(lista).map((a) => a.chave)).toEqual([
      'vermelho',
      'amarelo-velho',
      'amarelo-novo',
      'a-amarelo-sem-data',
      'b-amarelo-sem-data',
      'z-azul',
    ]);
    // Não muda a lista recebida.
    expect(lista[0]!.chave).toBe('z-azul');
  });

  it('um sem data depois de um com data, nas duas ordens de chegada', () => {
    const comData = aviso({ chave: 'b', gravidade: 'azul', desde: 5 });
    const semData = aviso({ chave: 'a', gravidade: 'azul' });
    expect(ordenarAvisos([semData, comData]).map((a) => a.chave)).toEqual(['b', 'a']);
    expect(ordenarAvisos([comData, semData]).map((a) => a.chave)).toEqual(['b', 'a']);
  });
});

describe('paraOperador (RN73, C140)', () => {
  it('o vermelho vira o texto simples, sem detalhe técnico nem atalho', () => {
    const backup = avisosDeBackup({ ultimoBackup: AGORA - 30 * H, copia: null }, AGORA)[0]!;
    expect(paraOperador(backup)).toEqual({
      ...backup,
      titulo: 'Problema no backup',
      detalhe: 'Avise o responsável pelo sistema.',
      acao: null,
    });
  });

  it('amarelos e azuis ficam iguais', () => {
    const a = aviso({ chave: 'sem-pdv', gravidade: 'azul', detalhe: 'x', acao: { rotulo: 'Ver', href: '#p' } });
    expect(paraOperador(a)).toBe(a);
    const b = aviso({ chave: 'r', gravidade: 'amarelo' });
    expect(paraOperador(b)).toBe(b);
  });
});

describe('proximaRevisao (RN74, C144)', () => {
  it('a revisão que vence primeiro, com a data e quanto falta', () => {
    expect(
      proximaRevisao([lembrete('cardapio', '2026-11-27', 7), lembrete('horario', '2026-11-26', 15), lembrete('precos', '2026-11-03')]),
    ).toBe('Próxima revisão: preços em 03/12 (vence em 6 dias).');
  });

  it('sem lembretes, nada', () => {
    expect(proximaRevisao([])).toBeNull();
  });
});
