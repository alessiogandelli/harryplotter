import { Check, CircleSlash, Copy, Download, FileCode2, FileImage, FileText, KeyRound, Loader2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiSource, loadSettings, saveSettings, serverHasAI, testLocal, type AIMode, type AISettings, type AISource } from '../lib/ai';
import { Segmented } from './controls';
import { toJSON, toPython, toR } from '../lib/codegen';
import { commands, score } from '../lib/commands';
import { toCSV } from '../lib/data';
import { copyPNG, download, exportFigure, fileBase, type ExportFormat } from '../lib/export';
import { presetById } from '../lib/spec';
import { useStore } from '../store';
import { SAMPLES } from './Welcome';

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

  const all = useMemo(() => commands(dataset, spec, SAMPLES), [dataset, spec]);
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

const MODES: { value: AIMode; label: string; title: string }[] = [
  { value: 'auto', label: 'Auto', title: 'Use the Harry server when it is on, otherwise your key' },
  { value: 'server', label: 'Server', title: 'Only the Harry Plotter server' },
  { value: 'key', label: 'My key', title: 'An OpenAI-compatible API with your own key' },
  { value: 'local', label: 'Local model', title: 'A model running on this computer (Ollama, LM Studio…)' },
  { value: 'off', label: 'Off', title: 'No AI: nothing about your data leaves this browser' },
];

export function SettingsDialog() {
  const set = useStore((s) => s.set);
  const [s, setS] = useState<AISettings>(loadSettings());
  const [source, setSource] = useState<AISource | null>(null);
  const [testing, setTesting] = useState(false);
  const close = () => set({ settingsOpen: false });
  const refresh = async (next = s) => {
    saveSettings(next);
    setTesting(true);
    await serverHasAI(true);
    let src = await aiSource();
    if (src.kind === 'local') {
      const err = await testLocal(next);
      if (err) src = { kind: 'none', label: 'Local model', detail: err };
    }
    setSource(src);
    setTesting(false);
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (p: Partial<AISettings>) => setS({ ...s, ...p });

  return (
    <Modal title={<><KeyRound size={16} /> AI assistant</>} onClose={close}>
      <div className="settings">
        <Segmented value={s.mode} onChange={(mode) => { const n = { ...s, mode }; setS(n); refresh(n); }} options={MODES} />

        <p className={`ai-status ${source?.kind === 'none' ? 'off' : 'on'}`}>
          {testing ? <Loader2 size={14} className="spin" /> : source?.kind === 'none' ? <CircleSlash size={14} /> : <Check size={14} />}
          {testing ? 'Checking…' : source ? <><b>{source.label}</b>{source.detail ? ` · ${source.detail}` : ''}</> : ''}
        </p>

        {(s.mode === 'auto' || s.mode === 'server') && (
          <label className="field"><span className="field-label">Harry Plotter server</span>
            <input className="input" value={s.serverUrl} onChange={(e) => patch({ serverUrl: e.target.value })} placeholder={DEFAULT_SERVER_HINT} />
          </label>
        )}

        {(s.mode === 'auto' || s.mode === 'key') && (
          <>
            {s.mode === 'auto' && <p className="muted small">When the server is off, your own key is used (if you add one):</p>}
            <label className="field"><span className="field-label">API base URL</span><input className="input" value={s.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></label>
            <label className="field"><span className="field-label">API key</span><input className="input" type="password" value={s.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} placeholder="sk-…" autoComplete="off" /></label>
            <label className="field"><span className="field-label">Model</span><input className="input" value={s.model} onChange={(e) => patch({ model: e.target.value })} placeholder="deepseek/deepseek-v4.1-flash" /></label>
            <div className="presets-row">
              {[
                ['OpenRouter', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash'],
                ['OpenAI', 'https://api.openai.com/v1', 'gpt-5-mini'],
              ].map(([n, u, m]) => <button key={n} type="button" className="chip" onClick={() => patch({ baseUrl: u, model: m })}>{n}</button>)}
            </div>
            <p className="muted small">The key stays in this browser and goes only to that address.</p>
          </>
        )}

        {s.mode === 'local' && (
          <>
            <label className="field"><span className="field-label">Local server (OpenAI-compatible)</span><input className="input" value={s.localUrl} onChange={(e) => patch({ localUrl: e.target.value })} placeholder="http://localhost:11434/v1" /></label>
            <label className="field"><span className="field-label">Model</span><input className="input" value={s.localModel} onChange={(e) => patch({ localModel: e.target.value })} placeholder="qwen2.5vl:7b" /></label>
            <div className="presets-row">
              {[
                ['Ollama', 'http://localhost:11434/v1', 'qwen2.5vl:7b'],
                ['LM Studio', 'http://localhost:1234/v1', 'qwen2.5-vl-7b-instruct'],
                ['llama.cpp', 'http://localhost:8080/v1', 'default'],
              ].map(([n, u, m]) => <button key={n} type="button" className="chip" onClick={() => patch({ localUrl: u, localModel: m })}>{n}</button>)}
            </div>
            {!isLocalPage() && (
              <div className="hint-box">
                The editor runs on <code>{location.origin}</code>, so your local model must allow it:
                <ul>
                  <li><b>Ollama:</b> start it with <code>OLLAMA_ORIGINS={location.origin} ollama serve</code></li>
                  <li><b>LM Studio:</b> Developer → Server settings → enable <i>CORS</i></li>
                  <li><b>llama.cpp:</b> <code>llama-server</code> already allows any origin</li>
                </ul>
                Your browser may ask permission to reach devices on your network: allow it. Safari can block this entirely; use Chrome, Edge or Firefox, or run Harry on your computer (<code>pip install harryplotter</code>).
              </div>
            )}
            <p className="muted small">Pick a vision model (e.g. qwen2.5-vl) so “Improve” can look at the figure.</p>
          </>
        )}

        {s.mode !== 'off' && (
          <details className="privacy">
            <summary>What the AI sees</summary>
            Column names, up to 8 example values per column, summary statistics (ranges, means, group sizes, correlations) and the figure settings; for “Improve”, a picture of the figure. Never your rows. Choose <b>Off</b> for sensitive data: everything else keeps working.
          </details>
        )}

        <div className="modal-actions">
          {s.apiKey && (s.mode === 'auto' || s.mode === 'key') && <button type="button" className="btn" onClick={() => { const c = { ...s, apiKey: '' }; setS(c); refresh(c); }}>Forget key</button>}
          <button type="button" className="btn" onClick={() => refresh()} disabled={testing}>Test</button>
          <button type="button" className="btn primary" onClick={() => { saveSettings(s); close(); }}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

const DEFAULT_SERVER_HINT = (import.meta.env.VITE_HP_SERVER as string | undefined) || 'same address as the editor';
const isLocalPage = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
