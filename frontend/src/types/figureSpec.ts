/**
 * TypeScript mirror of the canonical FigureSpec v1 contract.
 * Source of truth: docs/contract/figure-spec.md
 */

export type ChartType =
  | 'scatter'
  | 'line'
  | 'bar'
  | 'box'
  | 'histogram'
  | 'violin'
  | 'heatmap'
  | 'area';

export const CHART_TYPES: ChartType[] = [
  'scatter',
  'line',
  'bar',
  'box',
  'histogram',
  'violin',
  'heatmap',
  'area',
];

/** Fast-path primitives vs. extended (novel) chart types. */
export const FAST_CHART_TYPES: ChartType[] = ['scatter', 'line', 'bar', 'box', 'histogram'];

export type AxisScale = 'linear' | 'log';
export type TickMode = 'auto' | 'step' | 'count';
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';
export type LegendOrientation = 'h' | 'v';
export type Palette = 'default' | 'scientific' | 'colorblind' | 'grayscale';
export type TransformOp = 'filter' | 'groupby' | 'sort' | 'limit';
export type Agg = 'mean' | 'sum' | 'median' | 'min' | 'max' | 'count';
export type AxisName = 'x' | 'y';

export const AXIS_SCALES: AxisScale[] = ['linear', 'log'];
export const TICK_MODES: TickMode[] = ['auto', 'step', 'count'];
export const LEGEND_POSITIONS: LegendPosition[] = ['top', 'bottom', 'left', 'right'];
export const LEGEND_ORIENTATIONS: LegendOrientation[] = ['h', 'v'];
export const PALETTES: Palette[] = ['default', 'scientific', 'colorblind', 'grayscale'];
export const AGGS: Agg[] = ['mean', 'sum', 'median', 'min', 'max', 'count'];

export interface DatasetRef {
  id: string;
  contentHash: string;
}

export interface FilterTransform {
  op: 'filter';
  column: string;
  in: Array<string | number | boolean>;
}

export interface GroupByTransform {
  op: 'groupby';
  by: string[];
  agg: Record<string, Agg>;
}

export interface SortTransform {
  op: 'sort';
  column: string;
  desc: boolean;
}

export interface LimitTransform {
  op: 'limit';
  n: number;
}

export type Transform = FilterTransform | GroupByTransform | SortTransform | LimitTransform;

export interface Series {
  name?: string | null;
  x: string | null;
  y: string | null;
  color?: string | null;
}

export interface FigureLayer {
  chartType: ChartType;
  series: Series[];
}

export interface AxisStyle {
  label: string | null;
  range: [number | null, number | null];
  scale: AxisScale;
  reverse: boolean;
  grid: boolean;
  tickMode: TickMode;
  tickStep: number | null;
  tickCount: number | null;
  tickRotation: number;
}

export interface LegendStyle {
  show: boolean;
  position: LegendPosition;
  orientation: LegendOrientation;
  columns: number | null;
  title: string | null;
  order: string[] | null;
  fontSize: number;
}

export interface FontStyle {
  family: string;
  size: number;
}

export interface MarkerStyle {
  size: number;
  opacity: number;
  symbol: string;
}

export interface LineStyle {
  width: number;
}

export interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface FigureSize {
  width: number;
  height: number;
}

export interface StyleSpec {
  title: string | null;
  subtitle: string | null;
  axes: { x: AxisStyle; y: AxisStyle };
  legend: LegendStyle;
  font: FontStyle;
  palette: Palette;
  colorway: string[] | null;
  marker: MarkerStyle;
  line: LineStyle;
  background: string;
  margins: Margins;
  size: FigureSize;
}

export interface FigureMeta {
  modelVersion: string | null;
  createdAt: string;
}

export interface FigureSpec {
  version: 1;
  dataset: DatasetRef;
  transforms: Transform[];
  figure: FigureLayer;
  style: StyleSpec;
  meta: FigureMeta;
}

/** Required column mapping per chart type (contract "Chart type matrix"). */
export interface ChartTypeRequirement {
  x: 'req' | 'opt' | 'none';
  y: 'req' | 'opt' | 'none';
  color: 'req' | 'opt' | 'none';
  /** y is the z value (heatmap). */
  z?: boolean;
}

export const CHART_TYPE_MATRIX: Record<ChartType, ChartTypeRequirement> = {
  scatter: { x: 'req', y: 'req', color: 'opt' },
  line: { x: 'req', y: 'req', color: 'opt' },
  bar: { x: 'req', y: 'req', color: 'opt' },
  box: { x: 'opt', y: 'req', color: 'opt' },
  histogram: { x: 'req', y: 'none', color: 'opt' },
  violin: { x: 'opt', y: 'req', color: 'opt' },
  heatmap: { x: 'req', y: 'req', color: 'none', z: true },
  area: { x: 'req', y: 'req', color: 'opt' },
};

export function defaultAxisStyle(): AxisStyle {
  return {
    label: null,
    range: [null, null],
    scale: 'linear',
    reverse: false,
    grid: true,
    tickMode: 'auto',
    tickStep: null,
    tickCount: null,
    tickRotation: 0,
  };
}

export function defaultStyle(): StyleSpec {
  return {
    title: null,
    subtitle: null,
    axes: { x: defaultAxisStyle(), y: defaultAxisStyle() },
    legend: {
      show: true,
      position: 'right',
      orientation: 'v',
      columns: null,
      title: null,
      order: null,
      fontSize: 12,
    },
    font: { family: 'Inter, sans-serif', size: 12 },
    palette: 'default',
    colorway: null,
    marker: { size: 8, opacity: 1.0, symbol: 'circle' },
    line: { width: 2 },
    background: '#ffffff',
    margins: { l: 80, r: 20, t: 60, b: 60 },
    size: { width: 900, height: 600 },
  };
}

/** Canonical defaults for a brand-new spec. */
export function defaultSpec(
  dataset: DatasetRef = { id: '', contentHash: '' },
  createdAt: string = new Date().toISOString(),
): FigureSpec {
  return {
    version: 1,
    dataset,
    transforms: [],
    figure: {
      chartType: 'scatter',
      series: [{ name: null, x: null, y: null, color: null }],
    },
    style: defaultStyle(),
    meta: { modelVersion: null, createdAt },
  };
}
