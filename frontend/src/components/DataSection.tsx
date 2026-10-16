import { useTranslation } from 'react-i18next';
import { useFigureStore } from '../store/figureStore';
import { Collapsible } from './Collapsible';

/** Details of the currently loaded dataset, collapsed by default. */
export function DataSection() {
  const { t } = useTranslation();
  const dataset = useFigureStore((state) => state.dataset);

  return (
    <Collapsible title={t('data.title')}>
      {!dataset ? (
        <p className="muted">{t('data.noDataset')}</p>
      ) : (
        <div className="dataset">
          <dl className="dataset-meta">
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
              <h4>{t('data.stats')}</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('data.column')}</th>
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
              <h4>{t('data.sample')}</h4>
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
                    {dataset.sample.slice(0, 8).map((row, index) => (
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
    </Collapsible>
  );
}
