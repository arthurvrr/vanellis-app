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

describe('searchEntries: ordem e limite', () => {
  const e = (title: string, section = 'Produto', keywords?: string) => ({ title, section, href: '#', keywords });

  it('ordena: começa pelo texto, contém o texto, tem todas as palavras, só nas palavras-chave', () => {
    const lista = [
      e('Bolo', 'Produto', 'torta doce'),
      e('Doce torta de nozes'),
      e('Mini torta doce'),
      e('Torta doce'),
    ];
    expect(searchEntries(lista, 'torta doce').map((x) => x.title)).toEqual([
      'Torta doce',
      'Mini torta doce',
      'Doce torta de nozes',
      'Bolo',
    ]);
  });

  it('título com só parte das palavras fica junto com quem só casa nas palavras-chave', () => {
    const lista = [e('Torta salgada', 'Produto', 'doce'), e('Doce torta de nozes')];
    expect(searchEntries(lista, 'torta doce').map((x) => x.title)).toEqual(['Doce torta de nozes', 'Torta salgada']);
  });

  it('mantém a ordem original entre entradas empatadas', () => {
    const lista = [e('Torta B'), e('Torta A'), e('Torta C')];
    expect(searchEntries(lista, 'torta').map((x) => x.title)).toEqual(['Torta B', 'Torta A', 'Torta C']);
  });

  it('acha pela seção e junta espaços repetidos da busca', () => {
    expect(searchEntries([e('Coxinha', 'Salgados')], 'salgados').map((x) => x.title)).toEqual(['Coxinha']);
    expect(searchEntries([e('Torta de Nozes')], '  torta   de  ').map((x) => x.title)).toEqual(['Torta de Nozes']);
  });

  it('entrada sem palavras-chave só casa pelo título e pela seção', () => {
    expect(searchEntries([e('Pudim', 'Doce'), e('Coxinha', 'Salgados')], 'a').map((x) => x.title)).toEqual(['Coxinha']);
  });

  it('não junta palavras de campos diferentes', () => {
    // "Coxinha" + "Produto" não pode virar "coxinhaproduto".
    expect(searchEntries([e('Coxinha')], 'coxinhaproduto')).toEqual([]);
  });

  it('devolve no máximo 8 entradas, ou o limite pedido', () => {
    const lista = Array.from({ length: 10 }, (_, i) => e(`Torta ${i}`));
    expect(searchEntries(lista, 'torta')).toHaveLength(8);
    expect(searchEntries(lista, 'torta', 3).map((x) => x.title)).toEqual(['Torta 0', 'Torta 1', 'Torta 2']);
  });
});
