// Turn a Spec into a standalone script in Python (seaborn/matplotlib) or R (ggplot2),
// so the figure can live on in the researcher's own pipeline.

import { columnOf } from './data';
import { levels } from './data';
import { FONT_STACKS, groupColors, lowerFirst, markInfo, prettify, sequentialScheme, singleColor } from './spec';
import type { Dataset, Spec } from './types';

const q = (s: string) => JSON.stringify(s);
const r1 = (n: number) => Math.round(n * 100) / 100;

function labels(spec: Spec, dataset: Dataset) {
  const st = spec.style;
  const { x, y } = spec.enc;
  const yAuto = spec.mark === 'histogram' ? 'Count' : spec.mark === 'density' ? 'Density'
    : spec.mark === 'bar' && !y ? 'Count'
    : (spec.mark === 'bar' || spec.mark === 'line') && agg(spec, dataset) !== 'none' ? `${agg(spec, dataset) === 'mean' ? 'Mean' : prettify(agg(spec, dataset))} ${lowerFirst(prettify(y))}`
    : prettify(y);
  return {
    x: st.xLabel || prettify(x),
    y: st.yLabel || yAuto,
    color: st.colorLabel || prettify(spec.enc.color),
  };
}

function agg(spec: Spec, dataset: Dataset): string {
  if (spec.stats.aggregate !== 'none') return spec.stats.aggregate;
  if (spec.mark === 'bar') return spec.enc.y ? 'mean' : 'count';
  if (spec.mark === 'line' || spec.mark === 'area') {
    const x = spec.enc.x;
    if (!x) return 'none';
    const seen = new Set(dataset.rows.map((r) => String(r[x]) + '|' + (spec.enc.color ? String(r[spec.enc.color]) : '')));
    return seen.size < dataset.rows.length || spec.stats.timeBin !== 'none' ? 'mean' : 'none';
  }
  return 'none';
}

const usedColumns = (spec: Spec) => Object.values(spec.enc).filter(Boolean) as string[];

// ================================================================ Python

const PY_ERR: Record<string, string> = { none: 'None', sd: '"sd"', se: '"se"', ci95: '("ci", 95)' };
const PY_BIN: Record<string, string> = { day: 'D', week: 'W', month: 'M', quarter: 'Q', year: 'Y' };
const PY_CMAP: Record<string, string> = { viridis: 'viridis', cividis: 'cividis', magma: 'magma', blues: 'Blues' };

