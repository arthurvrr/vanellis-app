import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Sessao } from './api';
import { Agenda } from './Agenda';
import { Configuracoes } from './Configuracoes';
import { Contas } from './Contas';
import { Inicio } from './Inicio';
import { Login } from './Login';
import { Produtos } from './Produtos';

type Tela = 'inicio' | 'produtos' | 'agenda' | 'configuracoes' | 'contas';

interface SubItem {
  nome: string;
  href: string;
  soAdmin?: boolean;
}
interface Secao {
  id: 'inicio' | 'produtos' | 'agenda' | 'configuracoes';
  nome: string;
  href: string;
  icone: ReactNode;
  itens?: SubItem[];
}

const Icone = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Barra lateral: grandes seções e, dentro de cada uma, as configurações específicas. As
// próximas telas do doc (Preços, Cardápios especiais, Tele-entrega...) entram aqui.
const SECOES: Secao[] = [
  {
    id: 'inicio',
    nome: 'Início',
    href: '#inicio',
    icone: <Icone d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    id: 'produtos',
    nome: 'Produtos',
    href: '#produtos',
    icone: <Icone d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10" />,
    itens: [
      { nome: 'Lista de produtos', href: '#produtos' },
      { nome: 'Categorias', href: '#categorias' },
      { nome: 'Novo produto', href: '#produto/novo' },
    ],
  },
  {
    id: 'agenda',
    nome: 'Agenda',
    href: '#agenda',
    icone: <Icone d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
    itens: [
      { nome: 'Horário em vigor', href: '#agenda/horario' },
      { nome: 'Próximas mudanças', href: '#agenda/mudancas' },
      { nome: 'Datas sem retirada', href: '#agenda/bloqueadas' },
      { nome: 'Datas especiais', href: '#agenda/especiais' },
      { nome: 'Horários lotados', href: '#agenda/lotados' },
      { nome: 'Restrições de retirada', href: '#agenda/restricoes' },
      { nome: 'Antecedência e prazo', href: '#agenda/regras' },
    ],
  },
  {
    id: 'configuracoes',
    nome: 'Configurações',
    href: '#configuracoes',
    icone: (
      <Icone d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    ),
    itens: [
      { nome: 'Contatos e localização', href: '#configuracoes' },
      { nome: 'Contas', href: '#contas', soAdmin: true },
    ],
  },
];

/** Tela pelo endereço: '#agenda/especiais' → agenda; '#categorias' e '#produto/12' → produtos. */
function telaDoEndereco(): Tela {
  const h = window.location.hash.slice(1);
  const base = h.split('/')[0];
  if (base === 'produto' || base === 'categorias' || base === 'produtos-sem-pdv') return 'produtos';
  if (['inicio', 'produtos', 'agenda', 'configuracoes', 'contas'].includes(base!)) return base as Tela;
  return 'inicio';
}

const secaoDaTela = (t: Tela): Secao['id'] => (t === 'contas' ? 'configuracoes' : t);

// Painel do operador. Sem sessão, mostra o login (cenário C4).
export function PainelApp() {
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const [tela, setTela] = useState<Tela>(telaDoEndereco);
  const [hash, setHash] = useState(window.location.hash);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    api
      .sessao()
      .then(setSessao)
      .catch(() => setSessao(null));
    const onHash = () => {
      setTela(telaDoEndereco());
      setHash(window.location.hash);
      setMenuAberto(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /** Sessão encerrada no servidor (senha trocada, expirou): volta ao login. */
  const onAuthError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      setSessao(null);
      return true;
    }
    return false;
  }, []);

  const sair = async () => {
    await api.logout().catch(() => undefined);
    setSessao(null);
    window.location.replace('#');
  };

  if (sessao === undefined) return <p className="status">Carregando…</p>;
  if (sessao === null) return <Login onLogin={setSessao} />;

  const admin = sessao.papel === 'admin';
  const atual: Tela = tela === 'contas' && !admin ? 'inicio' : tela;
  const secaoAtual = secaoDaTela(atual);
  const subAtivo = (href: string) =>
    hash === href ||
    (href === '#produtos' && (hash === '#produtos-sem-pdv' || hash === '')) ||
    (hash === '' && href === '#inicio');

  return (
    <div className="painel">
      <header className="header painel__header">
        <button
          type="button"
          className="painel__burger"
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="painel-menu"
          onClick={() => setMenuAberto((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d={menuAberto ? 'M6 6l12 12M18 6L6 18' : 'M3 6h18M3 12h18M3 18h18'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <h1 className="header__logo">VANELLIS</h1>
        <div className="painel__user">
          <span>
            {sessao.usuario}
            {admin && ' (superusuário)'}
          </span>
          <button type="button" className="header__cart" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      <div className="painel__body">
        {menuAberto && <div className="painel__scrim" onClick={() => setMenuAberto(false)} aria-hidden="true" />}
        <nav id="painel-menu" className={menuAberto ? 'sidebar sidebar--open' : 'sidebar'} aria-label="Menu do painel">
          <ul>
            {SECOES.map((s) => {
              const ativa = s.id === secaoAtual;
              const itens = (s.itens ?? []).filter((i) => !i.soAdmin || admin);
              return (
                <li key={s.id} className={ativa ? 'sidebar__sec sidebar__sec--on' : 'sidebar__sec'}>
                  <a href={s.href} className="sidebar__link" aria-current={ativa && !itens.length ? 'page' : undefined}>
                    {s.icone}
                    {s.nome}
                  </a>
                  {ativa && itens.length > 0 && (
                    <ul className="sidebar__sub">
                      {itens.map((i) => (
                        <li key={i.href}>
                          <a
                            href={i.href}
                            className={subAtivo(i.href) ? 'sidebar__item sidebar__item--on' : 'sidebar__item'}
                            aria-current={subAtivo(i.href) ? 'page' : undefined}
                          >
                            {i.nome}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="painel__main">
          {atual === 'inicio' && <Inicio onAuthError={onAuthError} />}
          {atual === 'produtos' && <Produtos onAuthError={onAuthError} />}
          {atual === 'agenda' && <Agenda onAuthError={onAuthError} />}
          {atual === 'configuracoes' && <Configuracoes papel={sessao.papel} onAuthError={onAuthError} />}
          {atual === 'contas' && <Contas onAuthError={onAuthError} />}
        </div>
      </div>
    </div>
  );
}
