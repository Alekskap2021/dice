import { MAX_TARGET, MIN_TARGET, type GameEvent, type GameState } from '../../shared/engine.ts';
import type { RoomInfo } from '../../shared/protocol.ts';
import { RULES_TABLE, scoreSelection } from '../../shared/rules.ts';
import { audio } from './audio.ts';
import { createDiceTable } from './dice3d.ts';
import { createLocalSession, createOnlineSession, type Session, type SessionHandlers } from './session.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} не найден`);
  return el as T;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

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
      /* хранилище недоступно — не страшно */
    }
  },
};

const TARGETS = [1000, 2000, 3000, 4000, 5000];

const table = createDiceTable($('stage'));
table.reset([1, 2, 3, 4, 5, 6], [false, false, false, false, false, false]);

let session: Session | null = null;
let mode: 'bot' | 'online' | null = null;
let isHost = false;
let target = Number(storage.get('kosti.target')) || 2000;
let shown: GameState | null = null;
let busy = false;
let selected = new Set<number>();
let roomInfo: RoomInfo | null = null;
let chain: Promise<void> = Promise.resolve();
const logLines: string[] = [];

/* ---------- экраны ---------- */

const show = (id: 'menu' | 'lobby' | 'hud' | null): void => {
  for (const name of ['menu', 'lobby', 'hud']) $(name).classList.toggle('hidden', name !== id);
};

const toast = (text: string, ms = 2600): void => {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  window.clearTimeout((toast as unknown as { timer?: number }).timer);
  (toast as unknown as { timer?: number }).timer = window.setTimeout(() => el.classList.add('hidden'), ms);
};

const banner = (text: string, bad = false): void => {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show', 'bad');
  void el.offsetWidth;
  el.classList.add('show');
  el.classList.toggle('bad', bad);
};

