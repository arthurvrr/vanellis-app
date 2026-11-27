// Registro das ações da loja no histórico de avisos (RF68, C141). Fica separado do resto do
// módulo para as rotas de status e de lembretes gravarem a ação na mesma transação da mudança.

import { and, eq, isNull } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { avisoEvento } from './schema';

/**
 * Uma situação que liga e desliga (pedidos pausados, preços ocultos): ligar abre o registro,
 * desligar fecha o que estiver aberto. Ligar o que já está ligado não abre outro.
 */
export async function registrarSituacao(
  tx: DB,
  s: { chave: 'pedidos-pausados' | 'precos-ocultos'; titulo: string; ligado: boolean; conta: string; agora: Date },
): Promise<void> {
  if (s.ligado) {
    await tx
      .insert(avisoEvento)
      .values({ tipo: s.chave, chave: s.chave, gravidade: 'azul', titulo: s.titulo, inicio: s.agora, conta: s.conta })
      .onConflictDoNothing();
  } else {
    await tx
      .update(avisoEvento)
      .set({ fim: s.agora, contaFim: s.conta })
      .where(and(eq(avisoEvento.chave, s.chave), isNull(avisoEvento.fim)));
  }
}

/** Uma ação de um instante só (revisão marcada): começa e termina na mesma hora. */
export async function registrarAcao(
  tx: DB,
  a: { tipo: string; chave: string; titulo: string; conta: string; agora: Date },
): Promise<void> {
  await tx
    .insert(avisoEvento)
    .values({ tipo: a.tipo, chave: a.chave, gravidade: 'azul', titulo: a.titulo, inicio: a.agora, fim: a.agora, conta: a.conta });
}
