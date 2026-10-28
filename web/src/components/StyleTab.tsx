import { Plus, Trash2 } from 'lucide-react';
import { columnOf, levels } from '../lib/data';
import { PALETTES, PRESETS, applyPreset, groupColors, markInfo, paletteById, prettify, singleColor } from '../lib/spec';
import type { Spec } from '../lib/types';
import { useStore } from '../store';
import { Field, NumberInput, Section, Segmented, Select, Slider, TextInput } from './controls';

export function StyleTab() {
  const spec = useStore((s) => s.spec);
  const update = useStore((s) => s.update);
  const st = spec.style;
  const set = <K extends keyof Spec['style']>(k: K, v: Spec['style'][K], group?: string) => update((s) => { s.style[k] = v; }, group ?? k);
  const m = spec.mark;
  const hasAxes = m !== 'corr';
  const continuousX = ['scatter', 'line', 'area', 'histogram', 'density'].includes(m);
  const continuousY = !['heatmap', 'corr'].includes(m);
  const hasColor = !!spec.enc.color && markInfo(m).slots.includes('color');
  const dataset = useStore((s) => s.dataset);
  const colorType = columnOf(dataset, spec.enc.color)?.type;
  // charts whose colours come from a continuous scale rather than one colour per group
  const continuousColor = m === 'heatmap' || (hasColor && colorType === 'number' && ['scatter', 'line', 'area'].includes(m));
  const effectivePalette = continuousColor && paletteById(st.palette).kind === 'categorical' ? 'viridis' : st.palette;
  const groupedX = ['bar', 'box', 'violin', 'strip', 'histogram'].includes(m);

  return (
    <div className="tab-body">
      <Section title="Size">
        <Field label="Made for">
          <Select value={st.preset} onChange={(v) => update((s) => { s.style = applyPreset(s.style, v); })} options={[
            ...PRESETS.map((p) => ({ value: p.id, label: `${p.label}`, group: p.group })),
            { value: 'custom', label: 'Custom size', group: 'Other' },
          ]} />
        </Field>
        <div className="row2">
          <Field label="Width (mm)"><NumberInput value={Math.round(st.widthMm * 10) / 10} onChange={(v) => v && update((s) => { s.style.widthMm = v; s.style.preset = 'custom'; }, 'w')} /></Field>
          <Field label="Height (mm)"><NumberInput value={Math.round(st.heightMm * 10) / 10} onChange={(v) => v && update((s) => { s.style.heightMm = v; s.style.preset = 'custom'; }, 'h')} /></Field>
        </div>
      </Section>

      <Section title="Text">
        <Field label="Title"><TextInput value={st.title} placeholder="No title" onChange={(v) => set('title', v)} /></Field>
        <Field label="Subtitle"><TextInput value={st.subtitle} placeholder="—" onChange={(v) => set('subtitle', v)} /></Field>
        {hasAxes && <Field label="X label"><TextInput value={st.xLabel} placeholder={prettify(spec.enc.x) || 'automatic'} onChange={(v) => set('xLabel', v)} /></Field>}
        {hasAxes && <Field label="Y label"><TextInput value={st.yLabel} placeholder={prettify(spec.enc.y) || 'automatic'} onChange={(v) => set('yLabel', v)} /></Field>}
        {hasColor && <Field label="Legend title"><TextInput value={st.colorLabel} placeholder={prettify(spec.enc.color)} onChange={(v) => set('colorLabel', v)} /></Field>}
        <Field label="Caption"><TextInput value={st.caption} placeholder="Source, n, notes…" onChange={(v) => set('caption', v)} /></Field>
      </Section>

      <Section title="Colors & look">
        {m === 'corr' ? (
          <p className="muted small">Correlations always use a blue–red scale centred on 0, so the sign reads at a glance.</p>
        ) : (
          <>
            <div className="palettes">
              {PALETTES.filter((p) => (continuousColor ? p.kind !== 'categorical' : true)).map((p) => (
                <button key={p.id} type="button" className={`palette ${effectivePalette === p.id ? 'on' : ''}`} onClick={() => set('palette', p.id)} title={p.note ?? p.label}>
                  <span className="swatches">
                    {p.kind !== 'categorical'
                      ? <span className="ramp" style={{ background: `linear-gradient(90deg, ${p.colors.join(',')})` }} />
                      : p.colors.slice(0, 6).map((c) => <span key={c} style={{ background: c }} />)}
                  </span>
                  <span className="palette-name">{p.label}{p.note && <em> · {p.note}</em>}</span>
                </button>
              ))}
            </div>
            {!continuousColor && <ColorPickers />}
          </>
        )}
        <Field label="Theme">
          <Segmented value={st.theme} onChange={(v) => set('theme', v)} options={[
            { value: 'clean', label: 'Clean' }, { value: 'classic', label: 'Boxed' }, { value: 'minimal', label: 'Minimal' }, { value: 'dark', label: 'Dark' },
          ]} />
        </Field>
        {hasAxes && m !== 'heatmap' && (
          <Field label="Gridlines">
            {/* charts with grouped or binned x have no vertical grid to show */}
            <Segmented value={st.grid} onChange={(v) => set('grid', v)} options={groupedX ? [
              { value: 'none', label: 'None' }, { value: 'y', label: 'Horizontal' },
            ] : [
              { value: 'none', label: 'None' }, { value: 'y', label: 'Horizontal' }, { value: 'x', label: 'Vertical' }, { value: 'both', label: 'Both' },
            ]} />
          </Field>
        )}
        {hasColor && (
          <Field label="Legend">
            <Segmented value={continuousColor && st.legend !== 'none' ? 'auto' : st.legend} onChange={(v) => set('legend', v)} options={continuousColor ? [
              { value: 'auto', label: 'Shown' }, { value: 'none', label: 'Hidden' },
            ] : [
              { value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' }, { value: 'none', label: 'Hidden' },
            ]} />
          </Field>
        )}
      </Section>

      <Section title="Typography">
        <Field label="Font">
          <Segmented value={st.font} onChange={(v) => set('font', v)} options={[
            { value: 'sans', label: <span style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>Helvetica</span> },
            { value: 'serif', label: <span style={{ fontFamily: 'Times New Roman, Times, serif' }}>Times</span> },
            { value: 'mono', label: <span style={{ fontFamily: 'Courier New, monospace' }}>Courier</span> },
          ]} />
        </Field>
        <Field label="Size"><Slider value={st.fontSize} min={5} max={28} step={0.5} format={(v) => `${v} pt`} onChange={(v) => set('fontSize', v)} /></Field>
      </Section>

      {hasAxes && (
        <Section title="Axes" open={false}>
          {continuousX && (
            <Field label="X scale">
              <Segmented value={st.xScale} onChange={(v) => set('xScale', v)} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }, { value: 'sqrt', label: '√' }]} />
            </Field>
          )}
          {continuousY && m !== 'density' && (
            <Field label="Y scale">
              <Segmented value={st.yScale} onChange={(v) => set('yScale', v)} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }, { value: 'sqrt', label: '√' }]} />
            </Field>
          )}
          {continuousX && (
            <div className="row2">
              <Field label="X from"><NumberInput value={st.xMin} onChange={(v) => set('xMin', v)} /></Field>
              <Field label="X to"><NumberInput value={st.xMax} onChange={(v) => set('xMax', v)} /></Field>
            </div>
          )}
          {continuousY && (
            <div className="row2">
              <Field label="Y from"><NumberInput value={st.yMin} onChange={(v) => set('yMin', v)} /></Field>
              <Field label="Y to"><NumberInput value={st.yMax} onChange={(v) => set('yMax', v)} /></Field>
            </div>
          )}
          <Field label="X labels">
            <Segmented value={st.xTickAngle === null ? 'auto' : String(st.xTickAngle)} onChange={(v) => set('xTickAngle', v === 'auto' ? null : Number(v))} options={[
              { value: 'auto', label: 'Auto' }, { value: '0', label: 'Flat' }, { value: '45', label: '45°' }, { value: '90', label: '90°' },
            ]} />
          </Field>
          {continuousY && !['bar', 'histogram', 'area', 'density'].includes(m) && (
            <Field label="Y starts at 0">
              <Segmented value={st.zeroY ? 'yes' : 'no'} onChange={(v) => set('zeroY', v === 'yes')} options={[{ value: 'no', label: 'Fit data' }, { value: 'yes', label: 'Zero' }]} />
            </Field>
          )}
        </Section>
      )}

      {!['heatmap', 'corr'].includes(m) && (
        <Section title="Marks" open={false}>
          {(['scatter', 'strip', 'box'].includes(m) || (['line', 'bar', 'violin'].includes(m) && spec.stats.points)) && <Field label={m === 'box' && !spec.stats.points ? 'Outlier size' : 'Point size'}><Slider value={st.markSize} min={0.5} max={10} step={0.25} onChange={(v) => set('markSize', v)} /></Field>}
          {['scatter', 'strip', 'area', 'histogram', 'bar'].includes(m) && <Field label="Opacity"><Slider value={st.opacity} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('opacity', v)} /></Field>}
          {(['line', 'density', 'area'].includes(m) || (m === 'scatter' && spec.stats.trend !== 'none')) && <Field label={m === 'scatter' ? 'Trend line width' : 'Line width'}><Slider value={st.lineWidth} min={0.5} max={5} step={0.25} onChange={(v) => set('lineWidth', v)} /></Field>}
        </Section>
      )}

      {hasAxes && m !== 'heatmap' && <ReferenceLines />}
    </div>
  );
}

