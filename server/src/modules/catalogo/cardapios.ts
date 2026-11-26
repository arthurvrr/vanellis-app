// Vínculos entre produto e cardápio (RF64): um produto pode estar em vários cardápios, ou em
// nenhum, cada um com a sua ordem. product_category é a única ligação entre os dois (PR E4).

import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { productCategory } from './schema';

/** Produtos de um cardápio, na ordem dele. */
export async function idsNoCardapio(tx: DB, categoryId: number): Promise<number[]> {
  const rows = await tx
    .select({ id: productCategory.productId })
    .from(productCategory)
    .where(eq(productCategory.categoryId, categoryId))
    .orderBy(asc(productCategory.position), asc(productCategory.productId));
  return rows.map((r) => r.id);
}

/** Grava a ordem de um cardápio: a posição de cada vínculo. */
export async function ordenar(tx: DB, categoryId: number, ids: number[]): Promise<void> {
  for (const [position, productId] of ids.entries()) {
    await tx
      .insert(productCategory)
      .values({ productId, categoryId, position })
      .onConflictDoUpdate({ target: [productCategory.productId, productCategory.categoryId], set: { position } });
  }
}

/** A ordem de cada cardápio antes de uma gravação, para o produto manter o lugar onde já estava. */
export async function ordensAntes(tx: DB, categoryIds: number[]): Promise<Map<number, number[]>> {
  const ordens = new Map<number, number[]>();
  for (const id of new Set(categoryIds)) ordens.set(id, await idsNoCardapio(tx, id));
  return ordens;
}

/**
 * Deixa os vínculos de um produto iguais a `cardapios`. Onde ele já estava, mantém o lugar; num
 * cardápio novo, entra no fim (ou logo depois de `depoisDe`, na cópia de um produto). Chame depois
 * de gravar o produto, com as ordens lidas antes (`ordensAntes`).
 */
export async function vincular(
  tx: DB,
  productId: number,
  cardapios: number[],
  antes: Map<number, number[]>,
  depoisDe?: number,
): Promise<void> {
  await tx
    .delete(productCategory)
    .where(
      cardapios.length
        ? and(eq(productCategory.productId, productId), notInArray(productCategory.categoryId, cardapios))
        : eq(productCategory.productId, productId),
    );
  for (const categoryId of cardapios) {
    const ids = [...(antes.get(categoryId) ?? [])];
    if (!ids.includes(productId)) {
      const i = depoisDe === undefined ? -1 : ids.indexOf(depoisDe);
      if (i >= 0) ids.splice(i + 1, 0, productId);
      else ids.push(productId);
    }
    await ordenar(tx, categoryId, ids);
  }
}

/** Cardápios de cada produto. */
export async function cardapiosDe(tx: DB, productIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!productIds.length) return out;
  const rows = await tx
    .select({ productId: productCategory.productId, categoryId: productCategory.categoryId })
    .from(productCategory)
    .where(inArray(productCategory.productId, productIds));
  for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), r.categoryId]);
  return out;
}
