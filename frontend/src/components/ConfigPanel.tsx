import { useTranslation } from 'react-i18next';
import { AxesSection } from './sections/AxesSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LegendSection } from './sections/LegendSection';
import { SeriesSection } from './sections/SeriesSection';
import { ExportSection } from './sections/ExportSection';

export function ConfigPanel() {
  const { t } = useTranslation();
  return (
    <section className="panel config-panel">
      <h2>{t('config.title')}</h2>
      <AxesSection />
      <AppearanceSection />
      <LegendSection />
      <SeriesSection />
      <ExportSection />
    </section>
  );
}
