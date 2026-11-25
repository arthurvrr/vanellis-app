// Tratamento de texto usado por várias regras: o único lugar dessas funções.

/** Sem acentos e em minúsculas, para comparar nomes ("Pães" casa com "paes"). */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Só os dígitos: '(51) 99528-4226' → '51995284226'. */
export const onlyDigits = (s: string) => s.replace(/\D/g, '');
