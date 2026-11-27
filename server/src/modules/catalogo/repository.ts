import {
  agendaForCart,
  closedMenuProducts,
  menuAnnouncement,
  menuPickups,
  pdvWarning,
  specialMenuState,
  applyHiddenPrices,
  type AgendaInput,
  type MenuPickup,
  type PublicSpecialMenu,
  type SpecialMenu,
  type SpecialMenuState,
  type CatalogoDTO,
  type CategoryDTO,
  type PriceMode,
  type ProductDTO,
  type SaleUnit,
} from '@vanellis/shared';
import { asc, eq } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { num } from '../../db/conversao';
import { getAgendaInput } from '../agenda/repository';
import { storeSettings } from '../configuracoes/schema';
import { category, option, optionGroup, product, productCategory } from './schema';

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
export async function specialMenus(db: DB, now: string, agenda?: AgendaInput): Promise<Map<number, SpecialMenuNow>> {
  const input = agenda ?? (await getAgendaInput(db)).input;
  const cats = await db.select().from(category).where(eq(category.special, true));
  // Os itens de cada cardápio vêm dos vínculos (RF64): um produto pode estar em vários.
  const prods = await db
    .select({
      id: product.id,
      categoryId: productCategory.categoryId,
      leadTimeHours: product.leadTimeHours,
      available: product.available,
    })
    .from(productCategory)
    .innerJoin(product, eq(product.id, productCategory.productId));
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
  const { input } = await getAgendaInput(db);
  const especiais = await specialMenus(db, now, input);
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
  // Cardápios visíveis de cada produto, e a ordem de cada cardápio (RF64, RN69).
  const vinculos = await db
    .select()
    .from(productCategory)
    .orderBy(asc(productCategory.position), asc(productCategory.productId));
  const cardapiosDe = new Map<number, number[]>();
  for (const v of vinculos) {
    if (!shown.has(v.categoryId)) continue;
    cardapiosDe.set(v.productId, [...(cardapiosDe.get(v.productId) ?? []), v.categoryId]);
  }
  for (const c of categorias as CategoryDTO[]) {
    c.productIds = vinculos.filter((v) => v.categoryId === c.id).map((v) => v.productId);
  }
  // "Prazo encerrado" (RN67): só se o item não chega a nenhuma data de nenhum cardápio especial
  // visível dele e não está em nenhum cardápio regular (RN68).
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const fechado = (productId: number) => {
    const cats = (cardapiosDe.get(productId) ?? []).map((id) => porId.get(id)!);
    return cats.length > 0 && cats.every((c) => c.special?.closedProducts.includes(productId));
  };

  const rows = await db.query.product.findMany({
    orderBy: [asc(product.id)],
    with: {
      groups: {
        orderBy: [asc(optionGroup.position), asc(optionGroup.id)],
        with: { options: { orderBy: [asc(option.position), asc(option.id)] } },
      },
    },
  });

  // O produto aparece enquanto algum cardápio dele estiver visível (RN69).
  const produtos: ProductDTO[] = rows.filter((p) => cardapiosDe.has(p.id)).map((p) => ({
    id: p.id,
    categoryIds: cardapiosDe.get(p.id)!,
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
    orderClosed: fechado(p.id),
    priceHidden: p.priceHidden,
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
  // Primeira retirada no card (RF58): só para produto com antecedência própria maior que a da loja.
  for (const p of produtos) {
    if (!p.available || p.orderClosed || (p.leadTimeHours ?? 0) <= input.minLeadHours) continue;
    const [dia] = agendaForCart(input, false, now, { categorias, produtos }, [p.id]).days;
    if (dia) p.firstPickup = { date: dia.date, weekday: dia.weekday, time: dia.times[0] ?? null };
  }
  // Preços ocultos, todos (RF39) ou de um produto (RF69): os valores nem saem do servidor.
  return applyHiddenPrices<CatalogoDTO>({ categorias, produtos, pricesHidden });
}
