import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSpec } from '../types/figureSpec';
import { ApiClient, ApiError, ApiValidationError } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const client = () => new ApiClient('/api');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ApiClient', () => {
  it('uploads a dataset as multipart form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'd1',
        filename: 'a.csv',
        rows: 2,
        contentHash: 'sha256:h',
        columns: [],
        stats: {},
        sample: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['a,b\n1,2'], 'a.csv', { type: 'text/csv' });
    const summary = await client().uploadDataset(file);

    expect(summary.id).toBe('d1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/datasets');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
  });

  it('posts the dataset id and spec to render', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ figure: { data: [{ type: 'scatter' }], layout: {} } }));
    vi.stubGlobal('fetch', fetchMock);

    const spec = defaultSpec({ id: 'd1', contentHash: 'sha256:h' });
    const result = await client().render('d1', spec);

    expect(result.figure.data).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/figures/render');
    expect(JSON.parse(init.body)).toEqual({ datasetId: 'd1', spec });
  });

  it('generates a figure and exposes provider and confidence', async () => {
    const spec = defaultSpec();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ spec, provider: 'fake', confidence: 0.42 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().generate('d1', 'scatter of score over time');

    expect(result.provider).toBe('fake');
    expect(result.confidence).toBe(0.42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/generate');
    expect(JSON.parse(init.body)).toEqual({
      datasetId: 'd1',
      prompt: 'scatter of score over time',
    });
  });

  it('patches with the current spec', async () => {
    const spec = defaultSpec();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        spec,
        patch: { style: { legend: { position: 'top' } } },
        provider: 'decisions',
        confidence: 0.9,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().patch('d1', spec, 'legend on top');

    expect(result.patch).toEqual({ style: { legend: { position: 'top' } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/patch');
    expect(JSON.parse(init.body)).toEqual({ datasetId: 'd1', spec, prompt: 'legend on top' });
  });

  it('creates a version under a project', async () => {
    const created = {
      id: 'v1',
      projectId: 'p1',
      name: 'figure 3',
      createdAt: '2026-01-01T00:00:00Z',
      spec: defaultSpec(),
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created));
    vi.stubGlobal('fetch', fetchMock);

    const version = await client().createVersion('p1', 'figure 3', defaultSpec());

    expect(version.id).toBe('v1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/versions');
    expect(JSON.parse(init.body).name).toBe('figure 3');
  });

  it('throws ApiValidationError with issues on 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ errors: [{ path: 'figure.series[0].y', message: "unknown column 'scor'" }] }, 422),
      ),
    );

    const error = (await client()
      .render('d1', defaultSpec())
      .catch((err: unknown) => err)) as ApiValidationError;

    expect(error).toBeInstanceOf(ApiValidationError);
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0].path).toBe('figure.series[0].y');
  });

  it('throws ApiError with the server code for other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'export_unavailable', message: 'pdf missing' }, 501)),
    );

    const error = (await client()
      .exportFigure({ datasetId: 'd1', spec: defaultSpec(), format: 'pdf' })
      .catch((err: unknown) => err)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('export_unavailable');
    expect(error.status).toBe(501);
  });

  it('returns export bytes as a blob', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, { status: 200 })));

    const out = await client().exportFigure({ datasetId: 'd1', spec: defaultSpec(), format: 'pdf' });

    expect(out).toBeInstanceOf(Blob);
    expect(out.size).toBeGreaterThan(0);
  });

  it('lists the dataset library through the envelope shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        datasets: [
          {
            id: 'd1',
            filename: 'demo.csv',
            rows: 600,
            columnCount: 8,
            contentHash: 'sha256:h',
            kind: 'sample',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const datasets = await client().listDatasets();

    expect(datasets).toHaveLength(1);
    expect(datasets[0].kind).toBe('sample');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/datasets');
  });

  it('lists projects through the envelope shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ projects: [{ id: 'p1', name: 'P', createdAt: '2026-01-01T00:00:00Z' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const projects = await client().listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('p1');
  });
});
