import {
  casaBusca,
  formatBRL,
  mostrarPreco,
  parsePreco,
  problemaPreco,
  type PrecoCategoriaDTO,
  type PriceMode,
} from '@vanellis/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { avisarAoSair } from './saida';

// Tela Preços (etapa 4: RF31; cenários C62–C66). Todos os preços numa lista, editáveis na
// própria linha; as alterações são salvas juntas. A estrutura (quais opções têm preço, se
// trocam ou somam) continua no cadastro do produto.

type Msg = { ok: boolean; text: string } | null;
/** Linha editável: 'p12' = preço do produto 12, 'o40' = preço da opção 40. */
type Chave = `p${number}` | `o${number}`;
interface Linha {
  chave: Chave;
  original: number;
  priceMode: PriceMode | null;
}

function linhasDe(cats: PrecoCategoriaDTO[]): Map<Chave, Linha> {
  const m = new Map<Chave, Linha>();
  for (const c of cats)
    for (const p of c.produtos) {
      if (p.price !== null) m.set(`p${p.id}`, { chave: `p${p.id}`, original: p.price, priceMode: null });
      for (const o of p.options) m.set(`o${o.id}`, { chave: `o${o.id}`, original: o.price, priceMode: o.priceMode });
    }
  return m;
}

const SAIR = 'Há preços alterados que ainda não foram salvos. Sair e perder as alterações?';

