import { Check, Copy, Download, FileCode2, FileImage, FileText, KeyRound, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadSettings, saveSettings, serverHasAI, type AISettings } from '../lib/ai';
import { toJSON, toPython, toR } from '../lib/codegen';
import { commands, score } from '../lib/commands';
import { toCSV } from '../lib/data';
import { copyPNG, download, exportFigure, fileBase, type ExportFormat } from '../lib/export';
import { presetById } from '../lib/spec';
import { useStore } from '../store';

function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ⌘K

export function CommandPalette({ onApp }: { onApp: (action: string) => void }) {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset);
  const replace = useStore((s) => s.replace);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const all = useMemo(() => commands(dataset, spec), [dataset, spec]);
  const results = useMemo(() => {
    if (!q.trim()) return all.filter((c) => !c.id.startsWith('enc:') || c.id.includes(':none')).slice(0, 60);
    return all.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.c);
  }, [all, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => { list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const close = () => set({ paletteOpen: false });
  const run = (i: number) => {
    const c = results[i];
    if (!c) return;
    const out = c.run(spec);
    close();
    if (typeof out === 'string') onApp(out.slice(4));
    else replace(out);
  };

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette-box" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            autoFocus value={q} placeholder="Type a command — “violin”, “color topic”, “nature”, “log y”, “export”…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); run(sel); }
              if (e.key === 'Escape') close();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul ref={list} className="palette-list">
          {results.map((c, i) => (
            <li key={c.id} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); run(i); }}>
              <span>{c.label}</span>
              <span className="muted small">{c.group}</span>
            </li>
          ))}
          {!results.length && <li className="muted">Nothing matches — try the prompt bar instead.</li>}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- export

const FORMATS: { id: ExportFormat; label: string; note: string; icon: ReactNode }[] = [
  { id: 'pdf', label: 'PDF', note: 'Vector · for LaTeX & journals', icon: <FileText size={18} /> },
  { id: 'svg', label: 'SVG', note: 'Vector · editable in Illustrator, Inkscape', icon: <FileCode2 size={18} /> },
  { id: 'png', label: 'PNG', note: 'Image · Word, slides, web', icon: <FileImage size={18} /> },
  { id: 'tiff', label: 'TIFF', note: 'Image · journal submission systems', icon: <FileImage size={18} /> },
];

