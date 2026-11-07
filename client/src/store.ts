import { useSyncExternalStore } from 'react';
import { MAX_TARGET, MIN_TARGET, type Action, type GameEvent, type GameState } from '../../shared/engine.ts';
import type { RoomInfo } from '../../shared/protocol.ts';
import { scoreSelection } from '../../shared/rules.ts';
import { audio } from './audio.ts';
import type { DiceTable } from './dice3d.ts';
import { createLocalSession, createOnlineSession, type Session, type SessionHandlers } from './session.ts';

export type Screen = 'menu' | 'lobby' | 'game';

export type UiState = {
  screen: Screen;
  mode: 'bot' | 'online' | null;
  shown: GameState | null;
  busy: boolean;
  selected: number[];
  room: RoomInfo | null;
  log: string[];
  banner: { id: number; text: string; bad: boolean } | null;
  toast: { id: number; text: string } | null;
  gameOver: boolean;
  rematchWaiting: boolean;
  menuError: string;
  lobbyError: string;
  rulesOpen: boolean;
  name: string;
  target: number;
  /** Громкость эффектов и музыки, 0–100. */
  sfxVolume: number;
  musicVolume: number;
};

/* ---------- хранилище настроек ---------- */

const storage = {
  get: (key: string): string => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  },
  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* хранилище недоступно: настройки просто не сохранятся */
    }
  },
};

/** Читает громкость 0–100. Понимает и старые значения on/off, сохранённые прежней версией. */
const initialVolume = (key: string, fallback: number): number => {
  const raw = storage.get(key);
  if (raw === 'off') return 0;
  if (raw === '' || raw === 'on') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
};

let state: UiState = {
  screen: 'menu',
  mode: null,
  shown: null,
  busy: false,
  selected: [],
  room: null,
  log: [],
  banner: null,
  toast: null,
  gameOver: false,
  rematchWaiting: false,
  menuError: '',
  lobbyError: '',
  rulesOpen: false,
  name: storage.get('kosti.name'),
  target: Number(storage.get('kosti.target')) || 2000,
  sfxVolume: initialVolume('kosti.sfx', 80),
  musicVolume: initialVolume('kosti.music', 50),
};

const listeners = new Set<() => void>();
const set = (patch: Partial<UiState>): void => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getState = (): UiState => state;
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
/** Подписка на часть состояния. Селектор должен возвращать примитив или неизменяемую ссылку. */
export const useStore = <T,>(selector: (s: UiState) => T): T => useSyncExternalStore(subscribe, () => selector(state));

/* ---------- внутренние переменные ---------- */

let session: Session | null = null;
let table: DiceTable | null = null;
let chain: Promise<void> = Promise.resolve();
let idCounter = 0;
let toastTimer: number | undefined;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
const mySeat = (): number => session?.seat() ?? 0;
const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const showToast = (text: string, ms = 3200): void => {
  window.clearTimeout(toastTimer);
  set({ toast: { id: (idCounter += 1), text } });
  toastTimer = window.setTimeout(() => set({ toast: null }), ms);
};

const showBanner = (text: string, bad = false): void => set({ banner: { id: (idCounter += 1), text, bad } });

const pushLog = (line: string): void => set({ log: [...state.log, line].slice(-6) });

audio.setSfxVolume(state.sfxVolume / 100);
audio.setMusicVolume(state.musicVolume / 100);

const emptyDice = (): { values: number[]; locked: boolean[] } => ({
  values: [1, 2, 3, 4, 5, 6],
  locked: [false, false, false, false, false, false],
});

/* ---------- производные значения ---------- */

export const selectionPoints = (s: UiState): number | null => {
  if (!s.shown || s.selected.length === 0) return null;
  return scoreSelection(s.selected.map((index) => s.shown?.dice[index]?.value ?? 0));
};

export const isMyTurn = (s: UiState): boolean =>
  s.shown !== null && s.shown.phase !== 'over' && s.shown.current === (session?.seat() ?? 0);

/* ---------- показ событий с анимацией ---------- */

const nameOf = (game: GameState, index: number): string => escapeHtml(game.players[index]?.name ?? '?');