const pushLog = (line: string): void => {
  logLines.push(line);
  if (logLines.length > 6) logLines.shift();
  $('log').innerHTML = logLines.map((text) => `<li>${text}</li>`).join('');
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/* ---------- меню ---------- */

const nameInput = $<HTMLInputElement>('name');
nameInput.value = storage.get('kosti.name');
const playerName = (): string => {
  const name = nameInput.value.replace(/\s+/g, ' ').trim() || 'Игрок';
  storage.set('kosti.name', name);
  return name;
};

const renderTargets = (): void => {
  const root = $('targets');
  root.innerHTML = '';
  const options = TARGETS.includes(target) ? TARGETS : [...TARGETS, target].sort((a, b) => a - b);
  for (const value of options) {
    const chip = document.createElement('button');
    chip.className = `chip${value === target ? ' active' : ''}`;
    chip.textContent = String(value);
    chip.onclick = () => {
      audio.unlock();
      audio.click();
      target = value;
      storage.set('kosti.target', String(value));
      renderTargets();
    };
    root.appendChild(chip);
  }
  const custom = document.createElement('input');
  custom.type = 'number';
  custom.min = String(MIN_TARGET);
  custom.max = String(MAX_TARGET);
  custom.step = '100';
  custom.placeholder = 'своё';
  custom.style.cssText = 'width:90px;padding:6px 10px;font-size:16px;border-radius:20px';
  custom.onchange = () => {
    const value = Math.round(Number(custom.value) / 50) * 50;
    if (value >= MIN_TARGET && value <= MAX_TARGET) {
      target = value;
      storage.set('kosti.target', String(value));
      renderTargets();
    } else {
      toast(`Цель должна быть от ${MIN_TARGET} до ${MAX_TARGET}`);
      custom.value = '';
    }
  };
  root.appendChild(custom);
};
renderTargets();

const buildRules = (): void => {
  $('rules-body').innerHTML = `
    <p>Цель — первым набрать нужное число очков. Игра идёт на шести кубиках.</p>
    <h3>Ход</h3>
    <p>Бросьте все кубики. Выберите кубики, которые дают очки, — каждый выбранный кубик должен входить в комбинацию — и отложите их.
    Затем решите: забрать очки хода в свою копилку и передать ход, или бросить оставшиеся кубики и рискнуть ради большего.</p>
    <h3>Болт</h3>
    <p>Если после броска нет ни одной комбинации, вы теряете все очки, набранные за этот ход, и ход переходит к сопернику.</p>
    <h3>Горячие кости</h3>
    <p>Если все шесть кубиков дали очки, можно бросить все шесть заново и продолжить набирать очки в этом же ходу.</p>
    <h3>Очки</h3>
    <table>${RULES_TABLE.map((row) => `<tr><td>${row.combo}</td><td>${row.points}</td></tr>`).join('')}</table>
    <p>Очки хода не защищены, пока вы их не забрали. Победителем становится тот, кто первым достиг цели.</p>`;
};
buildRules();

const openRules = (): void => {
  audio.click();
  $('rules-modal').classList.remove('hidden');
};
$('btn-rules').onclick = openRules;
$('btn-hud-rules').onclick = openRules;
$('btn-rules-close').onclick = () => {
  audio.click();
  $('rules-modal').classList.add('hidden');
};

const muteBtn = $('btn-mute');
muteBtn.onclick = () => {
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  muteBtn.classList.toggle('off', audio.isMuted());
};

/* ---------- отображение игры ---------- */

const mySeat = (): number => session?.seat() ?? 0;

const renderScoreboard = (state: GameState, bumpPlayer: number | null = null): void => {
  const root = $('scoreboard');
  root.innerHTML = state.players
    .map((player, index) => {
      const percent = Math.min(100, (player.score / state.target) * 100);
      const you = index === mySeat() ? ' (вы)' : '';
      const classes = ['score-card', index === state.current && state.phase !== 'over' ? 'active' : '', index === bumpPlayer ? 'bump' : '']
        .filter(Boolean)
        .join(' ');
      return `<div class="${classes}">
        <div class="row"><span class="pname">${escapeHtml(player.name)}${you}</span><span class="pscore">${player.score}</span></div>
        <div class="bar"><i style="width:${percent}%"></i></div>
        <div class="goal">цель: ${state.target}</div>
      </div>`;
    })
    .join('');
};

const myTurn = (state: GameState): boolean => state.phase !== 'over' && state.current === mySeat();

const selectionPoints = (): number | null => {
  if (!shown || selected.size === 0) return null;
  return scoreSelection([...selected].map((index) => shown?.dice[index]?.value ?? 0));
};

const refreshControls = (): void => {
  const state = shown;
  const rollBtn = $<HTMLButtonElement>('btn-roll');
  const keepRoll = $<HTMLButtonElement>('btn-keep-roll');
  const keepBank = $<HTMLButtonElement>('btn-keep-bank');
  const info = $('selection-info');
  for (const b of [rollBtn, keepRoll, keepBank]) b.classList.add('hidden');
  info.classList.remove('bad');

  if (!state || state.phase === 'over') {
    info.textContent = '';
    table.setPickable(new Set(), () => undefined);
    return;
  }

  const name = state.players[state.current]?.name ?? '';
  $('turn-label').textContent = myTurn(state) ? 'Ваш ход' : `Ход: ${name}`;
  $('turn-score').innerHTML = state.turnScore > 0 ? `Очки хода: <b>${state.turnScore}</b>` : '';

  if (!myTurn(state)) {
    info.textContent = mode === 'bot' ? 'Бот думает…' : 'Соперник ходит…';
    table.setPickable(new Set(), () => undefined);
    return;
  }

  if (state.phase === 'roll') {
    info.textContent = '';
    rollBtn.classList.remove('hidden');
    rollBtn.disabled = busy;
    table.setPickable(new Set(), () => undefined);
    return;
  }

  const points = selectionPoints();
  if (selected.size === 0) info.textContent = 'Выберите кубики с очками';
  else if (points === null) {
    info.textContent = 'Эти кубики не дают очков вместе';
    info.classList.add('bad');
  } else info.innerHTML = `Выбрано: <b>+${points}</b> · за ход будет <b>${state.turnScore + points}</b>`;

  keepRoll.classList.remove('hidden');
  keepBank.classList.remove('hidden');
  const ok = points !== null && !busy;
  keepRoll.disabled = !ok;
  keepBank.disabled = !ok;

  const free = new Set(state.dice.flatMap((die, index) => (die.locked ? [] : [index])));
  table.setPickable(busy ? new Set() : free, toggleDie);
};

const toggleDie = (index: number): void => {
  if (busy || !shown || !myTurn(shown) || shown.phase !== 'choose') return;
  if (selected.has(index)) {
    selected.delete(index);
    audio.deselect();
  } else {
    selected.add(index);
    audio.select();
  }
  table.setSelected(selected);
  refreshControls();
};

const perform = (action: Parameters<Session['perform']>[0]): void => {
  if (busy || !session) return;
  audio.unlock();
  busy = true;
  refreshControls();
  session.perform(action);
};

$('btn-roll').onclick = () => perform({ type: 'roll' });
$('btn-keep-roll').onclick = () => perform({ type: 'keep', indices: [...selected], then: 'roll' });
$('btn-keep-bank').onclick = () => perform({ type: 'keep', indices: [...selected], then: 'bank' });
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && shown?.phase === 'roll' && myTurn(shown) && !busy && !$('hud').classList.contains('hidden')) {
    event.preventDefault();
    perform({ type: 'roll' });
  }
});

