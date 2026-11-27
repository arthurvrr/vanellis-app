// Central de avisos do painel (RF66–RF68, RN71–RN75; cenários C136–C141). Junta os dados do
// sistema (backup, cópia externa, status, lembretes, cardápios especiais), monta os avisos com as
// regras do shared (montarAvisos) e mantém o histórico: os problemas de sistema abrem e fecham
// registros sozinhos, e o admin marca Ciente nos vermelhos.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  instanteBrasilia,
  montarAvisos,
  nowInBrasilia,
  paraOperador,
  proximaRevisao,
  specialMenuWarnings,
  type AvisoDTO,
  type EstadoBackup,
  type EstadoCopia,
} from '@vanellis/shared';
import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import type { DB } from '../../db/client';
import { requireUser, type SessionUser } from '../acesso/sessao';
import { specialMenus } from '../catalogo/repository';
import { category } from '../catalogo/schema';
import { listReminders } from '../configuracoes/routes';
import { readStatus } from '../painel/routes';
import { avisoEvento } from './schema';

const DIA = 24 * 3_600_000;
/** O histórico guarda 1 ano (RN75). */
const DIAS_HISTORICO = 365;
/** De quanto em quanto tempo os problemas de sistema são conferidos sem ninguém abrir o painel. */
const INTERVALO_MS = 10 * 60_000;
const BACKUP = /^vanellis-.*\.sql\.gz$/;

export interface EventoDTO {
  id: number;
  tipo: string;
  gravidade: string;
  titulo: string;
  /** Instantes em ms. */
  inicio: number;
  fim: number | null;
  conta: string | null;
  contaFim: string | null;
  cientePor: string | null;
  cienteEm: number | null;
  /** Vermelho ainda sem Ciente: conta no sino (RN72). */
  pedeCiente: boolean;
}

export interface AvisosDTO {
  agora: (AvisoDTO & { eventoId: number | null })[];
  historico: EventoDTO[];
  sino: { total: number; vermelho: boolean };
  proximaRevisao: string | null;
  podeMarcarCiente: boolean;
}

/**
 * Lê a pasta de backups: o backup conferido mais recente e o estado da cópia externa.
 * Sem pasta configurada (desenvolvimento e testes), o backup não é monitorado.
 */
export async function lerEstadoBackup(pasta: string | null | undefined): Promise<EstadoBackup | null> {
  if (!pasta) return null;
  let ultimoBackup: number | null = null;
  for (const nome of await readdir(pasta).catch(() => [] as string[])) {
    if (!BACKUP.test(nome)) continue;
    const t = (await stat(join(pasta, nome))).mtimeMs;
    if (ultimoBackup === null || t > ultimoBackup) ultimoBackup = t;
  }
  return { ultimoBackup, copia: await lerCopia(pasta) };
}

/** Estado gravado pelo deploy/copia-externa.sh; ausente, ilegível ou desligada = `null`. */
async function lerCopia(pasta: string): Promise<EstadoCopia | null> {
  try {
    const e = JSON.parse(await readFile(join(pasta, '.copia-externa.json'), 'utf8')) as Record<string, unknown>;
    if (e.ligada !== true) return null;
    const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);
    return {
      ultimaOk: ms(e.ultimaOk),
      ultimaTentativa: ms(e.ultimaTentativa),
      falhaDesde: ms(e.falhaDesde),
      erro: typeof e.erro === 'string' ? e.erro : null,
    };
  } catch {
    return null;
  }
}

/** Os avisos ativos agora (sem o recorte do operador). */
async function avisosAtivos(db: DB, backupDir: string | null | undefined, agora: string): Promise<AvisoDTO[]> {
  const status = await readStatus(db);
  const especiais = await specialMenus(db, agora);
  const cats = await db.select({ id: category.id, name: category.name }).from(category).where(eq(category.special, true));
  return montarAvisos(
    {
      backup: await lerEstadoBackup(backupDir),
      pdvMissing: status.pdvMissing,
      ordersPaused: status.ordersPaused,
      pricesHidden: status.pricesHidden,
      lembretes: await listReminders(db, agora.slice(0, 10)),
      cardapios: cats.map((c) => {
        const sp = especiais.get(c.id);
        return { id: c.id, name: c.name, warnings: sp ? specialMenuWarnings(sp.menu, sp.pickups) : [] };
      }),
    },
    instanteBrasilia(agora),
  );
}

/**
 * Os problemas de sistema (vermelhos) abrem e fecham registros sozinhos: um novo abre com a data
 * em que começou; um registro aberto cujo problema acabou é fechado agora (RF68, C139).
 */
async function sincronizar(db: DB, vermelhos: AvisoDTO[], agora: Date): Promise<void> {
  const abertos = await db
    .select({ id: avisoEvento.id, chave: avisoEvento.chave })
    .from(avisoEvento)
    .where(and(eq(avisoEvento.gravidade, 'vermelho'), isNull(avisoEvento.fim)));
  for (const a of vermelhos) {
    if (abertos.some((e) => e.chave === a.chave)) continue;
    await db
      .insert(avisoEvento)
      .values({
        tipo: a.tipo,
        chave: a.chave,
        gravidade: a.gravidade,
        titulo: a.titulo,
        inicio: new Date(a.desde ?? agora.getTime()),
      })
      .onConflictDoNothing();
  }
  for (const e of abertos) {
    if (!vermelhos.some((a) => a.chave === e.chave)) {
      await db.update(avisoEvento).set({ fim: agora }).where(eq(avisoEvento.id, e.id));
    }
  }
}

