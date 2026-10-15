import { useEffect, useState } from 'react';
import { api, ApiError, ApiValidationError } from '../api/client';
import { isRenderable } from '../types/figureSpec';
import type { FigureSpec } from '../types/figureSpec';
import type { ValidationIssue } from '../types/api';

export interface PreviewFigure {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
}

export interface PreviewResult {
  figure: PreviewFigure | null;
  issues: ValidationIssue[];
  error: string | null;
  loading: boolean;
}

/** Debounce window for the render call (ms). */
export const PREVIEW_DEBOUNCE_MS = 300;

/**
 * Debounced preview: whenever the dataset or spec changes, POST the spec to
 * `/api/figures/render` and expose the returned Plotly figure. The backend is
 * the only compiler; the client renders whatever `{data, layout}` it returns.
 */
export function usePreview(datasetId: string | null, spec: FigureSpec): PreviewResult {
  const [figure, setFigure] = useState<PreviewFigure | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId || !isRenderable(spec)) {
      setFigure(null);
      setIssues([]);
      setError(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await api.render(datasetId, spec);
        if (!alive) return;
        setFigure(response.figure);
        setIssues([]);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setFigure(null);
        if (err instanceof ApiValidationError) {
          setIssues(err.errors);
          setError(null);
        } else if (err instanceof ApiError) {
          setIssues([]);
          setError(err.message);
        } else {
          setIssues([]);
          setError(String(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [datasetId, spec]);

  return { figure, issues, error, loading };
}
