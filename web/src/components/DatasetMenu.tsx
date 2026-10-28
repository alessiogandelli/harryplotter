import { ChevronDown, ClipboardPaste, Database, FolderOpen, History, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { forget, openFromLibrary, useStore } from '../store';
import { MarkIcon } from './icons';
import { SAMPLES } from './Welcome';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
};

/** The dataset switcher: your recent files, the bundled examples, or a new file. */
export function DatasetMenu({ onOpenFile, onSample }: { onOpenFile: () => void; onSample: (file: string) => void }) {
  const dataset = useStore((s) => s.dataset)!;
  const library = useStore((s) => s.library);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const mine = library.filter((e) => e.id !== dataset.id || dataset.example);
  const pick = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div className="dataset-menu" ref={box}>
      <button type="button" className="dataset-chip" onClick={() => setOpen(!open)} aria-expanded={open} title="Change dataset">
        <Database size={14} />
        <strong>{dataset.name}</strong>
        <span className="muted">{dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns</span>
        <ChevronDown size={14} className="muted" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" className="menu-item primary" onClick={() => pick(onOpenFile)}>
            <FolderOpen size={16} />
            <span><b>Open a file…</b><em>CSV, TSV, Excel, JSON — or drop it anywhere, or paste cells with ⌘V</em></span>
          </button>

          <div className="menu-label"><History size={13} /> Your datasets</div>
          {mine.length === 0 && <p className="menu-empty">Files you open are kept here, in this browser, with their last figure.</p>}
          {mine.map((e) => (
            <div key={e.id} className="menu-row">
              <button type="button" className="menu-item" onClick={() => pick(() => openFromLibrary(e.id))}>
                <Database size={15} />
                <span><b>{e.name}</b><em>{e.rows.toLocaleString()} rows · {e.columns} columns · {ago(e.savedAt)}</em></span>
              </button>
              <button type="button" className="icon-btn" title="Remove from this list" onClick={() => forget(e.id)}><Trash2 size={13} /></button>
            </div>
          ))}

          <div className="menu-label"><ClipboardPaste size={13} /> Examples</div>
          <div className="menu-examples">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className={`menu-item compact ${dataset.example && dataset.name === s.file.replace(/\.csv$/, '') ? 'on' : ''}`} onClick={() => pick(() => onSample(s.file))}>
                <MarkIcon mark={s.mark} size={16} />
                <span><b>{s.title}</b><em>{s.field}</em></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
