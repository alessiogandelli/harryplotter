/**
 * Single FigureSpec store with a deterministic past/future history.
 *
 * Architectural rule: all UI controls mutate the present spec through `apply`
 * (a pure reducer), which records the previous spec on the undo stack. `undo`
 * and `redo` are therefore exact inverses with no heuristics.
 */
import { create } from 'zustand';
import type { FigureSpec } from '../types/figureSpec';
import { defaultSpec } from '../types/figureSpec';
import type { DatasetSummary, GenerateResponse, PatchResponse } from '../types/api';

/** Maximum number of undo steps retained. */
export const HISTORY_LIMIT = 100;

export interface AiStatus {
  provider: string;
  confidence: number | null;
  /** Whether the server flagged this result as below its confidence threshold. */
  belowThreshold: boolean;
  /** The partial patch for a refinement, when the last call was `patch`. */
  patch: Record<string, unknown> | null;
  at: number;
}

export interface FigureStoreState {
  spec: FigureSpec;
  past: FigureSpec[];
  future: FigureSpec[];
  datasetId: string | null;
  dataset: DatasetSummary | null;
  projectId: string | null;
  ai: AiStatus | null;

  /** Apply a pure reducer to the present spec and record it in history. */
  apply: (recipe: (spec: FigureSpec) => FigureSpec) => void;
  /** Replace the present spec and record it in history. */
  replace: (spec: FigureSpec) => void;
  undo: () => void;
  redo: () => void;
  /** Load a fresh dataset: rebinds spec.dataset and clears history. */
  loadDataset: (dataset: DatasetSummary) => void;
  /** Attach an already-known dataset (e.g. after restoring a version). */
  setDataset: (dataset: DatasetSummary | null) => void;
  setProjectId: (id: string | null) => void;
  setAi: (ai: AiStatus | null) => void;
  /** Apply an AI generate/patch result through the history stack. */
  applyAi: (result: GenerateResponse | PatchResponse) => void;
  /** Restore a saved spec, resetting history to a single entry. */
  restore: (spec: FigureSpec) => void;
  reset: () => void;
}

interface History {
  spec: FigureSpec;
  past: FigureSpec[];
  future: FigureSpec[];
}

function pushHistory(state: History, next: FigureSpec): History {
  if (next === state.spec) return state;
  return {
    spec: next,
    past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export const useFigureStore = create<FigureStoreState>((set) => ({
  spec: defaultSpec(),
  past: [],
  future: [],
  datasetId: null,
  dataset: null,
  projectId: null,
  ai: null,

  apply: (recipe) => set((state) => pushHistory(state, recipe(state.spec))),

  replace: (spec) => set((state) => pushHistory(state, spec)),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const past = state.past.slice(0, -1);
      const previous = state.past[state.past.length - 1];
      return {
        spec: previous,
        past,
        future: [state.spec, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        spec: next,
        past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }),

  loadDataset: (dataset) =>
    set((state) => {
      const spec = structuredClone(state.spec);
      spec.dataset = { id: dataset.id, contentHash: dataset.contentHash };
      return { dataset, datasetId: dataset.id, spec, past: [], future: [] };
    }),

  setDataset: (dataset) => set({ dataset, datasetId: dataset?.id ?? null }),

  setProjectId: (projectId) => set({ projectId }),

  setAi: (ai) => set({ ai }),

  applyAi: (result) =>
    set((state) => {
      const next = pushHistory(state, result.spec);
      return {
        ...next,
        ai: {
          provider: result.provider,
          confidence: result.confidence,
          belowThreshold: result.belowThreshold ?? false,
          patch: 'patch' in result ? (result as PatchResponse).patch : null,
          at: Date.now(),
        },
      };
    }),

  restore: (spec) =>
    set({
      spec,
      past: [],
      future: [],
      datasetId: spec.dataset.id || null,
      ai: null,
    }),

  reset: () =>
    set({
      spec: defaultSpec(),
      past: [],
      future: [],
      datasetId: null,
      dataset: null,
      ai: null,
    }),
}));

/** Convenience derived selectors (kept out of the store to avoid re-renders). */
export function useCanUndo(): boolean {
  return useFigureStore((state) => state.past.length > 0);
}

export function useCanRedo(): boolean {
  return useFigureStore((state) => state.future.length > 0);
}
