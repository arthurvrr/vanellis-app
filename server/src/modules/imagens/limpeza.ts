// Limpeza das fotos sem uso (B02). Uma foto enviada pelo painel e nunca salva (o operador desistiu,
// ou a gravação falhou como no B01) não é apagada por deleteStoredImage, que só age ao trocar ou
// excluir. Uma vez por dia, saem as fotos que nenhum produto, opção ou capa de cardápio usa e que
// foram enviadas há mais de um dia: a folga protege a foto de quem ainda está editando.

import { and, eq, lt, notExists, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { DB } from '../../db/client';
import { category, option, product } from '../catalogo/schema';
import { limparHistorico } from '../avisos/avisos';
import { URL_PREFIX } from './imagens';
import { storedImage } from './schema';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Apaga as fotos sem uso enviadas antes de `agora` menos um dia; devolve quantas apagou. */
export async function limparFotosOrfas(db: DB, agora: Date): Promise<number> {
  // A URL guardada no cadastro é /api/imagens/<id> (imageUrl).
  const urlDaFoto: SQL = sql`${URL_PREFIX}::text || ${storedImage.id}::text`;
  const ninguemUsa = (coluna: PgColumn, tabela: typeof product | typeof option | typeof category) =>
    notExists(db.select({ um: sql`1` }).from(tabela).where(eq(coluna, urlDaFoto)));
  const apagadas = await db
    .delete(storedImage)
    .where(
      and(
        lt(storedImage.createdAt, new Date(agora.getTime() - DIA_MS)),
        ninguemUsa(product.imageUrl, product),
        ninguemUsa(option.imageUrl, option),
        ninguemUsa(category.coverImageUrl, category),
      ),
    )
    .returning({ id: storedImage.id });
  return apagadas.length;
}

interface OpcoesAgenda {
  agora?: () => Date;
  registrar?: (mensagem: string) => void;
}

/**
 * Roda a limpeza (fotos sem uso e histórico de avisos antigo) ao subir o servidor e depois uma
 * vez por dia. Uma falha só fica registrada no
 * log: não derruba o servidor e a próxima rodada tenta de novo.
 */
export function agendarLimpeza(db: DB, { agora = () => new Date(), registrar = console.log }: OpcoesAgenda = {}) {
  const rodar = async () => {
    try {
      const n = await limparFotosOrfas(db, agora());
      if (n) registrar(`Limpeza de fotos sem uso: ${n} apagada(s).`);
      // O histórico de avisos guarda 1 ano (RN75): sai na mesma rodada diária.
      const h = await limparHistorico(db, agora());
      if (h) registrar(`Histórico de avisos: ${h} registro(s) com mais de 1 ano apagado(s).`);
      return n;
    } catch (e) {
      registrar(`Limpeza de fotos sem uso falhou: ${(e as Error).message}`);
      return 0;
    }
  };
  const timer = setInterval(() => void rodar(), DIA_MS);
  // Não segura o processo aberto só por causa da limpeza.
  timer.unref();
  return { primeira: rodar(), parar: () => clearInterval(timer) };
}
