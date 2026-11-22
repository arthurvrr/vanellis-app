import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Mensagem curta no canto da tela (RF48): verde para sucesso, vermelha para erro.
type Kind = 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<((message: string, kind?: Kind) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, kind: Kind = 'success') => {
    nextId.current += 1;
    setToast({ id: nextId.current, kind, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <span aria-hidden="true">{toast.kind === 'success' ? '✓' : '!'}</span>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