export function ExportDialog({ initialTab = 'image' }: { initialTab?: 'image' | 'code' }) {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset)!;
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const [tab, setTab] = useState<'image' | 'code'>(initialTab);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [dpi, setDpi] = useState(300);
  const [lang, setLang] = useState<'python' | 'r' | 'json'>('python');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => set({ exportOpen: false });
  const preset = presetById(spec.style.preset);
  const file = `${dataset.name}.csv`;

  const code = useMemo(() => {
    try { return lang === 'python' ? toPython(spec, dataset, file) : lang === 'r' ? toR(spec, dataset, file) : toJSON(spec); }
    catch (e) { return `# could not generate code: ${(e as Error).message}`; }
  }, [lang, spec, dataset, file]);

  async function doExport() {
    setBusy(true);
    try { await exportFigure(spec, dataset, format, dpi); notify(`Saved ${format.toUpperCase()}`); }
    catch (e) { notify(`Export failed: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  const px = (mm: number) => Math.round((mm / 25.4) * dpi);

  return (
    <Modal title="Export" onClose={close} wide>
      <div className="tabs-inline">
        <button type="button" className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>Figure file</button>
        <button type="button" className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>Code &amp; project</button>
      </div>
      {tab === 'image' ? (
        <div className="export-body">
          <div className="formats">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className={`format ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)}>
                {f.icon}
                <strong>{f.label}</strong>
                <span className="muted small">{f.note}</span>
              </button>
            ))}
          </div>
          {(format === 'png' || format === 'tiff') && (
            <div className="dpi">
              <span>Resolution</span>
              {[150, 300, 600, 1200].map((d) => <button key={d} type="button" className={`chip ${dpi === d ? 'on' : ''}`} onClick={() => setDpi(d)}>{d} dpi</button>)}
              <span className="muted small">{px(spec.style.widthMm)} × {px(spec.style.heightMm)} px</span>
            </div>
          )}
          <p className="muted small">
            {Math.round(spec.style.widthMm * 10) / 10} × {Math.round(spec.style.heightMm * 10) / 10} mm at {spec.style.fontSize} pt{preset ? ` — ${preset.label}` : ''}. The file is exactly the size you see in the editor, so text is never rescaled by the journal.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={async () => { try { await copyPNG(spec, dataset); notify('Image copied — paste it anywhere'); } catch { notify('Your browser blocked clipboard images'); } }}><Copy size={15} /> Copy image</button>
            <button type="button" className="btn primary" onClick={doExport} disabled={busy}><Download size={15} /> {busy ? 'Exporting…' : `Download ${format.toUpperCase()}`}</button>
          </div>
        </div>
      ) : (
        <div className="export-body">
          <p className="muted small">The same figure as a script — drop it into your analysis so it is reproducible and versionable. It expects the data in <code>{file}</code>.</p>
          <div className="code-tabs">
            {(['python', 'r', 'json'] as const).map((l) => (
              <button key={l} type="button" className={`chip ${lang === l ? 'on' : ''}`} onClick={() => setLang(l)}>
                {l === 'python' ? 'Python · seaborn' : l === 'r' ? 'R · ggplot2' : 'Spec JSON'}
              </button>
            ))}
          </div>
          <pre className="code"><code>{code}</code></pre>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => download(`${file}`, new Blob([toCSV(dataset)], { type: 'text/csv' }))}><Download size={15} /> Data (CSV)</button>
            <button type="button" className="btn" onClick={() => download(`${fileBase(spec, dataset)}.hplot.json`, new Blob([JSON.stringify({ harryplotter: 1, spec, data: { name: dataset.name, columns: dataset.columns.map((c) => c.name), rows: dataset.rows } })], { type: 'application/json' }))}><Download size={15} /> Project (.hplot.json)</button>
            <button type="button" className="btn primary" onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsDialog() {
  const set = useStore((s) => s.set);
  const [s, setS] = useState<AISettings>(loadSettings());
  const [server, setServer] = useState<boolean | null>(null);
  useEffect(() => { serverHasAI().then(setServer); }, []);
  const close = () => set({ settingsOpen: false });

  return (
    <Modal title={<><KeyRound size={16} /> AI assistant</>} onClose={close}>
      <div className="settings">
        {server ? (
          <p className="ok-box"><Check size={15} /> Connected through the Harry Plotter server — the key stays on the server.</p>
        ) : (
          <>
            <p className="muted small">Harry works without AI: every control, ⌘K and short phrases (“log y”, “color by group”). For free-form requests connect any OpenAI-compatible API — OpenRouter, OpenAI, a local Ollama or LM Studio. The key stays in this browser.</p>
            <label className="field"><span className="field-label">API base URL</span><input className="input" value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></label>
            <label className="field"><span className="field-label">API key</span><input className="input" type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-…" autoComplete="off" /></label>
            <label className="field"><span className="field-label">Model</span><input className="input" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="deepseek/deepseek-v4.1-flash" /></label>
            <div className="presets-row">
              {[
                ['OpenRouter', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash'],
                ['OpenAI', 'https://api.openai.com/v1', 'gpt-5-mini'],
                ['Ollama (local)', 'http://localhost:11434/v1', 'qwen2.5:7b'],
              ].map(([n, u, m]) => <button key={n} type="button" className="chip" onClick={() => setS({ ...s, baseUrl: u, model: m })}>{n}</button>)}
            </div>
            <div className="modal-actions">
              {s.apiKey && <button type="button" className="btn" onClick={() => { const c = { ...s, apiKey: '' }; setS(c); saveSettings(c); }}>Forget key</button>}
              <button type="button" className="btn primary" onClick={() => { saveSettings(s); close(); }}>Save</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
