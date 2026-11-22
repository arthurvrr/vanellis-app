import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Sessao } from './api';
import { Configuracoes } from './Configuracoes';
import { Contas } from './Contas';
import { Inicio } from './Inicio';
import { Login } from './Login';

type Tela = 'inicio' | 'configuracoes' | 'contas';
const TELAS: { id: Tela; nome: string; soAdmin?: boolean }[] = [
  { id: 'inicio', nome: 'Início' },
  { id: 'configuracoes', nome: 'Configurações' },
  { id: 'contas', nome: 'Contas', soAdmin: true },
];
const telaDoEndereco = (): Tela => {
  const h = window.location.hash.slice(1);
  return TELAS.some((t) => t.id === h) ? (h as Tela) : 'inicio';
};

// Painel do operador. Sem sessão, mostra o login (cenário C4). As demais telas do doc
// (Agenda, Produtos, Preços...) entram no menu conforme as etapas.
export function PainelApp() {
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const [tela, setTela] = useState<Tela>(telaDoEndereco);

  useEffect(() => {
    api
      .sessao()
      .then(setSessao)
      .catch(() => setSessao(null));
    const onHash = () => setTela(telaDoEndereco());
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

  const telas = TELAS.filter((t) => !t.soAdmin || sessao.papel === 'admin');
  const atual = telas.some((t) => t.id === tela) ? tela : 'inicio';

  return (
    <div className="painel">
      <header className="header painel__header">
        <h1 className="header__logo">VANELLIS</h1>
        <div className="painel__user">
          <span>
            {sessao.usuario}
            {sessao.papel === 'admin' && ' (superusuário)'}
          </span>
          <button type="button" className="header__cart" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <nav className="tabs painel__menu" aria-label="Menu do painel">
        {telas.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={t.id === atual ? 'tab tab--active' : 'tab'}
            aria-current={t.id === atual ? 'page' : undefined}
          >
            {t.nome}
          </a>
        ))}
      </nav>
      {atual === 'inicio' && <Inicio onAuthError={onAuthError} />}
      {atual === 'configuracoes' && <Configuracoes papel={sessao.papel} onAuthError={onAuthError} />}
      {atual === 'contas' && <Contas onAuthError={onAuthError} />}
    </div>
  );
}
