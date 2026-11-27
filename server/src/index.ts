import { createApp } from './app';
import { env } from './config/env';
import { db } from './db/client';
import { agendarLimpeza } from './modules/imagens/limpeza';

createApp(db).listen(env.PORT, () => {
  console.log(`Servidor em http://localhost:${env.PORT}`);
  // Fotos enviadas e nunca usadas saem do banco uma vez por dia (B02).
  agendarLimpeza(db);
});
