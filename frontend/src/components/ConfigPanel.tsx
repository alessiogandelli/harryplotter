import { useTranslation } from 'react-i18next';
import { CHART_TYPES, type ChartType } from '../types/figureSpec';
import { setChartType } from '../store/reducers';
import { useFigureStore } from '../store/figureStore';
import { Field, Select } from './fields';
import { AxesSection } from './sections/AxesSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LegendSection } from './sections/LegendSection';
import { SeriesSection } from './sections/SeriesSection';
import { DataSection } from './DataSection';
import { ExportSection } from './sections/ExportSection';

/** The right-hand settings column. Chart type stays visible; the rest collapse. */
export function ConfigPanel() {
  const { t } = useTranslation();
  const chartType = useFigureStore((state) => state.spec.figure.chartType);
  const apply = useFigureStore((state) => state.apply);

  return (
    <aside className="settings">
      <div className="settings-charttype">
        <Field label={t('config.series.chartType')}>
          <Select
            value={chartType}
            options={CHART_TYPES.map((type) => ({
              value: type,
              label: t(`config.chartTypes.${type}`),
            }))}
            onChange={(next: ChartType) => apply((spec) => setChartType(spec, next))}
          />
        </Field>
      </div>

      <SeriesSection />
      <AxesSection />
      <AppearanceSection />
      <LegendSection />
      <DataSection />
      <ExportSection />
    </aside>
  );
}
