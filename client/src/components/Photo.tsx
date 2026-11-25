import { useState } from 'react';

// Foto de produto ou categoria. Sem foto, ou se o arquivo não carregar, mostra um fundo
// neutro do mesmo tamanho em vez do ícone de imagem quebrada.
export function Photo({
  src,
  className,
  alt = '',
  lazy = false,
}: {
  src: string | null;
  className: string;
  alt?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${className} photo--empty`} aria-hidden="true" />;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      onError={() => setFailed(true)}
    />
  );
}
