// App de teste: PostgreSQL em memória (PGlite) com as migrações aplicadas e um cliente HTTP
// que guarda o cookie de sessão, como um navegador.

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app';
import type { DB } from '../db/client';
import * as schema from '../db/schema';
import { hashPassword } from '../modules/acesso/senha';

export async function startTestApp() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  await db.insert(schema.storeSettings).values({ whatsappNumber: '5551999999999' });
  await db.insert(schema.agendaConfig).values({});
  await db.insert(schema.appUser).values([
    { username: 'padaria', passwordHash: await hashPassword('senha-operador'), role: 'operador' },
    { username: 'arthur', passwordHash: await hashPassword('senha-admin'), role: 'admin' },
  ]);

  const server = createApp(db as unknown as DB).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /** Um "navegador": guarda o cookie que o servidor mandar. */
  function browser() {
    let cookie = '';
    return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set };
    };
  }

  return {
    db,
    browser,
    stop: async () => {
      await new Promise((r) => server.close(r));
      await client.close();
    },
  };
}
