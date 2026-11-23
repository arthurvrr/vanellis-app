import type { ProductDTO } from '@vanellis/shared';
import { useState } from 'react';
import { ProductDetail } from './ProductDetail';

// Computador: o detalhe do produto fica num painel ao lado da grade. A categoria abre com
// um produto já selecionado; clicar em outro troca o painel na hora.
export function SidePanel({ product }: { product: ProductDTO | null }) {
  // Depois de adicionar, o produto continua aberto, mas volta ao estado inicial (RF48).
  const [round, setRound] = useState(0);

  // Só quando nenhum produto da categoria está disponível.
  if (!product) {
    return (
      <aside className="side side--empty" aria-label="Detalhe do produto">
        <p className="side__hint-title">Nenhum produto disponível</p>
        <p className="side__hint">Os produtos desta categoria estão indisponíveis no momento.</p>
      </aside>
    );
  }

  return (
    <aside className="side" aria-labelledby="detail-title">
      <ProductDetail key={`${product.id}-${round}`} product={product} onAdded={() => setRound((r) => r + 1)} />
    </aside>
  );
}
