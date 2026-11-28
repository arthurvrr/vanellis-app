// Cadastro completo de produto (etapa 3: RF14, RF29, RF30, RF40, RF46; cenários C52–C61).
// Salvar atualiza grupos e opções pelo id (sem recriar), para os carrinhos dos clientes
// continuarem valendo quando o operador muda preços ou ordem (C59).

import {
  duplicateProduct,
  validateProduct,
  type GroupForm,
  type OptionForm,
  type PriceMode,
  type ProductForm,
  type SaleUnit,
  type TemplateDTO,
} from '@vanellis/shared';
import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { kg, money, num } from '../../db/conversao';
import { inTransaction } from '../../db/transacao';
import { deleteStoredImage, photoUrl } from '../imagens/imagens';
import { cardapiosDe, ordensAntes, vincular } from './cardapios';
import { category, menuSection, option, optionGroup, product, productCategory, productTemplate } from './schema';

const txt = (v: string | null) => (v && v.trim() ? v.trim() : null);

// ---------- formato recebido ----------

const nullableNumber = z.number().finite().nullable();
const optionSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().max(50, 'Nome da opção: até 50 caracteres'),
  description: z.string().max(300).nullable(),
  imageUrl: photoUrl,
  price: nullableNumber,
  weightMinKg: nullableNumber,
  weightMaxKg: nullableNumber,
  pdvCode: z.string().trim().max(20).nullable(),
  available: z.boolean(),
});
const groupSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().max(50, 'Nome do grupo: até 50 caracteres'),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  controlsImage: z.boolean(),
  priceMode: z.enum(['replace', 'add']).nullable(),
  hasWeight: z.boolean(),
  hasPdv: z.boolean(),
  options: z.array(optionSchema).max(40),
});
export const productFormSchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(30),
  // As chaves chegam como texto no JSON: o id do cardápio.
  sectionIds: z
    .record(z.string().regex(/^\d+$/, 'Cardápio inválido'), z.number().int().positive())
    .default({})
    .transform((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v])) as Record<number, number>),
  name: z.string().max(100),
  description: z.string().max(1000).nullable(),
  imageUrl: photoUrl,
  imageAlt: z.string().max(200).nullable(),
  pdvCode: z.string().trim().max(20).nullable(),
  saleUnit: z.enum(['UN', 'KG']),
  basePrice: nullableNumber,
  weightMinKg: nullableNumber,
  weightMaxKg: nullableNumber,
  minQuantity: z.number().int(),
  leadTimeHours: z.number().int().nullable(),
  available: z.boolean(),
  // Ausente (painel aberto antes da atualização) = preço visível.
  priceHidden: z.boolean().default(false),
  groups: z.array(groupSchema).max(10),
});

/** Limpa textos vazios e normaliza o que depende das características do grupo. */
function normalize(f: ProductForm): ProductForm {
  return {
    ...f,
    name: f.name.trim(),
    description: txt(f.description),
    imageAlt: txt(f.imageAlt),
    pdvCode: txt(f.pdvCode),
    weightMinKg: f.saleUnit === 'KG' ? f.weightMinKg : null,
    weightMaxKg: f.saleUnit === 'KG' ? f.weightMaxKg : null,
    groups: f.groups.map((g) => ({
      ...g,
      name: g.name.trim(),
      options: g.options.map((o) => ({
        ...o,
        name: o.name.trim(),
        description: txt(o.description),
        pdvCode: g.hasPdv ? txt(o.pdvCode) : null,
        price: g.priceMode ? o.price : null,
        weightMinKg: g.hasWeight ? o.weightMinKg : null,
        weightMaxKg: g.hasWeight ? o.weightMaxKg : null,
      })),
    })),
  };
}

// ---------- leitura ----------

