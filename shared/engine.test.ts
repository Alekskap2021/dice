import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseBotAction } from './bot.ts';
import { applyAction, createGame, type GameState } from './engine.ts';
import { hasAnyScoring, scoreSelection } from './rules.ts';

test('одиночные кубики', () => {
  assert.equal(scoreSelection([1]), 100);
  assert.equal(scoreSelection([5]), 50);
  assert.equal(scoreSelection([1, 5]), 150);
  assert.equal(scoreSelection([1, 1]), 200);
  assert.equal(scoreSelection([2]), null);
  assert.equal(scoreSelection([1, 2]), null);
  assert.equal(scoreSelection([]), null);
});

test('тройки и больше', () => {
  assert.equal(scoreSelection([2, 2, 2]), 200);
  assert.equal(scoreSelection([1, 1, 1]), 1000);
  assert.equal(scoreSelection([6, 6, 6]), 600);
  assert.equal(scoreSelection([3, 3, 3, 3]), 600);
  assert.equal(scoreSelection([3, 3, 3, 3, 3]), 1200);
  assert.equal(scoreSelection([4, 4, 4, 4, 4, 4]), 3200);
  assert.equal(scoreSelection([2, 2, 2, 1]), 300);
  assert.equal(scoreSelection([2, 2, 2, 3]), null);
});

test('стриты', () => {
  assert.equal(scoreSelection([1, 2, 3, 4, 5]), 500);
  assert.equal(scoreSelection([2, 3, 4, 5, 6]), 750);
  assert.equal(scoreSelection([1, 2, 3, 4, 5, 6]), 1500);
  assert.equal(scoreSelection([5, 4, 3, 2, 1, 1]), 600);
  assert.equal(scoreSelection([2, 3, 4, 5]), null);
});

test('болт', () => {
  assert.equal(hasAnyScoring([2, 3, 4, 6, 6]), false);
  assert.equal(hasAnyScoring([2, 2, 2, 4]), true);
  assert.equal(hasAnyScoring([2, 3, 4, 6, 1]), true);
});

const sequence = (values: number[]) => {
  let i = 0;
  // rng возвращает число так, чтобы 1 + floor(r*6) дало нужное значение
  return () => ((values[i++ % values.length] ?? 1) - 1 + 0.5) / 6;
};

test('ход: бросок, взять, забрать очки, смена игрока', () => {
  let state: GameState = createGame(['A', 'B'], 1000);
  let result = applyAction(state, { type: 'roll' }, sequence([1, 5, 2, 3, 4, 6]));
  assert.ok(result.ok);
  state = result.state;
  assert.equal(state.phase, 'choose');
  result = applyAction(state, { type: 'keep', indices: [0], then: 'bank' }, Math.random);
  assert.ok(result.ok);
  assert.equal(result.state.players[0]?.score, 100);
  assert.equal(result.state.current, 1);
  assert.equal(result.state.phase, 'roll');
});

test('болт обнуляет очки хода', () => {
  const state = createGame(['A', 'B'], 1000);
  const result = applyAction(state, { type: 'roll' }, sequence([2, 3, 4, 6, 6, 2]));
  assert.ok(result.ok);
  assert.equal(result.state.current, 1);
  assert.equal(result.state.turnScore, 0);
  assert.ok(result.events.some((event) => event.type === 'bust'));
});

test('горячие кости: все шесть дали очки, бросаем снова шесть', () => {
  let state = createGame(['A', 'B'], 5000);
  let result = applyAction(state, { type: 'roll' }, sequence([1, 2, 3, 4, 5, 6]));
  assert.ok(result.ok);
  state = result.state;
  result = applyAction(state, { type: 'keep', indices: [0, 1, 2, 3, 4, 5], then: 'roll' }, sequence([1, 1, 2, 3, 4, 6]));
  assert.ok(result.ok);
  assert.equal(result.state.turnScore, 1500);
  assert.ok(result.events.some((event) => event.type === 'rolled' && event.hot && event.indices.length === 6));
});

test('нельзя взять неочковые кубики и заблокированные', () => {
  const state = createGame(['A', 'B'], 1000);
  const rolled = applyAction(state, { type: 'roll' }, sequence([1, 5, 2, 3, 4, 6]));
  assert.ok(rolled.ok);
  assert.equal(applyAction(rolled.state, { type: 'keep', indices: [2], then: 'roll' }, Math.random).ok, false);
  assert.equal(applyAction(rolled.state, { type: 'keep', indices: [0, 0], then: 'roll' }, Math.random).ok, false);
  assert.equal(applyAction(rolled.state, { type: 'roll' }, Math.random).ok, false);
});

test('победа при достижении цели', () => {
  const state = createGame(['A', 'B'], 100);
  const rolled = applyAction(state, { type: 'roll' }, sequence([1, 2, 3, 4, 6, 6]));
  assert.ok(rolled.ok);
  const done = applyAction(rolled.state, { type: 'keep', indices: [0], then: 'bank' }, Math.random);
  assert.ok(done.ok);
  assert.equal(done.state.phase, 'over');
  assert.equal(done.state.winner, 0);
});

test('бот всегда делает допустимый ход и доигрывает партию', () => {
  for (let game = 0; game < 200; game += 1) {
    let state = createGame(['Бот 1', 'Бот 2'], 2000);
    for (let step = 0; step < 5000 && state.phase !== 'over'; step += 1) {
      const result = applyAction(state, chooseBotAction(state), Math.random);
      assert.ok(result.ok, result.ok ? '' : result.error);
      state = result.state;
    }
    assert.equal(state.phase, 'over');
  }
});
