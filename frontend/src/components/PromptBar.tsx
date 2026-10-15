import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useFigureStore } from '../store/figureStore';

export function PromptBar() {
  const { t } = useTranslation();
  const datasetId = useFigureStore((state) => state.datasetId);
  const spec = useFigureStore((state) => state.spec);
  const ai = useFigureStore((state) => state.ai);
  const applyAi = useFigureStore((state) => state.applyAi);

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRefinement =
    ai !== null || spec.figure.series.some((series) => series.x !== null || series.y !== null);

  const lowConfidence = ai !== null && ai.belowThreshold;

  const submit = async () => {
    if (!datasetId) {
      setError(t('prompt.noDataset'));
      return;
    }
    if (!prompt.trim()) {
      setError(t('prompt.emptyPrompt'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = isRefinement
        ? await api.patch(datasetId, spec, prompt)
        : await api.generate(datasetId, prompt);
      applyAi(result);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel prompt-panel">
      <h2>{t('prompt.title')}</h2>
      <textarea
        className="input prompt-input"
        rows={3}
        placeholder={t('prompt.placeholder')}
        value={prompt}
        disabled={busy}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="prompt-actions">
        <button type="button" className="primary" onClick={submit} disabled={busy}>
          {busy ? t('prompt.busy') : isRefinement ? t('prompt.refine') : t('prompt.generate')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {ai && (
        <p className="ai-meta">
          <span>
            {t('prompt.provider')}: <strong>{ai.provider}</strong>
          </span>
          {ai.confidence !== null && (
            <span>
              {t('prompt.confidence')}: <strong>{ai.confidence.toFixed(2)}</strong>
            </span>
          )}
        </p>
      )}

      {lowConfidence && ai?.confidence !== null && (
        <p className="warning">
          {t('prompt.lowConfidence', { value: ai?.confidence?.toFixed(2) })}
        </p>
      )}
    </section>
  );
}
