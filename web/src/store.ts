import { create } from 'zustand';
import { normalizeSpec, emptySpec } from './lib/spec';
import { autoSpec, suggest, type Suggestion } from './lib/suggest';
import { buildDataset } from './lib/data';
import type { Dataset, Spec } from './lib/types';

export interface ImproveState {
  status: 'checking' | 'ai' | 'done';
  before: Spec;
  fixed: { issue: string; fix: string }[];
  advice: string[];
  aiChanges: string[];
  error?: string;
}

export interface ChatTurn { role: 'user' | 'assistant'; text: string; error?: boolean }

interface State {
  dataset: Dataset | null;
  spec: Spec;
  past: Spec[];
  future: Spec[];
  suggestions: Suggestion[];
  tab: 'chart' | 'style';
  view: 'figure' | 'data';
  chat: ChatTurn[];
  aiBusy: boolean;
  paletteOpen: boolean;
  ideasOpen: boolean;
  improve: ImproveState | null;
  exportOpen: boolean;
  settingsOpen: boolean;
  toast: string | null;

  loadDataset: (d: Dataset, spec?: unknown) => void;
  /** Change the spec. Consecutive edits with the same `group` merge into one undo step. */
  update: (fn: (s: Spec) => Spec | void, group?: string) => void;
  replace: (spec: unknown) => void;
  undo: () => void;
  redo: () => void;
  set: (p: Partial<State>) => void;
  notify: (msg: string) => void;
}

let lastGroup: string | undefined;
let lastGroupAt = 0;

const clone = (s: Spec): Spec => structuredClone(s);

export const useStore = create<State>((set, get) => ({
  dataset: null,
  spec: emptySpec(),
  past: [],
  future: [],
  suggestions: [],
  tab: 'chart',
  view: 'figure',
  chat: [],
  aiBusy: false,
  paletteOpen: false,
  ideasOpen: false,
  improve: null,
  exportOpen: false,
  settingsOpen: false,
  toast: null,

  loadDataset: (d, spec) => {
    const s = spec ? normalizeSpec(spec, d) : autoSpec(d);
    lastGroup = undefined;
    set({ dataset: d, spec: s, past: [], future: [], suggestions: suggest(d), view: 'figure', chat: [] });
  },

  update: (fn, group) => {
    const { spec, past, dataset } = get();
    const draft = clone(spec);
    const out = fn(draft) ?? draft;
    const next = normalizeSpec(out, dataset);
    const now = Date.now();
    const merge = group !== undefined && group === lastGroup && now - lastGroupAt < 1500;
    lastGroup = group;
    lastGroupAt = now;
    set({ spec: next, past: merge ? past : [...past.slice(-99), spec], future: [] });
  },

  replace: (raw) => {
    const { spec, past, dataset } = get();
    lastGroup = undefined;
    set({ spec: normalizeSpec(raw, dataset), past: [...past.slice(-99), spec], future: [] });
  },

  undo: () => {
    const { past, spec, future } = get();
    if (!past.length) return;
    lastGroup = undefined;
    set({ spec: past[past.length - 1], past: past.slice(0, -1), future: [spec, ...future] });
  },

  redo: () => {
    const { past, spec, future } = get();
    if (!future.length) return;
    lastGroup = undefined;
    set({ spec: future[0], past: [...past, spec], future: future.slice(1) });
  },

  set: (p) => set(p),

  notify: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => { if (get().toast === msg) set({ toast: null }); }, 2600);
  },
}));

// ---------------------------------------------------------------- autosave
// The last session (data + figure) survives a reload. IndexedDB, because
// datasets easily exceed localStorage's few megabytes.

const DB = 'harryplotter';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
  } catch { /* private mode etc.: autosave is a convenience */ }
}

async function get<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

let saveTimer: number | undefined;
let lastSavedData: Dataset | null = null;

export function startAutosave() {
  useStore.subscribe((s) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!s.dataset) return;
      if (s.dataset !== lastSavedData) {
        put('dataset', { name: s.dataset.name, rows: s.dataset.rows, order: s.dataset.columns.map((c) => c.name) });
        lastSavedData = s.dataset;
      }
      put('spec', s.spec);
    }, 400);
  });
}

export async function restoreSession(): Promise<boolean> {
  const d = await get<{ name: string; rows: Record<string, unknown>[]; order: string[] }>('dataset');
  if (!d?.rows?.length) return false;
  const spec = await get<Spec>('spec');
  const dataset = buildDataset(d.name, d.rows, d.order);
  lastSavedData = dataset;
  useStore.getState().loadDataset(dataset, spec);
  return true;
}
