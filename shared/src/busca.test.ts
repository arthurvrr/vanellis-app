// Cenários C92, C93 (etapa 7): busca do painel.
import { describe, expect, it } from 'vitest';
import { searchEntries } from './busca';

const entries = [
  { title: 'Datas sem retirada', section: 'Agenda', href: '#agenda/bloqueadas', keywords: 'feriado folga bloquear' },
  { title: 'Horário em vigor', section: 'Agenda', href: '#agenda/horario', keywords: 'funcionamento almoço' },
  { title: 'Preços', section: 'Produtos', href: '#precos', keywords: 'reajuste valor' },
  { title: 'Coxinha', section: 'Produto', href: '#produto/2' },
  { title: 'Torta de Nozes', section: 'Produto', href: '#produto/38' },
];
const titulos = (q: string) => searchEntries(entries, q).map((e) => e.title);

describe('searchEntries', () => {
  it('C92: acha a tela pelo que ela faz, sem acento nem maiúsculas', () => {
    expect(titulos('feriado')).toEqual(['Datas sem retirada']);
    expect(titulos('HORARIO')).toEqual(['Horário em vigor']);
    expect(titulos('preco')).toEqual(['Preços']);
  });
  it('C93: acha produto; todas as palavras precisam aparecer', () => {
    expect(titulos('coxinha')).toEqual(['Coxinha']);
    expect(titulos('torta nozes')).toEqual(['Torta de Nozes']);
    expect(titulos('torta coxinha')).toEqual([]);
  });
  it('o título que começa pelo texto vem primeiro', () => {
    expect(titulos('agenda')[0]).toBe('Datas sem retirada');
    expect(searchEntries([...entries, { title: 'Agenda', section: 'Agenda', href: '#agenda' }], 'agenda')[0]!.title).toBe(
      'Agenda',
    );
  });
  it('vazio não lista nada', () => {
    expect(titulos('   ')).toEqual([]);
  });
});
