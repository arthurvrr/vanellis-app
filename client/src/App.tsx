import type { CatalogoDTO } from '@vanellis/shared';
import { useEffect, useState } from 'react';
import { ProductCard } from './components/ProductCard';
import { fetchCatalogo } from './lib/api';

// Tela 1 do cliente: Cardápio (RF01). Carrinho e checkout vêm nas próximas etapas.
export function App() {
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);

  useEffect(() => {
    fetchCatalogo()
      .then((c) => {
        setCatalogo(c);
        setCategoriaId(c.categorias[0]?.id ?? null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  if (erro) return <p className="status">{erro}</p>;
  if (!catalogo) return <p className="status">Carregando o cardápio…</p>;

  const produtos = catalogo.produtos.filter((p) => p.categoryId === categoriaId);

  return (
    <>
      <header className="header">
        <h1>VANELLIS</h1>
      </header>
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
