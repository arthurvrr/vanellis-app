import type { CustomerData } from '@vanellis/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Rascunho do checkout: retirada e dados do cliente. Fica só na memória da página, para o cliente
// poder voltar ao carrinho sem perder o que digitou; recarregar a página apaga tudo (RN02).

export interface Pickup {
  date: string;
  /** Início da faixa; `null` enquanto não escolhida, ou em data especial (RN20). */
  start: string | null;
}

export type Touched = Partial<Record<keyof CustomerData, boolean>>;

interface Draft {
  pickup: Pickup | null;
  setPickup: (p: Pickup | null) => void;
  customer: CustomerData;
  setField: (field: keyof CustomerData, value: string) => void;
  touched: Touched;
  touch: (field: keyof CustomerData) => void;
  reset: () => void;
}

const empty: CustomerData = { name: '', cpf: '', phone: '', note: '' };
const DraftContext = createContext<Draft | null>(null);

export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [customer, setCustomer] = useState<CustomerData>(empty);
  const [touched, setTouched] = useState<Touched>({});

  const setField = useCallback((field: keyof CustomerData, value: string) => {
    setCustomer((c) => ({ ...c, [field]: value }));
  }, []);
  const touch = useCallback((field: keyof CustomerData) => {
    setTouched((t) => ({ ...t, [field]: true }));
  }, []);
  const reset = useCallback(() => {
    setPickup(null);
    setCustomer(empty);
    setTouched({});
  }, []);

  const value = useMemo(
    () => ({ pickup, setPickup, customer, setField, touched, touch, reset }),
    [pickup, customer, setField, touched, touch, reset],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useCheckoutDraft(): Draft {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useCheckoutDraft fora do CheckoutDraftProvider');
  return ctx;
}
