// Configurações da loja, linha única (id = 1): WhatsApp que recebe os pedidos (RF23)
// e atalhos de contato e localização do site (RF34).

import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, varchar } from 'drizzle-orm/pg-core';

export const storeSettings = pgTable(
  'store_settings',
  {
    id: integer('id').primaryKey().default(1),
    /** Número que recebe os pedidos, só dígitos com DDI e DDD (ex: 5551995284226). */
    whatsappNumber: varchar('whatsapp_number', { length: 15 }).notNull(),
    instagramUrl: varchar('instagram_url', { length: 200 }),
    contactPhone: varchar('contact_phone', { length: 15 }),
    /** Endereço da loja, mostrado no atalho de localização (RF34). */
    address: varchar('address', { length: 200 }),
    /** Link do Google Maps aberto pelo pin de localização; sem ele, busca pelo endereço. */
    mapsUrl: varchar('maps_url', { length: 500 }),
    /** Oculta todos os preços do site (RF39). */
    pricesHidden: boolean('prices_hidden').notNull().default(false),
  },
  (t) => [
    check('store_settings_single_row', sql`${t.id} = 1`),
    check('store_settings_whatsapp_check', sql`${t.whatsappNumber} ~ '^[0-9]{12,15}$'`),
  ],
);
