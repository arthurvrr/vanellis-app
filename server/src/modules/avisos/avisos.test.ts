// Central de avisos (RF66–RF68, RN71–RN75; cenários C136–C141): avisos de backup lidos da pasta
// de backups, histórico de problemas e de ações na loja, Ciente do admin e a visão do operador.

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { instanteBrasilia } from '@vanellis/shared';
import type { DB } from '../../db/client';
import { startTestApp } from '../../test/app';
import { agendaConfig } from '../agenda/schema';
import { reviewReminder, storeSettings } from '../configuracoes/schema';
import { agendarAvisos, lerEstadoBackup, limparHistorico } from './avisos';
import { avisoEvento } from './schema';

const H = 3_600_000;
let agora = '2026-11-27T10:00';
const AGORA = () => instanteBrasilia(agora);
let pasta: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let admin: ReturnType<typeof app.browser>;
let op: ReturnType<typeof app.browser>;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'vanellis-avisos-'));
  app = await startTestApp({ now: () => agora, backupDir: pasta });
  admin = app.browser();
  op = app.browser();
  await admin('POST', '/api/auth/login', { usuario: 'arthur', senha: 'senha-admin' });
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(async () => {
  await app.stop();
  await rm(pasta, { recursive: true, force: true });
});
beforeEach(async () => {
  agora = '2026-11-27T10:00';
  await rm(pasta, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });
  await app.db.delete(avisoEvento);
  // Lembretes em dia, para não entrarem nos avisos destes cenários.
  await app.db.delete(reviewReminder);
  for (const kind of ['cardapio', 'horario', 'precos'] as const)
    await app.db.insert(reviewReminder).values({ kind, everyDays: 30, lastReviewed: '2026-11-26' });
  await app.db.update(agendaConfig).set({ ordersPaused: false });
  await app.db.update(storeSettings).set({ pricesHidden: false });
});

/** Um backup conferido feito `horas` antes de agora. */
async function backup(horas: number, nome = 'vanellis-2026-11-26_0300.sql.gz') {
  const f = join(pasta, nome);
  await writeFile(f, 'x');
  const t = new Date(AGORA() - horas * H);
  await utimes(f, t, t);
}
/** O estado que a cópia externa grava (instantes como ISO, em UTC). */
async function copia(e: Record<string, unknown>) {
  await writeFile(join(pasta, '.copia-externa.json'), JSON.stringify(e));
}
const iso = (horas: number) => new Date(AGORA() - horas * H).toISOString();
const avisos = async (quem = admin) => (await quem('GET', '/api/painel/avisos')).body;
const chaves = (body: { agora: { chave: string }[] }) => body.agora.map((a) => a.chave);

