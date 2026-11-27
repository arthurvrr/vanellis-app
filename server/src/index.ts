import { createApp } from './app';
import { env } from './config/env';
import { db } from './db/client';
import { agendarAvisos } from './modules/avisos/avisos';
import { agendarLimpeza } from './modules/imagens/limpeza';

createApp(db, { backupDir: env.BACKUP_DIR }).listen(env.PORT, () => {
  console.log(`Servidor em http://localhost:${env.PORT}`);
  // Fotos enviadas e nunca usadas (B02) e histórico de avisos com mais de 1 ano (RN75) saem uma
  // vez por dia.
  agendarLimpeza(db);
  // Problemas de backup entram no histórico de avisos mesmo sem ninguém abrir o painel (RN72).
  agendarAvisos(db, { backupDir: env.BACKUP_DIR });
});
