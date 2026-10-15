/**
 * TypeScript mirror of the HTTP API contract (docs/contract/http-api.md).
 */
import type { FigureSpec } from './figureSpec';

export type ColumnDtype = 'numeric' | 'categorical' | 'datetime' | 'boolean';

export interface DatasetColumn {
  name: string;
  dtype: ColumnDtype;
  missing: number;
}

export interface NumericStats {
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface DatasetSummary {
  id: string;
  filename: string;
  rows: number;
  contentHash: string;
  columns: DatasetColumn[];
  /** Present only for numeric columns. */
  stats: Record<string, NumericStats>;
  sample: Array<Record<string, unknown>>;
}

export type ProviderName = 'decisions' | 'structured' | 'fake';

export interface GenerateResponse {
  spec: FigureSpec;
  provider: ProviderName;
  confidence: number | null;
  /** Set by the server using its configured FIGURELAB_CONFIDENCE_THRESHOLD. */
  belowThreshold: boolean;
}

export interface PatchResponse {
  spec: FigureSpec;
  patch: Record<string, unknown>;
  provider: ProviderName;
  confidence: number | null;
  /** Set by the server using its configured FIGURELAB_CONFIDENCE_THRESHOLD. */
  belowThreshold: boolean;
}

export interface RenderResponse {
  figure: {
    data: Array<Record<string, unknown>>;
    layout: Record<string, unknown>;
  };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  spec: FigureSpec;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationErrorBody {
  errors: ValidationIssue[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export type ExportFormat = 'html' | 'png' | 'svg' | 'pdf';

export interface ExportRequest {
  datasetId: string;
  spec: FigureSpec;
  format: ExportFormat;
  width?: number;
  height?: number;
  scale?: number;
}