describe('avisos de backup (RF67)', () => {
  it('C136: backup com mais de 26 horas → vermelho com a data do último, sino 1 vermelho, início no histórico', async () => {
    await backup(27);
    const b = await avisos();
    expect(b.agora).toEqual([
      expect.objectContaining({
        chave: 'backup-atrasado',
        gravidade: 'vermelho',
        titulo: 'Backup do banco atrasado',
        detalhe: 'Último backup bom: 26/11 07:00.',
        eventoId: expect.any(Number),
      }),
    ]);
    expect(b.sino).toEqual({ total: 1, vermelho: true });
    expect(b.historico).toEqual([
      expect.objectContaining({
        id: b.agora[0].eventoId,
        titulo: 'Backup do banco atrasado',
        gravidade: 'vermelho',
        inicio: AGORA() - H,
        fim: null,
        pedeCiente: true,
      }),
    ]);
    // Abrir de novo não duplica o registro.
    expect((await avisos()).historico).toHaveLength(1);
  });

  it('C137: backup em dia, cópia desligada → nenhum aviso de backup; o .tmp e outros arquivos não contam', async () => {
    await backup(20);
    await backup(1, 'vanellis-2026-11-27_0300.sql.gz.tmp');
    await backup(1, 'antes-de-publicar-2026-11-27.sql.gz');
    await copia({ ligada: false });
    const b = await avisos();
    expect(b.agora).toEqual([]);
    expect(b.sino).toEqual({ total: 0, vermelho: false });
  });

  it('pasta sem backup nenhum → vermelho "nenhum backup encontrado"', async () => {
    expect((await avisos()).agora[0]).toMatchObject({
      chave: 'backup-atrasado',
      detalhe: 'Nenhum backup encontrado no servidor.',
    });
  });

  it('C138: cópia no Drive falhando → vermelho com o erro e a última cópia boa', async () => {
    await backup(2);
    await copia({ ligada: true, ultimaOk: iso(3), ultimaTentativa: iso(1), falhaDesde: iso(2), erro: 'não foi possível enviar' });
    expect((await avisos()).agora).toEqual([
      expect.objectContaining({
        chave: 'copia-externa',
        titulo: 'Cópia do backup no Drive falhando',
        detalhe: 'Última cópia boa: 27/11 07:00. Erro: não foi possível enviar',
      }),
    ]);
  });

  it('estado da cópia ilegível conta como cópia desligada (não inventa aviso)', async () => {
    await backup(2);
    await writeFile(join(pasta, '.copia-externa.json'), '{pela metade');
    expect((await avisos()).agora).toEqual([]);
  });

  it('cópia ligada sem cópia boa há mais de 26 horas → vermelho', async () => {
    await backup(2);
    await copia({ ligada: true, ultimaOk: iso(30), ultimaTentativa: iso(30), falhaDesde: null, erro: null });
    expect(chaves(await avisos())).toEqual(['copia-externa']);
  });

  it('C139: resolvido sozinho sai de Agora, fica no histórico com início e fim e conta no sino até o Ciente', async () => {
    await backup(27);
    const { agora: [atrasado] } = await avisos();
    agora = '2026-11-27T11:00';
    await backup(0, 'vanellis-2026-11-27_1100.sql.gz');
    let b = await avisos();
    expect(b.agora).toEqual([]);
    expect(b.historico[0]).toMatchObject({ id: atrasado.eventoId, fim: AGORA(), pedeCiente: true, cientePor: null });
    expect(b.sino).toEqual({ total: 1, vermelho: true });

    const r = await admin('POST', `/api/painel/avisos/${atrasado.eventoId}/ciente`, {});
    expect(r.status).toBe(200);
    b = r.body;
    expect(b.sino).toEqual({ total: 0, vermelho: false });
    expect(b.historico[0]).toMatchObject({ cientePor: 'arthur', cienteEm: AGORA(), pedeCiente: false });
  });

  it('Ciente num aviso ainda ativo registra quem viu, e ele continua em Agora enquanto durar', async () => {
    await backup(27);
    const { agora: [atrasado] } = await avisos();
    const b = (await admin('POST', `/api/painel/avisos/${atrasado.eventoId}/ciente`, {})).body;
    expect(chaves(b)).toEqual(['backup-atrasado']);
    expect(b.sino).toEqual({ total: 1, vermelho: true });
    expect(b.historico[0]).toMatchObject({ cientePor: 'arthur', pedeCiente: false });
  });

  it('Ciente de um registro que não existe, ou que não é vermelho, ou com id inválido → 404', async () => {
    expect((await admin('POST', '/api/painel/avisos/999999/ciente', {})).status).toBe(404);
    expect((await admin('POST', '/api/painel/avisos/abc/ciente', {})).status).toBe(404);
    await op('PUT', '/api/painel/status', { ordersPaused: true });
    const pausa = (await avisos()).historico.find((e: { tipo: string }) => e.tipo === 'pedidos-pausados');
    expect((await admin('POST', `/api/painel/avisos/${pausa.id}/ciente`, {})).status).toBe(404);
  });
});

describe('visão do operador (RN73, C140)', () => {
  it('C140: vê o texto simples, sem detalhe; o Ciente pela API é recusado', async () => {
    await backup(27);
    const b = await avisos(op);
    expect(b.agora).toEqual([
      expect.objectContaining({
        chave: 'backup-atrasado',
        titulo: 'Problema no backup',
        detalhe: 'Avise o responsável pelo sistema.',
        acao: null,
      }),
    ]);
    expect(b.historico[0].titulo).toBe('Problema no backup');
    expect(b.podeMarcarCiente).toBe(false);
    expect((await avisos()).podeMarcarCiente).toBe(true);
    expect((await op('POST', `/api/painel/avisos/${b.agora[0].eventoId}/ciente`, {})).status).toBe(403);
  });
});

