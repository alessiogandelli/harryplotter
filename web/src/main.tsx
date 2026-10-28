import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, loadTheme } from './lib/theme';
import './styles.css';

applyTheme(loadTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// handy for debugging and automated checks: window.harryplotter.store.getState()
import { usageLog } from './lib/ai';
import { useStore } from './store';
(window as unknown as { harryplotter: unknown }).harryplotter = { store: useStore, usage: usageLog };
