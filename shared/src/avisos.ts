// Central de avisos do painel (RF66–RF68, RN71–RN75; cenários C136–C145): quais avisos existem
// agora, com que gravidade e em que ordem, e o texto simples que o operador vê nos de sistema.
// O servidor junta os dados (backup, status, lembretes, cardápios) e chama montarAvisos.

import { overdueText, REMINDERS, type ReminderWithStatus } from './lembretes';
import { nowInBrasilia } from './agenda';
import { shortDate } from './datas';

export type Gravidade = 'vermelho' | 'amarelo' | 'azul';
export type TipoAviso =
  | 'backup-atrasado'
  | 'copia-externa'
  | 'revisao-vencida'
  | 'cardapio-especial'
  | 'sem-pdv'
  | 'pedidos-pausados'
  | 'precos-ocultos';

export interface AcaoAviso {
  rotulo: string;
  href: string;
}

export interface AvisoDTO {
  /** Única entre os avisos ativos: o tipo, ou tipo:id quando há um por item. */
  chave: string;
  tipo: TipoAviso;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string | null;
  /** Desde quando vale (ms), para a ordem e o histórico; `null` = sem data conhecida. */
  desde: number | null;
  /** Atalho para resolver. */
  acao: AcaoAviso | null;
}

/** Um registro do histórico de avisos (RF68). */
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

/** Sem backup bom (ou sem cópia boa no Drive) há mais que isso, o painel avisa (RF67). */
export const HORAS_SEM_BACKUP = 26;
const HORA = 3_600_000;
const PRAZO = HORAS_SEM_BACKUP * HORA;

/** Estado da cópia externa, gravado pelo deploy/copia-externa.sh. Instantes em ms. */
export interface EstadoCopia {
  ultimaOk: number | null;
  ultimaTentativa: number | null;
  /** Primeira falha depois da última cópia boa. */
  falhaDesde: number | null;
  /** Erro da última tentativa; `null` = deu certo. */
  erro: string | null;
}

export interface EstadoBackup {
  /** Data do backup conferido mais recente (ms); `null` = nenhum. */
  ultimoBackup: number | null;
  /** `null` = cópia externa desligada. */
  copia: EstadoCopia | null;
}

export interface EntradaAvisos {
  /** `null` = backup não monitorado (desenvolvimento e testes). */
  backup: EstadoBackup | null;
  pdvMissing: number;
  ordersPaused: boolean;
  pricesHidden: boolean;
  lembretes: ReminderWithStatus[];
  cardapios: { id: number; name: string; warnings: string[] }[];
}

/** Instante de um horário de Brasília 'AAAA-MM-DDTHH:MM' (UTC-3, sem horário de verão desde 2019). */
export const instanteBrasilia = (horario: string) => Date.parse(`${horario}:00-03:00`);

/** 'DD/MM HH:MM' em Brasília. */
export function dataHora(ms: number): string {
  const s = nowInBrasilia(new Date(ms));
  return `${shortDate(s)} ${s.slice(11, 16)}`;
}

/** Avisos de backup e da cópia externa (RF67). */
export function avisosDeBackup(b: EstadoBackup, agora: number): AvisoDTO[] {
  const out: AvisoDTO[] = [];
  const sistema = (chave: 'backup-atrasado' | 'copia-externa', titulo: string, detalhe: string, desde: number | null) =>
    out.push({ chave, tipo: chave, gravidade: 'vermelho', titulo, detalhe, desde, acao: null });

  if (b.ultimoBackup === null) {
    sistema('backup-atrasado', 'Backup do banco atrasado', 'Nenhum backup encontrado no servidor.', null);
  } else if (agora - b.ultimoBackup > PRAZO) {
    sistema(
      'backup-atrasado',
      'Backup do banco atrasado',
      `Último backup bom: ${dataHora(b.ultimoBackup)}.`,
      b.ultimoBackup + PRAZO,
    );
  }

  const c = b.copia;
  if (c) {
    const ultima = c.ultimaOk === null ? 'Nenhuma cópia boa ainda.' : `Última cópia boa: ${dataHora(c.ultimaOk)}.`;
    const titulo = 'Cópia do backup no Drive falhando';
    if (c.erro !== null) {
      sistema('copia-externa', titulo, `${ultima} Erro: ${c.erro}`, c.falhaDesde ?? c.ultimaTentativa);
    } else if (c.ultimaOk === null) {
      sistema('copia-externa', titulo, ultima, null);
    } else if (agora - c.ultimaOk > PRAZO) {
      sistema(
        'copia-externa',
        titulo,
        `Nenhuma cópia nas últimas ${HORAS_SEM_BACKUP} horas. ${ultima}`,
        c.ultimaOk + PRAZO,
      );
    }
  }
  return out;
}