export async function loadProductForm(db: DB, id: number): Promise<ProductForm | null> {
  const p = await db.query.product.findFirst({
    where: eq(product.id, id),
    with: {
      groups: {
        orderBy: [asc(optionGroup.position), asc(optionGroup.id)],
        with: { options: { orderBy: [asc(option.position), asc(option.id)] } },
      },
    },
  });
  if (!p) return null;
  // Cardápios do produto, na ordem da tela (RF64); pode não haver nenhum.
  const vinculos = await db
    .select({ id: productCategory.categoryId, sectionId: productCategory.sectionId })
    .from(productCategory)
    .innerJoin(category, eq(category.id, productCategory.categoryId))
    .where(eq(productCategory.productId, id))
    .orderBy(asc(category.position), asc(category.id));
  return {
    categoryIds: vinculos.map((v) => v.id),
    sectionIds: Object.fromEntries(vinculos.filter((v) => v.sectionId !== null).map((v) => [v.id, v.sectionId!])),
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
    pdvCode: p.pdvCode,
    saleUnit: p.saleUnit as SaleUnit,
    basePrice: num(p.basePrice),
    weightMinKg: num(p.weightMinKg),
    weightMaxKg: num(p.weightMaxKg),
    minQuantity: p.minQuantity,
    leadTimeHours: p.leadTimeHours,
    available: p.available,
    priceHidden: p.priceHidden,
    groups: p.groups.map(
      (g): GroupForm => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        controlsImage: g.controlsImage,
        priceMode: g.priceMode as PriceMode | null,
        hasWeight: g.hasWeight,
        hasPdv: g.hasPdv,
        options: g.options.map(
          (o): OptionForm => ({
            id: o.id,
            name: o.name,
            description: o.description,
            imageUrl: o.imageUrl,
            price: num(o.price),
            weightMinKg: num(o.weightMinKg),
            weightMaxKg: num(o.weightMaxKg),
            pdvCode: o.pdvCode,
            available: o.available,
          }),
        ),
      }),
    ),
  };
}

export async function listTemplates(db: DB): Promise<TemplateDTO[]> {
  const rows = await db.select().from(productTemplate).orderBy(asc(productTemplate.id));
  return rows.map((t) => ({ id: t.id, name: t.name, saleUnit: t.saleUnit as SaleUnit, groups: t.groups as TemplateDTO['groups'] }));
}

// ---------- validação contra o banco ----------

export class FormError extends Error {
  constructor(
    readonly status: number,
    readonly errors: string[],
  ) {
    super(errors[0]);
  }
}

/** Código PDV já usado em outro produto ou opção (RN41, C54). */
async function pdvConflicts(db: DB, f: ProductForm, productId: number | null): Promise<string[]> {
  const codes = [f.pdvCode, ...f.groups.flatMap((g) => g.options.map((o) => o.pdvCode))].filter((c): c is string => !!c);
  if (!codes.length) return [];
  const others = productId ?? -1;
  const inProducts = await db
    .select({ code: product.pdvCode, name: product.name })
    .from(product)
    .where(and(inArray(product.pdvCode, codes), ne(product.id, others)));
  const inOptions = await db
    .select({ code: option.pdvCode, name: sql<string>`${product.name} || ' ' || ${option.name}` })
    .from(option)
    .innerJoin(optionGroup, eq(option.groupId, optionGroup.id))
    .innerJoin(product, eq(optionGroup.productId, product.id))
    .where(and(inArray(option.pdvCode, codes), ne(product.id, others)));
  return [...inProducts, ...inOptions].map((c) => `Código PDV ${c.code} já está em uso em ${c.name}`);
}

