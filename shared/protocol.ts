import type { Action, GameEvent, GameState } from './engine.ts';
import type { ReactionId } from './reactions.ts';

export type ClientMessage =
  | { t: 'create'; name: string; target: number; lastTurn?: boolean }
  | { t: 'join'; code: string; name: string }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'react'; id: ReactionId }
  | { t: 'leave' };

export type RoomInfo = {
  code: string;
  target: number;
  lastTurn: boolean;
  names: string[];
  you: number;
  started: boolean;
};

export type ServerMessage =
  | { t: 'room'; room: RoomInfo }
  | { t: 'state'; state: GameState; events: GameEvent[] }
  | { t: 'react'; seat: number; id: ReactionId }
  | { t: 'peer_left' }
  | { t: 'error'; message: string };
