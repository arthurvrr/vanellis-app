// Configurações da loja, linha única (id = 1): WhatsApp que recebe os pedidos (RF23)
// e atalhos de contato do site (RF34).

import { sql } from 'drizzle-orm';
import { check, integer, pgTable, varchar } from 'drizzle-orm/pg-core';

export const storeSettings = pgTable(
  'store_settings',
  {
    id: integer('id').primaryKey().default(1),
    /** Número que recebe os pedidos, só dígitos com DDI e DDD (ex: 5551995284226). */
    whatsappNumber: varchar('whatsapp_number', { length: 15 }).notNull(),
    instagramUrl: varchar('instagram_url', { length: 200 }),
    contactPhone: varchar('contact_phone', { length: 15 }),
  },
  (t) => [
    check('store_settings_single_row', sql`${t.id} = 1`),
    check('store_settings_whatsapp_check', sql`${t.whatsappNumber} ~ '^[0-9]{12,15}$'`),
  ],
);
