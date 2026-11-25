import { describe, expect, it } from 'vitest';
import {
  emptyAddress,
  formatAddress,
  formatCPF,
  formatPhone,
  isValidCPF,
  isValidFullName,
  isValidPhone,
  validateAddress,
  validateCustomer,
  type Address,
} from './cliente';

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

  it('recusa dígitos a mais, mesmo que os 11 primeiros formem um CPF válido', () => {
    expect(isValidCPF('529.982.247-250')).toBe(false);
  });

  it('confere os dois dígitos verificadores, não só o último', () => {
    // O 1º dígito está errado (o certo é 2), mas o 2º confere com o errado.
    expect(isValidCPF('529.982.247-09')).toBe(false);
  });

  it('resto 10 vira dígito 0, em qualquer dos dois dígitos', () => {
    expect(isValidCPF('100.000.001-08')).toBe(true);
    expect(isValidCPF('100.000.028-10')).toBe(true);
  });

  it('formata enquanto digita', () => {
    expect(formatCPF('5299')).toBe('529.9');
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });

  it('ignora o que passa de 11 dígitos', () => {
    expect(formatCPF('529982247251')).toBe('529.982.247-25');
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
    // Fixo: o dígito depois do DDD precisa ser de 2 a 5, mesmo que outro dígito do número seja.
    expect(isValidPhone('(51) 1012-3456')).toBe(false);
    expect(isValidPhone('(51) 6012-3456')).toBe(false);
    expect(isValidPhone('0533334444')).toBe(false);
  });

  it('aceita os DDDs das pontas, 11 e 99', () => {
    expect(isValidPhone('(11) 98765-4321')).toBe(true);
    expect(isValidPhone('(99) 98765-4321')).toBe(true);
  });

  it('formata enquanto digita', () => {
    expect(formatPhone('51')).toBe('(51');
    expect(formatPhone('519952')).toBe('(51) 9952');
    expect(formatPhone('51995284226')).toBe('(51) 99528-4226');
    expect(formatPhone('5133334444')).toBe('(51) 3333-4444');
  });

  it('campo vazio fica vazio e o que passa de 11 dígitos é ignorado', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('519952842261')).toBe('(51) 99528-4226');
  });
});

describe('nome completo', () => {
  it('exige ao menos nome e sobrenome', () => {
    expect(isValidFullName('Ana')).toBe(false);
    expect(isValidFullName('  Ana   Souza ')).toBe(true);
    expect(isValidFullName('José da Silva')).toBe(true);
  });

  it('só conta palavras com letras', () => {
    expect(isValidFullName('Ana 123')).toBe(false);
    expect(isValidFullName('Ana 2ª')).toBe(true);
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

  it('o nome com exatamente 60 caracteres passa, e os espaços das pontas não contam', () => {
    const ok = { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(51) 99528-4226', note: '' };
    const nome60 = `Ana ${'a'.repeat(56)}`;
    expect(validateCustomer({ ...ok, name: nome60 })).toEqual({});
    expect(validateCustomer({ ...ok, name: `   ${nome60}   ` })).toEqual({});
  });
});

describe('endereço da tele-entrega (RN45)', () => {
  const endereco: Address = {
    street: 'Rua das Flores',
    number: '123',
    complement: 'ap 2',
    district: 'Centro',
    city: 'Xangri-lá',
    reference: 'perto da praça',
  };

  it('o endereço vazio tem todos os campos em branco', () => {
    expect(emptyAddress).toEqual({ street: '', number: '', complement: '', district: '', city: '', reference: '' });
  });

  it('diz ao cliente qual campo obrigatório falta, mesmo se só tem espaços', () => {
    expect(validateAddress(emptyAddress)).toEqual({
      street: 'Informe a rua.',
      number: 'Informe o número (ou "s/n").',
      district: 'Informe o bairro.',
      city: 'Informe a cidade.',
    });
    expect(validateAddress({ ...endereco, street: '   ' })).toEqual({ street: 'Informe a rua.' });
  });

  it('limita cada campo a 80 caracteres', () => {
    expect(validateAddress({ ...endereco, reference: 'a'.repeat(80) })).toEqual({});
    expect(validateAddress({ ...endereco, reference: 'a'.repeat(81) })).toEqual({ reference: 'Use até 80 caracteres.' });
  });

  it('tira os espaços das pontas de cada campo ao montar o texto', () => {
    const comEspacos = Object.fromEntries(Object.entries(endereco).map(([k, v]) => [k, ` ${v} `])) as unknown as Address;
    expect(formatAddress(comEspacos)).toBe('Rua das Flores, 123, ap 2 - Centro, Xangri-lá (ref.: perto da praça)');
    expect(formatAddress({ ...endereco, complement: '  ', reference: '  ' })).toBe('Rua das Flores, 123 - Centro, Xangri-lá');
  });
});
