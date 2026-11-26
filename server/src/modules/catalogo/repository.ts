import {
  closedMenuProducts,
  menuAnnouncement,
  menuPickups,
  pdvWarning,
  specialMenuState,
  withoutPrices,
  type MenuPickup,
  type PublicSpecialMenu,
  type SpecialMenu,
  type SpecialMenuState,
  type CatalogoDTO,
  type PriceMode,
  type ProductDTO,
  type SaleUnit,
} from '@vanellis/shared';
import { asc, eq } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { num } from '../../db/conversao';
import { getAgendaInput } from '../agenda/repository';
import { storeSettings } from '../configuracoes/schema';
import { category, option, optionGroup, product } from './schema';

/**
 * Produtos sem código PDV para o caixa (RN41, C46), pela mesma regra do aviso do editor
 * (pdvWarning, G35): com um grupo de código próprio, uma opção sem código já conta.
 */
export async function productsMissingPdv(db: DB): Promise<Set<number>> {
  const products = await db.select({ id: product.id, saleUnit: product.saleUnit, pdvCode: product.pdvCode }).from(product);
  const groups = await db
    .select({ id: optionGroup.id, productId: optionGroup.productId, name: optionGroup.name, hasPdv: optionGroup.hasPdv })
    .from(optionGroup);
  const options = await db.select({ groupId: option.groupId, pdvCode: option.pdvCode }).from(option);
  const missing = new Set<number>();
  for (const p of products) {
    const shape = {
      ...p,
      saleUnit: p.saleUnit as SaleUnit,
      groups: groups
        .filter((g) => g.productId === p.id)
        .map((g) => ({ ...g, options: options.filter((o) => o.groupId === g.id) })),
    };
    if (pdvWarning(shape)) missing.add(p.id);
  }
  return missing;
}

export interface SpecialMenuNow {
  menu: SpecialMenu;
  pickups: MenuPickup[];
  state: SpecialMenuState;
  /** O que o site recebe, quando o cardápio está visível. */
  public: PublicSpecialMenu;
}

/**
 * Os cardápios especiais agora ('AAAA-MM-DDTHH:MM'): as datas de retirada que ainda aceitam
 * pedidos, o estado e o anúncio (RN62, RN63, RN67). Uma regra só para o site e para o painel.
 */
export async function specialMenus(db: DB, now: string): Promise<Map<number, SpecialMenuNow>> {
  const { input } = await getAgendaInput(db);
  const cats = await db.select().from(category).where(eq(category.special, true));
  const prods = await db
    .select({ id: product.id, categoryId: product.categoryId, leadTimeHours: product.leadTimeHours, available: product.available })
    .from(product);
  const out = new Map<number, SpecialMenuNow>();
  for (const c of cats) {
    const menu: SpecialMenu = { visibleFrom: c.visibleFrom ?? '', hidden: c.hidden, pickupDates: [...c.pickupDates].sort() };
    // Só os itens disponíveis contam para o cardápio continuar no site (C122).
    const itens = prods.filter((p) => p.categoryId === c.id && p.available);
    const pickups = menuPickups(input, now, menu.pickupDates, itens.map((p) => p.leadTimeHours ?? 0));
    out.set(c.id, {
      menu,
      pickups,
      state: specialMenuState(menu, pickups, now.slice(0, 10)),
      public: {
        pickupDates: pickups.filter((p) => p.open).map((p) => p.date),
        announcement: menuAnnouncement(pickups),
        closedProducts: closedMenuProducts(input, now, pickups, itens),
      },
    });
  }
  return out;
}

/**
 * Cardápio público agora ('AAAA-MM-DDTHH:MM'). Cardápio especial antes do início, oculto ou
 * sem nenhuma data aberta não sai do servidor, nem os seus produtos (RN17, RN18, RN63); quem já
 * tinha um item dele no carrinho é avisado para tirá-lo (C71, RN64).
 */
export async function getCatalogo(db: DB, now: string): Promise<CatalogoDTO> {
  const especiais = await specialMenus(db, now);
  const rows0 = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
  const categorias = rows0
    .filter((c) => !c.special || especiais.get(c.id)?.state === 'visivel')
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      special: c.special ? especiais.get(c.id)!.public : null,
    }));
  const shown = new Set(categorias.map((c) => c.id));
  // Itens de cardápio especial com o prazo encerrado (RN67).
  const fechados = new Set(categorias.flatMap((c) => c.special?.closedProducts ?? []));

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
    orderClosed: fechados.has(p.id),
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
