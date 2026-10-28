import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { buildExamples } from '../lib/promptExamples';
import { useFigureStore } from '../store/figureStore';

export function PromptBar() {
  const { t } = useTranslation();
  const datasetId = useFigureStore((state) => state.datasetId);
  const dataset = useFigureStore((state) => state.dataset);
  const spec = useFigureStore((state) => state.spec);
  const ai = useFigureStore((state) => state.ai);
  const applyAi = useFigureStore((state) => state.applyAi);
  const newFigure = useFigureStore((state) => state.newFigure);

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The first AI request builds a figure; once one exists, requests refine it.
  const isRefinement = ai !== null;
  const lowConfidence = ai !== null && ai.belowThreshold;
  const canSubmit = Boolean(datasetId) && prompt.trim().length > 0 && !busy;

  useEffect(() => {
    api
      .aiStatus()
      .then((status) => setLlmAvailable(status.llmAvailable))
      .catch(() => setLlmAvailable(false));
  }, []);

  const examples = buildExamples(dataset?.columns ?? []);

  const focus = () => textareaRef.current?.focus();

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

  const suggest = async () => {
    if (!datasetId) {
      setError(t('prompt.noDataset'));
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const result = await api.suggestPrompt(datasetId);
      setPrompt(result.prompt);
      focus();
    } catch (err) {
      setLlmAvailable(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
  };

  const polish = async () => {
    if (!datasetId) {
      setError(t('prompt.noDataset'));
      return;
    }
    setPolishing(true);
    setError(null);
    try {
      applyAi(await api.polish(datasetId, spec));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolishing(false);
    }
  };

  const useExample = (example: string) => {
    setPrompt(example);
    setExamplesOpen(false);
    focus();
  };

  return (
    <section className="panel prompt-panel">
      <div className="preview-header">
        <h2>{t('prompt.title')}</h2>
        <span className="muted prompt-mode">
          {isRefinement ? t('prompt.modeRefine') : t('prompt.modeGenerate')}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        className="input prompt-input"
        rows={3}
        placeholder={t('prompt.placeholder')}
        value={prompt}
        disabled={busy}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <div className="prompt-actions">
        <button type="button" className="primary" onClick={submit} disabled={!canSubmit}>
          {busy ? t('prompt.busy') : isRefinement ? t('prompt.refine') : t('prompt.generate')}
        </button>

        {isRefinement && (
          <button
            type="button"
            onClick={() => {
              newFigure();
              setError(null);
              focus();
            }}
            disabled={busy}
          >
            {t('prompt.newFigure')}
          </button>
        )}

        <button
          type="button"
          onClick={polish}
          disabled={!datasetId || !llmAvailable || polishing || busy}
          title={llmAvailable ? t('prompt.polishHint') : t('prompt.suggestNeedsKey')}
        >
          {polishing ? t('prompt.polishBusy') : t('prompt.polish')}
        </button>

        <button
          type="button"
          onClick={suggest}
          disabled={!datasetId || !llmAvailable || suggesting || busy}
          title={llmAvailable ? t('prompt.suggestHint') : t('prompt.suggestNeedsKey')}
        >
          {suggesting ? t('prompt.suggestBusy') : t('prompt.suggest')}
        </button>

        <span className="topbar-spacer" />

        <button
          type="button"
          aria-expanded={examplesOpen}
          onClick={() => setExamplesOpen((open) => !open)}
        >
          {t('prompt.examples')}
        </button>
      </div>

      {examplesOpen && (
        <div className="examples">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="example-chip"
              onClick={() => useExample(example)}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <p className="prompt-hint">{t('prompt.hint')}</p>

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
