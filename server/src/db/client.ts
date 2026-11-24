import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// oxlint-disable-next-line import/no-named-as-default-member -- o pg é CommonJS: `import { Pool }` quebra no Node
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
