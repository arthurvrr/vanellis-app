import {
  specialMenuState,
  withoutPrices,
  type CatalogoDTO,
  type PriceMode,
  type ProductDTO,
  type SaleUnit,
} from '@vanellis/shared';
import { asc, eq, isNotNull } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { num } from '../../db/conversao';
import { storeSettings } from '../configuracoes/schema';
import { category, option, optionGroup, product } from './schema';


/**
 * Produtos sem código PDV, nem no produto nem em alguma opção (RN41, C46): o caixa não tem como
 * registrar o item. Única definição dessa regra, usada pelo aviso do Início e pela lista de
 * produtos do painel.
 */
export async function productsMissingPdv(db: DB): Promise<Set<number>> {
  const withOptionCode = await db
    .selectDistinct({ productId: optionGroup.productId })
    .from(option)
    .innerJoin(optionGroup, eq(option.groupId, optionGroup.id))
    .where(isNotNull(option.pdvCode));
  const coded = new Set(withOptionCode.map((r) => r.productId));
  const products = await db.select({ id: product.id, pdvCode: product.pdvCode }).from(product);
  return new Set(products.filter((p) => !p.pdvCode && !coded.has(p.id)).map((p) => p.id));
}

/**
 * Cardápio público de hoje ('AAAA-MM-DD'). Cardápio especial fora do período ou oculto não
 * sai do servidor, nem os seus produtos (RN17, RN18); quem já tinha um item dele no carrinho
 * o perde, como acontece com um produto excluído (C71).
 */
export async function getCatalogo(db: DB, today: string): Promise<CatalogoDTO> {
  const rows0 = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
  const categorias = rows0
    .filter(
      (c) =>
        !c.special ||
        specialMenuState(
          { visibleFrom: c.visibleFrom ?? '', visibleUntil: c.visibleUntil ?? '', hidden: c.hidden, pickupDates: c.pickupDates },
          today,
        ) === 'visivel',
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      special: c.special ? { visibleUntil: c.visibleUntil!, pickupDates: [...c.pickupDates].sort() } : null,
    }));
  const shown = new Set(categorias.map((c) => c.id));

  const rows = await db.query.product.findMany({
    orderBy: [asc(product.position), asc(product.id)],
    with: {
      groups: {
        orderBy: [asc(optionGroup.position), asc(optionGroup.id)],
        with: { options: { orderBy: [asc(option.position), asc(option.id)] } },
      },
    },
  });

  const produtos: ProductDTO[] = rows.filter((p) => shown.has(p.categoryId)).map((p) => ({
    id: p.id,
    categoryId: p.categoryId,
    pdvCode: p.pdvCode,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
    saleUnit: p.saleUnit as SaleUnit,
    basePrice: num(p.basePrice),
    weightMinKg: num(p.weightMinKg),
    weightMaxKg: num(p.weightMaxKg),
    minQuantity: p.minQuantity,
    leadTimeHours: p.leadTimeHours,
    available: p.available,
    groups: p.groups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      controlsImage: g.controlsImage,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        pdvCode: o.pdvCode,
        description: o.description,
        imageUrl: o.imageUrl,
        priceMode: o.priceMode as PriceMode | null,
        price: num(o.price),
        weightMinKg: num(o.weightMinKg),
        weightMaxKg: num(o.weightMaxKg),
        available: o.available,
      })),
    })),
  }));

  const [settings] = await db.select({ pricesHidden: storeSettings.pricesHidden }).from(storeSettings).limit(1);
  const pricesHidden = settings?.pricesHidden ?? false;
  // Preços ocultos (RF39): os valores nem saem do servidor.
  const catalogo: CatalogoDTO = { categorias, produtos, pricesHidden };
  return pricesHidden ? withoutPrices(catalogo) : catalogo;
}