function ReferenceLines() {
  const spec = useStore((s) => s.spec);
  const update = useStore((s) => s.update);
  return (
    <Section title={`Reference lines${spec.annotations.length ? ` · ${spec.annotations.length}` : ''}`} open={spec.annotations.length > 0}
      aside={<button type="button" className="icon-btn" title="Add a reference line" onClick={() => update((s) => { s.annotations.push({ kind: 'hline', value: 0, label: '' }); })}><Plus size={15} /></button>}>
      {!spec.annotations.length && <p className="muted small">Thresholds, baselines, chance level — dashed lines with an optional label.</p>}
      {spec.annotations.map((a, i) => (
        <div key={i} className="annot">
          <Segmented value={a.kind} onChange={(v) => update((s) => { s.annotations[i].kind = v; })} options={[{ value: 'hline', label: 'Y =' }, { value: 'vline', label: 'X =' }]} />
          <NumberInput value={a.value} placeholder="value" onChange={(v) => v !== null && update((s) => { s.annotations[i].value = v; }, `a${i}`)} />
          <TextInput value={a.label ?? ''} placeholder="label" onChange={(v) => update((s) => { s.annotations[i].label = v; }, `al${i}`)} />
          <button type="button" className="icon-btn" onClick={() => update((s) => { s.annotations.splice(i, 1); })} aria-label="Remove line"><Trash2 size={14} /></button>
        </div>
      ))}
    </Section>
  );
}