export function toPython(spec: Spec, dataset: Dataset, file = `${dataset.name}.csv`): string {
  const st = spec.style;
  const { x, y, color, size, facet, facetRow } = spec.enc;
  const info = markInfo(spec.mark);
  const L = labels(spec, dataset);
  const dates = dataset.columns.filter((c) => c.type === 'date' && usedColumns(spec).includes(c.name)).map((c) => c.name);
  const hue = color && info.slots.includes('color') ? color : undefined;
  const hueNumeric = hue && columnOf(dataset, hue)?.type === 'number' && !['bar', 'box', 'violin', 'strip', 'histogram', 'density'].includes(spec.mark);
  const wIn = r1(st.widthMm / 25.4), hIn = r1(st.heightMm / 25.4);
  const nRows = facetRow ? `df[${q(facetRow)}].nunique()` : '1';
  const nCols = facet ? `df[${q(facet)}].nunique()` : '1';
  const out: string[] = [];
  const lines = (...l: string[]) => out.push(...l);
  const tests: string[] = [];

  lines('import pandas as pd', 'import matplotlib.pyplot as plt', 'import seaborn as sns');
  if (spec.stats.test) lines('from scipy import stats');
  lines('');
  lines(`df = pd.read_csv(${q(file)}${dates.length ? `, parse_dates=${JSON.stringify(dates)}` : ''})`);
  for (const f of spec.filters) {
    if (f.in?.length) lines(`df = df[df[${q(f.column)}].astype(str).isin(${JSON.stringify(f.in)})]`);
    if (f.min != null) lines(`df = df[df[${q(f.column)}] >= ${f.min}]`);
    if (f.max != null) lines(`df = df[df[${q(f.column)}] <= ${f.max}]`);
  }
  if (spec.mark === 'line' && spec.stats.timeBin !== 'none' && x && dates.includes(x)) {
    lines(`df[${q(x)}] = df[${q(x)}].dt.to_period(${q(PY_BIN[spec.stats.timeBin])}).dt.to_timestamp()  # average per ${spec.stats.timeBin}`);
  }
  lines('');

  // ---- style
  const family = st.font === 'serif' ? 'serif' : st.font === 'mono' ? 'monospace' : 'sans-serif';
  const families = FONT_STACKS[st.font].replace(/"/g, '').split(',').map((s) => s.trim()).filter((s) => !/^(sans-serif|serif|monospace)$/.test(s));
  if (st.theme === 'dark') lines('plt.style.use("dark_background")');
  lines('plt.rcParams.update({');
  lines(`    "font.family": ${q(family)},`, `    "font.${family}": ${JSON.stringify([...families, 'DejaVu Sans'])},`);
  lines(`    "font.size": ${st.fontSize},`, `    "axes.titlesize": ${r1(st.fontSize * 1.3)},`, `    "axes.labelsize": ${st.fontSize},`);
  lines(`    "xtick.labelsize": ${r1(st.fontSize * 0.92)},`, `    "ytick.labelsize": ${r1(st.fontSize * 0.92)},`, `    "legend.fontsize": ${st.fontSize},`);
  const spinesOff = st.theme === 'clean' ? ['top', 'right'] : st.theme === 'minimal' ? ['top', 'right', 'left', 'bottom'] : [];
  for (const s of spinesOff) lines(`    "axes.spines.${s}": False,`);
  lines(`    "axes.grid": ${st.grid !== 'none' ? 'True' : 'False'},`);
  if (st.grid !== 'none') lines(`    "axes.grid.axis": ${q(st.grid === 'both' ? 'both' : st.grid)},`, '    "grid.color": "#e6e6e9",', '    "grid.linewidth": 0.6,', '    "axes.axisbelow": True,');
  lines('    "svg.fonttype": "none",  # keep text editable in SVG', '    "pdf.fonttype": 42,', '})');
  if (hue && !hueNumeric) {
    const lv = levels(dataset.rows, hue);
    const cs = groupColors(st, lv);
    lines(`palette = {${lv.map((l, i) => `${q(l)}: ${q(cs[i])}`).join(', ')}}`);
  } else if (!hueNumeric) lines(`palette = [${q(singleColor(st))}]`);
  lines('');

  const common: string[] = [];
  if (hue) common.push(`hue=${q(hue)}`, hueNumeric ? `palette=${q(PY_CMAP[sequentialScheme(st.palette)] ?? 'viridis')}` : `palette=palette`);
  if (facet) common.push(`col=${q(facet)}`);
  if (facetRow) common.push(`row=${q(facetRow)}`);
  const sizeArgs = `height=${hIn} / ${nRows}, aspect=(${wIn} / ${nCols}) / (${hIn} / ${nRows})`;
  const kw = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(', ');
  const err = PY_ERR[spec.stats.error];
  const a = agg(spec, dataset);

  let figureLevel = true;
  switch (spec.mark) {
    case 'scatter':
      if (spec.stats.trend !== 'none') {
        lines(`g = sns.lmplot(data=df, ${kw(`x=${q(x!)}`, `y=${q(y!)}`, ...common, spec.stats.trend === 'loess' && 'lowess=True  # needs statsmodels', `ci=95`, sizeArgs, `scatter_kws={"s": ${r1((st.markSize * 1.6) ** 2)}, "alpha": ${st.opacity}, "linewidths": 0.4, "edgecolor": "white"}`, `line_kws={"linewidth": ${st.lineWidth}}`)})`);
      } else {
        lines(`g = sns.relplot(data=df, kind="scatter", ${kw(`x=${q(x!)}`, `y=${q(y!)}`, ...common, size && `size=${q(size)}`, !size && `s=${r1((st.markSize * 1.6) ** 2)}`, `alpha=${st.opacity}`, 'linewidth=0.4', 'edgecolor="white"', sizeArgs)})`);
      }
      if (spec.stats.test) tests.push(`r, p = stats.pearsonr(df[${q(x!)}], df[${q(y!)}])`, 'print(f"Pearson r = {r:.2f}, p = {p:.3g}, n = {len(df)}")', `g.axes.flat[0].text(0.02, 0.98, f"r = {r:.2f}, p = {p:.2g}", transform=g.axes.flat[0].transAxes, va="top")`);
      break;
    case 'line':
      lines(`g = sns.relplot(data=df, kind="line", ${kw(`x=${q(x!)}`, `y=${q(y!)}`, ...common, a !== 'none' && `estimator=${q(a === 'mean' ? 'mean' : a)}`, `errorbar=${a === 'mean' ? err : 'None'}`, spec.stats.points && 'marker="o"', `linewidth=${st.lineWidth}`, sizeArgs)})`);
      break;
    case 'area': {
      figureLevel = false;
      lines(`fig, ax = plt.subplots(figsize=(${wIn}, ${hIn}), layout="constrained")`);
      if (hue) lines(`wide = df.pivot_table(index=${q(x!)}, columns=${q(hue)}, values=${q(y!)}, aggfunc="mean")`, `wide.plot.area(ax=ax, color=[palette[c] for c in wide.columns], alpha=${Math.min(0.9, st.opacity)}, linewidth=0.6)`);
      else lines(`df.groupby(${q(x!)})[${q(y!)}].mean().plot.area(ax=ax, color=palette[0], alpha=${Math.min(0.9, st.opacity)}, linewidth=0.6)`);
      if (facet || facetRow) lines('# note: facets are not reproduced for area charts in this script');
      break;
    }
    case 'bar': {
      const mode = hue && hue !== x ? spec.stats.barMode : 'group';
      if (mode !== 'group') {
        figureLevel = false;
        lines(`fig, ax = plt.subplots(figsize=(${wIn}, ${hIn}), layout="constrained")`);
        lines(`wide = ${y ? `df.pivot_table(index=${q(x!)}, columns=${q(hue!)}, values=${q(y)}, aggfunc=${q(a)})` : `pd.crosstab(df[${q(x!)}], df[${q(hue!)}])`}`);
        if (mode === 'fill') lines('wide = wide.div(wide.sum(axis=1), axis=0) * 100');
        lines(`wide.plot.bar(ax=ax, stacked=True, color=[palette[c] for c in wide.columns], width=0.76, rot=0)`);
      } else if (!y) {
        lines(`g = sns.catplot(data=df, kind="count", ${kw(`x=${q(x!)}`, ...common, !hue && 'color=palette[0]', sizeArgs)})`);
      } else {
        lines(`g = sns.catplot(data=df, kind="bar", ${kw(x && `x=${q(x)}`, `y=${q(y)}`, ...common, !hue && 'color=palette[0]', `estimator=${q(a)}`, `errorbar=${a === 'mean' ? err : 'None'}`, 'capsize=0.15', 'err_kws={"linewidth": 1}', sizeArgs)})`);
        if (spec.stats.points) lines(`g.map_dataframe(sns.stripplot, ${kw(x && `x=${q(x)}`, `y=${q(y)}`, hue && `hue=${q(hue)}`, hue && 'dodge=True', 'color="black"', 'alpha=0.45', 'size=3', 'jitter=0.2', 'legend=False')})`);
      }
      break;
    }
    case 'histogram': {
      const multiple = hue ? { group: 'layer', stack: 'stack', fill: 'fill' }[spec.stats.barMode] : 'layer';
      lines(`g = sns.displot(data=df, kind="hist", ${kw(`x=${q(x!)}`, ...common, !hue && 'color=palette[0]', `bins=${spec.stats.bins}`, `multiple=${q(multiple)}`, hue && multiple === 'layer' && 'alpha=0.5', sizeArgs)})`);
      break;
    }
    case 'density':
      lines(`g = sns.displot(data=df, kind="kde", ${kw(`x=${q(x!)}`, ...common, !hue && 'color=palette[0]', 'fill=True', 'alpha=0.22', `linewidth=${st.lineWidth}`, 'common_norm=False', spec.stats.points && 'rug=True', sizeArgs)})`);
      break;
    case 'box':
    case 'violin':
    case 'strip': {
      const kind = spec.mark;
      const extra = kind === 'violin' ? ['inner="box"', 'cut=0'] : kind === 'strip' ? ['jitter=0.25', `alpha=${st.opacity}`] : ['fliersize=3', 'linewidth=0.9'];
      const hueArgs = hue && hue !== x ? common : common.filter((c) => !c.startsWith('hue') && !c.startsWith('palette'));
      const sameAsX = hue && hue === x;
      lines(`g = sns.catplot(data=df, kind=${q(kind)}, ${kw(x && `x=${q(x)}`, `y=${q(y!)}`, ...hueArgs, sameAsX && `hue=${q(x!)}`, sameAsX && 'palette=palette', sameAsX && 'legend=False', !hue && 'color=palette[0]', ...extra, sizeArgs)})`);
      if (kind === 'strip') {
        lines(`g.map_dataframe(sns.pointplot, ${kw(x && `x=${q(x)}`, `y=${q(y!)}`, `errorbar=${PY_ERR[spec.stats.error === 'none' ? 'ci95' : spec.stats.error]}`, 'color="black"', 'linestyle="none"', 'markers="_"', 'markersize=14', hue && hue !== x && `hue=${q(hue)}`, hue && hue !== x && 'dodge=0.4', hue && hue !== x && 'palette=["black"] * 12', hue && hue !== x && 'legend=False')})`);
      } else if (spec.stats.points) {
        lines(`g.map_dataframe(sns.stripplot, ${kw(x && `x=${q(x)}`, `y=${q(y!)}`, hue && hue !== x && `hue=${q(hue)}`, hue && hue !== x && 'dodge=True', 'color="black"', 'alpha=0.4', 'size=2.5', 'jitter=0.2', 'legend=False')})`);
      }
      if (spec.stats.test && x) {
        tests.push(`groups = [g[${q(y!)}].dropna() for _, g in df.groupby(${q(x)})]`,
          'if len(groups) == 2:',
          '    t, p = stats.ttest_ind(*groups, equal_var=False)',
          '    print(f"Welch t-test: t = {t:.2f}, p = {p:.3g}")',
          'else:',
          '    F, p = stats.f_oneway(*groups)',
          '    print(f"One-way ANOVA: F = {F:.2f}, p = {p:.3g}")');
      }
      break;
    }
    case 'heatmap': {
      figureLevel = false;
      const v = color && columnOf(dataset, color)?.type === 'number' ? color : undefined;
      lines(`fig, ax = plt.subplots(figsize=(${wIn}, ${hIn}), layout="constrained")`);
      lines(v ? `table = df.pivot_table(index=${q(y!)}, columns=${q(x!)}, values=${q(v)}, aggfunc=${q(spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate)})` : `table = pd.crosstab(df[${q(y!)}], df[${q(x!)}])`);
      lines(`sns.heatmap(table, ax=ax, cmap=${q(PY_CMAP[sequentialScheme(st.palette)] ?? 'viridis')}, annot=${spec.stats.labels ? 'True' : 'False'}, fmt=".3g", linewidths=0.5, linecolor="white", cbar_kws={"label": ${q(v ? `${prettify(spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate)} ${lowerFirst(prettify(v))}` : 'Count')}})`);
      break;
    }
    case 'corr': {
      figureLevel = false;
      lines('import numpy as np', `fig, ax = plt.subplots(figsize=(${wIn}, ${hIn}), layout="constrained")`);
      lines('corr = df.select_dtypes("number").corr()', 'mask = np.triu(np.ones_like(corr, dtype=bool), k=1)');
      lines(`sns.heatmap(corr, mask=mask, ax=ax, cmap="RdBu_r", vmin=-1, vmax=1, center=0, annot=${spec.stats.labels ? 'True' : 'False'}, fmt=".2f", square=True, linewidths=0.5, cbar_kws={"label": "Pearson r"})`);
      break;
    }
  }

  lines('');
  const target = figureLevel ? 'g' : 'ax';
  if (figureLevel) {
    lines(`g.set_axis_labels(${q(L.x)}, ${q(L.y)})`);
    if (facet || facetRow) {
      const tpl = (c?: string, v = 'col') => (c && columnOf(dataset, c)?.type === 'number' ? `${prettify(c)} = {${v}_name}` : `{${v}_name}`);
      lines(`g.set_titles(row_template=${q(tpl(facetRow, 'row'))}, col_template=${q(tpl(facet))})`);
    }
    for (const [axis, scale] of [['x', st.xScale], ['y', st.yScale]] as const) {
      if (scale === 'log') lines(`g.set(${axis}scale="log")`);
      if (scale === 'sqrt') lines('import numpy as np', `for ax in g.axes.flat:`, `    ax.set_${axis}scale("function", functions=(np.sqrt, np.square))`);
    }
    if (st.xMin !== null || st.xMax !== null) lines(`g.set(xlim=(${st.xMin ?? 'None'}, ${st.xMax ?? 'None'}))`);
    if (st.yMin !== null || st.yMax !== null) lines(`g.set(ylim=(${st.yMin ?? 'None'}, ${st.yMax ?? 'None'}))`);
    if (hue && !hueNumeric && st.legend !== 'none' && g_hasLegend(spec)) {
      lines(st.legend === 'right' || st.legend === 'auto'
        ? `sns.move_legend(g, "center right", title=${q(L.color)}, frameon=False)`
        : `sns.move_legend(g, "lower center", bbox_to_anchor=(0.5, 1.0), ncol=6, title=${q(L.color)}, frameon=False)`);
    } else if (hue && st.legend === 'none' && g_hasLegend(spec)) lines('g.legend.remove()');
    for (const an of spec.annotations) lines(`g.refline(${an.kind === 'hline' ? 'y' : 'x'}=${an.value}, color="0.45", linestyle="--", linewidth=0.9)`);
    if (st.title) lines(`g.figure.suptitle(${q(st.title)}, x=0.02, ha="left", fontweight="bold")`);
    lines(`g.figure.set_size_inches(${wIn}, ${hIn})`);
  } else {
    if (spec.mark !== 'corr') lines(`ax.set_xlabel(${q(L.x)})`, `ax.set_ylabel(${q(L.y)})`);
    if (st.yScale === 'log') lines('ax.set_yscale("log")');
    if (st.yMin !== null || st.yMax !== null) lines(`ax.set_ylim(${st.yMin ?? 'None'}, ${st.yMax ?? 'None'})`);
    if (spec.mark === 'bar' || spec.mark === 'area') lines(`ax.legend(title=${q(L.color)}, frameon=False${st.legend === 'none' ? '' : ''})`);
    for (const an of spec.annotations) lines(`ax.ax${an.kind === 'hline' ? 'h' : 'v'}line(${an.value}, color="0.45", linestyle="--", linewidth=0.9)`);
    if (st.title) lines(`ax.set_title(${q(st.title)}, loc="left", fontweight="bold")`);
  }
  if (st.caption) lines(`plt.figtext(0.01, 0.005, ${q(st.caption)}, ha="left", va="bottom", fontsize=${r1(st.fontSize * 0.88)}, color="0.4")`);
  if (tests.length) lines('', '# statistics', ...tests);
  lines('', `${target === 'g' ? 'g' : 'fig'}.savefig("figure.pdf", bbox_inches="tight")`, `${target === 'g' ? 'g' : 'fig'}.savefig("figure.png", dpi=300, bbox_inches="tight")`, 'plt.show()');
  return out.join('\n') + '\n';
}

const g_hasLegend = (spec: Spec) => !['corr', 'heatmap'].includes(spec.mark) && !(spec.enc.color && spec.enc.color === spec.enc.x);

// ================================================================ R

const R_ERR: Record<string, string> = { sd: 'mean_sdl, fun.args = list(mult = 1)', se: 'mean_se', ci95: 'mean_cl_normal' };
const R_FONT: Record<string, string> = { sans: 'Helvetica', serif: 'Times', mono: 'Courier' };
const R_BIN: Record<string, string> = { day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' };

const rn = (name: string) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(name) ? name : `\`${name.replace(/`/g, '\\`')}\``);

