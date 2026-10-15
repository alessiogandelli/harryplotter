import { useTranslation } from 'react-i18next';
import {
  LEGEND_ORIENTATIONS,
  LEGEND_POSITIONS,
  type LegendStyle,
} from '../../types/figureSpec';
import { useFigureStore } from '../../store/figureStore';
import { setLegend } from '../../store/reducers';
import { Collapsible } from '../Collapsible';
import { Checkbox, Field, NumberInput, Select, TextInput } from '../fields';

export function LegendSection() {
  const { t } = useTranslation();
  const legend = useFigureStore((state) => state.spec.style.legend);
  const apply = useFigureStore((state) => state.apply);

  const set = (patch: Partial<LegendStyle>) => apply((spec) => setLegend(spec, patch));

  return (
    <Collapsible title={t('config.legend.title')}>
      <Checkbox checked={legend.show} label={t('config.legend.show')} onChange={(show) => set({ show })} />

      <Field label={t('config.legend.position')}>
        <Select
          value={legend.position}
          options={LEGEND_POSITIONS.map((position) => ({
            value: position,
            label: t(`config.legend.positions.${position}`),
          }))}
          onChange={(position) => set({ position })}
        />
      </Field>

      <Field label={t('config.legend.orientation')}>
        <Select
          value={legend.orientation}
          options={LEGEND_ORIENTATIONS.map((orientation) => ({
            value: orientation,
            label: orientation,
          }))}
          onChange={(orientation) => set({ orientation })}
        />
      </Field>

      <Field label={t('config.legend.columns')}>
        <NumberInput
          value={legend.columns}
          min={1}
          onChange={(columns) => set({ columns })}
        />
      </Field>

      <Field label={t('config.legend.legendTitle')}>
        <TextInput
          value={legend.title ?? ''}
          onChange={(value) => set({ title: value || null })}
        />
      </Field>

      <Field label={t('config.legend.fontSize')}>
        <NumberInput
          value={legend.fontSize}
          min={1}
          onChange={(fontSize) => set({ fontSize: fontSize ?? 12 })}
        />
      </Field>

      <Field label={t('config.legend.order')}>
        <TextInput
          value={legend.order?.join(', ') ?? ''}
          placeholder={t('config.legend.orderHint')}
          onChange={(value) => {
            const names = value
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean);
            set({ order: names.length > 0 ? names : null });
          }}
        />
      </Field>
    </Collapsible>
  );
}
