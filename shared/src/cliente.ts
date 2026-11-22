// Dados do cliente no checkout (RN02): validados no navegador e nunca guardados.

export interface CustomerData {
  name: string;
  cpf: string;
  phone: string;
  note: string;
}

export const NAME_MAX_LENGTH = 60;
export const NOTE_MAX_LENGTH = 200;

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** CPF com 11 dígitos e dígitos verificadores corretos. */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

/** Telefone com DDD: fixo com 10 dígitos ou celular com 11 começando por 9. */
export function isValidPhone(value: string): boolean {
  const phone = onlyDigits(value);
  const ddd = Number(phone.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (phone.length === 11) return phone[2] === '9';
  return phone.length === 10 && /[2-5]/.test(phone[2] ?? '');
}

/** Nome completo: ao menos duas palavras com letras. */
export function isValidFullName(value: string): boolean {
  return value.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length >= 2;
}

/** "123.456.789-09" enquanto digita. */
export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** "(51) 99528-4226" ou "(51) 3333-4444" enquanto digita. */
export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (rest.length <= 4) return ddd + rest;
  const split = d.length === 11 ? 5 : 4;
  return `${ddd}${rest.slice(0, split)}-${rest.slice(split)}`;
}

export type CustomerErrors = Partial<Record<keyof CustomerData, string>>;

export function validateCustomer(data: CustomerData): CustomerErrors {
  const errors: CustomerErrors = {};
  if (data.name.trim().length > NAME_MAX_LENGTH) errors.name = `Use até ${NAME_MAX_LENGTH} caracteres.`;
  else if (!isValidFullName(data.name)) errors.name = 'Informe nome e sobrenome.';
  if (!isValidCPF(data.cpf)) errors.cpf = 'CPF inválido.';
  if (!isValidPhone(data.phone)) errors.phone = 'Informe o telefone com DDD.';
  if (data.note.length > NOTE_MAX_LENGTH) errors.note = `Use até ${NOTE_MAX_LENGTH} caracteres.`;
  return errors;
}
