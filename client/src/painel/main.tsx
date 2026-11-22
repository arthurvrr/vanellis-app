import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import { PainelApp } from './PainelApp';
import './painel.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PainelApp />
  </StrictMode>,
);
