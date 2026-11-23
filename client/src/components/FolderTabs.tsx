import type { CategoryDTO } from '@vanellis/shared';
import { useEffect, useRef, useState } from 'react';

// Abas das categorias como divisórias de um cardápio de papel: a seção aberta em marrom,
// colada na faixa. As abas vêm do cadastro de categorias (RF52); quando não cabem, rolam
// para o lado e a borda esmaece indicando que há mais.
export function FolderTabs({
  categorias,
  activeId,
  onSelect,
}: {
  categorias: CategoryDTO[];
  activeId: number | null;
  onSelect: (slug: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const check = () => setOverflow(row.scrollWidth > row.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    return () => ro.disconnect();
  }, [categorias]);

  // A aba aberta fica sempre à vista, mesmo com muitas categorias.
  useEffect(() => {
    rowRef.current?.querySelector('.folder-tab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  return (
    <nav className="folder-tabs" aria-label="Categorias do cardápio">
      <div ref={rowRef} className={overflow ? 'folder-tabs__row folder-tabs__row--overflow' : 'folder-tabs__row'}>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === activeId ? 'folder-tab folder-tab--active' : 'folder-tab'}
            aria-current={c.id === activeId ? 'page' : undefined}
            onClick={() => onSelect(c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
