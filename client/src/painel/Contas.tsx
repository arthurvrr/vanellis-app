import { useState, type FormEvent } from 'react';
import { api } from './api';

const MIN = 8;

// Ação exclusiva do superusuário (RN54, cenário C6): nova senha para o operador.
export function Contas({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < MIN) return setMsg({ ok: false, text: `A senha precisa ter pelo menos ${MIN} caracteres.` });
    if (senha !== repetir) return setMsg({ ok: false, text: 'As senhas não conferem.' });
    setEnviando(true);
    try {
      const { usuario } = await api.senhaOperador(senha);
      setMsg({
        ok: true,
        text: `Senha de "${usuario}" trocada. Quem estava no painel com essa conta precisa entrar de novo.`,
      });
      setSenha('');
      setRepetir('');
    } catch (err) {
      if (!onAuthError(err)) setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="painel__page" aria-labelledby="contas-title">
      <h2 id="contas-title">Contas</h2>
      <form className="card-form" onSubmit={submit}>
        <h3>Senha do operador</h3>
        <p className="field__help">
          Use quando a senha for esquecida ou quando alguém que sabia a senha sair da equipe. Todas as sessões abertas
          da conta do operador são encerradas.
        </p>
        <div className="field">
          <label htmlFor="nova">Nova senha</label>
          <input
            id="nova"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="repetir">Repita a nova senha</label>
          <input
            id="repetir"
            type="password"
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
          />
        </div>
        {msg && (
          <p className={msg.ok ? 'form-ok' : 'field__error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <button type="submit" className="primary" disabled={enviando}>
          Trocar senha do operador
        </button>
      </form>
    </section>
  );
}