/** Pick an exact colour for the single series, or for each group of the colour column. */
function ColorPickers() {
  const spec = useStore((s) => s.spec);
  const dataset = useStore((s) => s.dataset);
  const update = useStore((s) => s.update);
  const st = spec.style;
  const m = spec.mark;
  const col = markInfo(m).slots.includes('color') ? spec.enc.color : undefined;
  const lv = col && dataset ? levels(dataset.rows, col).slice(0, 12) : [];
  const items = lv.length ? lv.map((l, i) => ({ key: l, label: l, color: groupColors(st, lv)[i] })) : [{ key: '*', label: 'Series colour', color: singleColor(st) }];
  const setColor = (key: string, c: string | null) => update((s) => {
    const next = { ...s.style.colors };
    if (c) next[key] = c; else delete next[key];
    s.style.colors = next;
  }, `color:${key}`);
  const overridden = items.some((i) => st.colors[i.key]);

  return (
    <div className="color-pickers">
      <div className="color-pickers-head">
        <span className="field-label">{lv.length ? `Colours of ${prettify(col)}` : 'Colour'}</span>
        {overridden && <button type="button" className="link-btn" onClick={() => update((s) => { s.style.colors = {}; })}>reset to palette</button>}
      </div>
      {items.map((i) => (
        <label key={i.key} className="color-row" title="Pick a colour">
          <input type="color" value={i.color.length === 4 ? `#${[...i.color.slice(1)].map((c) => c + c).join('')}` : i.color.slice(0, 7)} onChange={(e) => setColor(i.key, e.target.value)} />
          <span className="color-name">{i.label}</span>
          <code>{i.color.toUpperCase()}</code>
          {st.colors[i.key] && <button type="button" className="icon-btn" onClick={(e) => { e.preventDefault(); setColor(i.key, null); }} aria-label="Back to palette colour">×</button>}
        </label>
      ))}
      {col && dataset && levels(dataset.rows, col).length > 12 && <p className="muted small">Showing the first 12 groups.</p>}
    </div>
  );
}
