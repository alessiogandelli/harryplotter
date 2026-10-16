import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigPanel } from './components/ConfigPanel';
import { DatasetPicker } from './components/DatasetPicker';
import { PreviewPanel } from './components/PreviewPanel';
import { PromptBar } from './components/PromptBar';
import { VersionsDialog } from './components/VersionsDialog';
import { SUPPORTED_LANGUAGES, setLanguage, type Language } from './i18n';
import { useCanRedo, useCanUndo, useFigureStore } from './store/figureStore';

export default function App() {
  const { t, i18n } = useTranslation();
  const undo = useFigureStore((state) => state.undo);
  const redo = useFigureStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const [saveOpen, setSaveOpen] = useState(false);

  const language = (i18n.resolvedLanguage ?? 'en') as Language;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{t('app.title')}</h1>
        </div>

        <DatasetPicker />

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <button type="button" onClick={undo} disabled={!canUndo}>
            {t('toolbar.undo')}
          </button>
          <button type="button" onClick={redo} disabled={!canRedo}>
            {t('toolbar.redo')}
          </button>
          <button type="button" className="primary" onClick={() => setSaveOpen(true)}>
            {t('toolbar.save')}
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
        <section className="workspace-main">
          <PromptBar />
          <PreviewPanel />
        </section>
        <ConfigPanel />
      </main>

      {saveOpen && <VersionsDialog onClose={() => setSaveOpen(false)} />}
    </div>
  );
}