async function check(db: DB, raw: unknown, productId: number | null): Promise<{ form: ProductForm; warnings: string[] }> {
  const parsed = productFormSchema.safeParse(raw);
  if (!parsed.success) throw new FormError(400, [parsed.error.issues[0]?.message ?? 'Dados inválidos']);
  const form = normalize(parsed.data);
  const { errors, warnings } = validateProduct(form);
  if (errors.length) throw new FormError(400, errors);
  const cats = await db.select({ id: category.id }).from(category).where(inArray(category.id, form.categoryIds));
  if (cats.length !== form.categoryIds.length) throw new FormError(400, ['Cardápio não encontrado']);
  const secoes = Object.entries(form.sectionIds ?? {}).map(([c, s]) => ({ categoryId: Number(c), id: s }));
  if (secoes.some((s) => !form.categoryIds.includes(s.categoryId))) {
    throw new FormError(400, ['Seção de um cardápio em que o produto não está']);
  }
  if (secoes.length) {
    const achadas = await db
      .select({ id: menuSection.id, categoryId: menuSection.categoryId })
      .from(menuSection)
      .where(inArray(menuSection.id, secoes.map((s) => s.id)));
    const ok = secoes.every((s) => achadas.some((a) => a.id === s.id && a.categoryId === s.categoryId));
    if (!ok) throw new FormError(400, ['Seção não encontrada no cardápio']);
  }
  const conflicts = await pdvConflicts(db, form, productId);
  if (conflicts.length) throw new FormError(409, conflicts);
  return { form, warnings };
}

// ---------- gravação ----------

/** Colunas do produto; os cardápios ficam nos vínculos (product_category). */
const productValues = (f: ProductForm) => ({
  name: f.name,
  description: f.description,
  imageUrl: f.imageUrl,
  imageAlt: f.imageAlt,
  pdvCode: f.pdvCode,
  saleUnit: f.saleUnit,
  basePrice: money(f.basePrice),
  weightMinKg: kg(f.weightMinKg),
  weightMaxKg: kg(f.weightMaxKg),
  minQuantity: f.minQuantity,
  leadTimeHours: f.leadTimeHours,
  available: f.available,
  priceHidden: f.priceHidden,
});

/** Grava grupos e opções: atualiza os que têm id, cria os novos, apaga os que saíram. */
async function saveGroups(tx: DB, productId: number, groups: GroupForm[]): Promise<string[]> {
  const removedImages: string[] = [];
  const existing = await tx.query.optionGroup.findMany({
    where: eq(optionGroup.productId, productId),
    with: { options: true },
  });
  const keepGroups = groups.map((g) => g.id).filter((id): id is number => !!id);
  for (const g of existing) {
    if (!keepGroups.includes(g.id)) removedImages.push(...g.options.map((o) => o.imageUrl ?? ''));
  }
  await tx
    .delete(optionGroup)
    .where(
      keepGroups.length
        ? and(eq(optionGroup.productId, productId), notInArray(optionGroup.id, keepGroups))
        : eq(optionGroup.productId, productId),
    );

  for (const [gi, g] of groups.entries()) {
    const values = {
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      controlsImage: g.controlsImage,
      priceMode: g.priceMode,
      hasWeight: g.hasWeight,
      hasPdv: g.hasPdv,
      position: gi,
    };
    const old = g.id ? existing.find((e) => e.id === g.id) : undefined;
    if (g.id && !old) throw new FormError(400, [`Grupo ${g.name} não pertence a este produto`]);
    let groupId: number;
    if (old) {
      await tx.update(optionGroup).set(values).where(eq(optionGroup.id, old.id));
      groupId = old.id;
    } else {
      const [row] = await tx.insert(optionGroup).values({ productId, ...values }).returning({ id: optionGroup.id });
      groupId = row!.id;
    }

    const keepOptions = g.options.map((o) => o.id).filter((id): id is number => !!id && !!old?.options.some((x) => x.id === id));
    for (const o of old?.options ?? []) if (!keepOptions.includes(o.id)) removedImages.push(o.imageUrl ?? '');
    await tx
      .delete(option)
      .where(keepOptions.length ? and(eq(option.groupId, groupId), notInArray(option.id, keepOptions)) : eq(option.groupId, groupId));

    // Nomes únicos por grupo: grava primeiro com nome provisório, para trocas de nome não colidirem.
    for (const [oi, o] of g.options.entries()) {
      const optionValues = {
        name: `~provisorio~${oi}`,
        description: o.description,
        imageUrl: o.imageUrl,
        priceMode: g.priceMode,
        price: money(o.price),
        weightMinKg: kg(o.weightMinKg),
        weightMaxKg: kg(o.weightMaxKg),
        pdvCode: null,
        available: o.available,
        position: oi,
      };
      if (o.id && keepOptions.includes(o.id)) {
        const before = old!.options.find((x) => x.id === o.id)!;
        if (before.imageUrl && before.imageUrl !== o.imageUrl) removedImages.push(before.imageUrl);
        await tx.update(option).set(optionValues).where(eq(option.id, o.id));
      } else {
        const [row] = await tx.insert(option).values({ groupId, ...optionValues }).returning({ id: option.id });
        o.id = row!.id;
      }
    }
    for (const o of g.options) {
      await tx.update(option).set({ name: o.name, pdvCode: o.pdvCode }).where(eq(option.id, o.id!));
    }
  }
  return removedImages.filter(Boolean);
}

