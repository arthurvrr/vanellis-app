// Conversões entre o formato do banco e o da aplicação: o único lugar dessas regras.
// O PostgreSQL devolve `numeric` como texto (para não perder precisão) e `time` com segundos.

/** `numeric` do banco ('12.50') → número; null continua null. */
export const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** Valor em reais → `numeric` com 2 casas ('12.50'); sem valor → null. */
export const money = (v: number | null | undefined): string | null => (v == null ? null : v.toFixed(2));

/** Peso em kg → `numeric` com 3 casas ('1.250'); sem valor → null. */
export const kg = (v: number | null | undefined): string | null => (v == null ? null : v.toFixed(3));

/** `time` do banco ('07:30:00') → 'HH:MM'. */
export const hm = (t: string): string => t.slice(0, 5);
