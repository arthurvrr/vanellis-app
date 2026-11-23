import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

// A pasta drizzle/ é relativa à pasta server/ (no container, /app/server).
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrações aplicadas.');
await pool.end();
