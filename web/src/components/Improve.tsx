import { Check, Eye, Lightbulb, Loader2, Undo2, X } from 'lucide-react';
import { aiAvailable, critiqueFigure } from '../lib/ai';
import { figurePNG } from '../lib/export';
import { improve } from '../lib/improve';
import { useStore } from '../store';

/** Deterministic fixes first (instant), then — if AI is set up — a vision model looks at the result. */
export async function runImprove() {
  const { spec, dataset, replace, set } = useStore.getState();
  if (!dataset) return;
  const before = spec;
  set({ improve: { status: 'checking', before, fixed: [], advice: [], aiChanges: [] } });

  const { spec: fixedSpec, findings } = improve(spec, dataset);
  const fixed = findings.filter((f) => f.fix).map((f) => ({ issue: f.issue, fix: f.fix! }));
  const advice = findings.filter((f) => !f.fix).map((f) => f.issue);
  if (fixed.length) replace(fixedSpec);

  if (!(await aiAvailable())) {
    set({ improve: { status: 'done', before, fixed, advice, aiChanges: [], error: 'Add an AI key in Settings to also get a visual review.' } });
    return;
  }
  set({ improve: { status: 'ai', before, fixed, advice, aiChanges: [] } });
  try {
    const current = useStore.getState().spec;
    const png = await figurePNG(current, dataset);
    const critique = await critiqueFigure(current, dataset, png, fixed.map((f) => f.fix));
    if (critique.changes.length) useStore.getState().replace(critique.spec);
    set({ improve: { status: 'done', before, fixed, advice, aiChanges: critique.changes } });
  } catch (e) {
    set({ improve: { status: 'done', before, fixed, advice, aiChanges: [], error: `Visual review unavailable: ${(e as Error).message}` } });
  }
}

export function ImprovePanel() {
  const imp = useStore((s) => s.improve);
  const set = useStore((s) => s.set);
  const replace = useStore((s) => s.replace);
  if (!imp) return null;
  const nothing = imp.status === 'done' && !imp.fixed.length && !imp.aiChanges.length && !imp.advice.length;

  return (
    <div className="improve-panel" role="status">
      <header>
        <strong>Improve this plot</strong>
        <button type="button" className="icon-btn" onClick={() => set({ improve: null })} aria-label="Close"><X size={14} /></button>
      </header>
      {imp.fixed.length > 0 && (
        <ul>
          {imp.fixed.map((f) => (
            <li key={f.issue}><Check size={14} className="ok" /><span><b>{f.fix}</b> {f.issue}</span></li>
          ))}
        </ul>
      )}
      {imp.advice.length > 0 && (
        <ul>
          {imp.advice.map((a) => <li key={a}><Lightbulb size={14} className="tip" /><span>{a}</span></li>)}
        </ul>
      )}
      {imp.status === 'checking' && <p className="muted"><Loader2 size={14} className="spin" /> Measuring labels and layout…</p>}
      {imp.status === 'ai' && <p className="muted"><Loader2 size={14} className="spin" /> Harry is looking at the figure…</p>}
      {imp.aiChanges.length > 0 && (
        <ul>
          {imp.aiChanges.map((c) => <li key={c}><Eye size={14} className="ok" /><span>{c}</span></li>)}
        </ul>
      )}
      {nothing && <p className="muted">Nothing to fix — this figure is in good shape.</p>}
      {imp.status === 'done' && imp.aiChanges.length === 0 && !imp.error && !nothing && <p className="muted small">Visual review: nothing else to change.</p>}
      {imp.error && <p className="muted small">{imp.error}</p>}
      {imp.status === 'done' && (imp.fixed.length > 0 || imp.aiChanges.length > 0) && (
        <footer>
          <button type="button" className="btn" onClick={() => { replace(imp.before); set({ improve: null }); }}><Undo2 size={14} /> Undo all</button>
          <button type="button" className="btn primary" onClick={() => set({ improve: null })}>Keep</button>
        </footer>
      )}
    </div>
  );
}