export async function createProduct(db: DB, raw: unknown): Promise<{ id: number; warnings: string[] }> {
  const { form, warnings } = await check(db, raw, null);
  const id = await inTransaction(db, async (tx) => {
    // Entra no fim de cada cardápio escolhido.
    const antes = await ordensAntes(tx, form.categoryIds);
    const [row] = await tx
      .insert(product)
      .values(productValues(form))
      .returning({ id: product.id });
    await vincular(tx, row!.id, form.categoryIds, antes, form.sectionIds ?? {});
    await saveGroups(tx, row!.id, form.groups);
    return row!.id;
  });
  return { id, warnings };
}

export async function updateProduct(db: DB, id: number, raw: unknown): Promise<{ id: number; warnings: string[] }> {
  const [atual] = await db.select().from(product).where(eq(product.id, id)).limit(1);
  if (!atual) throw new FormError(404, ['Produto não encontrado']);
  const { form, warnings } = await check(db, raw, id);
  const removed = await inTransaction(db, async (tx) => {
    const atuais = (await cardapiosDe(tx, [id])).get(id) ?? [];
    const antes = await ordensAntes(tx, [...form.categoryIds, ...atuais]);
    await tx.update(product).set(productValues(form)).where(eq(product.id, id));
    // Onde já estava, mantém o lugar; num cardápio novo, entra no fim (RF64).
    await vincular(tx, id, form.categoryIds, antes, form.sectionIds ?? {});
    const imgs = await saveGroups(tx, id, form.groups);
    if (atual.imageUrl && atual.imageUrl !== form.imageUrl) imgs.push(atual.imageUrl);
    return imgs;
  });
  for (const url of removed) await deleteStoredImage(db, url);
  return { id, warnings };
}

/** RF46: cópia indisponível e sem códigos; as fotos são as mesmas do original. */
export async function duplicate(db: DB, id: number): Promise<{ id: number }> {
  const form = await loadProductForm(db, id);
  if (!form) throw new FormError(404, ['Produto não encontrado']);
  const copy = duplicateProduct(form);
  // Uma transação só (G10): se a cópia não puder ir para o lugar certo, ela não fica criada.
  return inTransaction(db, async (tx) => {
    const antes = await ordensAntes(tx, copy.categoryIds);
    const [row] = await tx
      .insert(product)
      .values(productValues(copy))
      .returning({ id: product.id });
    const newId = row!.id;
    await saveGroups(tx, newId, copy.groups);
    // Nos mesmos cardápios do original, logo depois dele em cada um.
    await vincular(tx, newId, copy.categoryIds, antes, copy.sectionIds ?? {}, id);
    return { id: newId };
  });
}
