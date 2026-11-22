import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrações aplicadas.');
await pool.end();