describe('ações da loja no histórico (RF68, C141)', () => {
  beforeEach(() => backup(1));

  it('C141: pausar às 14h10 e retomar às 17h30 vira um registro com as duas horas e as contas', async () => {
    agora = '2026-11-27T14:10';
    await op('PUT', '/api/painel/status', { ordersPaused: true });
    expect(chaves(await avisos())).toEqual(['pedidos-pausados']);
    agora = '2026-11-27T17:30';
    await admin('PUT', '/api/painel/status', { ordersPaused: false });
    const b = await avisos();
    expect(b.agora).toEqual([]);
    expect(b.historico).toEqual([
      expect.objectContaining({
        tipo: 'pedidos-pausados',
        titulo: 'Pedidos pausados',
        gravidade: 'azul',
        inicio: instanteBrasilia('2026-11-27T14:10'),
        fim: instanteBrasilia('2026-11-27T17:30'),
        conta: 'padaria',
        contaFim: 'arthur',
        pedeCiente: false,
      }),
    ]);
  });

  it('pedir o mesmo estado de novo não abre outro registro; preços ocultos têm o seu', async () => {
    await op('PUT', '/api/painel/status', { ordersPaused: true, pricesHidden: true });
    await op('PUT', '/api/painel/status', { ordersPaused: true });
    await op('PUT', '/api/painel/status', { pricesHidden: false });
    const h = (await avisos()).historico;
    expect(h.map((e: { tipo: string; fim: number | null }) => [e.tipo, e.fim === null])).toEqual(
      expect.arrayContaining([
        ['pedidos-pausados', true],
        ['precos-ocultos', false],
      ]),
    );
    expect(h).toHaveLength(2);
  });

  it('marcar uma revisão registra quem e quando, como um ponto no histórico', async () => {
    await op('POST', '/api/painel/configuracoes/lembretes/precos/revisado', {});
    expect((await avisos()).historico).toEqual([
      expect.objectContaining({
        tipo: 'revisao-marcada',
        titulo: 'Revisão de preços marcada',
        inicio: AGORA(),
        fim: AGORA(),
        conta: 'padaria',
      }),
    ]);
  });

  it('o histórico vem do mais novo para o mais velho', async () => {
    agora = '2026-11-27T08:00';
    await op('POST', '/api/painel/configuracoes/lembretes/precos/revisado', {});
    agora = '2026-11-27T09:00';
    await op('POST', '/api/painel/configuracoes/lembretes/horario/revisado', {});
    expect((await avisos()).historico.map((e: { titulo: string }) => e.titulo)).toEqual([
      'Revisão de horário de funcionamento marcada',
      'Revisão de preços marcada',
    ]);
  });

  it('registros encerrados há mais de 1 ano saem na limpeza; os abertos e os recentes ficam (RN75)', async () => {
    const dia = 24 * H;
    const t = (ms: number) => new Date(ms);
    await app.db.insert(avisoEvento).values([
      { tipo: 'revisao-marcada', chave: 'r1', gravidade: 'azul', titulo: 'velho', inicio: t(AGORA() - 400 * dia), fim: t(AGORA() - 366 * dia) },
      { tipo: 'revisao-marcada', chave: 'r2', gravidade: 'azul', titulo: 'recente', inicio: t(AGORA() - 300 * dia), fim: t(AGORA() - 364 * dia + dia) },
      { tipo: 'pedidos-pausados', chave: 'pedidos-pausados', gravidade: 'azul', titulo: 'aberto', inicio: t(AGORA() - 400 * dia) },
    ]);
    expect(await limparHistorico(app.db as unknown as DB, new Date(AGORA()))).toBe(1);
    const titulos = (await app.db.select().from(avisoEvento)).map((e) => e.titulo).sort();
    expect(titulos).toEqual(['aberto', 'recente']);
  });
});

describe('Tudo certo e próxima revisão (RN74)', () => {
  it('sem avisos: sino zerado e a próxima revisão', async () => {
    await backup(1);
    const b = await avisos();
    expect(b.agora).toEqual([]);
    expect(b.proximaRevisao).toBe('Próxima revisão: produtos do cardápio em 26/12 (vence em 29 dias).');
  });

  it('sem pasta de backups configurada (desenvolvimento), o backup não é monitorado', async () => {
    expect(await lerEstadoBackup(undefined)).toBeNull();
    expect(await lerEstadoBackup(null)).toBeNull();
    expect(await lerEstadoBackup('')).toBeNull();
  });

  it('pasta configurada mas ausente: nenhum backup encontrado (avisa)', async () => {
    expect(await lerEstadoBackup(join(pasta, 'nao-existe'))).toEqual({ ultimoBackup: null, copia: null });
  });

  it('exige login', async () => {
    expect((await app.browser()('GET', '/api/painel/avisos')).status).toBe(401);
  });
});

describe('agenda dos avisos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registra o problema no histórico mesmo sem ninguém abrir o painel, e repete a cada 10 minutos', async () => {
    await backup(27);
    const repetir = vi.spyOn(globalThis, 'setInterval');
    const registrar = vi.fn();
    const agenda = agendarAvisos(app.db as unknown as DB, { backupDir: pasta, agora: () => new Date(AGORA()), registrar });
    try {
      await agenda.primeira;
      expect((await app.db.select().from(avisoEvento)).map((e) => e.chave)).toEqual(['backup-atrasado']);
      expect(repetir).toHaveBeenCalledWith(expect.any(Function), 10 * 60_000);
      expect(registrar).not.toHaveBeenCalled();
    } finally {
      agenda.parar();
    }
  });

  it('uma falha só vai para o log', async () => {
    const registrar = vi.fn();
    const quebrado = {
      select: () => {
        throw new Error('banco fora do ar');
      },
    } as unknown as DB;
    const agenda = agendarAvisos(quebrado, { backupDir: pasta, agora: () => new Date(AGORA()), registrar });
    await agenda.primeira;
    expect(registrar).toHaveBeenCalledWith('Avisos: falha ao atualizar o histórico: banco fora do ar');
    agenda.parar();
  });

  it('a falha no log traz a causa, não só a consulta', async () => {
    const registrar = vi.fn();
    const quebrado = {
      select: () => {
        throw new Error('Failed query: select "id" from "aviso_evento"\nparams: vermelho', {
          cause: new Error('relação "aviso_evento" não existe'),
        });
      },
    } as unknown as DB;
    const agenda = agendarAvisos(quebrado, { backupDir: pasta, agora: () => new Date(AGORA()), registrar });
    await agenda.primeira;
    agenda.parar();
    expect(registrar).toHaveBeenCalledWith(
      'Avisos: falha ao atualizar o histórico: relação "aviso_evento" não existe (Failed query: select "id" from "aviso_evento")',
    );
  });
});
