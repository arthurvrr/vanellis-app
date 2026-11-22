// Esquema do catálogo: categoria, produto, grupo de opção, opção e modelo de produto.
// Regras e validações: doc de requisitos, seção "Modelo de produtos e banco de dados".

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const category = pgTable('category', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  position: integer('position').notNull().default(0),
});

export const product = pgTable(
  'product',
  {
    id: serial('id').primaryKey(),
    // Obrigatório conforme o tipo de produto (RN41): validado no painel, não no banco.
    pdvCode: varchar('pdv_code', { length: 20 }).unique(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 255 }),
    imageAlt: text('image_alt'),
    saleUnit: varchar('sale_unit', { length: 2 }).notNull(),
    basePrice: numeric('base_price', { precision: 10, scale: 2 }),
    weightMinKg: numeric('weight_min_kg', { precision: 6, scale: 3 }),
    weightMaxKg: numeric('weight_max_kg', { precision: 6, scale: 3 }),
    minQuantity: integer('min_quantity').notNull().default(1),
    leadTimeHours: integer('lead_time_hours'),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    check('product_sale_unit_check', sql`${t.saleUnit} in ('UN', 'KG')`),
    check('product_min_quantity_check', sql`${t.minQuantity} > 0`),
    check('product_weight_check', sql`${t.weightMaxKg} >= ${t.weightMinKg}`),
  ],
);

export const optionGroup = pgTable(
  'option_group',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    controlsImage: boolean('controls_image').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    check('option_group_select_check', sql`${t.minSelect} >= 0 and ${t.maxSelect} >= 1 and ${t.maxSelect} >= ${t.minSelect}`),
  ],
);

export const option = pgTable(
  'option',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => optionGroup.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    pdvCode: varchar('pdv_code', { length: 20 }).unique(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 255 }),
    priceMode: varchar('price_mode', { length: 7 }),
    price: numeric('price', { precision: 10, scale: 2 }),
    weightMinKg: numeric('weight_min_kg', { precision: 6, scale: 3 }),
    weightMaxKg: numeric('weight_max_kg', { precision: 6, scale: 3 }),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    unique('option_group_name_unique').on(t.groupId, t.name),
    check('option_price_mode_check', sql`${t.priceMode} in ('replace', 'add')`),
    check('option_price_check', sql`(${t.priceMode} is null) = (${t.price} is null)`),
    check('option_weight_check', sql`${t.weightMaxKg} >= ${t.weightMinKg}`),
  ],
);

/** Modelo de produto: grupos copiados para o produto na criação (RF40). */
export const productTemplate = pgTable('product_template', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  saleUnit: varchar('sale_unit', { length: 2 }).notNull(),
  groups: jsonb('groups').notNull(),
});

export const categoryRelations = relations(category, ({ many }) => ({
  products: many(product),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  category: one(category, { fields: [product.categoryId], references: [category.id] }),
  groups: many(optionGroup),
}));

export const optionGroupRelations = relations(optionGroup, ({ one, many }) => ({
  product: one(product, { fields: [optionGroup.productId], references: [product.id] }),
  options: many(option),
}));

export const optionRelations = relations(option, ({ one }) => ({
  group: one(optionGroup, { fields: [option.groupId], references: [optionGroup.id] }),
}));
