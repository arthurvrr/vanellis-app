// Utilitários de texto (texto.ts): o único lugar de tirar acentos e de tirar não-dígitos.
import { describe, expect, it } from 'vitest';
import { normalize, onlyDigits } from './texto';

describe('normalize', () => {
  it('tira acentos e deixa em minúsculas', () => {
    expect(normalize('Ação PÃO Pé')).toBe('acao pao pe');
    expect(normalize('Pães de Queijo')).toBe('paes de queijo');
  });
});

describe('onlyDigits', () => {
  it('fica só com os dígitos', () => {
    expect(onlyDigits('(51) 99528-4226')).toBe('51995284226');
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
    expect(onlyDigits('sem número')).toBe('');
  });
});
