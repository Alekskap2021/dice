import { useState } from 'react';
import { Button, ChipGroup, Input } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

const TARGETS = [1000, 2000, 3000, 4000, 5000];

/** В странице-превью без сервера сетевая игра недоступна. Флаг ставит страница-обёртка. */
const isPreview = Reflect.get(window, '__KOSTI_PREVIEW__') === true;

export const MenuScreen = () => {
  const name = useStore((s) => s.name);
  const target = useStore((s) => s.target);
  const error = useStore((s) => s.menuError);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 4) ?? '');
  const [custom, setCustom] = useState('');

  const options = (TARGETS.includes(target) ? TARGETS : [...TARGETS, target].sort((a, b) => a - b)).map((value) => ({
    value: String(value),
    label: String(value),
  }));

  const join = (): void => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 4) {
      actions.notify('Введите четырёхбуквенный код комнаты');
      return;
    }
    actions.startOnline('join', trimmed);
  };

  return (
    <section className="screen">
      <div className="card menu-card">
        <h1 className="title">Кости</h1>
        <p className="subtitle">Игра в кости на двоих</p>

        <label className="field">
          <span className="field-label">Ваше имя</span>
          <Input value={name} onChange={(e) => actions.setName(e.target.value)} maxLength={16} placeholder="Генрих" autoComplete="off" />
        </label>

        <div className="field">
          <span className="field-label">Играем до очков</span>
          <ChipGroup
            label="Цель партии"
            value={String(target)}
            options={options}
            onChange={(value) => actions.setTarget(Number(value))}
          />
          <Input
            type="number"
            inputMode="numeric"
            min={500}
            max={20000}
            step={50}
            placeholder="Своё число очков"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={() => {
              if (custom && !actions.setTargetChecked(Number(custom))) setCustom('');
            }}
            aria-label="Своё число очков"
          />
        </div>

        <div className="stack">
          <Button variant="primary" size="lg" block onClick={actions.startBot}>
            Играть с ботом
          </Button>
          {isPreview ? (
            <p className="hint">Сетевая игра в превью недоступна: она работает только на сервере.</p>
          ) : (
            <>
          <Button size="lg" block onClick={() => actions.startOnline('create')}>
            Создать комнату
          </Button>
          <div className="join-row">
            <Input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              maxLength={4}
              placeholder="КОД"
              aria-label="Код комнаты"
              autoComplete="off"
            />
            <Button onClick={join}>Войти</Button>
          </div>
            </>
          )}
          <Button variant="ghost" block onClick={() => actions.setRulesOpen(true)}>
            Правила игры
          </Button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
};
