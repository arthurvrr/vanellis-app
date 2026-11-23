import type { ProductDTO } from '@vanellis/shared';
import { useEffect, useRef } from 'react';
import { ProductDetail } from './ProductDetail';

// Painel por cima do cardápio com o detalhe do produto: sobe de baixo no celular e fica
// centralizado no computador. Fecha com Esc, com o X ou tocando fora.
export function ProductSheet({ product, onClose }: { product: ProductDTO; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // a página de trás não rola
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button ref={closeRef} type="button" className="sheet__close" aria-label="Fechar" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <ProductDetail product={product} onAdded={onClose} />
      </div>
    </div>
  );
}