export function Precos({ onAuthError }: { onAuthError: (e: unknown) => boolean }) {
  const [cats, setCats] = useState<PrecoCategoriaDTO[] | null>(null);
  const [edits, setEdits] = useState<Partial<Record<Chave, string>>>({});
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [salvando, setSalvando] = useState(false);

  const erro = useCallback(
    (e: unknown) => {
      if (!onAuthError(e)) setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    },
    [onAuthError],
  );

  useEffect(() => {
    api.precos().then(setCats).catch(erro);
  }, [erro]);

  const linhas = useMemo(() => (cats ? linhasDe(cats) : new Map<Chave, Linha>()), [cats]);

  /** Linhas com valor diferente do salvo, e o problema de cada uma (C63, C64). */
  const alteradas = useMemo(() => {
    const out: { linha: Linha; price: number | null; problema: string | null }[] = [];
    for (const [chave, texto] of Object.entries(edits) as [Chave, string][]) {
      const linha = linhas.get(chave);
      if (!linha) continue;
      const price = parsePreco(texto);
      if (price === linha.original) continue;
      out.push({ linha, price, problema: problemaPreco(price, linha.priceMode) });
    }
    return out;
  }, [edits, linhas]);
  const comProblema = alteradas.filter((a) => a.problema).length;
  const sujo = alteradas.length > 0;

  // C65: avisa antes de sair da tela, ou fechar a aba, com alterações não salvas.
  useEffect(() => {
    avisarAoSair(sujo ? SAIR : null);
    return () => avisarAoSair(null);
  }, [sujo]);

  const set = (chave: Chave, texto: string) => {
    setMsg(null);
    setEdits((e) => ({ ...e, [chave]: texto }));
  };

  const salvar = async () => {
    if (comProblema || !sujo) return;
    setSalvando(true);
    setMsg(null);
    const pick = (k: 'p' | 'o') =>
      alteradas
        .filter((a) => a.linha.chave.startsWith(k))
        .map((a) => ({ id: Number(a.linha.chave.slice(1)), price: a.price! }));
    try {
      const novo = await api.salvaPrecos({ produtos: pick('p'), opcoes: pick('o') });
      const n = alteradas.length;
      setCats(novo);
      setEdits({});
      setMsg({ ok: true, text: n === 1 ? '1 preço salvo. O cardápio já mostra o valor novo.' : `${n} preços salvos. O cardápio já mostra os valores novos.` });
    } catch (e) {
      erro(e);
    } finally {
      setSalvando(false);
    }
  };

  if (!cats) return <p className="status">{msg?.text ?? 'Carregando…'}</p>;

  const total = cats.reduce((n, c) => n + c.produtos.length, 0);

  return (
    <section className="painel__page precos" aria-labelledby="precos-title">
      <h2 id="precos-title">Preços</h2>
      <p className="field__help precos__ajuda">
        Reajuste os valores e salve tudo de uma vez. Para mudar as opções de um produto, ou se uma opção troca ou soma
        o preço, use o cadastro do produto.
      </p>
      {msg && (
        <p className={msg.ok ? 'form-ok agenda__msg' : 'field__error agenda__msg'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      <div className="toolbar">
        <div className="field precos__busca">
          <label htmlFor="precos-busca">Buscar produto</label>
          <input
            id="precos-busca"
            type="search"
            value={busca}
            placeholder="Ex: torta"
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {cats.map((c) => {
        const produtos = c.produtos.filter((p) => casaBusca(p.name, busca));
        if (!produtos.length) return null;
        return (
          <section key={c.id} className="plist" aria-labelledby={`precos-cat-${c.id}`}>
            <h3 id={`precos-cat-${c.id}`}>{c.name}</h3>
            <ul className="precos__lista">
              {produtos.map((p) => (
                <li key={p.id} className={p.available ? 'preco-prod' : 'preco-prod preco-prod--off'}>
                  <div className="preco-row">
                    <div className="preco-row__nome">
                      <strong>{p.name}</strong>
                      {!p.available && <span className="tag">Indisponível</span>}
                      <a className="preco-row__editar" href={`#produto/${p.id}`}>
                        cadastro
                      </a>
                    </div>
                    {p.price !== null ? (
                      <CampoPreco
                        rotulo={`Preço de ${p.name}`}
                        unidade={p.saleUnit === 'KG' ? '/kg' : '/un'}
                        chave={`p${p.id}`}
                        original={p.price}
                        texto={edits[`p${p.id}`]}
                        priceMode={null}
                        onChange={set}
                      />
                    ) : (
                      <span className="preco-row__nota">Preço pelas opções</span>
                    )}
                  </div>
                  {p.options.length > 0 && (
                    <ul className="preco-opcoes">
                      {p.options.map((o) => (
                        <li key={o.id} className="preco-row preco-row--opcao">
                          <div className="preco-row__nome">
                            <span>
                              <span className="preco-row__grupo">{o.groupName} · </span>
                              {o.name}
                            </span>
                            <span className="tag">{o.priceMode === 'add' ? 'soma' : 'troca o preço'}</span>
                          </div>
                          <CampoPreco
                            rotulo={`${p.name}, ${o.groupName} ${o.name}`}
                            unidade={o.priceMode === 'add' ? '+' : p.saleUnit === 'KG' ? '/kg' : '/un'}
                            chave={`o${o.id}`}
                            original={o.price}
                            texto={edits[`o${o.id}`]}
                            priceMode={o.priceMode}
                            onChange={set}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {busca && !cats.some((c) => c.produtos.some((p) => casaBusca(p.name, busca))) && (
        <p className="status">Nenhum produto com “{busca.trim()}” no nome.</p>
      )}
      {!busca && total === 0 && <p className="status">Nenhum produto cadastrado.</p>}

      {sujo && (
        <div className="precos__barra" role="region" aria-label="Alterações não salvas">
          <span>
            {alteradas.length === 1 ? '1 preço alterado' : `${alteradas.length} preços alterados`}
            {comProblema > 0 && (
              <strong className="precos__problemas">
                {' · '}
                {comProblema === 1 ? 'corrija 1 preço' : `corrija ${comProblema} preços`}
              </strong>
            )}
          </span>
          <button type="button" className="link" onClick={() => setEdits({})} disabled={salvando}>
            Desfazer
          </button>
          <button type="button" className="add" onClick={salvar} disabled={salvando || comProblema > 0}>
            {salvando
              ? 'Salvando…'
              : alteradas.length === 1
                ? 'Salvar 1 alteração'
                : `Salvar ${alteradas.length} alterações`}
          </button>
        </div>
      )}
    </section>
  );
}

function CampoPreco({
  rotulo,
  unidade,
  chave,
  original,
  texto,
  priceMode,
  onChange,
}: {
  rotulo: string;
  unidade: string;
  chave: Chave;
  original: number;
  texto: string | undefined;
  priceMode: PriceMode | null;
  onChange: (chave: Chave, texto: string) => void;
}) {
  const valor = texto ?? mostrarPreco(original);
  const price = parsePreco(valor);
  const mudou = texto !== undefined && price !== original;
  const problema = mudou ? problemaPreco(price, priceMode) : null;
  const id = `preco-${chave}`;
  return (
    <div className={problema ? 'preco-campo preco-campo--erro' : mudou ? 'preco-campo preco-campo--mudou' : 'preco-campo'}>
      <span className="nfield__box">
        <span className="nfield__suffix">R$</span>
        <input
          id={id}
          inputMode="decimal"
          aria-label={rotulo}
          aria-invalid={problema ? true : undefined}
          aria-describedby={mudou ? `${id}-info` : undefined}
          value={valor}
          onChange={(e) => onChange(chave, e.target.value)}
          onBlur={() => {
            // Arruma a escrita (1,8 → 1,80) sem mudar o valor.
            if (texto !== undefined && price !== null && !problemaPreco(price, priceMode))
              onChange(chave, mostrarPreco(price));
          }}
        />
        <span className="nfield__suffix">{unidade}</span>
      </span>
      {mudou && (
        <span id={`${id}-info`} className={problema ? 'field__error preco-campo__info' : 'preco-campo__info'}>
          {problema ?? `antes ${formatBRL(original)}`}
        </span>
      )}
    </div>
  );
}
