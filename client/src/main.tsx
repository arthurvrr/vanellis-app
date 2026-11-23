import '@fontsource-variable/fraunces';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CartProvider } from './lib/cart';
import { CheckoutDraftProvider } from './lib/checkoutDraft';
import { ToastProvider } from './lib/toast';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <CartProvider>
        <CheckoutDraftProvider>
          <App />
        </CheckoutDraftProvider>
      </CartProvider>
    </ToastProvider>
  </StrictMode>,
);
