import { useEffect, useRef } from 'react';
import { createDiceTable } from './dice3d.ts';
import { Effects } from './screens/Effects.tsx';
import { GameScreen } from './screens/GameScreen.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { OverDialog } from './screens/OverDialog.tsx';
import { RulesDialog } from './screens/RulesDialog.tsx';
import { Toolbar } from './screens/Toolbar.tsx';
import { actions, useStore } from './store.ts';

const Stage = () => {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useStore((s) => s.shown);
  const busy = useStore((s) => s.busy);
  const mode = useStore((s) => s.mode);

  useEffect(() => {
    if (!ref.current) return undefined;
    const table = createDiceTable(ref.current);
    actions.attachTable(table);
    return () => {
      actions.attachTable(null);
      table.dispose();
    };
  }, []);

  useEffect(() => {
    actions.syncPickable();
  }, [shown, busy, mode]);

  return <div id="stage" ref={ref} />;
};

const Toast = () => {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className="toast" role="status" onClick={actions.dismissToast}>
      {toast.text}
    </div>
  );
};

export const App = () => {
  const screen = useStore((s) => s.screen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        actions.hotkey('space');
      } else if (event.code === 'KeyR') {
        event.preventDefault();
        actions.hotkey('r');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Stage />
      <div className="vignette" />
      {screen === 'menu' && <MenuScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameScreen />}
      <Effects />
      <Toolbar />
      <RulesDialog />
      <OverDialog />
      <Toast />
    </>
  );
};
