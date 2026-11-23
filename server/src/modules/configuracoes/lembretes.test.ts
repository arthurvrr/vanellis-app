// Cenários C89–C91 (etapa 7): lembretes vencidos e "revisado". "Hoje" muda em cada teste.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp } from '../../test/app';
import { reviewReminder } from './schema';

let now = '2026-11-23T10:00';
let app: Awaited<ReturnType<typeof startTestApp>>;
let op: ReturnType<typeof app.browser>;
beforeAll(async () => {
  app = await startTestApp({ now: () => now });
  op = app.browser();
  await op('POST', '/api/auth/login', { usuario: 'padaria', senha: 'senha-operador' });
});
afterAll(() => app.stop());
beforeEach(async () => {
  now = '2026-11-23T10:00';
  await app.db.update(reviewReminder).set({ lastReviewed: '2026-11-23' });
});

type L = { kind: string; status: { due: boolean; days: number; dueDate: string } };
const lembretes = async (): Promise<L[]> => (await op('GET', '/api/painel/configuracoes/lembretes')).body;
const precos = async () => (await lembretes()).find((l) => l.kind === 'precos')!;

describe('Lembretes de revisão', () => {
  it('C91: revisados hoje, nada vencido; o próximo é o do cardápio', async () => {
    const l = await lembretes();
    expect(l.every((x) => !x.status.due)).toBe(true);
    expect(l.find((x) => x.kind === 'cardapio')!.status.dueDate).toBe('2026-11-30');
  });

  it('C89: preços revisados há 31 dias aparecem vencidos há 1 dia', async () => {
    now = '2026-12-24T10:00';
    expect((await precos()).status).toMatchObject({ due: true, days: 1 });
  });

  it('C90: marcar como revisado recomeça o prazo a partir de hoje', async () => {
    now = '2026-12-24T10:00';
    const r = await op('POST', '/api/painel/configuracoes/lembretes/precos/revisado', {});
    expect(r.status).toBe(200);
    expect((await precos()).status).toMatchObject({ due: false, dueDate: '2027-01-23', days: 30 });
    expect((await op('POST', '/api/painel/configuracoes/lembretes/outro/revisado', {})).status).toBe(404);
  });

  it('exige login', async () => {
    expect((await app.browser()('POST', '/api/painel/configuracoes/lembretes/precos/revisado', {})).status).toBe(401);
  });
});
