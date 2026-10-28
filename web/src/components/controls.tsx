import { ChevronDown, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Column } from '../lib/types';
import { TypeIcon } from './icons';

export function Section({ title, children, open: initial = true, aside }: { title: string; children: ReactNode; open?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header>
        <button type="button" className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown size={14} className="chev" />
          {title}
        </button>
        {aside}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <span className="select">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {groups.length > 1
          ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {options.filter((o) => (o.group ?? '') === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))
          : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} />
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle" title={hint}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

/** Text input that keeps its own draft and commits on every keystroke (merged into one undo step). */
export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input className="input" value={draft} placeholder={placeholder} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} />;
}

export function NumberInput({ value, onChange, placeholder = 'auto', step, min, max }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; step?: number; min?: number; max?: number }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);
  return (
    <input
      className="input num" inputMode="decimal" value={draft} placeholder={placeholder} step={step} min={min} max={max}
      onChange={(e) => {
        setDraft(e.target.value);
        const t = e.target.value.trim().replace(',', '.');
        if (t === '') onChange(null);
        else if (Number.isFinite(Number(t))) onChange(Number(t));
      }}
    />
  );
}

export function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <span className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format ? format(value) : value}</output>
    </span>
  );
}

/** A slot (X, Y, Color…) that accepts a column by dropdown or by drag and drop. */
export function ColumnSlot({ label, value, columns, onChange, required, accept }: {
  label: string; value?: string; columns: Column[]; onChange: (v: string | undefined) => void; required?: boolean; accept?: Column['type'][];
}) {
  const [over, setOver] = useState(false);
  const col = columns.find((c) => c.name === value);
  const preferred = accept ? columns.filter((c) => accept.includes(c.type)) : columns;
  const others = accept ? columns.filter((c) => !accept.includes(c.type)) : [];
  return (
    <div
      className={`slot ${over ? 'over' : ''} ${value ? 'filled' : ''} ${required && !value ? 'needed' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-column')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const c = e.dataTransfer.getData('text/x-column'); if (c) onChange(c); }}
    >
      <span className="slot-label">{label}</span>
      <span className="slot-value">
        {col && <TypeIcon type={col.type} />}
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label={label}>
          <option value="">{required ? 'Choose a column…' : '—'}</option>
          {preferred.length > 0 && others.length > 0 ? (
            <>
              <optgroup label="Suggested">{preferred.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
              <optgroup label="Other columns">{others.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>
            </>
          ) : columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        {!value && <ChevronDown size={14} className="slot-chev" />}
      </span>
      {value && !required && (
        <button type="button" className="icon-btn slot-clear" onClick={() => onChange(undefined)} aria-label={`Clear ${label}`}><X size={13} /></button>
      )}
    </div>
  );
}
