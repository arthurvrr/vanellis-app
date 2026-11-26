// Produtos para os testes do servidor: grava o produto e o vínculo com o cardápio (product_category,
// a única ligação entre os dois desde a migração 0020).

import type { DB } from '../db/client';
import { product, productCategory } from '../db/schema';

type NovoProduto = typeof product.$inferInsert & {
  /** Cardápio do produto; ausente ou null = sem cardápio. */
  categoryId?: number | null;
  /** Posição no cardápio; ausente = no fim. */
  position?: number;
};

/** Grava os produtos, em ordem, e o vínculo de cada um; devolve as linhas gravadas. */
export async function inserirProdutos(banco: unknown, rows: NovoProduto[]): Promise<(typeof product.$inferSelect)[]> {
  // O app de teste usa o PGlite, com a mesma API do banco do app (como em test/app.ts).
  const db = banco as DB;
  const out: (typeof product.$inferSelect)[] = [];
  const proxima = new Map<number, number>();
  for (const { categoryId, position, ...valores } of rows) {
    const [row] = await db.insert(product).values(valores).returning();
    if (categoryId) {
      const pos = position ?? proxima.get(categoryId) ?? 0;
      proxima.set(categoryId, pos + 1);
      await db.insert(productCategory).values({ productId: row!.id, categoryId, position: pos });
    }
    out.push(row!);
  }
  return out;
}
