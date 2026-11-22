import {
  availableDays,
  nowInBrasilia,
  type AgendaDTO,
  type CatalogoDTO,
  type DemoData,
  type PublicSettingsDTO,
} from '@vanellis/shared';
import { IS_DEMO } from './demo';

async function getJSON<T>(url: string, what: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha ao carregar ${what} (${res.status})`);
  return res.json() as Promise<T>;
}

// Na versão de teste os dados vêm do JSON exportado. A comparação com MODE fica aqui, literal,
// para o build normal descartar o JSON (o Vite troca MODE pelo texto do modo).
let demoData: Promise<DemoData> | null = null;
const demo = (): Promise<DemoData> =>
  import.meta.env.MODE === 'demo'
    ? (demoData ??= import('../demo/dados.json').then((m) => m.default as unknown as DemoData))
    : Promise.reject(new Error('Dados de teste fora da versão de teste'));

export function fetchCatalogo(): Promise<CatalogoDTO> {
  if (IS_DEMO) return demo().then((d) => d.catalogo);
  return getJSON('/api/catalogo', 'o cardápio');
}

/** Dias e faixas de retirada para os produtos do carrinho (RF05). */
export async function fetchDisponibilidade(productIds: number[], signal?: AbortSignal): Promise<AgendaDTO> {
  if (IS_DEMO) {
    const { catalogo, agenda } = await demo();
    const ids = new Set(productIds);
    const lead = Math.max(0, ...catalogo.produtos.filter((p) => ids.has(p.id)).map((p) => p.leadTimeHours ?? 0));
    return {
      paused: agenda.paused,
      leadHours: Math.max(agenda.input.minLeadHours, lead),
      days: agenda.paused ? [] : availableDays(agenda.input, nowInBrasilia(), lead),
    };
  }
  const ids = [...new Set(productIds)].sort((a, b) => a - b).join(',');
  return getJSON(`/api/agenda/disponibilidade?produtos=${ids}`, 'os horários de retirada', signal);
}

/** Configurações carregadas uma vez por visita: cabeçalho, rodapé e envio usam as mesmas. */
let settingsOnce: Promise<PublicSettingsDTO> | null = null;
export function loadSettings(): Promise<PublicSettingsDTO> {
  settingsOnce ??= fetchConfiguracoes().catch((e: unknown) => {
    settingsOnce = null; // tenta de novo na próxima vez
    throw e;
  });
  return settingsOnce;
}

/** WhatsApp que recebe os pedidos e atalhos de contato (RF23, RF34). */
export function fetchConfiguracoes(signal?: AbortSignal): Promise<PublicSettingsDTO> {
  if (IS_DEMO) return demo().then((d) => d.configuracoes);
  return getJSON('/api/configuracoes/publicas', 'as configurações da loja', signal);
}