const nameOf = (state: GameState, index: number): string => escapeHtml(state.players[index]?.name ?? '?');

const playEvents = async (state: GameState, events: GameEvent[]): Promise<void> => {
  const actor = shown?.current ?? 0;
  for (const event of events) {
    if (event.type === 'kept') {
      pushLog(`${nameOf(state, actor)} взял ${event.points}`);
      await table.lockDice(event.indices);
    } else if (event.type === 'rolled') {
      if (event.hot) {
        audio.hot();
        banner('Горячие кости!');
        pushLog('Горячие кости!');
        await sleep(450);
      }
      await table.throwDice(
        event.indices,
        event.indices.map((index) => state.dice[index]?.value ?? 1),
      );
      await sleep(250);
    } else if (event.type === 'bust') {
      audio.bust();
      banner('Болт!', true);
      pushLog(`${nameOf(state, event.player)}: болт, очки хода сгорели`);
      await table.shake();
      await sleep(350);
      await table.gather();
    } else if (event.type === 'banked') {
      audio.coin();
      banner(`+${event.points}`);
      pushLog(`${nameOf(state, event.player)} забрал ${event.points}`);
      renderScoreboard(state, event.player);
      await sleep(550);
      await table.gather();
    } else if (event.type === 'win') {
      const mine = event.player === mySeat();
      if (mine) audio.win();
      else audio.lose();
    }
  }
};

const present = async (state: GameState, events: GameEvent[]): Promise<void> => {
  const first = shown === null || events.length === 0;
  if (first) {
    shown = state;
    selected = new Set();
    busy = false;
    $('over-modal').classList.add('hidden');
    logLines.length = 0;
    $('log').innerHTML = '';
    table.reset(
      state.dice.map((die) => die.value),
      state.dice.map((die) => die.locked),
    );
    renderScoreboard(state);
    refreshControls();
    audio.turn();
    return;
  }

  const previousCurrent = shown?.current;
  selected = new Set();
  busy = true;
  table.setSelected(selected);
  refreshControls();

  await playEvents(state, events);

  shown = state;
  busy = false;
  renderScoreboard(state);
  refreshControls();
  if (state.phase === 'over') {
    gameOver(state);
    return;
  }
  if (state.current !== previousCurrent) {
    audio.turn();
    banner(myTurn(state) ? 'Ваш ход' : `Ход: ${state.players[state.current]?.name ?? ''}`);
  }
};

const gameOver = (state: GameState): void => {
  const winner = state.winner ?? 0;
  const mine = winner === mySeat();
  $('over-title').textContent = mine ? 'Победа!' : 'Поражение';
  $('over-text').textContent = `${state.players[winner]?.name ?? ''} набирает ${state.players[winner]?.score ?? 0} очков и выигрывает партию.`;
  const again = $<HTMLButtonElement>('btn-again');
  again.disabled = false;
  again.textContent = 'Сыграть ещё';
  banner(mine ? 'Победа!' : 'Поражение', !mine);
  window.setTimeout(() => $('over-modal').classList.remove('hidden'), 1400);
};

$('btn-again').onclick = () => {
  audio.click();
  if (!session) return;
  if (mode === 'online') {
    $<HTMLButtonElement>('btn-again').disabled = true;
    $('btn-again').textContent = 'Ждём соперника…';
  } else {
    $('over-modal').classList.add('hidden');
  }
  session.rematch();
};

/* ---------- сессии ---------- */

const handlers = (): SessionHandlers => ({
  onState: (state, events) => {
    if ($('hud').classList.contains('hidden')) show('hud');
    chain = chain.then(() => present(state, events)).catch((error) => console.error(error));
    return chain;
  },
  onBotPick: (indices) => {
    selected = new Set(indices);
    table.setSelected(selected);
    audio.select();
  },
  onRoom: (room) => {
    roomInfo = room;
    renderLobby(room);
    if (room.started) return;
    if (!$('hud').classList.contains('hidden')) toLobbyFromGame();
    else show('lobby');
  },
  onPeerLeft: () => {
    toast('Соперник покинул комнату.');
  },
  onError: (message) => {
    busy = false;
    selected = new Set();
    table.setSelected(selected);
    refreshControls();
    if (!$('lobby').classList.contains('hidden')) $('lobby-error').textContent = message;
    else if (!$('menu').classList.contains('hidden')) $('menu-error').textContent = message;
    else toast(message);
  },
  onClose: () => {
    toast('Соединение с сервером потеряно.');
    toMenu();
  },
});

