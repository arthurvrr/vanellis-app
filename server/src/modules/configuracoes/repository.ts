import type { PublicSettingsDTO } from '@vanellis/shared';
import type { DB } from '../../db/client';
import { storeSettings } from './schema';

export type StoreSettingsRow = typeof storeSettings.$inferSelect;

export async function getSettings(db: DB): Promise<StoreSettingsRow | null> {
  const [row] = await db.select().from(storeSettings).limit(1);
  return row ?? null;
}

/** O que o site público recebe: contatos e localização (RF23, RF33, RF34). */
export function toPublicSettings(row: StoreSettingsRow): PublicSettingsDTO {
  return {
    whatsappNumber: row.whatsappNumber,
    instagramUrl: row.instagramUrl,
    contactPhone: row.contactPhone,
    address: row.address,
    mapsUrl: row.mapsUrl,
    messageTemplate: row.messageTemplate,
  };
}
