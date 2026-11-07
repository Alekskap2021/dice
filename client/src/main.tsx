import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { exposeForTests } from './store.ts';
import './ui/tokens.css';
import './ui/ui.css';
import './app.css';

exposeForTests();

const root = document.getElementById('root');
if (!root) throw new Error('#root не найден');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