/** O que a tela Avisos recebe; o operador vê os vermelhos com o texto simples (RN73). */
async function montarResposta(db: DB, backupDir: string | null | undefined, agora: string, user: SessionUser): Promise<AvisosDTO> {
  const instante = new Date(instanteBrasilia(agora));
  const ativos = await avisosAtivos(db, backupDir, agora);
  await sincronizar(
    db,
    ativos.filter((a) => a.gravidade === 'vermelho'),
    instante,
  );

  const rows = await db
    .select()
    .from(avisoEvento)
    .where(or(isNull(avisoEvento.fim), gte(avisoEvento.fim, new Date(instante.getTime() - DIAS_HISTORICO * DIA))))
    .orderBy(desc(avisoEvento.inicio), desc(avisoEvento.id))
    .limit(200);
  const operador = user.role !== 'admin';
  const historico: EventoDTO[] = rows.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    gravidade: e.gravidade,
    titulo: operador && e.gravidade === 'vermelho' ? 'Problema no backup' : e.titulo,
    inicio: e.inicio.getTime(),
    fim: e.fim?.getTime() ?? null,
    conta: e.conta,
    contaFim: e.contaFim,
    cientePor: e.cientePor,
    cienteEm: e.cienteEm?.getTime() ?? null,
    pedeCiente: e.gravidade === 'vermelho' && e.cientePor === null,
  }));

  const abertoDe = new Map(rows.filter((e) => e.fim === null).map((e) => [e.chave, e.id]));
  const agoraLista = ativos.map((a) => ({ ...(operador ? paraOperador(a) : a), eventoId: abertoDe.get(a.chave) ?? null }));
  const resolvidosSemCiente = historico.filter((e) => e.pedeCiente && e.fim !== null).length;
  const lembretes = await listReminders(db, agora.slice(0, 10));
  return {
    agora: agoraLista,
    historico,
    sino: {
      total: agoraLista.length + resolvidosSemCiente,
      vermelho: resolvidosSemCiente > 0 || ativos.some((a) => a.gravidade === 'vermelho'),
    },
    proximaRevisao: proximaRevisao(lembretes),
    podeMarcarCiente: !operador,
  };
}

/** Apaga os registros encerrados há mais de 1 ano (RN75); devolve quantos. */
export async function limparHistorico(db: DB, agora: Date): Promise<number> {
  const apagados = await db
    .delete(avisoEvento)
    .where(and(isNotNull(avisoEvento.fim), lt(avisoEvento.fim, new Date(agora.getTime() - DIAS_HISTORICO * DIA))))
    .returning({ id: avisoEvento.id });
  return apagados.length;
}

interface OpcoesAgenda {
  backupDir: string | null | undefined;
  agora?: () => Date;
  registrar?: (mensagem: string) => void;
}

/**
 * Confere os problemas de sistema ao subir e a cada 10 minutos, para o histórico registrar uma
 * falha de madrugada mesmo que ninguém abra o painel (RN72). Uma falha só vai para o log.
 */
export function agendarAvisos(db: DB, { backupDir, agora = () => new Date(), registrar = console.log }: OpcoesAgenda) {
  const rodar = async () => {
    try {
      const instante = agora();
      const ativos = await avisosAtivos(db, backupDir, nowInBrasilia(instante));
      await sincronizar(
        db,
        ativos.filter((a) => a.gravidade === 'vermelho'),
        instante,
      );
    } catch (e) {
      registrar(`Avisos: falha ao atualizar o histórico: ${(e as Error).message}`);
    }
  };
  const timer = setInterval(() => void rodar(), INTERVALO_MS);
  timer.unref();
  return { primeira: rodar(), parar: () => clearInterval(timer) };
}

/** GET a tela Avisos; POST Ciente (só o admin). */
export function avisosPainelRouter(db: DB, now: () => string, backupDir: string | null | undefined) {
  const router = Router();
  router.use(requireUser(db));

  router.get('/', async (_req, res) => {
    res.json(await montarResposta(db, backupDir, now(), res.locals.user as SessionUser));
  });

  router.post('/:id/ciente', requireUser(db, 'admin'), async (req, res) => {
    const id = Number(req.params.id);
    const user = res.locals.user as SessionUser;
    const instante = new Date(instanteBrasilia(now()));
    const marcados = Number.isInteger(id)
      ? await db
          .update(avisoEvento)
          // Marcar de novo mantém quem viu primeiro.
          .set({
            cientePor: sql`coalesce(${avisoEvento.cientePor}, ${user.username})`,
            cienteEm: sql`coalesce(${avisoEvento.cienteEm}, ${instante})`,
          })
          .where(and(eq(avisoEvento.id, id), eq(avisoEvento.gravidade, 'vermelho')))
          .returning({ id: avisoEvento.id })
      : [];
    if (!marcados.length) {
      res.status(404).json({ error: 'Aviso não encontrado' });
      return;
    }
    res.json(await montarResposta(db, backupDir, now(), user));
  });

  return router;
}
