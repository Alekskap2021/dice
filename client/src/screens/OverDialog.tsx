import { Button, Dialog } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

export const OverDialog = () => {
  const open = useStore((s) => s.gameOver);
  const shown = useStore((s) => s.shown);
  const waiting = useStore((s) => s.rematchWaiting);
  const winner = shown?.winner ?? null;
  const player = winner === null ? undefined : shown?.players[winner];

  return (
    <Dialog
      modalOnly
      open={open}
      onOpenChange={() => undefined}
      title={player ? `${player.name} побеждает` : 'Партия окончена'}
      description={player ? `Набрано ${player.score} очков.` : undefined}
    >
      <div className="stack">
        <Button variant="primary" size="lg" block disabled={waiting} onClick={actions.rematch}>
          {waiting ? 'Ждём соперника…' : 'Сыграть ещё'}
        </Button>
        <Button variant="ghost" block onClick={actions.leave}>
          В меню
        </Button>
      </div>
    </Dialog>
  );
};