const resetGameView = (): void => {
  shown = null;
  selected = new Set();
  busy = false;
  chain = Promise.resolve();
  logLines.length = 0;
  roomInfo = null;
  $('over-modal').classList.add('hidden');
  table.setSelected(selected);
  table.reset([1, 2, 3, 4, 5, 6], [false, false, false, false, false, false]);
};

const toMenu = (): void => {
  session?.close();
  session = null;
  mode = null;
  resetGameView();
  history.replaceState(null, '', location.pathname);
  show('menu');
};

const toLobbyFromGame = (): void => {
  shown = null;
  chain = Promise.resolve();
  $('over-modal').classList.add('hidden');
  table.reset([1, 2, 3, 4, 5, 6], [false, false, false, false, false, false]);
  show('lobby');
};

const startBotGame = (): void => {
  audio.unlock();
  audio.click();
  audio.startAmbient();
  $('menu-error').textContent = '';
  mode = 'bot';
  resetGameView();
  show('hud');
  session = createLocalSession(playerName(), target, handlers());
};

const startOnline = (kind: 'create' | 'join', code = ''): void => {
  audio.unlock();
  audio.click();
  audio.startAmbient();
  $('menu-error').textContent = '';
  $('lobby-error').textContent = '';
  mode = 'online';
  resetGameView();
  const name = playerName();
  session = createOnlineSession(kind === 'create' ? { kind, name, target } : { kind, name, code }, handlers());
};

$('btn-bot').onclick = startBotGame;
$('btn-create').onclick = () => startOnline('create');
$('btn-join').onclick = () => {
  const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('menu-error').textContent = 'Введите четырёхбуквенный код комнаты.';
    return;
  }
  startOnline('join', code);
};

$('btn-leave').onclick = () => {
  audio.click();
  toMenu();
};
$('btn-over-menu').onclick = () => {
  audio.click();
  toMenu();
};
$('btn-lobby-leave').onclick = () => {
  audio.click();
  toMenu();
};

/* ---------- лобби ---------- */

const inviteUrl = (code: string): string => `${location.origin}${location.pathname}?room=${code}`;

const renderLobby = (room: RoomInfo): void => {
  isHost = room.you === 0;
  $('room-code').textContent = room.code;
  $<HTMLInputElement>('invite-link').value = inviteUrl(room.code);
  $('lobby-target').textContent = String(room.target);
  $('lobby-players').innerHTML =
    room.names
      .map((name, index) => `<li class="filled">${escapeHtml(name)}${index === 0 ? ' · хозяин' : ''}${index === room.you ? ' (вы)' : ''}</li>`)
      .join('') + (room.names.length < 2 ? '<li class="waiting">Ждём друга…</li>' : '');
  const start = $<HTMLButtonElement>('btn-start');
  start.disabled = !isHost || room.names.length < 2;
  start.textContent = isHost ? 'Начать игру' : 'Ждём начала игры…';
  if (room.names.length === 2) audio.turn();
};

$('btn-start').onclick = () => {
  audio.click();
  session?.startGame();
};

$('btn-copy').onclick = async () => {
  audio.click();
  const link = $<HTMLInputElement>('invite-link').value;
  try {
    await navigator.clipboard.writeText(link);
    toast('Ссылка скопирована');
  } catch {
    $<HTMLInputElement>('invite-link').select();
    toast('Скопируйте ссылку вручную');
  }
};

if (typeof navigator.share === 'function') {
  const shareBtn = $('btn-share');
  shareBtn.classList.remove('hidden');
  shareBtn.onclick = () => {
    audio.click();
    if (!roomInfo) return;
    void navigator
      .share({ title: 'Кости', text: `Сыграем в кости! Код комнаты: ${roomInfo.code}`, url: inviteUrl(roomInfo.code) })
      .catch(() => undefined);
  };
}

// Крючок для автотестов в браузере.
Object.assign(window, { __kosti: { toggleDie, state: () => shown, busy: () => busy } });

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) {
  $<HTMLInputElement>('code').value = roomFromUrl.toUpperCase().slice(0, 4);
  toast('Вас пригласили в комнату. Введите имя и нажмите «Войти».', 5000);
}
