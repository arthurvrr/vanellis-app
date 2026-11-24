// Cria uma conta do painel ou troca a senha dela (RN55). Encerra as sessões abertas da conta.
//
//   npm run usuario:senha -- <usuário> --papel admin      cria o superusuário
//   npm run usuario:senha -- <usuário> --papel operador   cria a conta do operador
//   npm run usuario:senha -- <usuário>                    troca a senha de uma conta existente
//
// A senha é pedida no terminal, sem aparecer na tela; nunca vai como argumento.

import { eq } from 'drizzle-orm';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { db, pool } from '../src/db/client';
import { appUser } from '../src/modules/acesso/schema';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/modules/acesso/senha';
import { deleteUserSessions } from '../src/modules/acesso/sessao';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { papel: { type: 'string' } },
});
const username = positionals[0]?.trim().toLowerCase();
const role = values.papel;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
  fail('Uso: npm run usuario:senha -- <usuário> [--papel admin|operador]\nUsuário: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.');
}
if (role !== undefined && role !== 'admin' && role !== 'operador') fail('Papel deve ser admin ou operador.');

// Um leitor só para as duas perguntas: com a entrada vinda de um pipe, um segundo leitor
// perderia as linhas já lidas pelo primeiro.
let muted = false;
const rl = createInterface({
  input: process.stdin,
  output: new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  }),
  terminal: process.stdin.isTTY ?? false,
});
const lines = rl[Symbol.asyncIterator]();

/** Pergunta sem mostrar o que é digitado. */
async function askHidden(question: string): Promise<string> {
  muted = false;
  rl.setPrompt(question);
  rl.prompt();
  muted = true;
  const { value, done } = await lines.next();
  process.stdout.write('\n');
  if (done) fail('Senha não informada.');
  return value;
}

const [existing] = await db.select().from(appUser).where(eq(appUser.username, username)).limit(1);
if (!existing && !role) fail(`A conta "${username}" não existe. Para criar, informe --papel admin ou --papel operador.`);
if (existing && role && role !== existing.role) fail(`A conta "${username}" já existe com o papel ${existing.role}.`);

const senha = await askHidden('Nova senha: ');
if (senha.length < MIN_PASSWORD_LENGTH) fail(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
if ((await askHidden('Repita a senha: ')) !== senha) fail('As senhas não conferem.');

rl.close();
const passwordHash = await hashPassword(senha);
if (existing) {
  await db.update(appUser).set({ passwordHash }).where(eq(appUser.id, existing.id));
  await deleteUserSessions(db, existing.id);
  console.log(`Senha de "${username}" trocada. As sessões abertas dessa conta foram encerradas.`);
} else {
  await db.insert(appUser).values({ username, passwordHash, role: role as 'admin' | 'operador' });
  console.log(`Conta "${username}" (${role}) criada.`);
}
await pool.end();
