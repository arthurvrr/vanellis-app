import { describe, expect, it } from 'vitest';
import { formatCPF, formatPhone, isValidCPF, isValidFullName, isValidPhone, validateCustomer } from './cliente';

describe('CPF', () => {
  it('aceita CPF com dígitos verificadores corretos, com ou sem máscara', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });

  it('recusa dígito errado, tamanho errado e números repetidos', () => {
    expect(isValidCPF('529.982.247-24')).toBe(false);
    expect(isValidCPF('5299822472')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
  });

  it('formata enquanto digita', () => {
    expect(formatCPF('5299')).toBe('529.9');
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });
});

describe('telefone com DDD', () => {
  it('aceita celular com 11 dígitos e fixo com 10', () => {
    expect(isValidPhone('(51) 99528-4226')).toBe(true);
    expect(isValidPhone('5133334444')).toBe(true);
  });

  it('recusa sem DDD, celular sem o 9 e DDD inexistente', () => {
    expect(isValidPhone('99528-4226')).toBe(false);
    expect(isValidPhone('51895284226')).toBe(false);
    expect(isValidPhone('0533334444')).toBe(false);
  });

  it('formata enquanto digita', () => {
    expect(formatPhone('51')).toBe('(51');
    expect(formatPhone('519952')).toBe('(51) 9952');
    expect(formatPhone('51995284226')).toBe('(51) 99528-4226');
    expect(formatPhone('5133334444')).toBe('(51) 3333-4444');
  });
});

describe('nome completo', () => {
  it('exige ao menos nome e sobrenome', () => {
    expect(isValidFullName('Ana')).toBe(false);
    expect(isValidFullName('  Ana   Souza ')).toBe(true);
    expect(isValidFullName('José da Silva')).toBe(true);
  });
});

describe('validateCustomer', () => {
  it('aponta cada campo inválido e nada quando está tudo certo', () => {
    expect(validateCustomer({ name: 'Ana', cpf: '1', phone: '1', note: '' })).toEqual({
      name: 'Informe nome e sobrenome.',
      cpf: 'CPF inválido.',
      phone: 'Informe o telefone com DDD.',
    });
    expect(
      validateCustomer({ name: 'Ana Souza', cpf: '529.982.247-25', phone: '(51) 99528-4226', note: '' }),
    ).toEqual({});
  });

  it('limita o nome a 60 caracteres e a observação a 200', () => {
    const ok = { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(51) 99528-4226', note: '' };
    expect(validateCustomer({ ...ok, name: `Ana ${'a'.repeat(57)}` })).toEqual({ name: 'Use até 60 caracteres.' });
    expect(validateCustomer({ ...ok, note: 'a'.repeat(200) })).toEqual({});
    expect(validateCustomer({ ...ok, note: 'a'.repeat(201) })).toEqual({ note: 'Use até 200 caracteres.' });
  });
});
