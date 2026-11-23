import { searchEntries, type SearchEntry } from '@vanellis/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api } from './api';

// Busca no topo do painel (RF42; cenários C92, C93): acha uma tela, um bloco ou uma ação pelo
// nome ou pelo que ela faz, e os produtos pelo nome. Atalho: "/" em qualquer tela.

interface Entrada extends SearchEntry {
  soAdmin?: boolean;
}

/** Telas, blocos e ações do painel, com as palavras que a padaria usaria para procurar. */
const TELAS: Entrada[] = [
  { title: 'Início', section: 'Painel', href: '#inicio', keywords: 'resumo avisos começo' },
  {
    title: 'Pausar ou retomar pedidos',
    section: 'Início',
    href: '#inicio',
    keywords: 'parar fechar loja site pedidos lotado receber',
  },
  { title: 'Ocultar ou mostrar preços', section: 'Início', href: '#inicio', keywords: 'esconder valores preço' },
  { title: 'Revisões pendentes', section: 'Início', href: '#inicio', keywords: 'lembretes revisar conferir vencido' },
  {
    title: 'Lista de produtos',
    section: 'Produtos',
    href: '#produtos',
    keywords: 'disponibilidade esgotado acabou ligar desligar ordem excluir cardápio',
  },
  { title: 'Produtos sem código PDV', section: 'Produtos', href: '#produtos-sem-pdv', keywords: 'pdv código caixa' },
  { title: 'Categorias', section: 'Produtos', href: '#categorias', keywords: 'abas capa foto frase ordem' },
  {
    title: 'Cardápios especiais',
    section: 'Produtos › Categorias',
    href: '#categorias',
    keywords: 'natal ceia ano novo páscoa especial período ocultar',
  },
  { title: 'Novo produto', section: 'Produtos', href: '#produto/novo', keywords: 'cadastrar criar adicionar modelo' },
  { title: 'Preços', section: 'Produtos', href: '#precos', keywords: 'reajuste valor preço tabela pdv' },
  {
    title: 'Horário em vigor',
    section: 'Agenda',
    href: '#agenda/horario',
    keywords: 'horário funcionamento abrir fechar almoço intervalo semana',
  },
  {
    title: 'Próximas mudanças de horário',
    section: 'Agenda',
    href: '#agenda/mudancas',
    keywords: 'verão temporada programar temporário horário',
  },
  {
    title: 'Datas sem retirada',
    section: 'Agenda',
    href: '#agenda/bloqueadas',
    keywords: 'feriado folga bloquear fechado dia',
  },
  {
    title: 'Datas especiais',
    section: 'Agenda',
    href: '#agenda/especiais',
    keywords: 'natal ano novo véspera 24/12 31/12 combinar',
  },
  { title: 'Horários lotados', section: 'Agenda', href: '#agenda/lotados', keywords: 'lotou cheio produção fechar horário' },
  {
    title: 'Restrições de retirada',
    section: 'Agenda',
    href: '#agenda/restricoes',
    keywords: 'almoço a partir horário retirada',
  },
  { title: 'Antecedência e prazo', section: 'Agenda', href: '#agenda/regras', keywords: 'horas meses antes encomenda' },
  {
    title: 'Tele-entrega',
    section: 'Agenda',
    href: '#agenda/entrega',
    keywords: 'entrega delivery motoboy entregador endereço casa',
  },
  {
    title: 'Contatos e localização',
    section: 'Configurações',
    href: '#configuracoes',
    keywords: 'whatsapp instagram telefone endereço mapa maps',
  },
  {
    title: 'Mensagem do pedido',
    section: 'Configurações',
    href: '#configuracoes/mensagem',
    keywords: 'modelo texto whatsapp saudação',
  },
  {
    title: 'Frequência dos lembretes',
    section: 'Configurações',
    href: '#configuracoes/lembretes',
    keywords: 'lembretes revisão dias',
  },
  { title: 'Contas', section: 'Configurações', href: '#contas', keywords: 'senha usuário operador acesso', soAdmin: true },
];

export function BuscaPainel({ admin }: { admin: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [produtos, setProdutos] = useState<Entrada[]>([]);
  const carregou = useRef(false);

  // "/" em qualquer tela põe o cursor na busca, como em muitos sites.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key !== '/' || alvo.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Os produtos entram na busca na primeira vez que ela é usada (C93). */
  const carregarProdutos = () => {
    if (carregou.current) return;
    carregou.current = true;
    api
      .produtos()
      .then((ps) => setProdutos(ps.map((p) => ({ title: p.name, section: 'Produto', href: `#produto/${p.id}` }))))
      .catch(() => {
        carregou.current = false;
      });
  };

  const entradas = [...TELAS.filter((t) => admin || !t.soAdmin), ...produtos];
  const resultados = searchEntries(entradas, texto);
  const mostrar = aberta && texto.trim().length > 0;

  const ir = (e: Entrada) => {
    // Mesma tela e mesmo bloco: rola de novo até ele.
    if (window.location.hash === e.href) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else window.location.hash = e.href;
    setTexto('');
    setAberta(false);
    input.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberta(true);
      setAtivo((a) => Math.min(a + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = resultados[ativo];
      if (r) ir(r);
    } else if (e.key === 'Escape') {
      setTexto('');
      setAberta(false);
      input.current?.blur();
    }
  };

  return (
    <div className="busca" role="search">
      <svg className="busca__icone" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        type="search"
        className="busca__input"
        placeholder="Buscar no painel (ex: feriado, coxinha)"
        aria-label="Buscar uma tela, ação ou produto do painel"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && resultados[ativo] ? `${id}-${ativo}` : undefined}
        value={texto}
        onFocus={() => {
          carregarProdutos();
          setAberta(true);
        }}
        onBlur={() => setAberta(false)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAtivo(0);
          setAberta(true);
        }}
        onKeyDown={onKeyDown}
      />
      {mostrar && (
        <ul id={`${id}-lista`} className="busca__lista" role="listbox" aria-label="Resultados da busca">
          {resultados.length === 0 ? (
            <li className="busca__vazio" role="option" aria-disabled="true" aria-selected="false">
              Nada encontrado para “{texto.trim()}”.
            </li>
          ) : (
            resultados.map((r, i) => (
              <li
                key={`${r.href}-${r.title}`}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === ativo}
                className={i === ativo ? 'busca__item busca__item--ativo' : 'busca__item'}
                // mousedown, e não click: acontece antes de o campo perder o foco e fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  ir(r);
                }}
                onMouseEnter={() => setAtivo(i)}
              >
                <span className="busca__titulo">{r.title}</span>
                <span className="busca__secao">{r.section}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
