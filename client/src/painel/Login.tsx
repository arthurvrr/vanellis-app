import { useState, type FormEvent } from 'react';
import { api, type Sessao } from './api';

// Tela 1 do painel: Login (RF13, cenários C1–C3).
export function Login({ onLogin }: { onLogin: (s: Sessao) => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      onLogin(await api.login(usuario, senha));
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <form className="login__box" onSubmit={submit}>
        <h1>VANELLIS</h1>
        <p className="login__sub">Painel da padaria</p>
        <div className="field">
          <label htmlFor="usuario">Usuário</label>
          <input
            id="usuario"
            autoComplete="username"
            autoCapitalize="none"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        {erro && (
          <p className="field__error login__error" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className="primary" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
