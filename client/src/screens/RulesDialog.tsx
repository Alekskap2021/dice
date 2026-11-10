import { SCORING } from '../../../shared/rules.ts';
import { DiceFace, Button, Dialog, Kbd } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

type Combo = { dice: readonly number[]; points: number; accentFrom?: number };

const SINGLES: readonly Combo[] = [
  { dice: [1], points: SCORING.singleOne },
  { dice: [5], points: SCORING.singleFive },
];

const STRAIGHTS: readonly Combo[] = [
  { dice: [1, 2, 3, 4, 5], points: SCORING.straight1to5 },
  { dice: [2, 3, 4, 5, 6], points: SCORING.straight2to6 },
  { dice: [1, 2, 3, 4, 5, 6], points: SCORING.straight1to6 },
];

const TRIPLES: readonly Combo[] = [1, 2, 3, 4, 5, 6].map((face) => ({
  dice: [face, face, face],
  points: SCORING.threeOfKind[face] ?? 0,
}));

/** Каждая кость сверх трёх удваивает очки тройки. Показываем на двойках. */
const EXTRAS: readonly Combo[] = [4, 5, 6].map((count) => ({
  dice: Array.from({ length: count }, () => 2),
  points: (SCORING.threeOfKind[2] ?? 0) * 2 ** (count - 3),
  accentFrom: 3,
}));

const ComboRow = ({ combo }: { combo: Combo }) => (
  <li className="combo">
    <span className="combo-dice">
      {combo.dice.map((value, index) => (
        <DiceFace key={index} value={value} accent={combo.accentFrom !== undefined && index >= combo.accentFrom} />
      ))}
    </span>
    <span className="combo-points">{combo.points}</span>
  </li>
);

const ComboList = ({ title, combos }: { title?: string; combos: readonly Combo[] }) => (
  <>
    {title && <p className="combo-title">{title}</p>}
    <ul className="combos">
      {combos.map((combo) => (
        <ComboRow key={combo.dice.join('')} combo={combo} />
      ))}
    </ul>
  </>
);

export const RulesDialog = () => {
  const open = useStore((s) => s.rulesOpen);
  return (
    <Dialog open={open} onOpenChange={actions.setRulesOpen} title="Правила" description="Играем шестью костями. Побеждает тот, кто первым наберёт нужное число очков.">
      <div className="rules">
        <h3>Ход игры</h3>
        <p>
          Начните ход, бросив все шесть костей. Затем выберите кости, которые дают очки, и отложите их в сторону: очки за них
          засчитаются в конце хода. Остальные кости можно бросить снова. Бросайте, пока на столе остаётся хотя бы одна кость.
        </p>
        <p>
          Но если после броска не выпало ни одной очковой комбинации, всё, что вы набрали за этот ход, сгорает, а ход переходит к
          сопернику.
        </p>
        <p>
          Мастерство в том, чтобы вовремя закончить ход и забрать очки, пока риск остаться ни с чем не стал слишком большим.
        </p>

        <h3>Комбинации</h3>
        <ComboList combos={SINGLES} />
        <ComboList combos={STRAIGHTS} />
        <ComboList combos={TRIPLES} />
        <ComboList title="Каждая кость сверх трёх удваивает очки" combos={EXTRAS} />

        <h3>Дополнительно</h3>
        <p>
          <b>Горячие кости.</b> Если все шесть костей дали очки, можно бросить все шесть заново и продолжить набирать очки в том же ходу.
        </p>
        <p>
          <b>Последний ход.</b> Необязательное правило, его включают перед игрой. Набравший цель не побеждает сразу: остальные получают
          ещё по одному ходу, и выигрывает тот, у кого в итоге больше очков. При равенстве играем ещё круг.
        </p>
        <p>
          <b>Горячие клавиши.</b> <Kbd>R</Kbd> — взять выбранные кости и бросить ещё, <Kbd>Space</Kbd> — взять выбранные кости и закончить
          ход. Перед первым броском хода обе клавиши просто бросают кости.
        </p>
        <p>
          <b>Реакции.</b> Кнопка с облачком в углу экрана отправляет сопернику эмодзи или короткую реплику.
        </p>
      </div>
      <Button variant="primary" block onClick={() => actions.setRulesOpen(false)}>
        Понятно
      </Button>
    </Dialog>
  );
};