const playEvents = async (game: GameState, events: GameEvent[]): Promise<void> => {
  const actor = state.shown?.current ?? 0;
  for (const event of events) {
    if (event.type === 'kept') {
      pushLog(`${nameOf(game, actor)} взял ${event.points}`);
      await table?.lockDice(event.indices);
    } else if (event.type === 'rolled') {
      if (event.hot) {
        audio.hot();
        showBanner('Горячие кости!');
        pushLog('Горячие кости!');
        await sleep(450);
      }
      await table?.throwDice(
        event.indices,
        event.indices.map((index) => game.dice[index]?.value ?? 1),
      );
      await sleep(250);
    } else if (event.type === 'bust') {
      audio.bust();
      showBanner('Болт!', true);
      pushLog(`${nameOf(game, event.player)}: болт, очки хода сгорели`);
      await table?.shake();
      await sleep(350);
      await table?.gather();
    } else if (event.type === 'banked') {
      audio.coin();
      showBanner(`+${event.points}`);
      pushLog(`${nameOf(game, event.player)} забрал ${event.points}`);
      set({ shown: { ...game, current: state.shown?.current ?? game.current } });
      await sleep(550);
      await table?.gather();
    } else if (event.type === 'win') {
      if (event.player === mySeat()) audio.win();
      else audio.lose();
    }
  }
};

const present = async (game: GameState, events: GameEvent[]): Promise<void> => {
  if (state.shown === null || events.length === 0) {
    const dice = game.dice;
    table?.setSelected(new Set());
    table?.reset(
      dice.map((die) => die.value),
      dice.map((die) => die.locked),
    );
    set({ shown: game, selected: [], busy: false, gameOver: false, rematchWaiting: false, log: [], screen: 'game' });
    audio.turn();
    if (game.players.length === 2) showHotkeyHint();
    return;
  }

  const previousCurrent = state.shown.current;
  table?.setSelected(new Set());
  set({ selected: [], busy: true });

  await playEvents(game, events);

  set({ shown: game, busy: false });
  if (game.phase === 'over') {
    showBanner(game.winner === mySeat() ? 'Победа!' : 'Поражение', game.winner !== mySeat());
    window.setTimeout(() => set({ gameOver: true }), 1400);
    return;
  }
  if (game.current !== previousCurrent) {
    audio.turn();
    showBanner(game.current === mySeat() ? 'Ваш ход' : `Ход: ${game.players[game.current]?.name ?? ''}`);
  }
};

let hintShown = false;
const showHotkeyHint = (): void => {
  if (hintShown) return;
  hintShown = true;
  window.setTimeout(() => showToast('Горячие клавиши: R — взять и бросить ещё, Space — взять и закончить ход', 7000), 1200);
};

/* ---------- сессии ---------- */

const handlers = (): SessionHandlers => ({
  onState: (game, events) => {
    chain = chain.then(() => present(game, events)).catch((error) => console.error(error));
    return chain;
  },
  onBotPick: (indices) => {
    set({ selected: [...indices] });
    table?.setSelected(new Set(indices));
    audio.select();
  },
  onRoom: (room) => {
    set({ room });
    if (room.started) return;
    if (state.screen === 'game') {
      resetGameView();
    }
    set({ screen: 'lobby' });
  },
  onPeerLeft: () => showToast('Соперник покинул комнату.'),
  onError: (message) => {
    set({ busy: false, selected: [] });
    table?.setSelected(new Set());
    if (state.screen === 'lobby') set({ lobbyError: message });
    else if (state.screen === 'menu') set({ menuError: message });
    else showToast(message);
  },
  onClose: () => {
    showToast('Соединение с сервером потеряно.');
    actions.leave();
  },
});

const resetGameView = (): void => {
  chain = Promise.resolve();
  table?.setSelected(new Set());
  const { values, locked } = emptyDice();
  table?.reset(values, locked);
  set({ shown: null, selected: [], busy: false, log: [], gameOver: false, rematchWaiting: false, banner: null });
};

const playerName = (): string => {
  const name = state.name.replace(/\s+/g, ' ').trim() || 'Игрок';
  storage.set('kosti.name', name);
  return name;
};

/* ---------- действия ---------- */

const perform = (action: Action): void => {
  if (state.busy || !session) return;
  audio.unlock();
  set({ busy: true });
  session.perform(action);
};

