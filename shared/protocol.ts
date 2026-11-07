import type { Action, GameEvent, GameState } from './engine.ts';

export type ClientMessage =
  | { t: 'create'; name: string; target: number }
  | { t: 'join'; code: string; name: string }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'leave' };

export type RoomInfo = {
  code: string;
  target: number;
  names: string[];
  you: number;
  started: boolean;
};

export type ServerMessage =
  | { t: 'room'; room: RoomInfo }
  | { t: 'state'; state: GameState; events: GameEvent[] }
  | { t: 'peer_left' }
  | { t: 'error'; message: string };
