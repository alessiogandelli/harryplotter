/**
 * Pure FigureSpec reducers.
 *
 * Every control in the UI is expressed as one of these functions: each takes the
 * current spec and returns a new spec. They are pure, synchronous and never
 * touch the network or an LLM. They are the "control reducers" covered by tests.
 */
import type {
  AxisName,
  AxisStyle,
  ChartType,
  FontStyle,
  LegendStyle,
  LineStyle,
  Margins,
  MarkerStyle,
  Palette,
  Series,
  Transform,
} from '../types/figureSpec';

function clone(spec: import('../types/figureSpec').FigureSpec) {
  return structuredClone(spec);
}

type Spec = import('../types/figureSpec').FigureSpec;

export function setChartType(spec: Spec, chartType: ChartType): Spec {
  const next = clone(spec);
  next.figure.chartType = chartType;
  return next;
}

export function setSeries(spec: Spec, index: number, patch: Partial<Series>): Spec {
  const next = clone(spec);
  const current = next.figure.series[index];
  if (!current) return next;
  next.figure.series[index] = { ...current, ...patch };
  return next;
}

export function addSeries(spec: Spec, series: Series = { name: null, x: null, y: null, color: null }): Spec {
  const next = clone(spec);
  next.figure.series.push(structuredClone(series));
  return next;
}

export function removeSeries(spec: Spec, index: number): Spec {
  const next = clone(spec);
  if (next.figure.series.length <= 1) return next;
  next.figure.series.splice(index, 1);
  return next;
}

export function setSeriesList(spec: Spec, series: Series[]): Spec {
  const next = clone(spec);
  next.figure.series = series.map((s) => structuredClone(s));
  return next;
}

export function setTitle(spec: Spec, title: string | null): Spec {
  const next = clone(spec);
  next.style.title = title;
  return next;
}

export function setSubtitle(spec: Spec, subtitle: string | null): Spec {
  const next = clone(spec);
  next.style.subtitle = subtitle;
  return next;
}

export function setAxis(spec: Spec, axis: AxisName, patch: Partial<AxisStyle>): Spec {
  const next = clone(spec);
  next.style.axes[axis] = { ...next.style.axes[axis], ...patch };
  return next;
}

export function setLegend(spec: Spec, patch: Partial<LegendStyle>): Spec {
  const next = clone(spec);
  next.style.legend = { ...next.style.legend, ...patch };
  return next;
}

export function setFont(spec: Spec, patch: Partial<FontStyle>): Spec {
  const next = clone(spec);
  next.style.font = { ...next.style.font, ...patch };
  return next;
}

export function setMarker(spec: Spec, patch: Partial<MarkerStyle>): Spec {
  const next = clone(spec);
  next.style.marker = { ...next.style.marker, ...patch };
  return next;
}

export function setLine(spec: Spec, patch: Partial<LineStyle>): Spec {
  const next = clone(spec);
  next.style.line = { ...next.style.line, ...patch };
  return next;
}

export function setPalette(spec: Spec, palette: Palette): Spec {
  const next = clone(spec);
  next.style.palette = palette;
  return next;
}

export function setBackground(spec: Spec, background: string): Spec {
  const next = clone(spec);
  next.style.background = background;
  return next;
}

export function setMargins(spec: Spec, patch: Partial<Margins>): Spec {
  const next = clone(spec);
  next.style.margins = { ...next.style.margins, ...patch };
  return next;
}

export function setSize(spec: Spec, patch: Partial<{ width: number; height: number }>): Spec {
  const next = clone(spec);
  next.style.size = { ...next.style.size, ...patch };
  return next;
}

export function setTransforms(spec: Spec, transforms: Transform[]): Spec {
  const next = clone(spec);
  next.transforms = transforms.map((t) => structuredClone(t));
  return next;
}

export function addTransform(spec: Spec, transform: Transform): Spec {
  const next = clone(spec);
  next.transforms.push(structuredClone(transform));
  return next;
}

export function removeTransform(spec: Spec, index: number): Spec {
  const next = clone(spec);
  next.transforms.splice(index, 1);
  return next;
}
