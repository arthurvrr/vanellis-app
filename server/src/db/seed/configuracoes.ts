// Configurações iniciais da loja. PROVISÓRIO: número e links tirados do protótipo
// (vanellis-app-pern) até a padaria confirmar; depois mantidos pelo painel (RF23, RF34).

import { sql } from 'drizzle-orm';
import type { DB } from '../client';
import { storeSettings } from '../schema';

export async function loadConfiguracoes(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE ${storeSettings}`);
    await tx.insert(storeSettings).values({
      id: 1,
      whatsappNumber: '5551995284226',
      instagramUrl: 'https://www.instagram.com/padariaeconfeitariavanellis/',
      contactPhone: null,
    });
  });
}
