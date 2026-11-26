import type { DB } from './client';

/**
 * Roda `fn` numa transação (G10): grava tudo ou nada. O `tx` tem a mesma API do `db`, então as
 * funções que recebem `db` também servem dentro da transação.
 */
export function inTransaction<T>(db: DB, fn: (tx: DB) => Promise<T>): Promise<T> {
  return db.transaction((t) => fn(t as unknown as DB));
}
