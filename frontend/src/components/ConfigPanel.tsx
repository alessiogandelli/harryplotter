import { AxesSection } from './sections/AxesSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LegendSection } from './sections/LegendSection';
import { SeriesSection } from './sections/SeriesSection';
import { DataSection } from './DataSection';
import { ExportSection } from './sections/ExportSection';

/** The right-hand settings column. Every section is collapsed by default. */
export function ConfigPanel() {
  return (
    <aside className="settings">
      <SeriesSection />
      <AxesSection />
      <AppearanceSection />
      <LegendSection />
      <DataSection />
      <ExportSection />
    </aside>
  );
}
