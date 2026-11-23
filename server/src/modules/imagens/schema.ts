// Fotos enviadas pelo painel, guardadas no banco já reduzidas e em WebP (RN56).

import { customType, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const storedImage = pgTable('stored_image', {
  id: serial('id').primaryKey(),
  data: bytea('data').notNull(),
  mime: varchar('mime', { length: 30 }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
