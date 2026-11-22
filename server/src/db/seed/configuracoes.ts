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
      // Telefone e endereço da ficha da padaria no Google Maps (provisórios, editáveis no painel).
      contactPhone: '5551995284226',
      address: 'Av. Paraguassu, 557 - Noiva do Mar, Xangri-lá - RS, 95588-000',
      mapsUrl: 'https://maps.google.com/?cid=12232299815005214583',
    });
  });
}
