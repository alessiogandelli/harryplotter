import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useFigureStore } from '../store/figureStore';
import type { DatasetListItem } from '../types/api';

/** Compact header control: pick a dataset from the library or upload one. */
export function DatasetPicker() {
  const { t } = useTranslation();
  const datasetId = useFigureStore((state) => state.datasetId);
  const loadDataset = useFigureStore((state) => state.loadDataset);

  const [library, setLibrary] = useState<DatasetListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLibrary(await api.listDatasets());
    } catch {
      /* the picker still works for uploads */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = async (id: string) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      loadDataset(await api.getDataset(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      loadDataset(await api.uploadDataset(file));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dataset-picker">
      <select
        className="input"
        aria-label={t('header.dataset')}
        value={datasetId ?? ''}
        onChange={(event) => void select(event.target.value)}
        disabled={busy}
      >
        <option value="">{t('header.datasetPlaceholder')}</option>
        {library.map((item) => (
          <option key={item.id} value={item.id}>
            {item.filename}
            {item.kind === 'sample' ? ` · ${t('data.sampleBadge').toLowerCase()}` : ''}
          </option>
        ))}
      </select>

      <label className="upload-button">
        {busy ? <span className="spinner" /> : t('header.upload')}
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={upload}
          disabled={busy}
        />
      </label>

      {error && <span className="error">{error}</span>}
    </div>
  );
}
