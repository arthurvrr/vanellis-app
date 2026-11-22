import {
  MAX_LINES,
  MAX_QUANTITY,
  lineKey,
  type CartLine,
  type Selection,
} from '@vanellis/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Carrinho guardado no navegador (RF04). Guarda só produto, escolhas e quantidade:
// nome, preço e foto vêm sempre do catálogo atual. Dados do cliente nunca entram aqui (RN02).
const STORAGE_KEY = 'vanellis:carrinho:v1';

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function save(lines: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Navegador sem armazenamento (aba anônima, cota cheia): o carrinho vale só nesta visita.
  }
}

export type AddResult = 'added' | 'merged' | 'full';

interface CartContextValue {
  lines: CartLine[];
  add: (productId: number, selection: Selection, quantity: number) => AddResult;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => save(lines), [lines]);

  // Mantém abas abertas ao mesmo tempo com o mesmo carrinho.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback<CartContextValue['add']>(
    (productId, selection, quantity) => {
      const key = lineKey(productId, selection);
      const existing = lines.find((l) => l.key === key);
      if (!existing && lines.length >= MAX_LINES) return 'full';
      setLines((prev) =>
        prev.some((l) => l.key === key)
          ? prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l))
          : [...prev, { key, productId, selection, quantity }],
      );
      return existing ? 'merged' : 'added';
    },
    [lines],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, add, setQuantity, remove, clear }), [lines, add, setQuantity, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart fora do CartProvider');
  return ctx;
}
