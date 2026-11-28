// Vínculos entre produto e cardápio (RF64): um produto pode estar em vários cardápios, ou em
// nenhum, cada um com a sua ordem. product_category é a única ligação entre os dois (PR E4).

import { sendToEnd, type MenuSection } from '@vanellis/shared';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { menuSection, productCategory } from './schema';

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
 * Deixa os vínculos de um produto iguais a `cardapios`, cada um na seção de `secoes` (pelo id do
 * cardápio; ausente = sem seção). Onde ele já estava, mantém o lugar, a não ser que troque de seção:
 * aí vai para o fim da nova (RN83). Num cardápio novo, entra no fim (ou logo depois de `depoisDe`,
 * na cópia de um produto). Chame depois de gravar o produto, com as ordens lidas antes (`ordensAntes`).
 */
export async function vincular(
  tx: DB,
  productId: number,
  cardapios: number[],
  antes: Map<number, number[]>,
  secoes: Record<number, number>,
  depoisDe?: number,
): Promise<void> {
  const atuais = await tx
    .select({ categoryId: productCategory.categoryId, sectionId: productCategory.sectionId })
    .from(productCategory)
    .where(eq(productCategory.productId, productId));
  await tx
    .delete(productCategory)
    .where(
      cardapios.length
        ? and(eq(productCategory.productId, productId), notInArray(productCategory.categoryId, cardapios))
        : eq(productCategory.productId, productId),
    );
  for (const categoryId of cardapios) {
    let ids = [...(antes.get(categoryId) ?? [])];
    const sectionId = secoes[categoryId] ?? null;
    const atual = atuais.find((a) => a.categoryId === categoryId);
    if (!ids.includes(productId)) {
      const i = depoisDe === undefined ? -1 : ids.indexOf(depoisDe);
      if (i >= 0) ids.splice(i + 1, 0, productId);
      else ids.push(productId);
    } else if (atual && atual.sectionId !== sectionId) {
      ids = sendToEnd(ids, [productId]);
    }
    await ordenar(tx, categoryId, ids);
    await tx
      .update(productCategory)
      .set({ sectionId })
      .where(and(eq(productCategory.productId, productId), eq(productCategory.categoryId, categoryId)));
  }
}

/** Seção de cada produto num cardápio, pelo id do produto; sem seção = ausente. */
export async function secaoDe(tx: DB, categoryId: number): Promise<Record<number, number>> {
  const rows = await tx
    .select({ productId: productCategory.productId, sectionId: productCategory.sectionId })
    .from(productCategory)
    .where(eq(productCategory.categoryId, categoryId));
  return Object.fromEntries(rows.filter((r) => r.sectionId !== null).map((r) => [r.productId, r.sectionId!]));
}

/**
 * As seções de cada cardápio, na ordem do operador, com os produtos de cada uma na ordem do
 * cardápio (RF71, RF73). Cardápio sem seções = lista vazia.
 */
export async function secoesPorCardapio(tx: DB): Promise<Map<number, MenuSection[]>> {
  const secoes = await tx.select().from(menuSection).orderBy(asc(menuSection.position), asc(menuSection.id));
  const vinculos = await tx
    .select({ productId: productCategory.productId, sectionId: productCategory.sectionId })
    .from(productCategory)
    .orderBy(asc(productCategory.position), asc(productCategory.productId));
  const out = new Map<number, MenuSection[]>();
  for (const s of secoes) {
    const productIds = vinculos.filter((v) => v.sectionId === s.id).map((v) => v.productId);
    out.set(s.categoryId, [...(out.get(s.categoryId) ?? []), { id: s.id, name: s.name, productIds }]);
  }
  return out;
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
