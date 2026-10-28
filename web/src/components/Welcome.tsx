import { ClipboardPaste, FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import { Logo, MarkIcon } from './icons';

export const SAMPLES = [
  { file: 'reaction_times.csv', title: 'Reaction-time experiment', body: '24 participants, 3 doses, pre/post sessions', mark: 'violin' as const },
  { file: 'growth_curves.csv', title: 'Bacterial growth curves', body: 'OD600 over 48 h, 3 strains, 2 temperatures', mark: 'line' as const },
  { file: 'polarization_topics.csv', title: 'Online polarisation', body: '600 posts: sentiment, engagement, topics', mark: 'scatter' as const },
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
          <span className="muted small"><FileSpreadsheet size={13} /> No data at hand? Try an example</span>
          <div className="sample-grid">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className="sample" onClick={() => onSample(s.file)}>
                <span className="sample-icon"><MarkIcon mark={s.mark} size={26} /></span>
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
