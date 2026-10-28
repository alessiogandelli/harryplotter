import { Filter as FilterIcon, Plus, Trash2 } from 'lucide-react';
import { levels } from '../lib/data';
import { CATEGORICAL_MARKS, MARKS, markInfo } from '../lib/spec';
import type { Column, ColumnType, EncodingSlot, Filter, Spec } from '../lib/types';
import { useStore } from '../store';
import { ColumnSlot, Field, NumberInput, Section, Segmented, Select, Toggle } from './controls';
import { MarkIcon, TypeIcon } from './icons';

const SLOT_LABELS: Record<EncodingSlot, string> = { x: 'X', y: 'Y', color: 'Color', size: 'Size', facet: 'Panels', facetRow: 'Rows' };

function acceptFor(mark: Spec['mark'], slot: EncodingSlot): ColumnType[] | undefined {
  const cat: ColumnType[] = ['category'];
  const num: ColumnType[] = ['number'];
  if (slot === 'facet' || slot === 'facetRow') return cat;
  if (slot === 'size') return num;
  if (CATEGORICAL_MARKS.includes(mark)) return slot === 'x' || slot === 'color' ? cat : num;
  if (mark === 'heatmap') return slot === 'color' ? num : cat;
  if (mark === 'line' || mark === 'area') return slot === 'x' ? ['date', 'number'] : slot === 'color' ? cat : num;
  if (slot === 'color') return ['category', 'number'];
  return num;
}

