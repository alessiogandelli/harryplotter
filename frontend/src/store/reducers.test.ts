import { describe, expect, it } from 'vitest';
import { defaultSpec } from '../types/figureSpec';
import {
  addSeries,
  removeSeries,
  setAxis,
  setChartType,
  setLegend,
  setMarker,
  setSeries,
  setTitle,
  setTransforms,
} from './reducers';

describe('control reducers', () => {
  it('sets a title without mutating the input spec', () => {
    const spec = defaultSpec();
    const next = setTitle(spec, 'Score over time');
    expect(next.style.title).toBe('Score over time');
    expect(spec.style.title).toBeNull();
    expect(next).not.toBe(spec);
  });

  it('merges a partial legend patch and keeps the other fields', () => {
    const spec = defaultSpec();
    const next = setLegend(spec, { show: false, position: 'top' });
    expect(next.style.legend.show).toBe(false);
    expect(next.style.legend.position).toBe('top');
    expect(next.style.legend.orientation).toBe('v');
    expect(spec.style.legend.show).toBe(true);
  });

  it('merges a partial axis patch', () => {
    const spec = defaultSpec();
    const next = setAxis(spec, 'x', { scale: 'log', range: [1, 100] });
    expect(next.style.axes.x.scale).toBe('log');
    expect(next.style.axes.x.range).toEqual([1, 100]);
    expect(next.style.axes.x.grid).toBe(true);
    expect(next.style.axes.y.scale).toBe('linear');
  });

  it('changes the chart type', () => {
    const next = setChartType(defaultSpec(), 'histogram');
    expect(next.figure.chartType).toBe('histogram');
  });

  it('merges a partial marker patch', () => {
    const next = setMarker(defaultSpec(), { size: 12 });
    expect(next.style.marker.size).toBe(12);
    expect(next.style.marker.opacity).toBe(0.9);
  });

  it('updates one series by index', () => {
    const next = setSeries(defaultSpec(), 0, { x: 'time', y: 'score' });
    expect(next.figure.series[0]).toMatchObject({ x: 'time', y: 'score' });
  });

  it('adds and removes series but never removes the last one', () => {
    const base = defaultSpec();
    const withTwo = addSeries(base);
    expect(withTwo.figure.series).toHaveLength(2);
    const withOne = removeSeries(withTwo, 0);
    expect(withOne.figure.series).toHaveLength(1);
    const stillOne = removeSeries(withOne, 0);
    expect(stillOne.figure.series).toHaveLength(1);
  });

  it('deep-clones transforms so later external mutation is isolated', () => {
    const spec = defaultSpec();
    const transforms = [{ op: 'limit' as const, n: 5 }];
    const next = setTransforms(spec, transforms);
    transforms[0].n = 99;
    expect(next.transforms[0]).toEqual({ op: 'limit', n: 5 });
    expect(spec.transforms).toHaveLength(0);
  });
});
