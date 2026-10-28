import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// handy for debugging and automated checks: window.harryplotter.store.getState()
import { useStore } from './store';
(window as unknown as { harryplotter: unknown }).harryplotter = { store: useStore };
