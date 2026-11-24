import { pickupLabel, shortDate, visibleCategories, type CatalogoDTO, type ProductDTO } from '@vanellis/shared';
import { useCallback, useEffect, useState } from 'react';
import { AnnouncementBar } from './components/AnnouncementBar';
import { CartView } from './components/CartView';
import { ContactIcons } from './components/ContactIcons';
import { CheckoutView } from './components/Checkout';
import { ConfirmationView } from './components/ConfirmationView';
import { FolderTabs } from './components/FolderTabs';
import { HomeView } from './components/HomeView';
import { MenuCard } from './components/MenuCard';
import { ProductSheet } from './components/ProductSheet';
import { SidePanel } from './components/SidePanel';
import { SiteFooter } from './components/SiteFooter';
import { fetchCatalogo } from './lib/api';
import { useCart } from './lib/cart';
import { useMediaQuery } from './lib/useMediaQuery';
import { IS_DEMO } from './lib/demo';

type View = 'inicio' | 'cardapio' | 'carrinho' | 'dados' | 'confirmacao';
const FIXED: Record<string, View> = { '#carrinho': 'carrinho', '#dados': 'dados', '#confirmacao': 'confirmacao' };

/** Tela pelo endereço: '' = entrada, '#cardapio' ou '#<categoria>' = cardápio, demais fixas. */
function routeFromHash(slugs: string[]): { view: View; slug: string | null } {
  const h = window.location.hash;
  if (FIXED[h]) return { view: FIXED[h], slug: null };
  const slug = h.slice(1);
  if (h === '#cardapio') return { view: 'cardapio', slug: null };
  if (slugs.includes(slug)) return { view: 'cardapio', slug };
  return { view: 'inicio', slug: null };
}

// Telas do cliente (RNF02): Entrada, Cardápio, Carrinho, Retirada e dados, Confirmação.
// A tela fica no endereço (#tortas, #carrinho...) para o botão "voltar" do celular funcionar e
// para a padaria poder divulgar o link de uma categoria.
export function App() {
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [route, setRoute] = useState<{ view: View; slug: string | null }>({ view: 'inicio', slug: null });
  const [aberto, setAberto] = useState<ProductDTO | null>(null);
  const { lines } = useCart();
  const desktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    fetchCatalogo()
      .then((dados) => {
        // O cliente só vê categorias com produtos (uma categoria nova aparece com o 1º produto).
        const c = { ...dados, categorias: visibleCategories(dados) };
        setCatalogo(c);
        setRoute(routeFromHash(c.categorias.map((x) => x.slug)));
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!catalogo) return;
    const onHash = () => {
      setRoute(routeFromHash(catalogo.categorias.map((x) => x.slug)));
      setAberto(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [catalogo]);

  const go = (v: Exclude<View, 'cardapio'>) => {
    window.location.hash = v === 'inicio' ? '' : `#${v}`;
  };
  const goMenu = (slug?: string | null) => {
    window.location.hash = `#${slug ?? catalogo?.categorias[0]?.slug ?? 'cardapio'}`;
  };
  const closeSheet = useCallback(() => setAberto(null), []);
  const view = route.view;

  const header = (
    <>
      {IS_DEMO && (
        <p className="demo-banner" role="note">
          <strong>Versão de teste.</strong> Os pedidos não são enviados para a padaria. Use dados fictícios.
        </p>
      )}
      <header className="header">
        <h1>
          <button type="button" className="header__logo" onClick={() => go('inicio')}>
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
          onBack={() => goMenu(route.slug)}
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
        <ConfirmationView onMenu={() => goMenu()} />
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
          onMenu={() => goMenu()}
          onSent={() => go('confirmacao')}
        />
        <SiteFooter />
      </>
    );
  }

  if (view === 'inicio') {
    return (
      <>
        <AnnouncementBar />
        {header}
        <HomeView catalogo={catalogo} onCategory={goMenu} />
        <SiteFooter />
      </>
    );
  }

  const categoria = catalogo.categorias.find((c) => c.slug === route.slug) ?? catalogo.categorias[0];
  const produtos = catalogo.produtos.filter((p) => p.categoryId === categoria?.id);
  // Computador: ao abrir a categoria, o primeiro produto disponível já aparece no painel.
  const selecionado =
    (aberto && produtos.some((p) => p.id === aberto.id) ? aberto : null) ?? produtos.find((p) => p.available) ?? null;
  return (
    <>
      {header}
      <FolderTabs categorias={catalogo.categorias} activeId={categoria?.id ?? null} onSelect={goMenu} />
      {catalogo.pricesHidden && (
        <p className="menu-notice" role="note">
          Os preços estão sendo atualizados. A padaria informa os valores na confirmação do pedido.
        </p>
      )}
      {categoria && (
        <div className="menu-intro">
          <h2 className="menu-intro__title">{categoria.name}</h2>
          {categoria.description && <p className="menu-intro__text">{categoria.description}</p>}
          {categoria.special && (
            <p className="menu-intro__especial">
              ★ {pickupLabel(categoria.special)}. Encomendas até {shortDate(categoria.special.visibleUntil)}.
            </p>
          )}
        </div>
      )}
      {desktop ? (
        <div className="menu-layout">
          <main className="grid grid--side">
            {produtos.map((p) => (
              <MenuCard
                key={p.id}
                product={p}
                compact
                selected={selecionado?.id === p.id}
                onOpen={() => setAberto(p)}
              />
            ))}
          </main>
          <SidePanel product={selecionado} />
        </div>
      ) : (
        <main className="grid">
          {produtos.map((p) => (
            <MenuCard key={p.id} product={p} onOpen={() => setAberto(p)} />
          ))}
        </main>
      )}
      {aberto && !desktop && <ProductSheet product={aberto} onClose={closeSheet} />}
      <SiteFooter />
    </>
  );
}
