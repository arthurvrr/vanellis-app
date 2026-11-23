// Configurações da loja, linha única (id = 1): WhatsApp que recebe os pedidos e modelo da
// mensagem (RF23), atalhos de contato e localização do site (RF34) e lembretes (RF37).

import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';

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
    /** Modelo da mensagem do pedido (RF23); `null` = o padrão. */
    messageTemplate: text('message_template'),
  },
  (t) => [
    check('store_settings_single_row', sql`${t.id} = 1`),
    check('store_settings_whatsapp_check', sql`${t.whatsappNumber} ~ '^[0-9]{12,15}$'`),
  ],
);

/**
 * Lembretes de revisão (RN34, RN35): cada um com a sua frequência (RF37). A data da última
 * revisão é usada pelos lembretes do painel (etapa 7, RF36).
 */
export const reviewReminder = pgTable(
  'review_reminder',
  {
    kind: varchar('kind', { length: 20 }).primaryKey(),
    everyDays: integer('every_days').notNull(),
    lastReviewed: date('last_reviewed', { mode: 'string' }),
  },
  (t) => [check('review_reminder_days_check', sql`${t.everyDays} between 1 and 365`)],
);
