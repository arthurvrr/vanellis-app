import { useEffect, useRef, useState } from 'react';
import { mapsLink } from '@vanellis/shared';
import { siGooglemaps, siInstagram, siWhatsapp } from 'simple-icons';
import { useSettings } from '../lib/useSettings';

// Atalhos de contato na barra superior (RF33, RF34): logos do WhatsApp, do Instagram e do
// Google Maps (pin de localização).
// No computador ficam soltos ao lado do Carrinho; no celular ficam num menu (botão
// hambúrguer) e o Carrinho continua sempre visível. O WhatsApp abre uma conversa em
// branco, separada do envio do pedido. Ícones do pacote simple-icons (licença CC0).

function Logo({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function ContactIcons() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao tocar fora dele ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!settings) return null;

  const maps = mapsLink(settings);
  const links = [
    {
      name: 'WhatsApp',
      label: 'Conversar com a padaria no WhatsApp',
      href: `https://wa.me/${settings.whatsappNumber}`,
      path: siWhatsapp.path,
    },
    ...(settings.instagramUrl
      ? [{ name: 'Instagram', label: 'Instagram da padaria', href: settings.instagramUrl, path: siInstagram.path }]
      : []),
    ...(maps
      ? [
          {
            name: 'Localização',
            label: settings.address ? `Ver no Google Maps: ${settings.address}` : 'Ver a padaria no Google Maps',
            href: maps,
            path: siGooglemaps.path,
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Computador: ícones soltos na barra. */}
      <div className="header__contacts">
        {links.map((l) => (
          <a
            key={l.name}
            className="header__icon"
            href={l.href}
            target="_blank"
            rel="noreferrer"
            aria-label={l.label}
            title={l.name === 'Localização' && settings.address ? settings.address : l.name}
          >
            <Logo path={l.path} />
          </a>
        ))}
      </div>

      {/* Celular: os mesmos atalhos dentro do menu. */}
      <div className="header__menu" ref={menuRef}>
        <button
          type="button"
          className="header__icon header__menu-btn"
          aria-label="Contatos da padaria"
          aria-expanded={open}
          aria-controls="contact-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <ul id="contact-menu" className="header__dropdown">
            {links.map((l) => (
              <li key={l.name}>
                <a href={l.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                  <Logo path={l.path} />
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
