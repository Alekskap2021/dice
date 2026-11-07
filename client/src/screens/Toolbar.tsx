import { Button, Popover, Slider, Switch } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

export const Toolbar = () => {
  const screen = useStore((s) => s.screen);
  const sfxVolume = useStore((s) => s.sfxVolume);
  const musicVolume = useStore((s) => s.musicVolume);
  const effects = useStore((s) => s.effects);

  return (
    <div className="toolbar">
      <Popover
        title="Звук и эффекты"
        trigger={
          <Button variant="secondary" size="icon" aria-label="Настройки звука">
            ♪
          </Button>
        }
      >
        <Slider label="Музыка" value={musicVolume} onChange={actions.setMusicVolume} />
        <Slider label="Звуки" value={sfxVolume} onChange={actions.setSfxVolume} onCommit={actions.previewSfx} />
        <Switch label="Эффекты: тряска, замедление, монеты" checked={effects} onChange={actions.setEffects} />
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