const ORDEM: Record<Gravidade, number> = { vermelho: 0, amarelo: 1, azul: 2 };

/** Vermelho, amarelo, azul; dentro da cor, o mais antigo primeiro, os sem data no fim (RN71). */
export function ordenarAvisos(avisos: AvisoDTO[]): AvisoDTO[] {
  return [...avisos].sort(
    (a, b) =>
      ORDEM[a.gravidade] - ORDEM[b.gravidade] ||
      (a.desde ?? Infinity) - (b.desde ?? Infinity) ||
      a.chave.localeCompare(b.chave),
  );
}

/** Todos os avisos ativos, na ordem da tela (RF66, RN71). */
export function montarAvisos(e: EntradaAvisos, agora: number): AvisoDTO[] {
  const out: AvisoDTO[] = e.backup ? avisosDeBackup(e.backup, agora) : [];

  for (const l of e.lembretes) {
    if (!l.status.due) continue;
    const r = REMINDERS.find((x) => x.kind === l.kind)!;
    out.push({
      chave: `revisao-vencida:${l.kind}`,
      tipo: 'revisao-vencida',
      gravidade: 'amarelo',
      titulo: `Revisão de ${r.label.toLowerCase()} ${overdueText(l.status)}`,
      detalhe: r.help,
      desde: instanteBrasilia(`${l.status.dueDate}T00:00`),
      acao: { rotulo: `Abrir ${r.screen.toLowerCase()}`, href: r.href },
    });
  }

  for (const c of e.cardapios) {
    if (!c.warnings.length) continue;
    out.push({
      chave: `cardapio-especial:${c.id}`,
      tipo: 'cardapio-especial',
      gravidade: 'amarelo',
      titulo: `Cardápio ${c.name}`,
      detalhe: c.warnings.join(' '),
      desde: null,
      acao: { rotulo: 'Abrir cardápios', href: '#categorias' },
    });
  }

  const info = (tipo: 'sem-pdv' | 'pedidos-pausados' | 'precos-ocultos', titulo: string, detalhe: string, acao: AcaoAviso) =>
    out.push({ chave: tipo, tipo, gravidade: 'azul', titulo, detalhe, desde: null, acao });
  if (e.pdvMissing > 0) {
    info(
      'sem-pdv',
      `${e.pdvMissing} ${e.pdvMissing === 1 ? 'produto' : 'produtos'} sem código PDV`,
      'Eles continuam no cardápio, mas a mensagem do pedido vai sem o código.',
      { rotulo: 'Ver produtos', href: '#produtos-sem-pdv' },
    );
  }
  if (e.ordersPaused) {
    info('pedidos-pausados', 'Pedidos pausados', 'O site não está aceitando novos pedidos.', {
      rotulo: 'Retomar pedidos',
      href: '#inicio',
    });
  }
  if (e.pricesHidden) {
    info('precos-ocultos', 'Preços ocultos', 'O cardápio do site está sem valores.', {
      rotulo: 'Mostrar preços',
      href: '#inicio',
    });
  }
  return ordenarAvisos(out);
}

/** O operador não resolve problema de sistema: vê o texto simples, sem detalhe nem atalho (RN73). */
export function paraOperador(a: AvisoDTO): AvisoDTO {
  if (a.gravidade !== 'vermelho') return a;
  return { ...a, titulo: 'Problema no backup', detalhe: 'Avise o responsável pelo sistema.', acao: null };
}

/** "Próxima revisão: preços em 05/12 (vence em 8 dias).", para quando está tudo certo (RN74). */
export function proximaRevisao(lembretes: ReminderWithStatus[]): string | null {
  const [p] = [...lembretes].sort((a, b) => a.status.dueDate.localeCompare(b.status.dueDate));
  if (!p) return null;
  const r = REMINDERS.find((x) => x.kind === p.kind)!;
  return `Próxima revisão: ${r.label.toLowerCase()} em ${shortDate(p.status.dueDate)} (${overdueText(p.status)}).`;
}
