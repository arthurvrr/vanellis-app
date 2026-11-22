import type { CatalogoDTO } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { CartView } from './components/CartView';
import { CheckoutView } from './components/Checkout';
import { ProductCard } from './components/ProductCard';
import { fetchCatalogo } from './lib/api';
import { useCart } from './lib/cart';

type View = 'cardapio' | 'carrinho' | 'dados';
const HASHES: Record<View, string> = { cardapio: '', carrinho: '#carrinho', dados: '#dados' };
const viewFromHash = (): View =>
  (Object.keys(HASHES) as View[]).find((v) => HASHES[v] && HASHES[v] === window.location.hash) ?? 'cardapio';

// Telas do cliente (RNF02): Cardápio, Carrinho, Retirada e dados; a Confirmação vem com o envio.
// A tela fica no endereço (#carrinho, #dados) para o botão "voltar" do celular funcionar.
export function App() {
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const { lines } = useCart();

  useEffect(() => {
    fetchCatalogo()
      .then((c) => {
        setCatalogo(c);
        setCategoriaId(c.categorias[0]?.id ?? null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = HASHES[v];
  };

  const header = (
    <header className="header">
      <h1>
        <button type="button" className="header__logo" onClick={() => go('cardapio')}>
          VANELLIS
        </button>
      </h1>
      <button type="button" className="header__cart" onClick={() => go('carrinho')}>
        Carrinho
        {lines.length > 0 && <span className="header__count">{lines.length}</span>}
      </button>
    </header>
  );

  if (erro) return <p className="status">{erro}</p>;
  if (!catalogo) return <p className="status">Carregando o cardápio…</p>;

  if (view === 'carrinho') {
    return (
      <>
        {header}
        <CartView produtos={catalogo.produtos} onBack={() => go('cardapio')} onContinue={() => go('dados')} />
      </>
    );
  }

  if (view === 'dados') {
    return (
      <>
        {header}
        <CheckoutView produtos={catalogo.produtos} onBack={() => go('carrinho')} onMenu={() => go('cardapio')} />
      </>
    );
  }

  const produtos = catalogo.produtos.filter((p) => p.categoryId === categoriaId);
  return (
    <>
      {header}
      <nav className="tabs" aria-label="Categorias">
        {catalogo.categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === categoriaId ? 'tab tab--active' : 'tab'}
            aria-pressed={c.id === categoriaId}
            onClick={() => setCategoriaId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>
      <main className="grid">
        {produtos.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </main>
    </>
  );
}
