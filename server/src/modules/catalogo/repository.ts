import { withoutPrices, type CatalogoDTO, type PriceMode, type ProductDTO, type SaleUnit } from '@vanellis/shared';
import { asc } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { storeSettings } from '../configuracoes/schema';
import { category, option, optionGroup, product } from './schema';

// O PostgreSQL devolve `numeric` como texto para não perder precisão.
const num = (v: string | null): number | null => (v === null ? null : Number(v));

export async function getCatalogo(db: DB): Promise<CatalogoDTO> {
  const categorias = await db
    .select({ id: category.id, name: category.name, slug: category.slug, description: category.description, coverImageUrl: category.coverImageUrl })
    .from(category)
    .orderBy(asc(category.position), asc(category.id));

  const rows = await db.query.product.findMany({
    orderBy: [asc(product.position), asc(product.id)],
    with: {
      groups: {
        orderBy: [asc(optionGroup.position), asc(optionGroup.id)],
        with: { options: { orderBy: [asc(option.position), asc(option.id)] } },
      },
    },
  });

  const produtos: ProductDTO[] = rows.map((p) => ({
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
