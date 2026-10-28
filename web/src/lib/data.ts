import Papa from 'papaparse';
import type { Column, ColumnType, Dataset, Filter, Row } from './types';

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '.', '#n/a', 'missing']);

const isMissing = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ||
  (typeof v === 'string' && MISSING.has(v.trim().toLowerCase()));

const NUM_DOT = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?%?$/;
const NUM_COMMA = /^[-+]?\d+(,\d+)?([eE][-+]?\d+)?%?$/; // 3,14 (European decimal)
const DATE_LIKE = /^\d{4}-\d{1,2}(-\d{1,2})?([T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$|^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/;

function parseNumber(s: string, comma: boolean): number {
  let t = s.trim();
  const pct = t.endsWith('%');
  if (pct) t = t.slice(0, -1);
  if (comma) t = t.replace(',', '.');
  const n = Number(t);
  return pct ? n / 100 : n;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  // dd/mm/yyyy and dd.mm.yyyy: day first, as almost everyone outside the US writes it
  const dm = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (dm) {
    let [, a, b, y] = dm.map(Number) as unknown as number[];
    if (y < 100) y += 2000;
    let day = a, month = b;
    if (b > 12 && a <= 12) { day = b; month = a; }
    const d = new Date(Date.UTC(y, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t.length <= 10 ? `${t}${t.length === 7 ? '-01' : ''}T00:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Infer column types and convert the raw string/primitive grid into typed rows. */
export function buildDataset(name: string, raw: Record<string, unknown>[], fields?: string[]): Dataset {
  const names = (fields ?? Object.keys(raw[0] ?? {})).filter((f) => f !== '' && f !== '__parsed_extra');
  const rows: Row[] = raw.map(() => ({}));
  const columns: Column[] = [];

  for (const col of names) {
    const values = raw.map((r) => r[col]);
    const present = values.filter((v) => !isMissing(v));
    const strings = present.map((v) => (v instanceof Date ? v.toISOString() : String(v)));
    const n = present.length || 1;

    let type: ColumnType = 'category';
    let comma = false;
    const nativeNumbers = present.filter((v) => typeof v === 'number').length;
    const dotNums = strings.filter((s) => NUM_DOT.test(s.trim())).length;
    const commaNums = strings.filter((s) => NUM_COMMA.test(s.trim())).length;
    const dates = present.filter((v) => v instanceof Date).length + strings.filter((s) => DATE_LIKE.test(s.trim())).length;

    if (nativeNumbers / n >= 0.95 || dotNums / n >= 0.95) type = 'number';
    else if (commaNums / n >= 0.95) { type = 'number'; comma = true; }
    else if (dates / n >= 0.95) type = 'date';

    const convert = (v: unknown): unknown => {
      if (isMissing(v)) return null;
      if (type === 'number') {
        const x = typeof v === 'number' ? v : parseNumber(String(v), comma);
        return Number.isFinite(x) ? x : null;
      }
      if (type === 'date') return v instanceof Date ? v : parseDate(String(v));
      return String(v).trim();
    };

    const distinct = new Set<string>();
    let missing = 0;
    let min = Infinity, max = -Infinity;
    values.forEach((v, i) => {
      const x = convert(v);
      rows[i][col] = x;
      if (x === null) { missing++; return; }
      if (distinct.size < 5000) distinct.add(x instanceof Date ? x.toISOString().slice(0, 10) : String(x));
      const k = x instanceof Date ? x.getTime() : typeof x === 'number' ? x : NaN;
      if (!Number.isNaN(k)) { if (k < min) min = k; if (k > max) max = k; }
    });

    if (type === 'category' && distinct.size > 60 && distinct.size > 0.5 * (raw.length - missing)) type = 'text';

    columns.push({
      name: col,
      type,
      unique: distinct.size,
      missing,
      sample: [...distinct].slice(0, 8),
      ...(Number.isFinite(min) ? { min, max } : {}),
    });
  }

  return { name, rows, columns };
}

export function parseDelimited(name: string, text: string): Dataset {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (h, i) => h.trim() || `column_${i + 1}`,
  });
  if (!res.data.length) throw new Error('No rows found in this file.');
  return buildDataset(name, res.data, res.meta.fields);
}

export async function parseFile(file: File): Promise<Dataset> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    if (!raw.length) throw new Error('The first sheet is empty.');
    const header = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []).map(String);
    return buildDataset(name, raw, header);
  }
  const text = await file.text();
  if (ext === 'json') {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.rows;
    if (!Array.isArray(arr)) throw new Error('JSON must be an array of records.');
    return buildDataset(name, arr);
  }
  return parseDelimited(name, text);
}

// ---------------------------------------------------------------- helpers

export const columnOf = (d: Dataset | null, name?: string) => (name && d ? d.columns.find((c) => c.name === name) : undefined);

export function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  if (!filters.length) return rows;
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.column];
      if (f.in && f.in.length) return v !== null && f.in.includes(v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
      const k = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : NaN;
      if ((f.min ?? null) !== null || (f.max ?? null) !== null) {
        if (Number.isNaN(k)) return false;
        if (f.min != null && k < f.min) return false;
        if (f.max != null && k > f.max) return false;
      }
      return true;
    }),
  );
}

/** Distinct values of a column in first-seen order, numerically sorted when they look numeric. */
export function levels(rows: Row[], col: string): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined) continue;
    seen.add(v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  }
  const out = [...seen];
  if (out.every((s) => s !== '' && Number.isFinite(Number(s)))) out.sort((a, b) => Number(a) - Number(b));
  else if (out.length > 1 && out.every(isOrdinalWord)) out.sort((a, b) => ordinalRank(a) - ordinalRank(b));
  return out;
}

// low/medium/high etc. keep their natural order instead of alphabetical noise
const ORDINAL = ['none', 'very low', 'low', 'medium', 'mid', 'moderate', 'high', 'very high', 'control', 'placebo', 'baseline', 'pre', 'post', 'before', 'after'];
const isOrdinalWord = (s: string) => ORDINAL.includes(s.toLowerCase());
const ordinalRank = (s: string) => ORDINAL.indexOf(s.toLowerCase());

export const keyOf = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v));

export function toCSV(d: Dataset): string {
  return Papa.unparse(d.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of d.columns) {
      const v = r[c.name];
      o[c.name] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    return o;
  }), { columns: d.columns.map((c) => c.name) });
}
