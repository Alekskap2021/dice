import { Button, Kbd } from '../ui/index.ts';
import { actions, isMyTurn, selectionPoints, useStore } from '../store.ts';
import { ReactionBubble, ReactionPicker } from './Reactions.tsx';

const Scoreboard = () => {
  const shown = useStore((s) => s.shown);
  const preview = useStore(selectionPoints);
  const seat = useStore((s) => (s.mode === 'online' ? (s.room?.you ?? 0) : 0));
  if (!shown) return null;

  const active = shown.phase === 'over' ? -1 : shown.current;
  const [left, right] = shown.players;
  if (!left || !right) return null;

  const cells = [left, right].map((player, index) => {
    const isActive = index === active;
    const turn = isActive ? shown.turnScore : 0;
    const picked = isActive && preview !== null ? preview : 0;
    const side = index === 0 ? 'left' : 'right';
    const who = index === seat ? { 'data-me': '' } : { 'data-foe': '' };
    return { player, index, isActive, turn, picked, side, who };
  });

  return (
    <div className="scoreboard" data-active={active}>
      {cells.map(({ player, index, isActive, side, who }) => (
        <div key={`n${index}`} className="sb-cell" data-seat={index} data-side={side} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1 }} {...who}>
          <span className="sb-name" data-active={isActive ? '' : undefined}>{player.name}</span>
          {index === seat && <span className="tag">вы</span>}
          {shown.finalFrom === index && <span className="sb-star" title="Цель набрана" aria-label="Цель набрана">★</span>}
        </div>
      ))}
      <div className="sb-mid" style={{ gridColumn: 2, gridRow: 1 }}>Цель</div>

      {cells.map(({ player, index, side, who }) => (
        <div key={`s${index}`} className="sb-cell" data-side={side} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 2 }} {...who}>
          <span className="sb-score">{player.score}</span>
        </div>
      ))}
      <div className="sb-mid" style={{ gridColumn: 2, gridRow: 2 }}>
        <span className="sb-target">{shown.target}</span>
      </div>

      {cells.map(({ index, turn, side }) => (
        <div key={`t${index}`} className="sb-cell" data-side={side} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 3 }}>
          <span key={turn} className="sb-sub" data-on={turn > 0 ? '' : undefined}>{turn}</span>
        </div>
      ))}
      <div className="sb-mid" style={{ gridColumn: 2, gridRow: 3 }} title="Очки, набранные в этом ходу, но ещё не засчитанные">Кон</div>

      {cells.map(({ index, picked, side }) => (
        <div key={`p${index}`} className="sb-cell" data-side={side} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 4 }}>
          <span key={picked} className="sb-sub" data-on={picked > 0 ? '' : undefined} data-preview={picked > 0 ? '' : undefined}>{picked}</span>
        </div>
      ))}
      <div className="sb-mid" style={{ gridColumn: 2, gridRow: 4 }} title="Очки выбранных сейчас костей">Выбрано</div>

      <ReactionBubble seat={0} />
      <ReactionBubble seat={1} />
    </div>
  );
};

const TurnBadge = () => {
  const shown = useStore((s) => s.shown);
  const mine = useStore(isMyTurn);
  if (!shown || shown.phase === 'over') return null;
  const name = shown.players[shown.current]?.name ?? '';
  const final = shown.finalFrom !== null;
  let text = mine ? 'Ваш ход' : `Ход: ${name}`;
  if (final) text = mine ? 'Ваш последний ход' : `Последний ход: ${name}`;
  return (
    <div key={`${shown.current}${final}`} className="turn-badge" data-mine={mine ? '' : undefined} data-final={final ? '' : undefined}>
      {text}
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
    <div className="hud-top">
      <Scoreboard />
      <TurnBadge />
    </div>
    <Log />
    <Banner />
    <Controls />
    <ReactionPicker />
  </section>
);
