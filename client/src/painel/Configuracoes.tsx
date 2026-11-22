import { useEffect, useState, type FormEvent } from 'react';
import { api, type Configuracoes as Dados, type Papel } from './api';

// Tela Configurações do painel (RF23, RF34): contatos e localização mostrados no site.
// O WhatsApp que recebe os pedidos só o superusuário altera (RN54).

type Campo = keyof Dados;
const CAMPOS: { id: Campo; label: string; help: string; type?: string; soAdmin?: boolean }[] = [
  {
    id: 'whatsappNumber',
    label: 'WhatsApp que recebe os pedidos',
    help: 'Com DDD. Também é o atalho de WhatsApp do site. Só o superusuário altera.',
    type: 'tel',
    soAdmin: true,
  },
  { id: 'instagramUrl', label: 'Instagram', help: 'Link do perfil ou @perfil. Vazio tira o atalho do site.' },
  { id: 'contactPhone', label: 'Telefone para ligação', help: 'Com DDD. Vazio tira o "Ligar" do site.', type: 'tel' },
  { id: 'address', label: 'Endereço', help: 'Aparece ao passar o mouse no pin de localização.' },
  {
    id: 'mapsUrl',
    label: 'Link do Google Maps',
    help: 'No Google Maps, abra a padaria, toque em Compartilhar e cole o link aqui. Vazio: o pin busca pelo endereço.',
  },
];

/** Mostra o telefone guardado (5551995284226) como (51) 99528-4226. */
function showPhone(v: string | null): string {
  const d = (v ?? '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
}

function toForm(d: Dados): Record<Campo, string> {
  return {
    whatsappNumber: showPhone(d.whatsappNumber),
    instagramUrl: d.instagramUrl ?? '',
    contactPhone: showPhone(d.contactPhone),
    address: d.address ?? '',
    mapsUrl: d.mapsUrl ?? '',
  };
}

export function Configuracoes({ papel, onAuthError }: { papel: Papel; onAuthError: (e: unknown) => boolean }) {
  const [inicial, setInicial] = useState<Record<Campo, string> | null>(null);
  const [form, setForm] = useState<Record<Campo, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .configuracoes()
      .then((d) => {
        setInicial(toForm(d));
        setForm(toForm(d));
      })
      .catch((e: unknown) => onAuthError(e) || setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [onAuthError]);

  if (!form || !inicial) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  const mudou = CAMPOS.filter((c) => form[c.id] !== inicial[c.id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!mudou.length) return;
    setSalvando(true);
    setMsg(null);
    try {
      const d = await api.setConfiguracoes(Object.fromEntries(mudou.map((c) => [c.id, form[c.id]])));
      setInicial(toForm(d));
      setForm(toForm(d));
      setMsg({ ok: true, text: 'Configurações salvas. O site já mostra as novas informações.' });
    } catch (err) {
      if (!onAuthError(err)) setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="painel__page" aria-labelledby="config-title">
      <h2 id="config-title">Configurações</h2>
      <form className="card-form" onSubmit={salvar}>
        <h3>Contatos e localização do site</h3>
        {CAMPOS.map((c) => {
          const bloqueado = c.soAdmin && papel !== 'admin';
          return (
            <div className="field" key={c.id}>
              <label htmlFor={c.id}>{c.label}</label>
              <input
                id={c.id}
                type={c.type ?? 'text'}
                value={form[c.id]}
                disabled={bloqueado}
                onChange={(e) => setForm({ ...form, [c.id]: e.target.value })}
              />
              <p className="field__help">{c.help}</p>
            </div>
          );
        })}
        {msg && (
          <p className={msg.ok ? 'form-ok' : 'field__error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <button type="submit" className="primary" disabled={salvando || !mudou.length}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  );
}
