import { Info, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyFilters } from '../lib/data';
import { render } from '../lib/render';
import { MM_TO_PX, presetById } from '../lib/spec';
import type { Spec } from '../lib/types';

type EditField = 'title' | 'subtitle' | 'caption' | 'xLabel' | 'yLabel' | 'colorLabel';
import { useStore } from '../store';
import { TypeIcon } from './icons';

export function Canvas() {
  const view = useStore((s) => s.view);
  return (
    <main className="canvas">
      {view === 'figure' ? <Figure /> : <DataTable />}
      <Suggestions />
    </main>
  );
}

function Figure() {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });

  const result = useMemo(() => {
    try { return render(spec, dataset, { interactive: true }); }
    catch (e) { console.error(e); return { svg: null, notes: [], warnings: [`Something went wrong drawing this chart: ${(e as Error).message}`] }; }
  }, [spec, dataset]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = spec.style.widthMm * MM_TO_PX;
  const H = spec.style.heightMm * MM_TO_PX;
  const scale = Math.max(0.2, Math.min((box.w - 48) / W, (box.h - 72) / H, 3));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.replaceChildren();
    if (result.svg) {
      result.svg.style.width = `${W * scale}px`;
      result.svg.style.height = `${H * scale}px`;
      el.appendChild(result.svg);
    }
  }, [result, scale, W, H]);

  const preset = presetById(spec.style.preset);

  // ---- edit text in place: double-click a title, label or legend title
  const update = useStore((s) => s.update);
  const [editing, setEditing] = useState<{ field: EditField; rect: { x: number; y: number; w: number; h: number }; value: string } | null>(null);
  const startEdit = (target: Element | null, field?: EditField) => {
    const el = target?.closest('[data-edit]');
    const f = field ?? (el?.getAttribute('data-edit') as EditField | null);
    if (!f || !host.current) return;
    const paper = host.current.getBoundingClientRect();
    const r = el?.getBoundingClientRect() ?? new DOMRect(paper.left + 8, paper.top + 8, 220, 24);
    const value = spec.style[f] || (el?.textContent ?? '');
    setEditing({ field: f, rect: { x: r.left - paper.left, y: r.top - paper.top, w: Math.max(160, r.width + 40), h: Math.max(26, r.height + 6) }, value });
  };
  const commit = (value: string) => {
    if (!editing) return;
    const f = editing.field;
    update((s) => { s.style[f] = value.trim(); });
    setEditing(null);
  };

  return (
    <div className="stage" ref={stage}>
      {result.svg ? (
        <div className="paper-wrap">
          <div className="paper-holder">
            <div className="paper" ref={host} style={{ width: W * scale, height: H * scale }} onDoubleClick={(e) => startEdit(e.target as Element)} />
            {editing && (
              <input
                className="inline-edit" autoFocus defaultValue={editing.value}
                style={{ left: editing.rect.x, top: editing.rect.y, width: editing.rect.w, height: editing.rect.h }}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commit(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit(e.currentTarget.value);
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            )}
          </div>
          <div className="paper-meta">
            <span>{Math.round(spec.style.widthMm)} × {Math.round(spec.style.heightMm)} mm · {spec.style.fontSize} pt{preset ? ` · ${preset.label}` : ''}</span>
            {!spec.style.title && <button type="button" className="link-btn" onClick={() => startEdit(null, 'title')}>+ Add title</button>}
            <span className="hint">Double-click any title or label to edit it</span>
            {result.notes.map((n) => <span key={n} className="note"><Info size={12} /> {n}</span>)}
            {result.warnings.map((n) => <span key={n} className="note warn"><TriangleAlert size={12} /> {n}</span>)}
          </div>
        </div>
      ) : (
        <div className="empty-figure">
          <TriangleAlert size={22} />
          <p>{result.warnings[0] ?? 'Choose what to plot on the left.'}</p>
          <p className="muted small">Pick columns in “Data on the chart”, or ask Harry below.</p>
        </div>
      )}
    </div>
  );
}

function Suggestions() {
  const dataset = useStore((s) => s.dataset);
  const suggestions = useStore((s) => s.suggestions);
  const spec = useStore((s) => s.spec);
  const replace = useStore((s) => s.replace);

  const thumbs = useMemo(() => suggestions.map((sg) => {
    const thumb: Spec = { ...sg.spec, stats: { ...sg.spec.stats, test: false }, style: { ...sg.spec.style, widthMm: 80, heightMm: 52, fontSize: 6, legend: 'none', markSize: 2, palette: spec.style.palette } };
    try {
      const r = render(thumb, dataset, { interactive: false });
      return r.svg ? new XMLSerializer().serializeToString(r.svg) : null;
    } catch { return null; }
  }), [suggestions, dataset, spec.style.palette]);

  if (!suggestions.length) return null;
  const same = (a: Spec) => a.mark === spec.mark && JSON.stringify(a.enc) === JSON.stringify(spec.enc);

  return (
    <div className="suggestions" aria-label="Other ways to show this data">
      <span className="suggestions-label"><Sparkles size={13} /> Ideas</span>
      {suggestions.map((sg, i) => thumbs[i] && (
        <button key={sg.id} type="button" className={`thumb ${same(sg.spec) ? 'on' : ''}`} title={sg.title}
          onClick={() => replace({ ...sg.spec, style: { ...spec.style, title: '', subtitle: '', xLabel: '', yLabel: '', colorLabel: '', xMin: null, xMax: null, yMin: null, yMax: null, xScale: 'linear', yScale: 'linear' }, filters: spec.filters })}>
          <span className="thumb-img" dangerouslySetInnerHTML={{ __html: thumbs[i]! }} />
          <span className="thumb-title">{sg.title}</span>
        </button>
      ))}
    </div>
  );
}

function DataTable() {
  const dataset = useStore((s) => s.dataset)!;
  const filters = useStore((s) => s.spec.filters);
  const rows = useMemo(() => applyFilters(dataset.rows, filters), [dataset, filters]);
  const shown = rows.slice(0, 500);
  const fmt = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  return (
    <div className="table-wrap">
      <div className="table-meta muted small">
        {rows.length.toLocaleString()} of {dataset.rows.length.toLocaleString()} rows{filters.length ? ' after filters' : ''}{rows.length > 500 ? ' · showing the first 500' : ''}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{dataset.columns.map((c) => <th key={c.name}><TypeIcon type={c.type} /> {c.name}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>{dataset.columns.map((c) => <td key={c.name} className={c.type === 'number' ? 'num' : ''}>{fmt(r[c.name])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
