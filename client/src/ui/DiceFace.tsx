const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

type DiceFaceProps = {
  value: number;
  /** Подсветить кубик, например «лишний» кубик в комбинации. */
  accent?: boolean;
  size?: number;
};

/** Плоский контурный кубик с точками, как в таблице комбинаций. */
export const DiceFace = ({ value, accent = false, size = 28 }: DiceFaceProps) => (
  <svg className="dice-face" data-accent={accent ? '' : undefined} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <rect x="6" y="6" width="88" height="88" rx="18" />
    {(PIPS[value] ?? []).map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="8" />
    ))}
  </svg>
);
