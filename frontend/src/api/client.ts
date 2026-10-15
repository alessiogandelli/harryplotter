import type { FigureSpec } from '../types/figureSpec';
import type {
  DatasetListItem,
  DatasetSummary,
  ExportFormat,
  ExportRequest,
  GenerateResponse,
  PatchResponse,
  Project,
  RenderResponse,
  ValidationIssue,
  Version,
} from '../types/api';

/** Base path of the backend API (proxied by Vite in development). */
export const API_BASE = '/api';

/** Raised when the backend returns a 422 with structured validation errors. */
export class ApiValidationError extends Error {
  readonly errors: ValidationIssue[];
  readonly status: number;

  constructor(errors: ValidationIssue[], status = 422) {
    super('figure spec validation failed');
    this.name = 'ApiValidationError';
    this.errors = errors;
    this.status = status;
  }
}

/** Raised for any other non-2xx response. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'error', status = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function readError(response: Response): Promise<never> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 422 && body && typeof body === 'object' && 'errors' in body) {
    const errors = (body as { errors: ValidationIssue[] }).errors;
    throw new ApiValidationError(errors, response.status);
  }

  const code =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `http_${response.status}`;
  const message =
    body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message)
      : `request failed with status ${response.status}`;

  throw new ApiError(message, code, response.status);
}

/** Thin typed wrapper around fetch for the FigureLab HTTP contract. */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      await readError(response);
    }
    return (await response.json()) as T;
  }

  async health(): Promise<{ status: string }> {
    return this.json<{ status: string }>('/health');
  }

  async uploadDataset(file: File): Promise<DatasetSummary> {
    const form = new FormData();
    form.append('file', file);
    return this.json<DatasetSummary>('/datasets', { method: 'POST', body: form });
  }

  async listDatasets(): Promise<DatasetListItem[]> {
    const body = await this.json<{ datasets: DatasetListItem[] }>('/datasets');
    return body.datasets;
  }

  async getDataset(id: string): Promise<DatasetSummary> {
    return this.json<DatasetSummary>(`/datasets/${encodeURIComponent(id)}`);
  }

  async render(datasetId: string, spec: FigureSpec): Promise<RenderResponse> {
    return this.json<RenderResponse>('/figures/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, spec }),
    });
  }

  async generate(datasetId: string, prompt: string): Promise<GenerateResponse> {
    return this.json<GenerateResponse>('/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, prompt }),
    });
  }

  async patch(datasetId: string, spec: FigureSpec, prompt: string): Promise<PatchResponse> {
    return this.json<PatchResponse>('/ai/patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, spec, prompt }),
    });
  }

  async createProject(name: string): Promise<Project> {
    return this.json<Project>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async listProjects(): Promise<Project[]> {
    const body = await this.json<{ projects: Project[] }>('/projects');
    return body.projects;
  }

  async createVersion(projectId: string, name: string, spec: FigureSpec): Promise<Version> {
    return this.json<Version>(`/projects/${encodeURIComponent(projectId)}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, spec }),
    });
  }

  async listVersions(projectId: string): Promise<Version[]> {
    const body = await this.json<{ versions: Version[] }>(
      `/projects/${encodeURIComponent(projectId)}/versions`,
    );
    return body.versions;
  }

  async getVersion(id: string): Promise<Version> {
    return this.json<Version>(`/versions/${encodeURIComponent(id)}`);
  }

  async duplicateVersion(id: string): Promise<Version> {
    return this.json<Version>(`/versions/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
    });
  }

  async exportFigure(request: ExportRequest): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      await readError(response);
    }
    return response.blob();
  }
}

/** Shared client instance used across the app. */
export const api = new ApiClient();

export function exportFilename(format: ExportFormat): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `figure-${stamp}.${format}`;
}
