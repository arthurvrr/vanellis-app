import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não definida (veja server/.env.example)'),
  /** Pasta dos backups (no servidor, /backups); sem ela, o painel não avisa sobre backup (RF67). */
  BACKUP_DIR: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
