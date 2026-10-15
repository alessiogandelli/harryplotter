import { useTranslation } from 'react-i18next';
import { usePreview } from '../hooks/usePreview';
import { useFigureStore } from '../store/figureStore';
import Plot, { PLOT_CONFIG } from './Plot';

export function PreviewPanel() {
  const { t } = useTranslation();
  const datasetId = useFigureStore((state) => state.datasetId);
  const spec = useFigureStore((state) => state.spec);

  const { figure, issues, error, loading } = usePreview(datasetId, spec);

  return (
    <section className="panel preview-panel">
      <div className="preview-header">
        <h2>{t('preview.title')}</h2>
        {loading && <span className="badge">{t('preview.loading')}</span>}
      </div>

      {issues.length > 0 && (
        <div className="issues">
          <strong>{t('preview.invalid')}</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <code>{issue.path}</code> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="error">{`${t('preview.error')}: ${error}`}</p>}

      <div className="preview-canvas">
        {figure ? (
          <Plot
            data={figure.data}
            layout={figure.layout}
            config={PLOT_CONFIG}
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          issues.length === 0 && !error && <p className="muted">{t('preview.empty')}</p>
        )}
      </div>
    </section>
  );
}
