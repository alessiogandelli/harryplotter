import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, exportFilename } from '../../api/client';
import { useFigureStore } from '../../store/figureStore';
import type { ExportFormat } from '../../types/api';
import { Collapsible } from '../Collapsible';
import { Field, NumberInput, Select } from '../fields';

const FORMATS: ExportFormat[] = ['html', 'png', 'svg', 'pdf'];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ExportSection() {
  const { t } = useTranslation();
  const datasetId = useFigureStore((state) => state.datasetId);
  const spec = useFigureStore((state) => state.spec);
  const size = spec.style.size;

  const [format, setFormat] = useState<ExportFormat>('png');
  const [width, setWidth] = useState<number | null>(size.width);
  const [height, setHeight] = useState<number | null>(size.height);
  const [scale, setScale] = useState<number | null>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!datasetId) {
      setError(t('prompt.noDataset'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await api.exportFigure({
        datasetId,
        spec,
        format,
        width: width ?? undefined,
        height: height ?? undefined,
        scale: scale ?? undefined,
      });
      downloadBlob(blob, exportFilename(format));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'export_unavailable') {
        setError(t('config.export.unavailable'));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible title={t('config.export.title')}>
      <Field label={t('config.export.format')}>
        <Select
          value={format}
          options={FORMATS.map((item) => ({ value: item, label: item.toUpperCase() }))}
          onChange={setFormat}
        />
      </Field>

      <div className="row">
        <Field label={t('config.export.width')}>
          <NumberInput value={width} min={1} onChange={setWidth} />
        </Field>
        <Field label={t('config.export.height')}>
          <NumberInput value={height} min={1} onChange={setHeight} />
        </Field>
        <Field label={t('config.export.scale')}>
          <NumberInput value={scale} min={0.1} step={0.5} onChange={setScale} />
        </Field>
      </div>

      <button type="button" className="primary" onClick={run} disabled={busy}>
        {busy ? t('config.export.exporting') : t('config.export.export')}
      </button>

      {error && <p className="error">{error}</p>}
    </Collapsible>
  );
}
