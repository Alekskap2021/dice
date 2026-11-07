import { useEffect, useMemo } from 'react';
import { useStore } from '../store.ts';

const COINS = 26;

type CoinStyle = Record<`--${string}`, string>;

/** Золотые монеты вылетают из центра стола и падают вниз. */
const Coins = () => {
  const coins = useMemo(
    () =>
      Array.from({ length: COINS }, (_, i): CoinStyle => {
        const side = (i / COINS) * 2 - 1;
        return {
          '--dx': `${side * 46 + (Math.random() - 0.5) * 14}vw`,
          '--rise': `${-(14 + Math.random() * 18)}vh`,
          '--fall': `${22 + Math.random() * 22}vh`,
          '--rot': `${(Math.random() - 0.5) * 900}deg`,
          '--delay': `${Math.random() * 0.22}s`,
          '--dur': `${1.1 + Math.random() * 0.5}s`,
          '--size': `${16 + Math.random() * 12}px`,
        };
      }),
    [],
  );
  return (
    <div className="fx-coins" aria-hidden="true">
      {coins.map((style, i) => (
        <span key={i} className="fx-coin" style={style}>
          <span className="fx-coin-face" />
        </span>
      ))}
    </div>
  );
};

/** Экранные эффекты: золотая вспышка и монеты для горячих костей, красная вспышка и тряска интерфейса для болта. */
export const Effects = () => {
  const fx = useStore((s) => s.fx);
  const id = fx?.id;
  const kind = fx?.kind;

  useEffect(() => {
    if (kind !== 'bust') return undefined;
    document.body.classList.add('fx-shake');
    const timer = window.setTimeout(() => document.body.classList.remove('fx-shake'), 520);
    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove('fx-shake');
    };
  }, [id, kind]);

  if (!fx) return null;
  return (
    <div key={fx.id} className="fx" data-kind={fx.kind} aria-hidden="true">
      <div className="fx-flash" />
      {fx.kind === 'hot' && <Coins />}
    </div>
  );
};
