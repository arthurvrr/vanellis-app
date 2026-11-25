// Busca do painel (RF42; cenários C92, C93): acha telas, ações e produtos pelo nome ou pelo
// que fazem ("feriado" acha "Datas sem retirada"), sem diferenciar acentos nem maiúsculas.

export interface SearchEntry {
  title: string;
  /** Onde fica: "Agenda", "Produto"... */
  section: string;
  href: string;
  /** Palavras que levam até a entrada sem estar no título. */
  keywords?: string;
}

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Entradas em que aparecem todas as palavras digitadas (no título, na seção ou nas palavras-
 * chave). Primeiro as que começam pelo texto digitado, depois as que o têm no título.
 */
export function searchEntries<T extends SearchEntry>(entries: T[], query: string, limit = 8): T[] {
  // Stryker disable next-line Regex: equivalente, o filter(Boolean) descarta os vazios de espaços repetidos
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  const scored = entries
    .map((e) => {
      const title = normalize(e.title);
      const all = `${title} ${normalize(e.section)} ${normalize(e.keywords ?? '')}`;
      if (!words.every((w) => all.includes(w))) return null;
      const score = title.startsWith(q) ? 0 : title.includes(q) ? 1 : words.every((w) => title.includes(w)) ? 2 : 3;
      return { e, score };
    })
    .filter((x): x is { e: T; score: number } => x !== null);
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.e);
}
