/**
 * Таблица очков. Все числа правил собраны здесь, чтобы их можно было поправить в одном месте.
 * Правила взяты по памяти из Kingdom Come: Deliverance (поиск в интернете в этой сессии был недоступен),
 * поэтому значения стоит сверить с оригиналом.
 */
export const SCORING = {
  singleOne: 100,
  singleFive: 50,
  /** Очки за тройку одинаковых. Для четвёрки и больше очки удваиваются за каждый лишний кубик. */
  threeOfKind: { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 } as Record<number, number>,
  straight1to5: 500,
  straight2to6: 750,
  straight1to6: 1500,
} as const;

export const DICE_COUNT = 6;

type Counts = readonly number[]; // индекс 1..6, индекс 0 не используется

const toCounts = (values: readonly number[]): number[] => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
};

const hasRun = (counts: Counts, from: number, to: number): boolean => {
  for (let face = from; face <= to; face += 1) if ((counts[face] ?? 0) < 1) return false;
  return true;
};

const withoutRun = (counts: Counts, from: number, to: number): number[] => {
  const next = [...counts];
  for (let face = from; face <= to; face += 1) next[face] = (next[face] ?? 0) - 1;
  return next;
};

const total = (counts: Counts): number => counts.reduce((sum, count) => sum + count, 0);

/** Максимум очков, который можно получить, использовав ВСЕ кубики из набора, либо null. */
const bestUsingAll = (counts: Counts): number | null => {
  if (total(counts) === 0) return 0;
  let best: number | null = null;
  const consider = (candidate: number | null): void => {
    if (candidate !== null && (best === null || candidate > best)) best = candidate;
  };
  const plusRest = (points: number, rest: Counts): number | null => {
    const restScore = bestUsingAll(rest);
    return restScore === null ? null : points + restScore;
  };

  if (hasRun(counts, 1, 6)) consider(plusRest(SCORING.straight1to6, withoutRun(counts, 1, 6)));
  if (hasRun(counts, 1, 5)) consider(plusRest(SCORING.straight1to5, withoutRun(counts, 1, 5)));
  if (hasRun(counts, 2, 6)) consider(plusRest(SCORING.straight2to6, withoutRun(counts, 2, 6)));

  for (let face = 1; face <= 6; face += 1) {
    const count = counts[face] ?? 0;
    if (count >= 3) {
      const base = (SCORING.threeOfKind[face] ?? 0) * 2 ** (count - 3);
      const rest = [...counts];
      rest[face] = 0;
      consider(plusRest(base, rest));
    }
  }

  // Одиночные единицы и пятёрки: каждая — отдельная комбинация.
  // Остальные кубики разбираем без них, чтобы не считать одно и то же дважды.
  const ones = counts[1] ?? 0;
  const fives = counts[5] ?? 0;
  if (ones > 0 || fives > 0) {
    for (let takeOnes = 0; takeOnes <= Math.min(ones, 2); takeOnes += 1) {
      for (let takeFives = 0; takeFives <= Math.min(fives, 2); takeFives += 1) {
        if (takeOnes + takeFives === 0) continue;
        const rest = [...counts];
        rest[1] = ones - takeOnes;
        rest[5] = fives - takeFives;
        consider(plusRest(takeOnes * SCORING.singleOne + takeFives * SCORING.singleFive, rest));
      }
    }
  }
  return best;
};

/**
 * Очки за выбранные кубики. Возвращает null, если в выборе есть кубик, не входящий ни в какую комбинацию,
 * или если выбор пуст.
 */
export const scoreSelection = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const result = bestUsingAll(toCounts(values));
  return result === 0 ? null : result;
};

/** Есть ли среди брошенных кубиков хоть одна очковая комбинация. Если нет — «болт». */
export const hasAnyScoring = (values: readonly number[]): boolean => {
  const counts = toCounts(values);
  if ((counts[1] ?? 0) > 0 || (counts[5] ?? 0) > 0) return true;
  return counts.some((count) => count >= 3);
};