export const actions = {
  attachTable: (next: DiceTable | null): void => {
    table = next;
    if (table) {
      const { values, locked } = emptyDice();
      table.reset(values, locked);
      table.setPickable(new Set(), actions.toggleDie);
    }
  },

  /** Обновляет, какие кубики можно выбирать мышью. */
  syncPickable: (): void => {
    const shown = state.shown;
    if (!table) return;
    const canPick = shown !== null && !state.busy && isMyTurn(state) && shown.phase === 'choose';
    const free = shown ? shown.dice.flatMap((die, index) => (die.locked ? [] : [index])) : [];
    table.setPickable(canPick ? new Set(free) : new Set(), actions.toggleDie);
  },

  setName: (name: string): void => set({ name }),
  setTarget: (target: number): void => {
    storage.set('kosti.target', String(target));
    set({ target });
  },
  setTargetChecked: (raw: number): boolean => {
    const value = Math.round(raw / 50) * 50;
    if (value < MIN_TARGET || value > MAX_TARGET) {
      showToast(`Цель должна быть от ${MIN_TARGET} до ${MAX_TARGET}`);
      return false;
    }
    actions.setTarget(value);
    return true;
  },
  setSfxVolume: (percent: number): void => {
    storage.set('kosti.sfx', String(percent));
    audio.setSfxVolume(percent / 100);
    set({ sfxVolume: percent });
  },
  setMusicVolume: (percent: number): void => {
    storage.set('kosti.music', String(percent));
    audio.unlock();
    audio.setMusicVolume(percent / 100);
    set({ musicVolume: percent });
  },
  /** Звук-образец при отпускании ползунка эффектов. */
  previewSfx: (): void => {
    audio.unlock();
    audio.select();
  },
  setRulesOpen: (open: boolean): void => {
    if (open) audio.click();
    set({ rulesOpen: open });
  },
  dismissToast: (): void => set({ toast: null }),
  notify: showToast,

  startBot: (): void => {
    audio.unlock();
    audio.click();
    session?.close();
    resetGameView();
    set({ menuError: '', mode: 'bot', screen: 'game' });
    session = createLocalSession(playerName(), state.target, handlers());
  },

  startOnline: (kind: 'create' | 'join', code = ''): void => {
    audio.unlock();
    audio.click();
    session?.close();
    resetGameView();
    set({ menuError: '', lobbyError: '', mode: 'online' });
    const name = playerName();
    session = createOnlineSession(
      kind === 'create' ? { kind, name, target: state.target } : { kind, name, code },
      handlers(),
    );
  },

  startOnlineGame: (): void => {
    audio.click();
    session?.startGame();
  },

  rematch: (): void => {
    audio.click();
    if (!session) return;
    if (state.mode === 'online') set({ rematchWaiting: true });
    else set({ gameOver: false });
    session.rematch();
  },

  leave: (): void => {
    audio.click();
    session?.close();
    session = null;
    resetGameView();
    set({ screen: 'menu', mode: null, room: null, menuError: '', lobbyError: '' });
    history.replaceState(null, '', location.pathname);
  },

  roll: (): void => perform({ type: 'roll' }),

  /** Взять выбранные кубики и либо бросить ещё, либо закончить ход, забрав очки. */
  keep: (then: 'roll' | 'bank'): void => {
    if (selectionPoints(state) === null) {
      showToast('Сначала выберите кубики, которые дают очки');
      return;
    }
    perform({ type: 'keep', indices: [...state.selected], then });
  },

  toggleDie: (index: number): void => {
    const shown = state.shown;
    if (state.busy || !shown || !isMyTurn(state) || shown.phase !== 'choose') return;
    const selected = state.selected.includes(index) ? state.selected.filter((i) => i !== index) : [...state.selected, index];
    if (selected.length > state.selected.length) audio.select();
    else audio.deselect();
    table?.setSelected(new Set(selected));
    set({ selected });
  },

  /** Space — забрать и закончить ход, R — взять и бросить ещё. Перед первым броском хода оба бросают кубики. */
  hotkey: (key: 'space' | 'r'): void => {
    const shown = state.shown;
    if (state.screen !== 'game' || !shown || state.busy || state.gameOver || state.rulesOpen) return;
    if (!isMyTurn(state)) return;
    if (shown.phase === 'roll') actions.roll();
    else if (shown.phase === 'choose') actions.keep(key === 'space' ? 'bank' : 'roll');
  },
};

/** Крючок для автотестов в браузере. */
export const exposeForTests = (): void => {
  Object.assign(window, {
    __kosti: {
      toggleDie: actions.toggleDie,
      state: () => state.shown,
      busy: () => state.busy,
      ui: () => state,
    },
  });
};
