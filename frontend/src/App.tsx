import { useTranslation } from 'react-i18next';
import { DataPanel } from './components/DataPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { PromptBar } from './components/PromptBar';
import { ConfigPanel } from './components/ConfigPanel';
import { VersionsPanel } from './components/VersionsPanel';
import { SUPPORTED_LANGUAGES, setLanguage, type Language } from './i18n';
import { useCanRedo, useCanUndo, useFigureStore } from './store/figureStore';

export default function App() {
  const { t, i18n } = useTranslation();
  const undo = useFigureStore((state) => state.undo);
  const redo = useFigureStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const language = (i18n.resolvedLanguage ?? 'en') as Language;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <h1>{t('app.title')}</h1>
          <span className="tagline">{t('app.tagline')}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={undo} disabled={!canUndo}>
            {t('toolbar.undo')}
          </button>
          <button type="button" onClick={redo} disabled={!canRedo}>
            {t('toolbar.redo')}
          </button>
          <select
            className="input language-select"
            aria-label={t('toolbar.language')}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {code === 'en' ? t('toolbar.english') : t('toolbar.italian')}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="workspace">
        <aside className="column column-left">
          <DataPanel />
          <VersionsPanel />
        </aside>
        <section className="column column-center">
          <PreviewPanel />
        </section>
        <aside className="column column-right">
          <PromptBar />
          <ConfigPanel />
        </aside>
      </main>
    </div>
  );
}
