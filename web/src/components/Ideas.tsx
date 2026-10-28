import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { aiAvailable, suggestIdeas, type Idea } from '../lib/ai';
import { render } from '../lib/render';
import { suggest } from '../lib/suggest';
import type { Spec } from '../lib/types';
import { useStore } from '../store';

// survives closing the dialog, so reopening doesn't pay for the same ideas twice
let cache: { key: string; ideas: Idea[] } | null = null;

function thumb(spec: Spec, palette: string, dataset: ReturnType<typeof useStore.getState>['dataset']) {
  const s: Spec = { ...spec, stats: { ...spec.stats, test: false }, style: { ...spec.style, title: '', widthMm: 90, heightMm: 58, fontSize: 6, legend: 'none', markSize: 2, palette } };
  try {
    const r = render(s, dataset, { interactive: false });
    return r.svg ? new XMLSerializer().serializeToString(r.svg) : null;
  } catch { return null; }
}

export function IdeasDialog() {
  const dataset = useStore((s) => s.dataset)!;
  const spec = useStore((s) => s.spec);
  const set = useStore((s) => s.set);
  const replace = useStore((s) => s.replace);
  const [context, setContext] = useState('');
  const [ideas, setIdeas] = useState<Idea[] | null>(cache?.key === dataset.name + dataset.rows.length ? cache.ideas : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAI, setHasAI] = useState<boolean | null>(null);
  const close = () => set({ ideasOpen: false });

  useEffect(() => { aiAvailable().then(setHasAI); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const list = await suggestIdeas(dataset, spec, context.trim());
      cache = { key: dataset.name + dataset.rows.length, ideas: list };
      setIdeas(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (hasAI && !ideas && !busy) generate(); }, [hasAI]); // eslint-disable-line react-hooks/exhaustive-deps

  // without AI: the built-in heuristics, explained
  const offline: Idea[] = useMemo(() => suggest(dataset).map((s) => ({ title: s.title, question: '', why: 'Picked automatically from the column types.', spec: s.spec })), [dataset]);
  const shown = hasAI ? ideas ?? [] : offline;
  const thumbs = useMemo(() => shown.map((i) => thumb(i.spec, spec.style.palette, dataset)), [shown, spec.style.palette, dataset]);

  const apply = (idea: Idea) => {
    replace({ ...idea.spec, style: { ...spec.style, title: '', subtitle: '', xLabel: '', yLabel: '', colorLabel: '', xMin: null, xMax: null, yMin: null, yMax: null, xScale: idea.spec.style.xScale, yScale: idea.spec.style.yScale, xTickAngle: null } });
    close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal wide ideas" role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2><Sparkles size={17} /> What could you plot?</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="ideas-body">
          {hasAI ? (
            <div className="ideas-context">
              <input className="input" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Optional: what are you studying? e.g. “does the drug dose speed up responses?”"
                onKeyDown={(e) => { if (e.key === 'Enter') generate(); }} />
              <button type="button" className="btn primary" onClick={generate} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} {ideas ? 'New ideas' : 'Suggest'}
              </button>
            </div>
          ) : hasAI === false ? (
            <p className="muted small">These come from the column types. With an AI key (Settings), Harry reads a statistical summary of your data — never the raw rows — and proposes figures that answer specific research questions.</p>
          ) : null}
          {hasAI && <p className="muted small">Harry sees a summary of your data (column types, ranges, group sizes, correlations), not the rows themselves.</p>}
          {error && <p className="error-text">{error}</p>}
          {busy && !ideas && <div className="ideas-loading"><Loader2 size={18} className="spin" /> Reading your data…</div>}
          <div className="idea-grid">
            {shown.map((idea, i) => (
              <button key={i} type="button" className="idea" onClick={() => apply(idea)}>
                {thumbs[i] && <span className="idea-thumb" dangerouslySetInnerHTML={{ __html: thumbs[i]! }} />}
                <strong>{idea.title}</strong>
                {idea.question && <span className="idea-q">{idea.question}</span>}
                <span className="muted small">{idea.why}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
