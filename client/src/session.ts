import { chooseBotAction } from '../../shared/bot.ts';
import { applyAction, createGame, type Action, type GameEvent, type GameState } from '../../shared/engine.ts';
import type { ClientMessage, RoomInfo, ServerMessage } from '../../shared/protocol.ts';
import { REACTIONS, type ReactionId } from '../../shared/reactions.ts';

export type SessionHandlers = {
  /** Возвращает промис, который завершается, когда анимации показаны. */
  onState: (state: GameState, events: GameEvent[]) => Promise<void>;
  onBotPick: (indices: number[]) => void;
  onRoom: (room: RoomInfo) => void;
  onPeerLeft: () => void;
  /** Соперник прислал реакцию. */
  onReaction: (seat: number, id: ReactionId) => void;
  onError: (message: string) => void;
  onClose: () => void;
};

export type Session = {
  /** Номер моего места в игре. */
  seat: () => number;
  perform: (action: Action) => void;
  startGame: () => void;
  rematch: () => void;
  react: (id: ReactionId) => void;
  close: () => void;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

export type GameSettings = { target: number; lastTurn: boolean };

/** Ответы бота на реакции игрока. */
const BOT_REPLIES: ReactionId[] = ['laugh', 'wow', 'dice', 'beer', 'go', 'nice', 'luck'];

export const createLocalSession = (name: string, settings: GameSettings, handlers: SessionHandlers): Session => {
  const { target, lastTurn } = settings;
  let state = createGame([name, 'Бот'], target, lastTurn);
  let closed = false;
  let busy = false;

  const step = async (action: Action): Promise<void> => {
    const result = applyAction(state, action, Math.random);
    if (!result.ok) {
      handlers.onError(result.error);
      return;
    }
    state = result.state;
    await handlers.onState(state, result.events);
  };

  const botTurns = async (): Promise<void> => {
    while (!closed && state.phase !== 'over' && state.current === 1) {
      await sleep(750);
      if (closed) return;
      const action = chooseBotAction(state);
      if (action.type === 'keep') {
        handlers.onBotPick(action.indices);
        await sleep(1000);
        if (closed) return;
      }
      await step(action);
    }
  };

  const run = async (action: Action): Promise<void> => {
    if (busy || closed || state.current !== 0) return;
    busy = true;
    try {
      await step(action);
      await botTurns();
    } finally {
      busy = false;
    }
  };

  const begin = (): void => {
    state = createGame([name, 'Бот'], target, lastTurn);
    void handlers.onState(state, []);
  };
  queueMicrotask(begin);

  return {
    seat: () => 0,
    perform: (action) => void run(action),
    startGame: () => undefined,
    rematch: () => {
      if (!closed && !busy) begin();
    },
    react: () => {
      if (closed || Math.random() > 0.45) return;
      const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)] ?? REACTIONS[0].id;
      window.setTimeout(() => {
        if (!closed) handlers.onReaction(1, reply);
      }, 900 + Math.random() * 900);
    },
    close: () => {
      closed = true;
    },
  };
};

export type OnlineStart = { kind: 'create'; name: string; target: number; lastTurn: boolean } | { kind: 'join'; name: string; code: string };

export const createOnlineSession = (start: OnlineStart, handlers: SessionHandlers): Session => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  let seat = 0;
  let closed = false;

  const send = (message: ClientMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  socket.addEventListener('open', () => {
    send(
      start.kind === 'create'
        ? { t: 'create', name: start.name, target: start.target, lastTurn: start.lastTurn }
        : { t: 'join', code: start.code, name: start.name },
    );
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    if (message.t === 'room') {
      seat = message.room.you;
      handlers.onRoom(message.room);
    } else if (message.t === 'state') {
      void handlers.onState(message.state, message.events);
    } else if (message.t === 'react') {
      handlers.onReaction(message.seat, message.id);
    } else if (message.t === 'peer_left') {
      handlers.onPeerLeft();
    } else {
      handlers.onError(message.message);
    }
  });

  socket.addEventListener('close', () => {
    if (!closed) handlers.onClose();
  });
  socket.addEventListener('error', () => {
    if (!closed) handlers.onError('Нет связи с сервером.');
  });

  return {
    seat: () => seat,
    perform: (action) => send({ t: 'action', action }),
    startGame: () => send({ t: 'start' }),
    rematch: () => send({ t: 'rematch' }),
    react: (id) => send({ t: 'react', id }),
    close: () => {
      closed = true;
      send({ t: 'leave' });
      socket.close();
    },
  };
};
