import { freeIndices, type Action, type GameState } from './engine.ts';
import { scoreSelection } from './rules.ts';

type Candidate = { indices: number[]; points: number };

const allScoringSubsets = (state: GameState): Candidate[] => {
  const free = freeIndices(state);
  const result: Candidate[] = [];
  for (let mask = 1; mask < 1 << free.length; mask += 1) {
    const indices = free.filter((_, bit) => (mask >> bit) & 1);
    const points = scoreSelection(indices.map((index) => state.dice[index]?.value ?? 0));
    if (points !== null) result.push({ indices, points });
  }
  return result;
};

/**
 * Эвристика: берём набор с лучшим отношением очков к потраченным кубикам, но не жертвуем
 * крупной комбинацией. Забираем очки, когда риск болта становится выше выгоды.
 */
export const chooseBotAction = (state: GameState): Action => {
  if (state.phase === 'roll') return { type: 'roll' };

  const candidates = allScoringSubsets(state);
  const score = (c: Candidate): number => c.points - c.indices.length * 35;
  const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));

  const turnScore = state.turnScore + best.points;
  const diceLeft = freeIndices(state).length - best.indices.length;
  const me = state.players[state.current];
  const wins = me !== undefined && me.score + turnScore >= state.target;

  if (wins && state.finalFrom === null) return { type: 'keep', indices: best.indices, then: 'bank' };

  // Последний круг: бот должен обогнать лидера, иначе остановка ничего не даст.
  if (state.finalFrom !== null && me !== undefined) {
    const leader = Math.max(...state.players.filter((_, index) => index !== state.current).map((player) => player.score));
    const ahead = me.score + turnScore > leader;
    if (ahead) return { type: 'keep', indices: best.indices, then: 'bank' };
    return { type: 'keep', indices: best.indices, then: 'roll' };
  }
  if (diceLeft === 0) return { type: 'keep', indices: best.indices, then: 'roll' };

  // Чем меньше кубиков осталось, тем выше шанс болта, тем раньше стоит остановиться.
  const thresholds: Record<number, number> = { 1: 250, 2: 300, 3: 400, 4: 600, 5: 1000 };
  const limit = thresholds[diceLeft] ?? 600;
  const opponentAhead = state.players.some(
    (player, index) => index !== state.current && player.score >= state.target - 1000,
  );
  const adjustedLimit = opponentAhead ? limit * 2 : limit;
  return { type: 'keep', indices: best.indices, then: turnScore >= adjustedLimit ? 'bank' : 'roll' };
};
