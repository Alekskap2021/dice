import { useState } from 'react';
import { REACTIONS, reactionById, type ReactionId } from '../../../shared/reactions.ts';
import { Button, Popover } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

/** Пузырь с реакцией над карточкой игрока. */
export const ReactionBubble = ({ seat }: { seat: number }) => {
  const entry = useStore((s) => s.reactions[seat]);
  if (!entry) return null;
  const reaction = reactionById(entry.reaction);
  return (
    <div key={entry.id} className="reaction-bubble" data-seat={seat} data-emoji={reaction.emoji ? '' : undefined} role="status">
      {reaction.emoji ?? reaction.text}
    </div>
  );
};

const EMOJI = REACTIONS.filter((reaction) => 'emoji' in reaction);
const PHRASES = REACTIONS.filter((reaction) => 'text' in reaction);

export const ReactionPicker = () => {
  const [open, setOpen] = useState(false);

  const pick = (id: ReactionId): void => {
    actions.react(id);
    setOpen(false);
  };

  return (
    <div className="react-fab">
      <Popover
        title="Реакция"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button variant="secondary" size="icon" aria-label="Отправить реакцию">
            💬
          </Button>
        }
      >
        <div className="react-emoji">
          {EMOJI.map((reaction) => (
            <button key={reaction.id} type="button" className="react-btn" onClick={() => pick(reaction.id)}>
              {'emoji' in reaction ? reaction.emoji : ''}
            </button>
          ))}
        </div>
        <div className="react-phrases">
          {PHRASES.map((reaction) => (
            <button key={reaction.id} type="button" className="react-phrase" onClick={() => pick(reaction.id)}>
              {'text' in reaction ? reaction.text : ''}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
};
