import { Button, ChipGroup, Popover, Switch } from '../ui/index.ts';
import { actions, useStore, type Theme } from '../store.ts';

const THEMES = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
] as const;

export const Toolbar = () => {
  const screen = useStore((s) => s.screen);
  const sfx = useStore((s) => s.sfx);
  const music = useStore((s) => s.music);
  const theme = useStore((s) => s.theme);

  return (
    <div className="toolbar">
      <Popover
        title="Настройки"
        trigger={
          <Button variant="secondary" size="icon" aria-label="Настройки">
            ⚙
          </Button>
        }
      >
        <Switch label="Звуки" checked={sfx} onChange={actions.setSfx} />
        <Switch label="Музыка" checked={music} onChange={actions.setMusic} />
        <div className="field">
          <span className="field-label">Тема</span>
          <ChipGroup
            label="Тема оформления"
            value={theme}
            options={THEMES}
            onChange={(value) => actions.setTheme(value as Theme)}
          />
        </div>
      </Popover>
      <Button variant="secondary" size="icon" aria-label="Правила" onClick={() => actions.setRulesOpen(true)}>
        ?
      </Button>
      {screen !== 'menu' && (
        <Button variant="secondary" size="icon" aria-label="Выйти в меню" onClick={actions.leave}>
          ✕
        </Button>
      )}
    </div>
  );
};
