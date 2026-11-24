// Validação e normalização das configurações editadas no painel (RF23, RF34).
// Campos vazios viram `null` (o atalho some do site).

import { DEFAULT_MESSAGE_TEMPLATE, messageTemplateProblem, REMINDERS, reminderDaysProblem } from '@vanellis/shared';
import { z } from 'zod';

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Telefone brasileiro em qualquer formato → só dígitos com DDI 55 (ex: 5551995284226). */
const phone = (what: string) =>
  // Stryker disable next-line MethodExpression: sem o trim dá no mesmo, só os dígitos ficam.
  z
    .string()
    .trim()
    .transform((v) => {
      const d = v.replace(/\D/g, '');
      return d.length === 10 || d.length === 11 ? `55${d}` : d;
    })
    .refine((d) => /^55[1-9][0-9][0-9]{8,9}$/.test(d), `${what}: informe DDD e número, ex: (51) 99528-4226`);

const httpsUrl = (what: string, hosts: RegExp, example: string) =>
  z
    .string()
    .trim()
    .max(500, `${what}: link longo demais`)
    .refine((v) => {
      if (!URL.canParse(v)) return false;
      const u = new URL(v);
      return u.protocol === 'https:' && hosts.test(u.hostname);
    }, `${what}: cole o link completo, ex: ${example}`);

/** "@perfil" ou "perfil" vira o link do Instagram. */
const instagram = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    const handle = t.replace(/^@/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : t;
  },
  httpsUrl('Instagram', /^(www\.)?instagram\.com$/, 'https://www.instagram.com/padaria/'),
);

export const settingsPatch = z
  .object({
    whatsappNumber: phone('WhatsApp dos pedidos'),
    contactPhone: z.preprocess(blankToNull, phone('Telefone').nullable()),
    instagramUrl: z.preprocess(blankToNull, instagram.nullable()),
    address: z.preprocess(blankToNull, z.string().trim().max(200, 'Endereço: até 200 caracteres').nullable()),
    mapsUrl: z.preprocess(
      blankToNull,
      httpsUrl(
        'Link do Google Maps',
        /^((www|maps)\.google\.com(\.br)?|maps\.app\.goo\.gl|goo\.gl)$/,
        'https://maps.app.goo.gl/...',
      ).nullable(),
    ),
    // Modelo da mensagem (RF23, C84–C87): vazio ou igual ao padrão = `null` (usa o padrão).
    messageTemplate: z
      .string()
      .nullable()
      .transform((v) => (v === null || !v.trim() || v.trim() === DEFAULT_MESSAGE_TEMPLATE ? null : v.replace(/\r\n/g, '\n').trimEnd()))
      .superRefine((v, ctx) => {
        const problem = v === null ? null : messageTemplateProblem(v);
        // Stryker disable next-line StringLiteral: o código do erro é interno do zod; a API só devolve a mensagem.
        if (problem) ctx.addIssue({ code: 'custom', message: problem });
      }),
  })
  .partial()
  .strict();

/** Frequência de cada lembrete de revisão (RF37, C88). */
export const remindersPatch = z
  .object(
    Object.fromEntries(
      REMINDERS.map((r) => [
        r.kind,
        z.number().superRefine((d, ctx) => {
          const problem = reminderDaysProblem(d);
          // Stryker disable next-line StringLiteral: o código do erro é interno do zod; a API só devolve a mensagem.
          if (problem) ctx.addIssue({ code: 'custom', message: `${r.label}: ${problem.toLowerCase()}` });
        }),
      ]),
    ),
  )
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatch>;