export function toR(spec: Spec, dataset: Dataset, file = `${dataset.name}.csv`): string {
  const st = spec.style;
  const { x, y, color, size, facet, facetRow } = spec.enc;
  const info = markInfo(spec.mark);
  const L = labels(spec, dataset);
  const hue = color && info.slots.includes('color') ? color : undefined;
  const hueNumeric = !!hue && columnOf(dataset, hue)?.type === 'number' && !['bar', 'box', 'violin', 'strip', 'histogram', 'density'].includes(spec.mark);
  const a = agg(spec, dataset);
  const out: string[] = [];
  const lines = (...l: string[]) => out.push(...l);
  const usesFill = ['bar', 'histogram', 'density', 'box', 'violin', 'area'].includes(spec.mark);
  const aesColor = hue ? `${usesFill ? 'fill' : 'colour'} = ${hue === x || hueNumeric ? rn(hue) : `factor(${rn(hue)})`}` : '';

  lines('library(ggplot2)', 'library(dplyr)', 'library(readr)');
  if (spec.stats.test) lines('library(ggpubr)  # stat_cor / stat_compare_means');
  lines('', `df <- read_csv(${q(file)})`);
  for (const f of spec.filters) {
    if (f.in?.length) lines(`df <- df |> filter(as.character(${rn(f.column)}) %in% c(${f.in.map(q).join(', ')}))`);
    if (f.min != null) lines(`df <- df |> filter(${rn(f.column)} >= ${f.min})`);
    if (f.max != null) lines(`df <- df |> filter(${rn(f.column)} <= ${f.max})`);
  }
  if (spec.mark === 'line' && spec.stats.timeBin !== 'none' && x && columnOf(dataset, x)?.type === 'date') {
    lines(`df <- df |> mutate(${rn(x)} = lubridate::floor_date(${rn(x)}, ${q(R_BIN[spec.stats.timeBin])}))`);
  }
  if (hue && !hueNumeric && !['heatmap', 'corr'].includes(spec.mark)) {
    const lv = levels(dataset.rows, hue);
    const cs = groupColors(st, lv);
    lines(`palette <- c(${lv.map((l, i) => `${q(l)} = ${q(cs[i])}`).join(', ')})`, '');
  } else lines(`palette <- c(${q(singleColor(st))})`, '');

  const geoms: string[] = [];
  let base = `ggplot(df, aes(${[x && spec.mark !== 'corr' ? `x = ${['bar', 'box', 'violin', 'strip'].includes(spec.mark) ? `factor(${rn(x)})` : rn(x)}` : '', y && !['histogram', 'density', 'corr'].includes(spec.mark) ? `y = ${rn(y)}` : '', aesColor, size && spec.mark === 'scatter' ? `size = ${rn(size)}` : ''].filter(Boolean).join(', ')}))`;
  const dodge = hue && hue !== x ? 'position = position_dodge(width = 0.85)' : '';
  const solid = hue ? '' : `${usesFill ? 'fill' : 'colour'} = palette[1]`;
  const args = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(', ');

  switch (spec.mark) {
    case 'scatter':
      geoms.push(`geom_point(${args(!size && `size = ${r1(st.markSize * 0.55)}`, `alpha = ${st.opacity}`, solid)})`);
      if (spec.stats.trend !== 'none') geoms.push(`geom_smooth(${args(`method = ${q(spec.stats.trend === 'linear' ? 'lm' : 'loess')}`, 'formula = y ~ x', 'se = TRUE', `linewidth = ${r1(st.lineWidth * 0.5)}`, solid)})`);
      if (spec.stats.test) geoms.push('stat_cor(method = "pearson")');
      break;
    case 'line':
      if (a === 'none') geoms.push(`geom_line(${args(`linewidth = ${r1(st.lineWidth * 0.5)}`, solid)})`);
      else {
        if (spec.stats.error !== 'none' && a === 'mean') geoms.push(`stat_summary(${args(`fun.data = ${R_ERR[spec.stats.error]}`, 'geom = "ribbon"', 'alpha = 0.18', 'colour = NA', hue ? `aes(fill = factor(${rn(hue)}))` : 'fill = palette[1]')})`);
        geoms.push(`stat_summary(${args(`fun = ${a}`, 'geom = "line"', `linewidth = ${r1(st.lineWidth * 0.5)}`, solid)})`);
        if (spec.stats.points) geoms.push(`stat_summary(${args(`fun = ${a}`, 'geom = "point"', `size = ${r1(st.markSize * 0.5)}`, solid)})`);
      }
      break;
    case 'area':
      geoms.push(`stat_summary(${args('fun = mean', 'geom = "area"', 'position = "stack"', `alpha = ${Math.min(0.9, st.opacity)}`, solid)})`);
      break;
    case 'bar': {
      const mode = hue && hue !== x ? spec.stats.barMode : 'group';
      if (!y) geoms.push(`geom_bar(${args(mode === 'group' ? (dodge && 'position = position_dodge(width = 0.85), width = 0.8') : `position = ${q(mode === 'fill' ? 'fill' : 'stack')}`, solid)})`);
      else if (mode !== 'group') geoms.push(`stat_summary(${args(`fun = ${a}`, 'geom = "col"', `position = ${q(mode === 'fill' ? 'fill' : 'stack')}`, solid)})`);
      else {
        geoms.push(`stat_summary(${args(`fun = ${a}`, 'geom = "col"', 'width = 0.8', dodge, solid)})`);
        if (a === 'mean' && spec.stats.error !== 'none') geoms.push(`stat_summary(${args(`fun.data = ${R_ERR[spec.stats.error]}`, 'geom = "errorbar"', 'width = 0.2', 'linewidth = 0.4', dodge, hue ? 'aes(group = factor(' + rn(hue) + '))' : '')})`);
        if (spec.stats.points) geoms.push(`geom_point(${args(hue && hue !== x ? 'position = position_jitterdodge(jitter.width = 0.15, dodge.width = 0.85)' : 'position = position_jitter(width = 0.15)', 'alpha = 0.45', 'size = 1', 'show.legend = FALSE')})`);
      }
      break;
    }
    case 'histogram': {
      const pos = hue ? { group: 'identity', stack: 'stack', fill: 'fill' }[spec.stats.barMode] : 'stack';
      geoms.push(`geom_histogram(${args(`bins = ${spec.stats.bins}`, `position = ${q(pos)}`, hue && pos === 'identity' ? 'alpha = 0.5' : '', 'colour = "white"', 'linewidth = 0.2', solid)})`);
      break;
    }
    case 'density':
      geoms.push(`geom_density(${args('alpha = 0.25', `linewidth = ${r1(st.lineWidth * 0.5)}`, solid)})`);
      if (spec.stats.points) geoms.push('geom_rug(alpha = 0.35)');
      break;
    case 'box':
      geoms.push(`geom_boxplot(${args('width = 0.6', `outlier.shape = ${spec.stats.points ? 'NA' : '1'}`, dodge, solid)})`);
      if (spec.stats.points) geoms.push(`geom_point(${args(hue && hue !== x ? 'position = position_jitterdodge(jitter.width = 0.15, dodge.width = 0.85)' : 'position = position_jitter(width = 0.15)', 'alpha = 0.4', 'size = 0.8', 'show.legend = FALSE')})`);
      break;
    case 'violin':
      geoms.push(`geom_violin(${args('trim = TRUE', 'alpha = 0.75', dodge, solid)})`, `geom_boxplot(${args('width = 0.1', 'outlier.shape = NA', 'fill = "white"', dodge)})`);
      if (spec.stats.points) geoms.push('geom_jitter(width = 0.1, alpha = 0.35, size = 0.7, show.legend = FALSE)');
      break;
    case 'strip':
      geoms.push(`geom_point(${args(hue && hue !== x ? 'position = position_jitterdodge(jitter.width = 0.25, dodge.width = 0.8)' : 'position = position_jitter(width = 0.25)', `alpha = ${st.opacity}`, `size = ${r1(st.markSize * 0.45)}`, solid)})`);
      geoms.push(`stat_summary(${args(`fun.data = ${R_ERR[spec.stats.error === 'none' ? 'ci95' : spec.stats.error]}`, 'geom = "crossbar"', 'width = 0.5', 'colour = "black"', 'linewidth = 0.3', dodge)})`);
      break;
    case 'heatmap': {
      const v = color && columnOf(dataset, color)?.type === 'number' ? color : undefined;
      const fn = spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate;
      lines(`cells <- df |> count(${rn(x!)}, ${rn(y!)}${v ? '' : ', name = "value"'})`);
      if (v) out[out.length - 1] = `cells <- df |> group_by(${rn(x!)}, ${rn(y!)}) |> summarise(value = ${fn === 'count' ? 'n()' : `${fn}(${rn(v)}, na.rm = TRUE)`}, .groups = "drop")`;
      base = `ggplot(cells, aes(x = factor(${rn(x!)}), y = factor(${rn(y!)}), fill = value))`;
      geoms.push('geom_tile(colour = "white", linewidth = 0.4)');
      if (spec.stats.labels) geoms.push(`geom_text(aes(label = signif(value, 3)), size = ${r1(st.fontSize * 0.3)})`);
      geoms.push(`scale_fill_viridis_c(option = ${q({ viridis: 'D', cividis: 'E', magma: 'A', blues: 'G' }[sequentialScheme(st.palette)] ?? 'D')})`);
      break;
    }
    case 'corr':
      lines('m <- cor(select(df, where(is.numeric)), use = "pairwise.complete.obs")',
        'm[upper.tri(m)] <- NA',
        'cells <- na.omit(as.data.frame(as.table(m)))');
      base = 'ggplot(cells, aes(Var2, Var1, fill = Freq))';
      geoms.push('geom_tile(colour = "white", linewidth = 0.5)');
      if (spec.stats.labels) geoms.push(`geom_text(aes(label = sprintf("%.2f", Freq)), size = ${r1(st.fontSize * 0.3)})`);
      geoms.push('scale_fill_distiller(palette = "RdBu", limits = c(-1, 1), direction = 1, name = "Pearson r")', 'coord_equal()');
      break;
  }

  if (spec.stats.test && ['box', 'violin', 'strip', 'bar'].includes(spec.mark) && x && y) {
    const k = new Set(dataset.rows.map((r) => String(r[x]))).size;
    geoms.push(k === 2 ? 'stat_compare_means(method = "t.test", label = "p.format")' : 'stat_compare_means(method = "anova", label.x.npc = "left")');
  }

  if (hue && !hueNumeric && !['heatmap', 'corr'].includes(spec.mark)) {
    geoms.push(`scale_${usesFill ? 'fill' : 'colour'}_manual(values = palette)`);
    if (spec.mark === 'line' && spec.stats.error !== 'none') geoms.push('scale_fill_manual(values = palette, guide = "none")');
  }
  if (hueNumeric) geoms.push(`scale_colour_viridis_c(option = ${q({ viridis: 'D', cividis: 'E', magma: 'A', blues: 'G' }[sequentialScheme(st.palette)] ?? 'D')})`);
  if (st.xScale === 'log') geoms.push('scale_x_log10()'); else if (st.xScale === 'sqrt') geoms.push('scale_x_sqrt()');
  if (st.yScale === 'log') geoms.push('scale_y_log10()'); else if (st.yScale === 'sqrt') geoms.push('scale_y_sqrt()');
  if (st.xMin !== null || st.xMax !== null || st.yMin !== null || st.yMax !== null) {
    geoms.push(`coord_cartesian(${args((st.xMin !== null || st.xMax !== null) && `xlim = c(${st.xMin ?? 'NA'}, ${st.xMax ?? 'NA'})`, (st.yMin !== null || st.yMax !== null) && `ylim = c(${st.yMin ?? 'NA'}, ${st.yMax ?? 'NA'})`)})`);
  }
  for (const an of spec.annotations) geoms.push(`geom_${an.kind}(${an.kind === 'hline' ? 'yintercept' : 'xintercept'} = ${an.value}, linetype = "dashed", colour = "grey45")`);
  if (facet || facetRow) geoms.push(`facet_grid(${args(facetRow && `rows = vars(${rn(facetRow)})`, facet && `cols = vars(${rn(facet)})`)})`);

  const labs = [
    st.title && `title = ${q(st.title)}`, st.subtitle && `subtitle = ${q(st.subtitle)}`, st.caption && `caption = ${q(st.caption)}`,
    spec.mark !== 'corr' && `x = ${q(L.x)}`, spec.mark !== 'corr' && `y = ${q(L.y)}`,
    hue && `${usesFill ? 'fill' : 'colour'} = ${q(L.color)}`,
  ];
  geoms.push(`labs(${args(...labs)})`);

  const themeFn = st.theme === 'classic' ? 'theme_bw' : st.theme === 'minimal' ? 'theme_minimal' : st.theme === 'dark' ? 'theme_dark' : 'theme_classic';
  geoms.push(`${themeFn}(base_size = ${st.fontSize}, base_family = ${q(R_FONT[st.font])})`);
  const tweaks = [
    `legend.position = ${q(st.legend === 'none' ? 'none' : st.legend === 'top' ? 'top' : 'right')}`,
    'plot.title = element_text(face = "bold")',
    st.grid === 'y' || st.grid === 'both' ? 'panel.grid.major.y = element_line(colour = "grey90", linewidth = 0.3)' : '',
    st.grid === 'x' || st.grid === 'both' ? 'panel.grid.major.x = element_line(colour = "grey90", linewidth = 0.3)' : '',
    'strip.background = element_blank()',
  ];
  geoms.push(`theme(${args(...tweaks)})`);

  lines(`p <- ${base} +`);
  geoms.forEach((g, i) => lines(`  ${g}${i < geoms.length - 1 ? ' +' : ''}`));
  lines('', 'p', `ggsave("figure.pdf", p, width = ${st.widthMm}, height = ${st.heightMm}, units = "mm")`, `ggsave("figure.png", p, width = ${st.widthMm}, height = ${st.heightMm}, units = "mm", dpi = 300)`);
  return out.join('\n') + '\n';
}

export function toJSON(spec: Spec): string {
  return JSON.stringify(spec, null, 2);
}
