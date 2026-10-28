import { useTranslation } from 'react-i18next';
import { PALETTES } from '../../types/figureSpec';
import { useFigureStore } from '../../store/figureStore';
import { setBackground, setFont, setLine, setMargins, setMarker, setPalette, setSubtitle, setTitle } from '../../store/reducers';
import { Collapsible } from '../Collapsible';
import { Field, NumberInput, Select, TextInput } from '../fields';

const MARKER_SYMBOLS = ['circle', 'square', 'diamond', 'triangle-up', 'cross', 'x'];

export function AppearanceSection() {
  const { t } = useTranslation();
  const style = useFigureStore((state) => state.spec.style);
  const apply = useFigureStore((state) => state.apply);

  return (
    <Collapsible title={t('config.appearance.title')}>
      <Field label={t('config.appearance.titleLabel')}>
        <TextInput
          value={style.title ?? ''}
          placeholder={t('config.appearance.titlePlaceholder')}
          onChange={(value) => apply((spec) => setTitle(spec, value || null))}
        />
      </Field>

      <Field label={t('config.appearance.subtitleLabel')}>
        <TextInput
          value={style.subtitle ?? ''}
          onChange={(value) => apply((spec) => setSubtitle(spec, value || null))}
        />
      </Field>

      <Field label={t('config.appearance.fontFamily')}>
        <TextInput
          value={style.font.family}
          onChange={(family) => apply((spec) => setFont(spec, { family }))}
        />
      </Field>

      <Field label={t('config.appearance.fontSize')}>
        <NumberInput
          value={style.font.size}
          min={1}
          onChange={(size) => apply((spec) => setFont(spec, { size: size ?? 12 }))}
        />
      </Field>

      <Field label={t('config.appearance.palette')}>
        <Select
          value={style.palette}
          options={PALETTES.map((palette) => ({
            value: palette,
            label: t(`config.appearance.paletteNames.${palette}`),
          }))}
          onChange={(palette) => apply((spec) => setPalette(spec, palette))}
        />
      </Field>

      <Field label={t('config.appearance.background')}>
        <input
          className="input color-input"
          type="color"
          value={style.background}
          onChange={(event) => apply((spec) => setBackground(spec, event.target.value))}
        />
      </Field>

      <Field label={t('config.appearance.markerSize')}>
        <NumberInput
          value={style.marker.size}
          min={0}
          onChange={(size) => apply((spec) => setMarker(spec, { size: size ?? 0 }))}
        />
      </Field>

      <Field label={t('config.appearance.markerOpacity')}>
        <NumberInput
          value={style.marker.opacity}
          min={0}
          max={1}
          step={0.1}
          onChange={(opacity) => apply((spec) => setMarker(spec, { opacity: opacity ?? 1 }))}
        />
      </Field>

      <Field label={t('config.appearance.markerSymbol')}>
        <Select
          value={style.marker.symbol}
          options={MARKER_SYMBOLS.map((symbol) => ({ value: symbol, label: symbol }))}
          onChange={(symbol) => apply((spec) => setMarker(spec, { symbol }))}
        />
      </Field>

      <Field label={t('config.appearance.lineWidth')}>
        <NumberInput
          value={style.line.width}
          min={0}
          onChange={(width) => apply((spec) => setLine(spec, { width: width ?? 0 }))}
        />
      </Field>

      <div className="subgroup">
        <h4>{t('config.appearance.advanced')}</h4>

        <Field label={t('config.appearance.marginLeft')}>
          <NumberInput
            value={style.margins.l}
            min={0}
            onChange={(l) => apply((spec) => setMargins(spec, { l: l ?? 0 }))}
          />
        </Field>

        <Field label={t('config.appearance.marginRight')}>
          <NumberInput
            value={style.margins.r}
            min={0}
            onChange={(r) => apply((spec) => setMargins(spec, { r: r ?? 0 }))}
          />
        </Field>

        <Field label={t('config.appearance.marginTop')}>
          <NumberInput
            value={style.margins.t}
            min={0}
            onChange={(t) => apply((spec) => setMargins(spec, { t: t ?? 0 }))}
          />
        </Field>

        <Field label={t('config.appearance.marginBottom')}>
          <NumberInput
            value={style.margins.b}
            min={0}
            onChange={(b) => apply((spec) => setMargins(spec, { b: b ?? 0 }))}
          />
        </Field>
      </div>
    </Collapsible>
  );
}
