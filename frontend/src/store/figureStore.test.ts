import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSpec } from '../types/figureSpec';
import type { DatasetSummary } from '../types/api';
import { useFigureStore } from './figureStore';
import { setTitle } from './reducers';

function reset() {
  useFigureStore.setState({
    spec: defaultSpec(),
    past: [],
    future: [],
    datasetId: null,
    dataset: null,
    projectId: null,
    ai: null,
  });
}

beforeEach(reset);

describe('figure store history', () => {
  it('undo reverts an edit and redo reapplies it', () => {
    const { apply } = useFigureStore.getState();
    apply((spec) => setTitle(spec, 'first'));
    apply((spec) => setTitle(spec, 'second'));

    expect(useFigureStore.getState().spec.style.title).toBe('second');
    expect(useFigureStore.getState().past).toHaveLength(2);

    useFigureStore.getState().undo();
    expect(useFigureStore.getState().spec.style.title).toBe('first');
    useFigureStore.getState().undo();
    expect(useFigureStore.getState().spec.style.title).toBeNull();

    useFigureStore.getState().redo();
    expect(useFigureStore.getState().spec.style.title).toBe('first');
    useFigureStore.getState().redo();
    expect(useFigureStore.getState().spec.style.title).toBe('second');
  });

  it('is a no-op at the ends of the history', () => {
    useFigureStore.getState().undo();
    expect(useFigureStore.getState().spec.style.title).toBeNull();

    useFigureStore.getState().apply((spec) => setTitle(spec, 'only'));
    useFigureStore.getState().redo();
    expect(useFigureStore.getState().spec.style.title).toBe('only');
    expect(useFigureStore.getState().future).toHaveLength(0);
  });

  it('clears the redo stack when a new edit is applied after an undo', () => {
    const { apply } = useFigureStore.getState();
    apply((spec) => setTitle(spec, 'a'));
    apply((spec) => setTitle(spec, 'b'));
    useFigureStore.getState().undo();
    expect(useFigureStore.getState().future).toHaveLength(1);

    useFigureStore.getState().apply((spec) => setTitle(spec, 'c'));
    expect(useFigureStore.getState().spec.style.title).toBe('c');
    expect(useFigureStore.getState().future).toHaveLength(0);

    useFigureStore.getState().redo();
    expect(useFigureStore.getState().spec.style.title).toBe('c');
  });

  it('does not create a history entry when a reducer returns the same reference', () => {
    useFigureStore.getState().apply((spec) => spec);
    expect(useFigureStore.getState().past).toHaveLength(0);
  });

  it('applies an AI result through the history stack and records the provider', () => {
    const dataset: DatasetSummary = {
      id: 'd1',
      filename: 'a.csv',
      rows: 3,
      contentHash: 'sha256:x',
      columns: [],
      stats: {},
      sample: [],
    };
    useFigureStore.getState().loadDataset(dataset);
    expect(useFigureStore.getState().spec.dataset).toEqual({ id: 'd1', contentHash: 'sha256:x' });
    expect(useFigureStore.getState().past).toHaveLength(0);

    const generated = { ...defaultSpec(), style: { ...defaultSpec().style, title: 'AI' } };
    useFigureStore
      .getState()
      .applyAi({ spec: generated, provider: 'fake', confidence: 0.42, belowThreshold: true });

    expect(useFigureStore.getState().spec.style.title).toBe('AI');
    expect(useFigureStore.getState().ai).toMatchObject({
      provider: 'fake',
      confidence: 0.42,
      belowThreshold: true,
    });
    expect(useFigureStore.getState().past).toHaveLength(1);

    useFigureStore.getState().apply((spec) => setTitle(spec, 'manual'));
    useFigureStore.getState().undo();
    expect(useFigureStore.getState().spec.style.title).toBe('AI');
  });

  it('loadDataset fills sensible x/y/colour so it renders immediately', () => {
    const dataset: DatasetSummary = {
      id: 'd2',
      filename: 'demo.csv',
      rows: 600,
      contentHash: 'sha256:z',
      columns: [
        { name: 'date', dtype: 'datetime', missing: 0 },
        { name: 'group', dtype: 'categorical', missing: 0 },
        { name: 'score', dtype: 'numeric', missing: 0 },
      ],
      stats: {},
      sample: [],
    };

    useFigureStore.getState().loadDataset(dataset);
    const series = useFigureStore.getState().spec.figure.series[0];

    expect(series.x).toBe('date');
    expect(series.y).toBe('score');
    expect(series.color).toBe('group');
  });

  it('restore resets history to a single entry', () => {
    useFigureStore.getState().apply((spec) => setTitle(spec, 'temp'));
    const saved = defaultSpec({ id: 'd9', contentHash: 'h' });
    useFigureStore.getState().restore({ ...saved, style: { ...saved.style, title: 'saved' } });

    const state = useFigureStore.getState();
    expect(state.spec.style.title).toBe('saved');
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.datasetId).toBe('d9');
  });
});
