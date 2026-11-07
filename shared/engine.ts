import { DICE_COUNT, hasAnyScoring, scoreSelection } from './rules.ts';

export type Die = { value: number; locked: boolean };

export type Phase = 'roll' | 'choose' | 'over';

export type GameState = {
  target: number;
  players: { name: string; score: number }[];
  current: number;
  turnScore: number;
  dice: Die[];
  phase: Phase;
  winner: number | null;
};

export type Action =
  | { type: 'roll' }
  | { type: 'keep'; indices: number[]; then: 'roll' | 'bank' };

export type GameEvent =
  | { type: 'rolled'; indices: number[]; hot: boolean }
  | { type: 'kept'; indices: number[]; points: number }
  | { type: 'bust'; player: number }
  | { type: 'banked'; player: number; points: number }
  | { type: 'win'; player: number };

export type Rng = () => number;

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };

export const MIN_TARGET = 500;
export const MAX_TARGET = 20000;

export const createGame = (names: string[], target: number): GameState => ({
  target,
  players: names.map((name) => ({ name, score: 0 })),
  current: 0,
  turnScore: 0,
  dice: Array.from({ length: DICE_COUNT }, () => ({ value: 1, locked: false })),
  phase: 'roll',
  winner: null,
});

const randomDie = (rng: Rng): number => 1 + Math.floor(rng() * 6);

const clone = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((player) => ({ ...player })),
  dice: state.dice.map((die) => ({ ...die })),
});

const nextTurn = (state: GameState): void => {
  state.current = (state.current + 1) % state.players.length;
  state.turnScore = 0;
  state.phase = 'roll';
  for (const die of state.dice) die.locked = false;
};

/** Бросает все незафиксированные кубики. Если ни одной комбинации — болт, ход переходит. */
const rollFreeDice = (state: GameState, rng: Rng, events: GameEvent[], hot: boolean): void => {
  const indices: number[] = [];
  state.dice.forEach((die, index) => {
    if (die.locked) return;
    die.value = randomDie(rng);
    indices.push(index);
  });
  events.push({ type: 'rolled', indices, hot });
  const rolledValues = indices.map((index) => state.dice[index]?.value ?? 1);
  if (hasAnyScoring(rolledValues)) {
    state.phase = 'choose';
    return;
  }
  events.push({ type: 'bust', player: state.current });
  nextTurn(state);
};

export const freeIndices = (state: GameState): number[] =>
  state.dice.flatMap((die, index) => (die.locked ? [] : [index]));

export const applyAction = (previous: GameState, action: Action, rng: Rng): ApplyResult => {
  const state = clone(previous);
  const events: GameEvent[] = [];

  if (state.phase === 'over') return { ok: false, error: 'Игра окончена' };

  if (action.type === 'roll') {
    if (state.phase !== 'roll') return { ok: false, error: 'Сейчас нельзя бросать' };
    rollFreeDice(state, rng, events, false);
    return { ok: true, state, events };
  }

  if (state.phase !== 'choose') return { ok: false, error: 'Сначала нужно бросить кубики' };

  const unique = [...new Set(action.indices)];
  const valid = unique.length === action.indices.length && unique.every((index) => state.dice[index]?.locked === false);
  if (!valid) return { ok: false, error: 'Неверный выбор кубиков' };

  const points = scoreSelection(unique.map((index) => state.dice[index]?.value ?? 0));
  if (points === null) return { ok: false, error: 'Выбранные кубики не дают очков' };

  for (const index of unique) {
    const die = state.dice[index];
    if (die) die.locked = true;
  }
  state.turnScore += points;
  events.push({ type: 'kept', indices: unique, points });

  if (action.then === 'bank') {
    const player = state.players[state.current];
    if (!player) return { ok: false, error: 'Нет игрока' };
    player.score += state.turnScore;
    events.push({ type: 'banked', player: state.current, points: state.turnScore });
    if (player.score >= state.target) {
      state.phase = 'over';
      state.winner = state.current;
      state.turnScore = 0;
      events.push({ type: 'win', player: state.current });
      return { ok: true, state, events };
    }
    nextTurn(state);
    return { ok: true, state, events };
  }

  // Продолжаем бросать. Если все шесть кубиков дали очки — «горячие кости»: бросаем снова все шесть.
  const hot = freeIndices(state).length === 0;
  if (hot) for (const die of state.dice) die.locked = false;
  rollFreeDice(state, rng, events, hot);
  return { ok: true, state, events };
};
