import { sql } from 'drizzle-orm';
import type { DB } from '../client';
import { category, option, optionGroup, product, productTemplate } from '../schema';
import type { SeedCatalogo } from './types';

const money = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
const kg = (n: number | null | undefined) => (n == null ? null : n.toFixed(3));

/** Apaga e recria categorias, produtos, grupos, opções e modelos numa transação. */
export async function loadCatalogo(db: DB, seed: SeedCatalogo): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE ${option}, ${optionGroup}, ${product}, ${category}, ${productTemplate} RESTART IDENTITY CASCADE`,
    );

    const categoryIds = new Map<number, number>();
    for (const c of seed.categorias) {
      const [row] = await tx
        .insert(category)
        .values({ name: c.name, slug: c.slug, description: c.description ?? null, position: c.position })
        .returning({ id: category.id });
      categoryIds.set(c.protoId, row!.id);
    }

    for (const p of seed.produtos) {
      const [row] = await tx
        .insert(product)
        .values({
          categoryId: categoryIds.get(p.categoryProtoId)!,
          pdvCode: p.pdvCode ?? null,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          imageAlt: p.imageAlt,
          saleUnit: p.saleUnit,
          basePrice: money(p.basePrice),
          weightMinKg: kg(p.weightMinKg),
          weightMaxKg: kg(p.weightMaxKg),
          minQuantity: p.minQuantity,
          position: p.position,
        })
        .returning({ id: product.id });

      for (const [gi, g] of p.groups.entries()) {
        const [group] = await tx
          .insert(optionGroup)
          .values({
            productId: row!.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            controlsImage: g.controlsImage,
            // Características do grupo tiradas das opções (o editor do painel usa estas colunas).
            priceMode: g.options.find((o) => o.priceMode)?.priceMode ?? null,
            hasWeight: g.options.some((o) => o.weightMinKg != null),
            hasPdv: g.options.some((o) => o.pdvCode),
            position: gi,
          })
          .returning({ id: optionGroup.id });

        if (g.options.length) {
          await tx.insert(option).values(
            g.options.map((o, oi) => ({
              groupId: group!.id,
              name: o.name,
              pdvCode: o.pdvCode ?? null,
              description: o.description ?? null,
              imageUrl: o.imageUrl ?? null,
              priceMode: o.priceMode ?? null,
              price: money(o.price),
              weightMinKg: kg(o.weightMinKg),
              weightMaxKg: kg(o.weightMaxKg),
              position: oi,
            })),
          );
        }
      }
    }

    if (seed.modelos.length) {
      await tx.insert(productTemplate).values(seed.modelos);
    }
  });
}
