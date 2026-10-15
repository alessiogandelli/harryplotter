import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useFigureStore } from '../store/figureStore';

export function DataPanel() {
  const { t } = useTranslation();
  const dataset = useFigureStore((state) => state.dataset);
  const loadDataset = useFigureStore((state) => state.loadDataset);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const summary = await api.uploadDataset(file);
      loadDataset(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel data-panel">
      <h2>{t('data.title')}</h2>

      <label className="upload">
        <span className="upload-button">{uploading ? t('data.loading') : t('data.upload')}</span>
        <span className="upload-hint">{t('data.uploadHint')}</span>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} disabled={uploading} hidden />
      </label>

      {error && <p className="error">{error}</p>}

      {!dataset ? (
        <p className="muted">{t('data.noDataset')}</p>
      ) : (
        <div className="dataset">
          <dl className="dataset-meta">
            <div>
              <dt>{t('data.filename')}</dt>
              <dd>{dataset.filename}</dd>
            </div>
            <div>
              <dt>{t('data.rows')}</dt>
              <dd>{dataset.rows.toLocaleString()}</dd>
            </div>
            <div>
              <dt>{t('data.columns')}</dt>
              <dd>{dataset.columns.length}</dd>
            </div>
          </dl>

          <table className="table">
            <thead>
              <tr>
                <th>{t('data.column')}</th>
                <th>{t('data.type')}</th>
                <th>{t('data.missing')}</th>
              </tr>
            </thead>
            <tbody>
              {dataset.columns.map((column) => (
                <tr key={column.name}>
                  <td>{column.name}</td>
                  <td>{t(`data.dtype.${column.dtype}`)}</td>
                  <td>{column.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {Object.keys(dataset.stats).length > 0 && (
            <>
              <h3>{t('data.stats')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('data.column')}</th>
                    <th>{t('data.count')}</th>
                    <th>{t('data.mean')}</th>
                    <th>{t('data.std')}</th>
                    <th>{t('data.min')}</th>
                    <th>{t('data.max')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dataset.stats).map(([name, stats]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{stats.count}</td>
                      <td>{stats.mean.toFixed(3)}</td>
                      <td>{stats.std.toFixed(3)}</td>
                      <td>{stats.min}</td>
                      <td>{stats.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {dataset.sample.length > 0 && (
            <>
              <h3>{t('data.sample')}</h3>
              <div className="sample-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      {dataset.columns.map((column) => (
                        <th key={column.name}>{column.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.sample.map((row, index) => (
                      <tr key={index}>
                        {dataset.columns.map((column) => (
                          <td key={column.name}>{String(row[column.name] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
