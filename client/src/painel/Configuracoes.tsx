import {
  DEFAULT_MESSAGE_TEMPLATE,
  fillMessageTemplate,
  MESSAGE_FIELDS,
  MESSAGE_TEMPLATE_MAX_LENGTH,
  messageTemplateProblem,
  REMINDER_MAX_DAYS,
  REMINDER_MIN_DAYS,
  REMINDERS,
  reminderDaysProblem,
  SAMPLE_MESSAGE_VALUES,
  type ReminderDTO,
  type ReminderKind,
} from '@vanellis/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Configuracoes as Dados, type Papel } from './api';

// Tela Configurações do painel (RF23, RF34, RF37): contatos e localização mostrados no site,
// modelo da mensagem do pedido e frequência dos lembretes de revisão. O WhatsApp que recebe
// os pedidos só o superusuário altera (RN54).

type Msg = { ok: boolean; text: string } | null;
const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Aviso({ msg }: { msg: Msg }) {
  return msg ? (
    <p className={msg.ok ? 'form-ok' : 'field__error'} role={msg.ok ? 'status' : 'alert'}>
      {msg.text}
    </p>
  ) : null;
}

type Campo = Exclude<keyof Dados, 'messageTemplate'>;
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
  const [dados, setDados] = useState<Dados | null>(null);
  const [inicial, setInicial] = useState<Record<Campo, string> | null>(null);
  const [form, setForm] = useState<Record<Campo, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .configuracoes()
      .then((d) => {
        setDados(d);
        setInicial(toForm(d));
        setForm(toForm(d));
      })
      .catch((e: unknown) => onAuthError(e) || setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [onAuthError]);

  // Subseção pela barra lateral: '#configuracoes/mensagem' rola até o bloco.
  const carregada = form !== null;
  useEffect(() => {
    if (!carregada) return;
    const ir = () => {
      const m = window.location.hash.match(/^#configuracoes\/(\w+)$/);
      if (m) document.getElementById(`config-${m[1]}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (window.location.hash === '#configuracoes') window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    ir();
    window.addEventListener('hashchange', ir);
    return () => window.removeEventListener('hashchange', ir);
  }, [carregada]);

  if (!form || !inicial || !dados) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  const mudou = CAMPOS.filter((c) => form[c.id] !== inicial[c.id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!mudou.length) return;
    setSalvando(true);
    setMsg(null);
    try {
      const d = await api.setConfiguracoes(Object.fromEntries(mudou.map((c) => [c.id, form[c.id]])));
      setDados(d);
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
      <form className="card-form config__bloco" onSubmit={salvar}>
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

      <ModeloMensagem atual={dados.messageTemplate} onSalvo={setDados} onAuthError={onAuthError} />
      <Lembretes onAuthError={onAuthError} />
    </section>
  );
}

// ---------- Modelo da mensagem (RF23; C84–C87) ----------

/** Como no WhatsApp: *texto* aparece em negrito na prévia. */
function comNegrito(texto: string) {
  return texto
    .split(/(\*[^*\n]+\*)/g)
    .map((parte, i) => (/^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte));
}

function ModeloMensagem({
  atual,
  onSalvo,
  onAuthError,
}: {
  atual: string | null;
  onSalvo: (d: Dados) => void;
  onAuthError: (e: unknown) => boolean;
}) {
  const salvo = atual ?? DEFAULT_MESSAGE_TEMPLATE;
  const [texto, setTexto] = useState(salvo);
  const [msg, setMsg] = useState<Msg>(null);
  const [salvando, setSalvando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const problema = messageTemplateProblem(texto);
  const mudou = texto !== salvo;
  const padrao = texto === DEFAULT_MESSAGE_TEMPLATE;

  /** Põe o campo onde está o cursor (C85). */
  const inserir = (campo: string) => {
    const el = area.current;
    const pos = el ? el.selectionStart : texto.length;
    const fim = el ? el.selectionEnd : texto.length;
    const novo = `${texto.slice(0, pos)}{${campo}}${texto.slice(fim)}`;
    setTexto(novo);
    setMsg(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + campo.length + 2, pos + campo.length + 2);
    });
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (problema || !mudou) return;
    setSalvando(true);
    setMsg(null);
    try {
      const d = await api.setConfiguracoes({ messageTemplate: padrao ? null : texto });
      onSalvo(d);
      setTexto(d.messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE);
      setMsg({
        ok: true,
        text: padrao ? 'Modelo padrão restaurado.' : 'Modelo salvo. Os próximos pedidos já saem com o texto novo.',
      });
    } catch (err) {
      if (!onAuthError(err)) setMsg({ ok: false, text: erroDe(err) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form id="config-mensagem" className="card-form config__bloco" onSubmit={salvar}>
      <h3>Mensagem do pedido</h3>
      <p className="field__help">
        O texto que chega no WhatsApp da padaria. Os campos entre chaves são preenchidos com os dados de cada pedido;
        os marcados com * não podem sair. Linhas de um campo vazio (como a observação) somem sozinhas.
      </p>
      <div className="modelo">
        <div className="modelo__editor">
          <label htmlFor="modelo-texto" className="modelo__label">
            Modelo
          </label>
          <textarea
            id="modelo-texto"
            ref={area}
            rows={13}
            maxLength={MESSAGE_TEMPLATE_MAX_LENGTH}
            value={texto}
            aria-invalid={problema ? true : undefined}
            onChange={(e) => {
              setTexto(e.target.value);
              setMsg(null);
            }}
          />
          <p className="field__help">Toque num campo para colocá-lo onde está o cursor:</p>
          <div className="modelo__campos">
            {MESSAGE_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={texto.includes(`{${f.key}}`) ? 'chip modelo__campo modelo__campo--usado' : 'chip modelo__campo'}
                title={f.label}
                onClick={() => inserir(f.key)}
              >
                {`{${f.key}}`}
                {f.required && ' *'}
              </button>
            ))}
          </div>
        </div>
        <div className="modelo__previa" aria-label="Como fica a mensagem, com um pedido de exemplo">
          <p className="modelo__label">Como fica (pedido de exemplo)</p>
          <div className="whats">
            <pre className="whats__balao">
              {problema ? 'Corrija o modelo para ver a mensagem.' : comNegrito(fillMessageTemplate(texto, SAMPLE_MESSAGE_VALUES))}
            </pre>
          </div>
        </div>
      </div>
      {problema && (
        <p className="field__error" role="alert">
          {problema}
        </p>
      )}
      <Aviso msg={msg} />
      <div className="agenda__actions">
        <button
          type="button"
          className="link"
          disabled={padrao}
          onClick={() => {
            setTexto(DEFAULT_MESSAGE_TEMPLATE);
            setMsg(null);
          }}
        >
          Restaurar o modelo padrão
        </button>
        <button type="submit" className="primary modelo__salvar" disabled={salvando || !mudou || problema !== null}>
          {salvando ? 'Salvando…' : 'Salvar modelo'}
        </button>
      </div>
    </form>
  );
}

// ---------- Lembretes de revisão (RF37; C88) ----------

function Lembretes({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  const [salvos, setSalvos] = useState<ReminderDTO[] | null>(null);
  const [form, setForm] = useState<Record<ReminderKind, string>>({ cardapio: '', horario: '', precos: '' });
  const [msg, setMsg] = useState<Msg>(null);
  const [salvando, setSalvando] = useState(false);

  const aplicar = (l: ReminderDTO[]) => {
    setSalvos(l);
    setForm(Object.fromEntries(l.map((r) => [r.kind, String(r.everyDays)])) as Record<ReminderKind, string>);
  };
  useEffect(() => {
    api
      .lembretes()
      .then(aplicar)
      .catch((e: unknown) => onAuthError(e) || setMsg({ ok: false, text: erroDe(e) }));
  }, [onAuthError]);

  if (!salvos) return null;
  const mudou = REMINDERS.filter((r) => form[r.kind] !== String(salvos.find((s) => s.kind === r.kind)?.everyDays));
  const problemas = REMINDERS.map((r) => ({ r, p: reminderDaysProblem(Number(form[r.kind] || NaN)) })).filter((x) => x.p);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!mudou.length || problemas.length) return;
    setSalvando(true);
    setMsg(null);
    try {
      aplicar(await api.setLembretes(Object.fromEntries(mudou.map((r) => [r.kind, Number(form[r.kind])]))));
      setMsg({ ok: true, text: 'Frequência dos lembretes salva.' });
    } catch (err) {
      if (!onAuthError(err)) setMsg({ ok: false, text: erroDe(err) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form id="config-lembretes" className="card-form config__bloco" onSubmit={salvar}>
      <h3>Lembretes de revisão</h3>
      <p className="field__help">
        Como o site não é ligado ao PDV, o painel vai lembrar de conferir estes itens de tempos em tempos. Os lembretes
        vencidos aparecem no Início do painel.
      </p>
      <div className="lembretes">
        {REMINDERS.map((r) => (
          <div key={r.kind} className="field lembrete">
            <label htmlFor={`lemb-${r.kind}`}>{r.label}</label>
            <span className="lembrete__linha">
              a cada
              <input
                id={`lemb-${r.kind}`}
                type="number"
                inputMode="numeric"
                min={REMINDER_MIN_DAYS}
                max={REMINDER_MAX_DAYS}
                value={form[r.kind]}
                onChange={(e) => {
                  setForm({ ...form, [r.kind]: e.target.value });
                  setMsg(null);
                }}
              />
              dias
            </span>
            <p className="field__help">{r.help}</p>
          </div>
        ))}
      </div>
      {problemas.length > 0 && (
        <p className="field__error" role="alert">
          {problemas[0]!.r.label}: {problemas[0]!.p!.toLowerCase()}.
        </p>
      )}
      <Aviso msg={msg} />
      <button type="submit" className="primary" disabled={salvando || !mudou.length || problemas.length > 0}>
        {salvando ? 'Salvando…' : 'Salvar lembretes'}
      </button>
    </form>
  );
}
