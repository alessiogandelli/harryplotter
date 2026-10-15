import { useState, type ReactNode } from 'react';

export function Collapsible({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible${open ? ' open' : ''}`}>
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="collapsible-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
