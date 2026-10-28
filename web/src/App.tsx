import { Command, Database, Download, Image, Monitor, Moon, Redo2, Settings, Sun, Table2, Undo2, WandSparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { ChartTab } from './components/ChartTab';
import { CommandPalette, ExportDialog, SettingsDialog } from './components/Dialogs';
import { Logo } from './components/icons';
import { PromptBar } from './components/PromptBar';
import { IdeasDialog } from './components/Ideas';
import { ImprovePanel, runImprove } from './components/Improve';
import { StyleTab } from './components/StyleTab';
import { SAMPLES, Welcome } from './components/Welcome';
import { mergePatch } from './lib/ai';
import { emptySpec } from './lib/spec';
import { buildDataset, parseDelimited, parseFile } from './lib/data';
import { copyPNG } from './lib/export';
import { autoSpec } from './lib/suggest';
import { applyTheme, loadTheme, type UITheme } from './lib/theme';
import { restoreSession, startAutosave, useStore } from './store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl ';

export default function App() {
  const dataset = useStore((s) => s.dataset);
  const tab = useStore((s) => s.tab);
  const view = useStore((s) => s.view);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const { paletteOpen, exportOpen, settingsOpen, ideasOpen, improve, toast } = useStore();
  const { set, undo, redo, loadDataset, notify } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [exportTab, setExportTab] = useState<'image' | 'code'>('image');
  const [uiTheme, setUiTheme] = useState<UITheme>(loadTheme());
  const cycleTheme = () => {
    const next: UITheme = uiTheme === 'light' ? 'dark' : uiTheme === 'dark' ? 'system' : 'light';
    applyTheme(next);
    setUiTheme(next);
  };
  const fileInput = useRef<HTMLInputElement>(null);

  const openFiles = useCallback(async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    try {
      if (file.name.endsWith('.hplot.json')) {
        const p = JSON.parse(await file.text());
        loadDataset(buildDataset(p.data.name, p.data.rows, p.data.columns), p.spec);
      } else {
        loadDataset(await parseFile(file));
      }
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
      notify(`Could not read ${file.name}`);
    }
  }, [loadDataset, notify]);

  const openSample = useCallback(async (name: string) => {
    const text = await (await fetch(`samples/${name}`)).text();
    const d = parseDelimited(name.replace(/\.csv$/, ''), text);
    const showcase = SAMPLES.find((s) => s.file === name)?.spec;
    loadDataset(d, showcase ? mergePatch(emptySpec(), showcase) : undefined);
  }, [loadDataset]);

  // startup: a dataset handed over by the Python server, else the last session
  useEffect(() => {
    (async () => {
      try {
        // the Python server (CLI or `hp.plot(df)`) hands over a file to open
        const id = new URLSearchParams(location.search).get('d') ?? '';
        const r = await fetch(`api/initial?d=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (r.ok && r.headers.get('content-type')?.includes('json')) {
          const p = await r.json();
          if (p?.url) {
            const blob = await (await fetch(p.url)).blob();
            const d = await parseFile(new File([blob], p.filename ?? 'data.csv'));
            if (p.name) d.name = p.name;
            loadDataset(d, p.spec ?? undefined);
            setReady(true);
            startAutosave();
            return;
          }
        }
      } catch { /* static hosting: no server */ }
      await restoreSession();
      setReady(true);
      startAutosave();
    })();
  }, [loadDataset]);

  const appAction = useCallback((a: string) => {
    const s = useStore.getState();
    if (a === 'export') { setExportTab('image'); set({ exportOpen: true }); }
    if (a === 'code') { setExportTab('code'); set({ exportOpen: true }); }
    if (a === 'data') set({ view: s.view === 'data' ? 'figure' : 'data' });
    if (a === 'open') fileInput.current?.click();
    if (a === 'reset' && s.dataset) s.replace(autoSpec(s.dataset));
    if (a.startsWith('sample:')) openSample(a.slice(7));
    if (a === 'improve') runImprove();
    if (a === 'ideas') set({ ideasOpen: true });
    if (a === 'copy' && s.dataset) copyPNG(s.spec, s.dataset).then(() => notify('Image copied — paste it anywhere'), () => notify('Your browser blocked clipboard images'));
  }, [set, notify, openSample]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (useStore.getState().dataset) set({ paletteOpen: !useStore.getState().paletteOpen }); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); appAction('export'); }
      if (!mod && e.key === '/') { e.preventDefault(); document.getElementById('prompt-input')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set, undo, redo, appAction]);

  // paste a table straight from Excel / Sheets / a CSV in the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const file = e.clipboardData?.files?.[0];
      if (file) { e.preventDefault(); openFiles([file]); return; }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.split('\n').length >= 3 && /[\t,;]/.test(text)) {
        e.preventDefault();
        try { loadDataset(parseDelimited('pasted data', text)); notify('Pasted table loaded'); }
        catch (err) { notify(`Could not read the pasted table: ${(err as Error).message}`); }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [openFiles, loadDataset, notify]);

  // drop a new file anywhere
  const [dragging, setDragging] = useState(false);

  if (!ready) return <div className="boot"><Logo size={36} /></div>;

  return (
    <div
      className="app"
      onDragOver={(e) => { if (dataset && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); openFiles(e.dataTransfer.files); } }}
    >
      <input ref={fileInput} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.json" onChange={(e) => e.target.files?.length && openFiles(e.target.files)} />
      <header className="topbar">
        <div className="brand"><Logo /><span>Harry Plotter</span></div>
        {dataset && (
          <button type="button" className="dataset-chip" onClick={() => fileInput.current?.click()} title="Open another file">
            <Database size={14} />
            <strong>{dataset.name}</strong>
            <span className="muted">{dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns</span>
          </button>
        )}
        <div className="spacer" />
        {dataset && (
          <>
            <div className="btn-group">
              <button type="button" className="icon-btn" onClick={undo} disabled={!past} title={`Undo (${MOD}Z)`}><Undo2 size={16} /></button>
              <button type="button" className="icon-btn" onClick={redo} disabled={!future} title={`Redo (${MOD}⇧Z)`}><Redo2 size={16} /></button>
            </div>
            <div className="btn-group view-toggle">
              <button type="button" className={view === 'figure' ? 'on' : ''} onClick={() => set({ view: 'figure' })} title="Figure"><Image size={15} /></button>
              <button type="button" className={view === 'data' ? 'on' : ''} onClick={() => set({ view: 'data' })} title="Data table"><Table2 size={15} /></button>
            </div>
            <button type="button" className="btn ghost cmdk" onClick={() => set({ paletteOpen: true })}><Command size={14} /> <span>Commands</span> <kbd>{MOD}K</kbd></button>
          </>
        )}
        <button type="button" className="icon-btn" onClick={cycleTheme} title={`Editor theme: ${uiTheme} (click to change)`}>
          {uiTheme === 'light' ? <Sun size={16} /> : uiTheme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
        </button>
        <button type="button" className="icon-btn" onClick={() => set({ settingsOpen: true })} title="AI settings"><Settings size={16} /></button>
        {dataset && (
          <button type="button" className="btn improve-btn" onClick={() => runImprove()} disabled={!!improve && improve.status !== 'done'} title="Fix overlapping labels, clutter and other annoyances">
            <WandSparkles size={15} /> <span>Improve</span>
          </button>
        )}
        {dataset && <button type="button" className="btn primary" onClick={() => appAction('export')}><Download size={15} /> <span>Export</span></button>}
      </header>

      {dataset ? (
        <div className="workspace">
          <aside className="sidebar">
            <div className="tabs">
              <button type="button" className={tab === 'chart' ? 'on' : ''} onClick={() => set({ tab: 'chart' })}>Chart</button>
              <button type="button" className={tab === 'style' ? 'on' : ''} onClick={() => set({ tab: 'style' })}>Style</button>
            </div>
            {tab === 'chart' ? <ChartTab /> : <StyleTab />}
          </aside>
          <div className="center">
            <Canvas />
            <ImprovePanel />
            <PromptBar />
          </div>
        </div>
      ) : (
        <Welcome onFiles={openFiles} onSample={openSample} error={error} />
      )}

      {dragging && <div className="drop-overlay">Drop to open this file</div>}
      {paletteOpen && <CommandPalette onApp={appAction} />}
      {exportOpen && dataset && <ExportDialog initialTab={exportTab} />}
      {settingsOpen && <SettingsDialog />}
      {ideasOpen && dataset && <IdeasDialog />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
