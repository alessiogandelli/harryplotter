import { ClipboardPaste, FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import type { MarkType } from '../lib/types';
import { Logo, MarkIcon } from './icons';

/**
 * Example datasets (synthetic, see samples/generate.py), each opening on a showcase figure.
 * `spec` is a partial spec merged over the defaults; omit it to get the automatic first chart.
 */
export const SAMPLES: { file: string; title: string; body: string; field: string; mark: MarkType; spec?: Record<string, any> }[] = [
  {
    file: 'rnaseq_volcano.csv', title: 'RNA-seq volcano', field: 'Genomics', body: '4,000 genes, fold change vs significance', mark: 'scatter',
    spec: {
      mark: 'scatter', enc: { x: 'log2_fold_change', y: 'neg_log10_p', color: 'regulation' },
      style: { title: 'Treated vs control: differential expression', xLabel: 'log₂ fold change', yLabel: '−log₁₀ p', colorLabel: 'Regulation', palette: 'updown', markSize: 2, opacity: 0.75, grid: 'none', legend: 'top' },
      annotations: [{ kind: 'vline', value: -1 }, { kind: 'vline', value: 1 }, { kind: 'hline', value: 1.301, label: 'p = 0.05' }],
    },
  },
  {
    file: 'temperature_anomalies.csv', title: 'Warming stripes', field: 'Climate', body: 'Monthly temperature anomalies 1880–2025', mark: 'heatmap',
    spec: {
      mark: 'heatmap', enc: { x: 'year', y: 'region', color: 'anomaly_C' }, stats: { aggregate: 'mean', labels: false },
      style: { title: 'Temperature anomaly by region, 1880–2025', subtitle: 'Annual mean, °C relative to 1951–1980', palette: 'rdbu', preset: 'nature-2', widthMm: 183, heightMm: 80, fontSize: 7, colorLabel: 'Anomaly (°C)' },
    },
  },
  {
    file: 'seabirds.csv', title: 'Antarctic seabirds', field: 'Ecology', body: 'Bill shape of three species — a Simpson’s paradox', mark: 'scatter',
    spec: {
      mark: 'scatter', enc: { x: 'bill_length_mm', y: 'bill_depth_mm', color: 'species' }, stats: { trend: 'linear', test: true },
      style: { title: 'Longer bills are shallower… except within every species', markSize: 3, opacity: 0.8 },
    },
  },
  {
    file: 'dose_response.csv', title: 'Dose–response', field: 'Pharmacology', body: '5 compounds, 2 cell lines, log-spaced doses', mark: 'line',
    spec: {
      mark: 'line', enc: { x: 'conc_uM', y: 'viability_pct', color: 'compound', facet: 'cell_line' }, stats: { error: 'se', points: true },
      style: { title: 'Cell viability after 72 h', xLabel: 'Concentration (µM)', yLabel: 'Viability (%)', xScale: 'log', palette: 'okabe-ito' },
      annotations: [{ kind: 'hline', value: 50, label: 'IC₅₀' }],
    },
  },
  {
    file: 'clinical_trial.csv', title: 'Clinical trial', field: 'Medicine', body: 'LDL cholesterol over 12 weeks, three arms', mark: 'line',
    spec: {
      mark: 'line', enc: { x: 'week', y: 'ldl_mmol_l', color: 'arm' }, stats: { error: 'ci95', points: true },
      style: { title: 'LDL cholesterol by treatment arm', xLabel: 'Week', yLabel: 'LDL (mmol/L)', colorLabel: 'Arm', palette: 'npg' },
    },
  },
  {
    file: 'reaction_times.csv', title: 'Reaction-time experiment', field: 'Psychology', body: '24 participants, 3 doses, pre/post sessions', mark: 'violin',
    spec: {
      mark: 'violin', enc: { x: 'condition', y: 'rt_ms', facet: 'session' }, stats: { points: true, test: true },
      style: { title: 'Higher doses speed up responses after treatment' },
    },
  },
  {
    file: 'growth_curves.csv', title: 'Bacterial growth curves', field: 'Microbiology', body: 'OD600 over 48 h, 3 strains, 2 temperatures', mark: 'line',
    spec: {
      mark: 'line', enc: { x: 'time_h', y: 'od600', color: 'strain', facet: 'temperature_C' }, stats: { error: 'se' },
      style: { title: 'Growth of wild type and knock-out strains', yScale: 'log' },
    },
  },
  { file: 'polarization_topics.csv', title: 'Online polarisation', field: 'Social science', body: '600 posts: sentiment, engagement, topics', mark: 'line' },
];

export function Welcome({ onFiles, onSample, error }: { onFiles: (f: FileList) => void; onSample: (file: string) => void; error: string | null }) {
  const [over, setOver] = useState(false);
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="hero">
          <Logo size={44} />
          <h1>Harry Plotter</h1>
          <p className="lead">Publication-ready figures from your data in seconds.<br />No code, no fighting with matplotlib.</p>
        </div>

        <label
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
        >
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.json" onChange={(e) => e.target.files?.length && onFiles(e.target.files)} hidden />
          <Upload size={28} />
          <strong>Drop a data file here, or click to choose</strong>
          <span className="muted">CSV · TSV · Excel · JSON — your data never leaves this computer</span>
          <span className="paste-hint"><ClipboardPaste size={14} /> or copy cells in Excel and press <kbd>⌘V</kbd> / <kbd>Ctrl V</kbd></span>
        </label>
        {error && <p className="error-text">{error}</p>}

        <div className="samples">
          <span className="muted small"><FileSpreadsheet size={13} /> No data at hand? Open an example (synthetic data)</span>
          <div className="sample-grid">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className="sample" onClick={() => onSample(s.file)}>
                <span className="sample-head"><span className="sample-icon"><MarkIcon mark={s.mark} size={24} /></span><em>{s.field}</em></span>
                <strong>{s.title}</strong>
                <span className="muted small">{s.body}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