export function ChartTab() {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset)!;
  const update = useStore((s) => s.update);
  const info = markInfo(spec.mark);
  const st = spec.stats;
  const m = spec.mark;
  const yNumeric = !!spec.enc.y;
  const hasColor = !!spec.enc.color && spec.enc.color !== spec.enc.x;

  const setStat = <K extends keyof Spec['stats']>(k: K, v: Spec['stats'][K], group?: string) => update((s) => { s.stats[k] = v; }, group);

  return (
    <div className="tab-body">
      <Section title="Chart type">
        <div className="mark-grid">
          {MARKS.map((mk) => (
            <button key={mk.id} type="button" className={`mark-tile ${m === mk.id ? 'on' : ''}`} onClick={() => update((s) => { s.mark = mk.id; })} title={mk.hint}>
              <MarkIcon mark={mk.id} />
              <span>{mk.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {info.slots.length > 0 && (
        <Section title="Data on the chart">
          <div className="slots">
            {info.slots.map((slot) => (
              <ColumnSlot
                key={slot}
                label={SLOT_LABELS[slot]}
                value={spec.enc[slot]}
                columns={dataset.columns}
                required={info.required.includes(slot)}
                accept={acceptFor(m, slot)}
                onChange={(v) => update((s) => { if (v) s.enc[slot] = v; else delete s.enc[slot]; })}
              />
            ))}
          </div>
          {(m === 'scatter' || m === 'line' || CATEGORICAL_MARKS.includes(m)) && spec.enc.x && spec.enc.y && (
            <button type="button" className="link-btn" onClick={() => update((s) => { [s.enc.x, s.enc.y] = [s.enc.y, s.enc.x]; })}>Swap X ↔ Y</button>
          )}
        </Section>
      )}

      <Section title="Statistics">
        {(m === 'bar' || m === 'line' || m === 'area' || m === 'heatmap') && (m !== 'bar' || yNumeric) && (
          <Field label={m === 'heatmap' ? 'Cell value' : 'Summarise Y'}>
            <Select value={st.aggregate} onChange={(v) => setStat('aggregate', v)} options={[
              { value: 'none', label: m === 'bar' || m === 'heatmap' ? 'Mean (default)' : 'Automatic' },
              { value: 'mean', label: 'Mean' }, { value: 'median', label: 'Median' }, { value: 'sum', label: 'Sum' },
              { value: 'count', label: 'Count' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' },
            ]} />
          </Field>
        )}
        {(m === 'bar' || m === 'line') && (m !== 'bar' || yNumeric) && (
          <Field label="Error bars">
            <Segmented value={st.error} onChange={(v) => update((s) => { s.stats.error = v; })} options={[
              { value: 'none', label: 'None' }, { value: 'sd', label: 'SD', title: 'Standard deviation' },
              { value: 'se', label: 'SE', title: 'Standard error of the mean' }, { value: 'ci95', label: '95% CI', title: '95% confidence interval (t)' },
            ]} />
          </Field>
        )}
        {m === 'strip' && (
          <Field label="Mean bars">
            <Segmented value={st.error === 'none' ? 'ci95' : st.error} onChange={(v) => setStat('error', v)} options={[
              { value: 'sd', label: 'SD' }, { value: 'se', label: 'SE' }, { value: 'ci95', label: '95% CI' },
            ]} />
          </Field>
        )}
        {(m === 'scatter' || m === 'line') && (
          <Field label="Trend line">
            <Segmented value={st.trend} onChange={(v) => setStat('trend', v)} options={[
              { value: 'none', label: 'None' }, { value: 'linear', label: 'Linear', title: 'Least-squares fit with 95% confidence band' }, { value: 'loess', label: 'LOESS', title: 'Local smoothing' },
            ]} />
          </Field>
        )}
        {m === 'line' && dataset.columns.find((c) => c.name === spec.enc.x)?.type === 'date' && (
          <Field label="Average per">
            <Select value={st.timeBin} onChange={(v) => setStat('timeBin', v)} options={[
              { value: 'none', label: 'Each date' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' },
            ]} />
          </Field>
        )}
        {(m === 'histogram') && (
          <Field label="Bins"><NumberInput value={st.bins} onChange={(v) => v && setStat('bins', v, 'bins')} /></Field>
        )}
        {(m === 'bar' || m === 'histogram') && hasColor && (
          <Field label={m === 'histogram' ? 'Groups' : 'Sub-groups'}>
            <Segmented value={st.barMode} onChange={(v) => setStat('barMode', v)} options={[
              { value: 'group', label: m === 'histogram' ? 'Overlay' : 'Side by side' }, { value: 'stack', label: 'Stacked' }, { value: 'fill', label: '100%' },
            ]} />
          </Field>
        )}
        {CATEGORICAL_MARKS.includes(m) && spec.enc.x && (
          <Field label="Order">
            <Segmented value={st.sort} onChange={(v) => setStat('sort', v)} options={[
              { value: 'none', label: 'Natural' }, { value: 'desc', label: 'Largest first' }, { value: 'asc', label: 'Smallest first' },
            ]} />
          </Field>
        )}
        {(['bar', 'box', 'violin', 'line', 'density'] as Spec['mark'][]).includes(m) && (
          <Toggle label={m === 'line' ? 'Show markers' : m === 'density' ? 'Show rug' : 'Show every observation'} checked={st.points} onChange={(v) => setStat('points', v)} />
        )}
        {(m === 'scatter' || m === 'line' || CATEGORICAL_MARKS.includes(m)) && (
          <Toggle
            label={m === 'scatter' || m === 'line' ? 'Show r and p-value' : 'Show significance test'}
            hint={m === 'scatter' || m === 'line' ? 'Pearson correlation with two-sided p' : 'Welch t-test for two groups, one-way ANOVA for more'}
            checked={st.test} onChange={(v) => setStat('test', v)}
          />
        )}
        {(m === 'heatmap' || m === 'corr') && <Toggle label="Numbers in cells" checked={st.labels} onChange={(v) => setStat('labels', v)} />}
      </Section>

      <Filters />
      <ColumnList columns={dataset.columns} />
    </div>
  );
}

function Filters() {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset)!;
  const update = useStore((s) => s.update);
  const usable = dataset.columns.filter((c) => c.type !== 'text');

  const add = () => {
    const first = usable.find((c) => c.type === 'category') ?? usable[0];
    if (!first) return;
    update((s) => { s.filters.push(first.type === 'category' ? { column: first.name, in: levels(dataset.rows, first.name) } : { column: first.name, min: null, max: null }); });
  };

  return (
    <Section title={`Filters${spec.filters.length ? ` · ${spec.filters.length}` : ''}`} open={spec.filters.length > 0}
      aside={<button type="button" className="icon-btn" onClick={add} title="Add a filter"><Plus size={15} /></button>}>
      {!spec.filters.length && <p className="muted small">Keep only part of the data — a group, a time window, a range. <button type="button" className="link-btn" onClick={add}><FilterIcon size={12} /> Add filter</button></p>}
      {spec.filters.map((f, i) => <FilterRow key={i} index={i} filter={f} columns={usable} />)}
    </Section>
  );
}

function FilterRow({ index, filter, columns }: { index: number; filter: Filter; columns: Column[] }) {
  const dataset = useStore((s) => s.dataset)!;
  const update = useStore((s) => s.update);
  const col = columns.find((c) => c.name === filter.column);
  const all = col?.type === 'category' ? levels(dataset.rows, filter.column) : [];
  const chosen = new Set(filter.in ?? all);
  const set = (fn: (f: Filter) => void, group?: string) => update((s) => { fn(s.filters[index]); }, group);

  return (
    <div className="filter">
      <div className="filter-head">
        <Select value={filter.column} options={columns.map((c) => ({ value: c.name, label: c.name }))} onChange={(v) => update((s) => {
          const c = columns.find((x) => x.name === v)!;
          s.filters[index] = c.type === 'category' ? { column: v, in: levels(dataset.rows, v) } : { column: v, min: null, max: null };
        })} />
        <button type="button" className="icon-btn" onClick={() => update((s) => { s.filters.splice(index, 1); })} aria-label="Remove filter"><Trash2 size={14} /></button>
      </div>
      {col?.type === 'category' ? (
        <div className="chips">
          {all.slice(0, 40).map((v) => (
            <button key={v} type="button" className={`chip ${chosen.has(v) ? 'on' : ''}`} onClick={() => set((f) => {
              const next = new Set(f.in ?? all);
              if (next.has(v)) next.delete(v); else next.add(v);
              f.in = all.filter((x) => next.has(x));
            })}>{v}</button>
          ))}
          <button type="button" className="link-btn" onClick={() => set((f) => { f.in = chosen.size === all.length ? [] : all; })}>{chosen.size === all.length ? 'none' : 'all'}</button>
        </div>
      ) : (
        <div className="range">
          <NumberInput value={filter.min ?? null} placeholder={col?.type === 'date' ? 'from (any)' : `min ${col?.min !== undefined ? +col.min.toPrecision(3) : ''}`} onChange={(v) => set((f) => { f.min = v; }, `fmin${index}`)} />
          <span className="muted">to</span>
          <NumberInput value={filter.max ?? null} placeholder={col?.type === 'date' ? 'to (any)' : `max ${col?.max !== undefined ? +col.max.toPrecision(3) : ''}`} onChange={(v) => set((f) => { f.max = v; }, `fmax${index}`)} />
        </div>
      )}
    </div>
  );
}

function ColumnList({ columns }: { columns: Column[] }) {
  return (
    <Section title={`Columns · ${columns.length}`} open={false}>
      <p className="muted small">Drag a column onto X, Y, Color…</p>
      <ul className="columns">
        {columns.map((c) => (
          <li key={c.name} draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-column', c.name); e.dataTransfer.effectAllowed = 'copy'; }} title={c.sample.join(', ')}>
            <TypeIcon type={c.type} />
            <span className="col-name">{c.name}</span>
            <span className="muted small">{c.type === 'number' && c.min !== undefined ? `${+c.min.toPrecision(3)} – ${+c.max!.toPrecision(3)}` : `${c.unique} values`}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
