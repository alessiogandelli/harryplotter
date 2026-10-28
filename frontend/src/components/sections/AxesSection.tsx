import { useTranslation } from 'react-i18next';
import { AXIS_SCALES, TICK_MODES, type AxisName, type AxisStyle } from '../../types/figureSpec';
import { setAxis } from '../../store/reducers';
import { useFigureStore } from '../../store/figureStore';
import { Collapsible } from '../Collapsible';
import { Checkbox, Field, NumberInput, Select, TextInput } from '../fields';

function AxisControls({ axis }: { axis: AxisName }) {
  const { t } = useTranslation();
  const value = useFigureStore((state) => state.spec.style.axes[axis]);
  const apply = useFigureStore((state) => state.apply);

  const set = (patch: Partial<AxisStyle>) => apply((spec) => setAxis(spec, axis, patch));

  return (
    <div className="subgroup">
      <h4>{t(`config.axes.${axis}`)}</h4>

      <Field label={t('config.axes.label')}>
        <TextInput value={value.label ?? ''} onChange={(label) => set({ label: label || null })} />
      </Field>

      <Field label={t('config.axes.range')}>
        <div className="row">
          <NumberInput
            value={value.range[0]}
            placeholder={t('config.axes.min')}
            onChange={(min) => set({ range: [min, value.range[1]] })}
          />
          <NumberInput
            value={value.range[1]}
            placeholder={t('config.axes.max')}
            onChange={(max) => set({ range: [value.range[0], max] })}
          />
        </div>
      </Field>

      <Field label={t('config.axes.scale')}>
        <Select
          value={value.scale}
          options={AXIS_SCALES.map((scale) => ({
            value: scale,
            label: t(`config.axes.scales.${scale}`),
          }))}
          onChange={(scale) => set({ scale })}
        />
      </Field>

      <Field label={t('config.axes.tickMode')}>
        <Select
          value={value.tickMode}
          options={TICK_MODES.map((mode) => ({ value: mode, label: t(`config.axes.${mode}`) }))}
          onChange={(tickMode) =>
            set({
              tickMode,
              tickStep: tickMode === 'step' ? value.tickStep : null,
              tickCount: tickMode === 'count' ? value.tickCount : null,
            })
          }
        />
      </Field>

      {value.tickMode === 'step' && (
        <Field label={t('config.axes.tickStep')}>
          <NumberInput value={value.tickStep} onChange={(tickStep) => set({ tickStep })} />
        </Field>
      )}

      {value.tickMode === 'count' && (
        <Field label={t('config.axes.tickCount')}>
          <NumberInput value={value.tickCount} onChange={(tickCount) => set({ tickCount })} />
        </Field>
      )}

      <Field label={t('config.axes.tickRotation')}>
        <NumberInput
          value={value.tickRotation}
          onChange={(tickRotation) => set({ tickRotation: tickRotation ?? 0 })}
        />
      </Field>

      <Checkbox
        checked={value.reverse}
        label={t('config.axes.reverse')}
        onChange={(reverse) => set({ reverse })}
      />
      <Checkbox
        checked={value.grid}
        label={t('config.axes.grid')}
        onChange={(grid) => set({ grid })}
      />
    </div>
  );
}

export function AxesSection() {
  const { t } = useTranslation();
  return (
    <Collapsible title={t('config.axes.title')}>
      <AxisControls axis="x" />
      <AxisControls axis="y" />
    </Collapsible>
  );
}
