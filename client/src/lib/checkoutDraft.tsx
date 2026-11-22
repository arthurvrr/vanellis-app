import type { CustomerData } from '@vanellis/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Rascunho do checkout: retirada, dados do cliente e "Li e concordo". Fica só na memória da
// página, para o cliente poder voltar ao carrinho sem perder o que digitou; recarregar a
// página apaga tudo (RN02). Guarda também o último pedido enviado, para a Confirmação (RN50).

export interface Pickup {
  date: string;
  /** Horário 'HH:MM'; `null` enquanto não escolhido, ou em data especial (RN20). */
  time: string | null;
}

export type Touched = Partial<Record<keyof CustomerData, boolean>>;

/** O que a tela de Confirmação mostra depois do envio (RF09). */
export interface SentOrder {
  code: string;
  url: string;
  /** Texto da mensagem, mostrado na tela na versão de teste. */
  message: string;
  pickup: string;
  items: string[];
  total: string | null;
}

interface Draft {
  pickup: Pickup | null;
  setPickup: (p: Pickup | null) => void;
  customer: CustomerData;
  setField: (field: keyof CustomerData, value: string) => void;
  touched: Touched;
  touch: (field: keyof CustomerData) => void;
  touchAll: () => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  sent: SentOrder | null;
  /** Registra o pedido enviado e limpa o rascunho para o próximo. */
  finish: (order: SentOrder) => void;
}

const empty: CustomerData = { name: '', cpf: '', phone: '', note: '' };
const DraftContext = createContext<Draft | null>(null);

export function CheckoutDraftProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [customer, setCustomer] = useState<CustomerData>(empty);
  const [touched, setTouched] = useState<Touched>({});
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState<SentOrder | null>(null);

  const setField = useCallback((field: keyof CustomerData, value: string) => {
    setCustomer((c) => ({ ...c, [field]: value }));
  }, []);
  const touch = useCallback((field: keyof CustomerData) => {
    setTouched((t) => ({ ...t, [field]: true }));
  }, []);
  const touchAll = useCallback(() => setTouched({ name: true, cpf: true, phone: true, note: true }), []);
  const finish = useCallback((order: SentOrder) => {
    setSent(order);
    setPickup(null);
    setCustomer(empty);
    setTouched({});
    setAgreed(false);
  }, []);

  const value = useMemo(
    () => ({ pickup, setPickup, customer, setField, touched, touch, touchAll, agreed, setAgreed, sent, finish }),
    [pickup, customer, setField, touched, touch, touchAll, agreed, sent, finish],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useCheckoutDraft(): Draft {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useCheckoutDraft fora do CheckoutDraftProvider');
  return ctx;
}
