import { instanteBrasilia, REMINDERS, reminderStatus, type ReminderKind, type ReminderWithStatus } from '@vanellis/shared';
import { Router } from 'express';
import type { DB } from '../../db/client';
import { inTransaction } from '../../db/transacao';
import { requireUser, type SessionUser } from '../acesso/sessao';
import { registrarAcao } from '../avisos/registro';
import { getSettings, toPublicSettings } from './repository';
import { reviewReminder, storeSettings } from './schema';
import { remindersPatch, settingsPatch } from './validacao';

// Configurações que o site público usa: WhatsApp dos pedidos, contatos e localização.
export function configuracoesRouter(db: DB) {
  const router = Router();
  router.get('/publicas', async (_req, res) => {
    const row = await getSettings(db);
    if (!row) {
      res.status(503).json({ error: 'Configurações da loja não cadastradas' });
      return;
    }
    res.json(toPublicSettings(row));
  });
  return router;
}

/** Os três lembretes, na ordem da tela, com a situação de hoje; um que falte no banco vem com o padrão. */
export async function listReminders(db: DB, today: string): Promise<ReminderWithStatus[]> {
  const rows = await db.select().from(reviewReminder);
  return REMINDERS.map((r) => {
    const row = rows.find((x) => x.kind === r.kind);
    const dto = { kind: r.kind, everyDays: row?.everyDays ?? r.defaultDays, lastReviewed: row?.lastReviewed ?? null };
    return { ...dto, status: reminderStatus(dto, today) };
  });
}

// Tela Configurações do painel (RF23, RF34, RF37). O operador muda contatos e localização; o
// número que recebe os pedidos só o superusuário muda (RN54).
/** `today` devolve 'AAAA-MM-DD' no horário de Brasília (fixo nos testes). */
export function configuracoesPainelRouter(db: DB, now: () => string) {
  const today = () => now().slice(0, 10);
  const router = Router();
  router.use(requireUser(db));

  router.get('/', async (_req, res) => {
    const row = await getSettings(db);
    if (!row) {
      res.status(503).json({ error: 'Configurações da loja não cadastradas' });
      return;
    }
    res.json(toPublicSettings(row));
  });

  router.put('/', async (req, res) => {
    const parsed = settingsPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }
    const user = res.locals.user as SessionUser;
    if (parsed.data.whatsappNumber !== undefined && user.role !== 'admin') {
      res.status(403).json({ error: 'Só o superusuário pode trocar o WhatsApp que recebe os pedidos' });
      return;
    }
    if (Object.keys(parsed.data).length) await db.update(storeSettings).set(parsed.data);
    const row = await getSettings(db);
    res.json(row ? toPublicSettings(row) : null);
  });

  // Frequência dos lembretes de revisão (RF37, C88).
  router.get('/lembretes', async (_req, res) => {
    res.json(await listReminders(db, today()));
  });
  // Marcar como revisado: o prazo recomeça hoje (RN35, RF36, C90).
  router.post('/lembretes/:kind/revisado', async (req, res) => {
    const kind = req.params.kind as ReminderKind;
    const def = REMINDERS.find((r) => r.kind === kind);
    if (!def) {
      res.status(404).json({ error: 'Lembrete não encontrado' });
      return;
    }
    // Insere ou atualiza num comando só (G10), e a revisão entra no histórico de avisos junto (RF68).
    await inTransaction(db, async (tx) => {
      await tx
        .insert(reviewReminder)
        .values({ kind, everyDays: def.defaultDays, lastReviewed: today() })
        .onConflictDoUpdate({ target: reviewReminder.kind, set: { lastReviewed: today() } });
      await registrarAcao(tx, {
        tipo: 'revisao-marcada',
        chave: `revisao-marcada:${kind}`,
        titulo: `Revisão de ${def.label.toLowerCase()} marcada`,
        conta: (res.locals.user as SessionUser).username,
        agora: new Date(instanteBrasilia(now())),
      });
    });
    res.json(await listReminders(db, today()));
  });
  router.put('/lembretes', async (req, res) => {
    const parsed = remindersPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
      return;
    }
    // Todos os lembretes mudados juntos, ou nenhum (G10).
    await inTransaction(db, async (tx) => {
      for (const [kind, everyDays] of Object.entries(parsed.data) as [ReminderKind, number][]) {
        await tx
          .insert(reviewReminder)
          .values({ kind, everyDays })
          .onConflictDoUpdate({ target: reviewReminder.kind, set: { everyDays } });
      }
    });
    res.json(await listReminders(db, today()));
  });

  return router;
}
