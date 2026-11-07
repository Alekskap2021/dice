import { Button, Kbd, ProgressBar } from '../ui/index.ts';
import { actions, isMyTurn, selectionPoints, useStore } from '../store.ts';

const Scoreboard = () => {
  const shown = useStore((s) => s.shown);
  const preview = useStore(selectionPoints);
  const seat = useStore((s) => (s.mode === 'online' ? (s.room?.you ?? 0) : 0));
  if (!shown) return null;

  return (
    <div className="scoreboard">
      {shown.players.map((player, index) => {
        const active = index === shown.current && shown.phase !== 'over';
        return (
          <article key={index} className="score-card" data-active={active ? '' : undefined}>
            <header className="score-head">
              <span className="score-name">
                {player.name}
                {index === seat && <span className="tag">вы</span>}
              </span>
              <span className="score-points">{player.score}</span>
            </header>
            <ProgressBar value={player.score} max={shown.target} label={`Прогресс ${player.name}`} />
            <footer className="score-foot">
              <span className="score-goal">Цель {shown.target}</span>
              <span className="score-pills">
                {active && shown.turnScore > 0 && (
                  <span key={`t${shown.turnScore}`} className="pill pill-turn">
                    В ходе {shown.turnScore}
                  </span>
                )}
                {active && preview !== null && (
                  <span key={`p${preview}`} className="pill pill-preview">
                    +{preview}
                  </span>
                )}
              </span>
            </footer>
          </article>
        );
      })}
    </div>
  );
};

const TurnBadge = () => {
  const shown = useStore((s) => s.shown);
  const mine = useStore(isMyTurn);
  if (!shown || shown.phase === 'over') return null;
  const name = shown.players[shown.current]?.name ?? '';
  return (
    <div key={`${shown.current}`} className="turn-badge" data-mine={mine ? '' : undefined}>
      {mine ? 'Ваш ход' : `Ход: ${name}`}
    </div>
  );
};

const Controls = () => {
  const shown = useStore((s) => s.shown);
  const busy = useStore((s) => s.busy);
  const mine = useStore(isMyTurn);
  const preview = useStore(selectionPoints);
  const selectedCount = useStore((s) => s.selected.length);
  const mode = useStore((s) => s.mode);
  if (!shown || shown.phase === 'over') return null;

  if (!mine) {
    return (
      <div className="controls">
        <p className="status">{mode === 'bot' ? 'Бот думает…' : 'Соперник ходит…'}</p>
      </div>
    );
  }

  if (shown.phase === 'roll') {
    return (
      <div className="controls">
        <div className="control-buttons">
          <Button variant="primary" size="lg" disabled={busy} onClick={actions.roll}>
            Бросить кубики <Kbd>Space</Kbd>
          </Button>
        </div>
        <p className="hotkeys">
          <Kbd>Space</Kbd> или <Kbd>R</Kbd> — бросить кубики
        </p>
      </div>
    );
  }

  const ok = preview !== null && !busy;
  let status = 'Выберите кубики, которые дают очки';
  if (selectedCount > 0 && preview === null) status = 'Эти кубики вместе не дают очков';
  if (preview !== null) status = `Выбрано +${preview} · за ход будет ${shown.turnScore + preview}`;

  return (
    <div className="controls">
      <p className="status" data-bad={selectedCount > 0 && preview === null ? '' : undefined}>
        {status}
      </p>
      <div className="control-buttons">
        <Button size="lg" disabled={!ok} onClick={() => actions.keep('roll')}>
          Взять и бросить ещё <Kbd>R</Kbd>
        </Button>
        <Button variant="primary" size="lg" disabled={!ok} onClick={() => actions.keep('bank')}>
          Взять и закончить ход <Kbd>Space</Kbd>
        </Button>
      </div>
      <p className="hotkeys">
        <Kbd>R</Kbd> взять и бросить ещё · <Kbd>Space</Kbd> взять и закончить ход
      </p>
    </div>
  );
};

const Banner = () => {
  const banner = useStore((s) => s.banner);
  if (!banner) return null;
  return (
    <div key={banner.id} className="banner" data-bad={banner.bad ? '' : undefined} aria-live="polite">
      {banner.text}
    </div>
  );
};

const Log = () => {
  const log = useStore((s) => s.log);
  return (
    <ol className="log">
      {log.map((line, i) => (
        <li key={`${i}-${line}`} dangerouslySetInnerHTML={{ __html: line }} />
      ))}
    </ol>
  );
};

export const GameScreen = () => (
  <section className="hud">
    <Scoreboard />
    <TurnBadge />
    <Log />
    <Banner />
    <Controls />
  </section>
);
