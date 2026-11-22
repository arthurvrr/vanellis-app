import type { CatalogoDTO } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { CartView } from './components/CartView';
import { ContactIcons } from './components/ContactIcons';
import { CheckoutView } from './components/Checkout';
import { ConfirmationView } from './components/ConfirmationView';
import { ProductCard } from './components/ProductCard';
import { SiteFooter } from './components/SiteFooter';
import { fetchCatalogo } from './lib/api';
import { useCart } from './lib/cart';
import { IS_DEMO } from './lib/demo';

type View = 'cardapio' | 'carrinho' | 'dados' | 'confirmacao';
const HASHES: Record<View, string> = {
  cardapio: '',
  carrinho: '#carrinho',
  dados: '#dados',
  confirmacao: '#confirmacao',
};
const viewFromHash = (): View =>
  (Object.keys(HASHES) as View[]).find((v) => HASHES[v] && HASHES[v] === window.location.hash) ?? 'cardapio';

// Telas do cliente (RNF02): Cardápio, Carrinho, Retirada e dados, Confirmação.
// A tela fica no endereço (#carrinho, #dados, #confirmacao) para o botão "voltar" do celular funcionar.
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
    <>
      {IS_DEMO && (
        <p className="demo-banner" role="note">
          <strong>Versão de teste.</strong> Os pedidos não são enviados para a padaria. Use dados fictícios.
        </p>
      )}
      <header className="header">
        <h1>
          <button type="button" className="header__logo" onClick={() => go('cardapio')}>
            VANELLIS
          </button>
        </h1>
        <div className="header__actions">
          <ContactIcons />
          {/* Carrinho sempre visível, só o ícone, com a quantidade de itens no selo. */}
          <button
            type="button"
            className="header__icon header__cart-btn"
            onClick={() => go('carrinho')}
            aria-label={
              lines.length === 0
                ? 'Carrinho vazio'
                : `Carrinho, ${lines.length} ${lines.length === 1 ? 'item' : 'itens'}`
            }
            title="Carrinho"
          >
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
              <path
                d="M2.5 3.5h2.2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1l1.8-7.3H6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="19.6" r="1.5" fill="currentColor" />
              <circle cx="17" cy="19.6" r="1.5" fill="currentColor" />
            </svg>
            {lines.length > 0 && (
              <span className="header__badge" aria-hidden="true">
                {lines.length > 99 ? '99+' : lines.length}
              </span>
            )}
          </button>
        </div>
      </header>
    </>
  );

  if (erro) return <p className="status">{erro}</p>;
  if (!catalogo) return <p className="status">Carregando o cardápio…</p>;

  if (view === 'carrinho') {
    return (
      <>
        {header}
        <CartView
          produtos={catalogo.produtos}
          pricesHidden={catalogo.pricesHidden}
          onBack={() => go('cardapio')}
          onContinue={() => go('dados')}
        />
        <SiteFooter />
      </>
    );
  }

  if (view === 'confirmacao') {
    return (
      <>
        {header}
        <ConfirmationView onMenu={() => go('cardapio')} />
        <SiteFooter />
      </>
    );
  }

  if (view === 'dados') {
    return (
      <>
        {header}
        <CheckoutView
          produtos={catalogo.produtos}
          pricesHidden={catalogo.pricesHidden}
          onBack={() => go('carrinho')}
          onMenu={() => go('cardapio')}
          onSent={() => go('confirmacao')}
        />
        <SiteFooter />
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
      {catalogo.pricesHidden && (
        <p className="menu-notice" role="note">
          Os preços estão sendo atualizados. A padaria informa os valores na confirmação do pedido.
        </p>
      )}
      <main className="grid">
        {produtos.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
