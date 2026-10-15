import { useTranslation } from 'react-i18next';
import { AGGS, CHART_TYPES, type Agg, type ChartType, type Transform } from '../../types/figureSpec';
import type { DatasetColumn } from '../../types/api';
import {
  addSeries,
  addTransform,
  removeSeries,
  removeTransform,
  setChartType,
  setSeries,
  setTransforms,
} from '../../store/reducers';
import { useFigureStore } from '../../store/figureStore';
import { Collapsible } from '../Collapsible';
import { Checkbox, Field, NumberInput, Select, TextInput } from '../fields';

function columnOptions(columns: DatasetColumn[]) {
  return columns.map((column) => ({ value: column.name, label: column.name }));
}

function parseValues(raw: string): Array<string | number> {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part !== '' && !Number.isNaN(Number(part)) ? Number(part) : part));
}

function TransformEditor({ transform, index, columns }: { transform: Transform; index: number; columns: DatasetColumn[] }) {
  const { t } = useTranslation();
  const apply = useFigureStore((state) => state.apply);

  const update = (next: Transform) =>
    apply((spec) => setTransforms(spec, spec.transforms.map((item, i) => (i === index ? next : item))));

  const remove = () => apply((spec) => removeTransform(spec, index));

  return (
    <div className="transform">
      <div className="transform-head">
        <span className="transform-op">{transform.op}</span>
        <button type="button" className="link" onClick={remove}>
          {t('config.series.remove')}
        </button>
      </div>

      {transform.op === 'filter' && (
        <>
          <Field label={t('config.series.filterColumn')}>
            <Select
              value={transform.column}
              options={columnOptions(columns)}
              onChange={(column) => update({ ...transform, column })}
            />
          </Field>
          <Field label={t('config.series.filterValues')}>
            <TextInput
              value={transform.in.join(', ')}
              onChange={(value) => update({ ...transform, in: parseValues(value) })}
            />
          </Field>
        </>
      )}

      {transform.op === 'groupby' && (
        <>
          <Field label={t('config.series.groupBy')}>
            <TextInput
              value={transform.by.join(', ')}
              onChange={(value) =>
                update({
                  ...transform,
                  by: value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label={t('config.series.aggColumn')}>
            <Select
              value={Object.keys(transform.agg)[0] ?? ''}
              options={[{ value: '', label: t('config.series.none') }, ...columnOptions(columns)]}
              onChange={(column) => {
                const agg = Object.values(transform.agg)[0] ?? 'mean';
                update({ ...transform, agg: column ? { [column]: agg } : {} });
              }}
            />
          </Field>
          <Field label={t('config.series.aggFunction')}>
            <Select
              value={Object.values(transform.agg)[0] ?? 'mean'}
              options={AGGS.map((agg) => ({ value: agg, label: agg }))}
              onChange={(agg: Agg) => {
                const column = Object.keys(transform.agg)[0];
                if (column) update({ ...transform, agg: { [column]: agg } });
              }}
            />
          </Field>
        </>
      )}

      {transform.op === 'sort' && (
        <>
          <Field label={t('config.series.sortColumn')}>
            <Select
              value={transform.column}
              options={columnOptions(columns)}
              onChange={(column) => update({ ...transform, column })}
            />
          </Field>
          <Checkbox
            checked={transform.desc}
            label={t('config.series.sortDesc')}
            onChange={(desc) => update({ ...transform, desc })}
          />
        </>
      )}

      {transform.op === 'limit' && (
        <Field label={t('config.series.limitN')}>
          <NumberInput value={transform.n} min={1} onChange={(n) => update({ ...transform, n: n ?? 1 })} />
        </Field>
      )}
    </div>
  );
}

export function SeriesSection() {
  const { t } = useTranslation();
  const figure = useFigureStore((state) => state.spec.figure);
  const transforms = useFigureStore((state) => state.spec.transforms);
  const dataset = useFigureStore((state) => state.dataset);
  const apply = useFigureStore((state) => state.apply);

  const columns = dataset?.columns ?? [];
  const firstColumn = columns[0]?.name ?? '';

  const add = (transform: Transform) => apply((spec) => addTransform(spec, transform));

  return (
    <Collapsible title={t('config.series.title')}>
      <Field label={t('config.series.chartType')}>
        <Select
          value={figure.chartType}
          options={CHART_TYPES.map((chartType) => ({ value: chartType, label: chartType }))}
          onChange={(chartType: ChartType) => apply((spec) => setChartType(spec, chartType))}
        />
      </Field>

      <h4>{t('config.series.series')}</h4>
      {figure.series.map((series, index) => (
        <div className="series-item" key={index}>
          <Field label={t('config.series.name')}>
            <TextInput
              value={series.name ?? ''}
              onChange={(name) => apply((spec) => setSeries(spec, index, { name: name || null }))}
            />
          </Field>
          <div className="row">
            <Field label={t('config.series.x')}>
              <Select
                value={series.x ?? ''}
                options={[{ value: '', label: t('config.series.none') }, ...columnOptions(columns)]}
                onChange={(x) => apply((spec) => setSeries(spec, index, { x: x || null }))}
              />
            </Field>
            <Field label={t('config.series.y')}>
              <Select
                value={series.y ?? ''}
                options={[{ value: '', label: t('config.series.none') }, ...columnOptions(columns)]}
                onChange={(y) => apply((spec) => setSeries(spec, index, { y: y || null }))}
              />
            </Field>
            <Field label={t('config.series.color')}>
              <Select
                value={series.color ?? ''}
                options={[{ value: '', label: t('config.series.none') }, ...columnOptions(columns)]}
                onChange={(color) => apply((spec) => setSeries(spec, index, { color: color || null }))}
              />
            </Field>
          </div>
          {figure.series.length > 1 && (
            <button
              type="button"
              className="link"
              onClick={() => apply((spec) => removeSeries(spec, index))}
            >
              {t('config.series.removeSeries')}
            </button>
          )}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => apply((spec) => addSeries(spec))}>
        {t('config.series.addSeries')}
      </button>

      <h4>{t('config.series.transforms')}</h4>
      {transforms.length === 0 && <p className="muted">{t('config.series.noTransforms')}</p>}
      {transforms.map((transform, index) => (
        <TransformEditor
          key={index}
          transform={transform}
          index={index}
          columns={columns}
        />
      ))}
      <div className="transform-add">
        <button
          type="button"
          className="secondary"
          onClick={() => add({ op: 'filter', column: firstColumn, in: [] })}
        >
          {t('config.series.addFilter')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => add({ op: 'groupby', by: [], agg: firstColumn ? { [firstColumn]: 'mean' } : {} })}
        >
          {t('config.series.addGroupby')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => add({ op: 'sort', column: firstColumn, desc: true })}
        >
          {t('config.series.addSort')}
        </button>
        <button type="button" className="secondary" onClick={() => add({ op: 'limit', n: 15 })}>
          {t('config.series.addLimit')}
        </button>
      </div>
    </Collapsible>
  );
}
