// G10: operações em várias etapas gravam tudo ou nada. Cada cenário instala um gatilho no banco
// de teste que faz uma das etapas falhar no meio e confere que o estado anterior continua valendo.

import { sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { userSession } from '../modules/acesso/schema';
import { resetAttempts } from '../modules/acesso/tentativas';
import { category, product } from '../modules/catalogo/schema';
import { reviewReminder, storeSettings } from '../modules/configuracoes/schema';
import { openingHours, weeklySchedule } from '../modules/agenda/schema';
import { startTestApp } from '../test/app';

const NOW = '2026-11-22T10:00';
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
let admin: ReturnType<typeof app.browser>;

const SEMANA = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '07:30', close: '19:00' }));
// Horário que o gatilho recusa: a gravação falha no meio, depois que as etapas anteriores rodaram.
const RECUSADO = { weekday: 6, open: '07:30', close: '23:59' };

beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
  await app.db.execute(sql`
    create function falha_simulada() returns trigger language plpgsql as $$
    begin raise exception 'falha simulada no meio da gravação (G10)'; end $$`);
  op = app.browser();
  admin = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
  await admin('POST', '/api/auth/login', { usuario: 'arthur', senha: 'senha-admin' });
});
afterAll(() => app.stop());

let contador = 0;
/** Faz a gravação em `tabela` falhar (`quando` = condição sobre new/old, padrão: sempre). */
async function falharEm(tabela: PgTable, evento: 'insert' | 'update' | 'delete', quando: SQL = sql`true`) {
  const nome = sql.identifier(`falha_${++contador}`);
  await app.db.execute(
    sql`create trigger ${nome} before ${sql.raw(evento)} on ${tabela} for each row when (${quando}) execute function falha_simulada()`,
  );
  return async () => {
    await app.db.execute(sql`drop trigger ${nome} on ${tabela}`);
  };
}
let desfazer: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of desfazer) await d();
  desfazer = [];
});
const falha = async (...args: Parameters<typeof falharEm>) => desfazer.push(await falharEm(...args));

describe('Agenda', () => {
  beforeEach(async () => {
    await app.db.delete(openingHours);
    await app.db.delete(weeklySchedule);
    await op('PUT', '/api/painel/agenda/horario-atual', { hours: SEMANA });
  });

  it('falha ao gravar o horário novo: o horário anterior continua valendo', async () => {
    await falha(openingHours, 'insert', sql`new.close_time = '23:59'`);
    const res = await op('PUT', '/api/painel/agenda/horario-atual', { hours: [...SEMANA.slice(0, 6), RECUSADO] });
    expect(res.status).toBe(500);
    const agenda = (await op('GET', '/api/painel/agenda')).body;
    expect(agenda.current.hours).toEqual(SEMANA);
  });

  it('falha ao gravar os horários de uma mudança programada: a mudança não fica cadastrada sem horário', async () => {
    await falha(openingHours, 'insert', sql`new.close_time = '23:59'`);
    const res = await op('POST', '/api/painel/agenda/mudancas', {
      validFrom: '2026-12-01',
      hours: [...SEMANA.slice(0, 6), RECUSADO],
    });
    expect(res.status).toBe(500);
    expect((await op('GET', '/api/painel/agenda')).body.upcoming).toEqual([]);
  });

  it('falha ao gravar o horário da primeira vez: não fica um horário vazio em vigor', async () => {
    await app.db.delete(openingHours);
    await app.db.delete(weeklySchedule);
    await falha(openingHours, 'insert', sql`new.close_time = '23:59'`);
    expect((await op('PUT', '/api/painel/agenda/horario-atual', { hours: [RECUSADO] })).status).toBe(500);
    expect((await op('GET', '/api/painel/agenda')).body.current).toBeNull();
  });
});

describe('Troca de senha do operador', () => {
  beforeEach(() => resetAttempts());

  it('falha ao encerrar as sessões: a senha antiga continua valendo, nada pela metade', async () => {
    await falha(userSession, 'delete');
    const res = await admin('PUT', '/api/auth/operador/senha', { senha: 'senha-nova-123' });
    expect(res.status).toBe(500);
    // Sem transação, a senha já teria mudado e as sessões antigas seguiriam abertas.
    expect((await app.browser()('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' })).status).toBe(200);
  });
});

describe('Status do painel', () => {
  it('falha ao ocultar os preços: a pausa dos pedidos pedida junto também não vale', async () => {
    await falha(storeSettings, 'update');
    const res = await op('PUT', '/api/painel/status', { ordersPaused: true, pricesHidden: true });
    expect(res.status).toBe(500);
    expect((await op('GET', '/api/painel/status')).body).toMatchObject({ ordersPaused: false, pricesHidden: false });
  });
});

describe('Lembretes de revisão', () => {
  beforeEach(async () => {
    await app.db.delete(reviewReminder);
  });

  it('falha no segundo lembrete: o primeiro não muda sozinho', async () => {
    await falha(reviewReminder, 'insert', sql`new.every_days = 20`);
    await falha(reviewReminder, 'update', sql`new.every_days = 20`);
    const res = await op('PUT', '/api/painel/configuracoes/lembretes', { cardapio: 10, horario: 20 });
    expect(res.status).toBe(500);
    expect(await app.db.select().from(reviewReminder)).toEqual([]);
  });

  it('grava e depois altera a frequência (insere se faltar, atualiza se existir)', async () => {
    await op('PUT', '/api/painel/configuracoes/lembretes', { cardapio: 10 });
    const res = await op('PUT', '/api/painel/configuracoes/lembretes', { cardapio: 12, horario: 20 });
    expect(res.status).toBe(200);
    const linhas = await app.db.select().from(reviewReminder);
    expect(linhas.map((l) => [l.kind, l.everyDays]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['cardapio', 12],
      ['horario', 20],
    ]);
  });

  it('marcar como revisado mantém a frequência já escolhida', async () => {
    await op('PUT', '/api/painel/configuracoes/lembretes', { precos: 45 });
    await op('POST', '/api/painel/configuracoes/lembretes/precos/revisado', {});
    const [linha] = await app.db.select().from(reviewReminder);
    expect(linha).toMatchObject({ kind: 'precos', everyDays: 45, lastReviewed: '2026-11-22' });
  });
});

describe('Duplicar produto', () => {
  it('falha ao pôr a cópia na posição certa: nenhuma cópia fica criada', async () => {
    await app.db.delete(product);
    await app.db.delete(category);
    const [cat] = await app.db.insert(category).values({ name: 'Pães', slug: 'paes', position: 0 }).returning();
    const [orig] = await app.db
      .insert(product)
      .values({ categoryId: cat!.id, name: 'Pão de Queijo', saleUnit: 'UN', basePrice: '1.00', position: 0 })
      .returning();
    await falha(product, 'update', sql`new.position <> old.position`);
    const res = await op('POST', `/api/painel/catalogo/produtos/${orig!.id}/duplicar`, {});
    expect(res.status).toBe(500);
    expect(await app.db.select({ id: product.id }).from(product)).toEqual([{ id: orig!.id }]);
  });
});
