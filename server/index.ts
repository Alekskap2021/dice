import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { applyAction, createGame, MAX_TARGET, MIN_TARGET, type GameState } from '../shared/engine.ts';
import type { ClientMessage, RoomInfo, ServerMessage } from '../shared/protocol.ts';

type Seat = { socket: WebSocket; name: string; wantsRematch: boolean };

type Room = {
  code: string;
  target: number;
  seats: Seat[];
  state: GameState | null;
};

const PORT = Number(process.env.PORT ?? 3000);
const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const rooms = new Map<string, Room>();
const roomOf = new WeakMap<WebSocket, Room>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = (): string => {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
};

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};

const cleanName = (name: string, fallback: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 16) || fallback;

const roomInfo = (room: Room, you: number): RoomInfo => ({
  code: room.code,
  target: room.target,
  names: room.seats.map((seat) => seat.name),
  you,
  started: room.state !== null,
});

const broadcastRoom = (room: Room): void => {
  room.seats.forEach((seat, index) => send(seat.socket, { t: 'room', room: roomInfo(room, index) }));
};

const leaveRoom = (socket: WebSocket): void => {
  const room = roomOf.get(socket);
  if (!room) return;
  roomOf.delete(socket);
  const index = room.seats.findIndex((seat) => seat.socket === socket);
  if (index === -1) return;
  room.seats.splice(index, 1);
  if (room.seats.length === 0) {
    rooms.delete(room.code);
    return;
  }
  room.state = null;
  room.seats.forEach((seat) => {
    seat.wantsRematch = false;
    send(seat.socket, { t: 'peer_left' });
  });
  broadcastRoom(room);
};

const startGame = (room: Room): void => {
  room.state = createGame(room.seats.map((seat) => seat.name), room.target);
  room.seats.forEach((seat) => (seat.wantsRematch = false));
  broadcastRoom(room);
  room.seats.forEach((seat) => send(seat.socket, { t: 'state', state: room.state as GameState, events: [] }));
};

const handleMessage = (socket: WebSocket, message: ClientMessage): void => {
  if (message.t === 'create') {
    leaveRoom(socket);
    const target = Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(Number(message.target) || 2000)));
    const room: Room = { code: makeCode(), target, seats: [], state: null };
    room.seats.push({ socket, name: cleanName(message.name, 'Игрок 1'), wantsRematch: false });
    rooms.set(room.code, room);
    roomOf.set(socket, room);
    broadcastRoom(room);
    return;
  }

  if (message.t === 'join') {
    leaveRoom(socket);
    const room = rooms.get(String(message.code).toUpperCase().trim());
    if (!room) return send(socket, { t: 'error', message: 'Комната не найдена. Проверьте код.' });
    if (room.seats.length >= 2) return send(socket, { t: 'error', message: 'В комнате уже двое игроков.' });
    const fallback = 'Игрок 2';
    let name = cleanName(message.name, fallback);
    if (room.seats.some((seat) => seat.name === name)) name = `${name} (2)`;
    room.seats.push({ socket, name, wantsRematch: false });
    roomOf.set(socket, room);
    broadcastRoom(room);
    return;
  }

  const room = roomOf.get(socket);
  if (!room) return send(socket, { t: 'error', message: 'Вы не в комнате.' });
  const index = room.seats.findIndex((seat) => seat.socket === socket);

  if (message.t === 'leave') return leaveRoom(socket);

  if (message.t === 'start') {
    if (index !== 0) return send(socket, { t: 'error', message: 'Начать игру может только создатель комнаты.' });
    if (room.seats.length < 2) return send(socket, { t: 'error', message: 'Ждём второго игрока.' });
    return startGame(room);
  }

  if (message.t === 'rematch') {
    const seat = room.seats[index];
    if (!seat || room.state?.phase !== 'over') return;
    seat.wantsRematch = true;
    if (room.seats.length === 2 && room.seats.every((s) => s.wantsRematch)) startGame(room);
    return;
  }

  if (message.t === 'action') {
    const state = room.state;
    if (!state) return send(socket, { t: 'error', message: 'Игра ещё не началась.' });
    if (state.current !== index) return send(socket, { t: 'error', message: 'Сейчас не ваш ход.' });
    const result = applyAction(state, message.action, Math.random);
    if (!result.ok) return send(socket, { t: 'error', message: result.error });
    room.state = result.state;
    room.seats.forEach((seat) => send(seat.socket, { t: 'state', state: result.state, events: result.events }));
  }
};

const serveStatic = (urlPath: string, res: import('node:http').ServerResponse): void => {
  const safe = normalize(decodeURIComponent(urlPath.split('?')[0] ?? '/')).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Клиент не собран. Выполните: npm run build');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
};

const server = createServer((req, res) => serveStatic(req.url ?? '/', res));
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      handleMessage(socket, JSON.parse(raw.toString()) as ClientMessage);
    } catch {
      send(socket, { t: 'error', message: 'Некорректное сообщение.' });
    }
  });
  socket.on('close', () => leaveRoom(socket));
  socket.on('error', () => leaveRoom(socket));
});

server.listen(PORT, () => console.log(`Кости: http://localhost:${PORT}`));
