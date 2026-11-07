/**
 * Звук без внешних файлов.
 * - Стук кубиков: настоящая запись удара одного кубика о стол (встроена в код). Для шести кубиков запись
 *   «размножается»: каждый кубик играет её со своей скоростью, тембром, фазой и положением в стереопанораме,
 *   а повторные подскоки берут короткие срезы удара. Пока запись декодируется, звучит синтезированный запасной удар.
 * - Музыка: лютня (алгоритм Карплюса — Стронга), дудка, бурдон и бубен играют джигу в ре-дорийском ладу.
 * - Небольшая комната (свёрточная реверберация) склеивает всё в один звук.
 */

import { DICE_SAMPLE_BASE64 } from './sounds/diceSample.ts';

type Bus = GainNode;

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: Bus;
let musicBus: Bus;
let reverb: ConvolverNode;
let noiseBuffer: AudioBuffer;
let hitBuffers: AudioBuffer[] = [];
let coinBuffer: AudioBuffer;
let diceBuffer: AudioBuffer | null = null;
const pluckCache = new Map<number, AudioBuffer>();

/** Громкость от 0 до 1. */
let sfxVolume = 0.8;
let musicVolume = 0.5;
const MUSIC_GAIN = 0.6;

const rand = (): number => Math.random();

/* ---------- инициализация ---------- */

const makeImpulse = (c: AudioContext, seconds: number, decay: number): AudioBuffer => {
  const length = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) data[i] = (rand() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
};

type Mode = { ratio: number; amp: number; decay: number };

/** Удар кубика по деревянному столу: низкий «тук», средние резонансы дерева, сухой щелчок кости. */
const renderHit = (c: AudioContext): AudioBuffer => {
  const sr = c.sampleRate;
  const length = Math.floor(sr * 0.3);
  const buffer = c.createBuffer(1, length, sr);
  const d = buffer.getChannelData(0);
  const f0 = 140 + rand() * 130;
  const modes: Mode[] = [
    { ratio: 1, amp: 1, decay: 0.07 },
    { ratio: 1.58 + rand() * 0.1, amp: 0.55, decay: 0.05 },
    { ratio: 2.31 + rand() * 0.15, amp: 0.38, decay: 0.034 },
    { ratio: 3.12 + rand() * 0.2, amp: 0.24, decay: 0.022 },
    { ratio: 4.7 + rand() * 0.3, amp: 0.14, decay: 0.014 },
    { ratio: 7.1 + rand() * 0.5, amp: 0.08, decay: 0.009 },
  ];
  const phases = modes.map(() => rand() * Math.PI * 2);
  const pingFreq = 2600 + rand() * 1800;
  let prevNoise = 0;
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sr;
    let v = 0;
    modes.forEach((m, k) => {
      v += m.amp * Math.sin(2 * Math.PI * f0 * m.ratio * t + (phases[k] ?? 0)) * Math.exp(-t / m.decay);
    });
    const noise = rand() * 2 - 1;
    const click = (noise - prevNoise) * Math.exp(-t / 0.0022) * 0.9;
    prevNoise = noise;
    const ping = Math.sin(2 * Math.PI * pingFreq * t) * Math.exp(-t / 0.011) * 0.28;
    const attack = Math.min(1, t / 0.0004);
    const sample = (v * 0.55 + click + ping) * attack;
    d[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  for (let i = 0; i < length; i += 1) d[i] = ((d[i] ?? 0) / peak) * 0.9;
  return buffer;
};

const renderCoin = (c: AudioContext): AudioBuffer => {
  const sr = c.sampleRate;
  const length = Math.floor(sr * 1.2);
  const buffer = c.createBuffer(1, length, sr);
  const d = buffer.getChannelData(0);
  const base = 2350;
  const partials = [
    { r: 1, a: 1, t: 0.32 },
    { r: 2.32, a: 0.6, t: 0.22 },
    { r: 4.25, a: 0.35, t: 0.13 },
    { r: 6.63, a: 0.2, t: 0.08 },
  ];
  for (let i = 0; i < length; i += 1) {
    const t = i / sr;
    let v = 0;
    for (const p of partials) v += p.a * Math.sin(2 * Math.PI * base * p.r * t) * Math.exp(-t / p.t);
    // второй «звяк» чуть позже
    const t2 = t - 0.075;
    if (t2 > 0) for (const p of partials) v += 0.7 * p.a * Math.sin(2 * Math.PI * base * 1.06 * p.r * t2) * Math.exp(-t2 / p.t);
    d[i] = v * Math.min(1, t / 0.0006) * 0.28;
  }
  return buffer;
};

const decodeDiceSample = async (c: AudioContext): Promise<void> => {
  try {
    const binary = atob(DICE_SAMPLE_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    diceBuffer = await c.decodeAudioData(bytes.buffer);
  } catch (error) {
    console.warn('Не удалось декодировать звук кубика, используется синтез', error);
  }
};

const ensure = (): AudioContext | null => {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const c = new Ctor();
  ctx = c;
  master = c.createGain();
  master.gain.value = 0.9;
  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 3;
  master.connect(compressor).connect(c.destination);

  sfxBus = c.createGain();
  musicBus = c.createGain();
  sfxBus.gain.value = sfxVolume;
  musicBus.gain.value = MUSIC_GAIN * musicVolume;
  sfxBus.connect(master);
  musicBus.connect(master);

  reverb = c.createConvolver();
  reverb.buffer = makeImpulse(c, 1.6, 2.6);
  const wet = c.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);
  const send = (bus: Bus, amount: number): void => {
    const g = c.createGain();
    g.gain.value = amount;
    bus.connect(g).connect(reverb);
  };
  send(sfxBus, 0.5);
  send(musicBus, 0.8);

  noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nd.length; i += 1) nd[i] = rand() * 2 - 1;

  hitBuffers = Array.from({ length: 8 }, () => renderHit(c));
  coinBuffer = renderCoin(c);
  void decodeDiceSample(c);
  return c;
};

/* ---------- примитивы ---------- */

type PlayOptions = { when?: number; gain?: number; rate?: number; pan?: number; bus?: 'sfx' | 'music' };

const playBuffer = (buffer: AudioBuffer, o: PlayOptions = {}): void => {
  const c = ctx;
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate ?? 1;
  const g = c.createGain();
  g.gain.value = o.gain ?? 1;
  let node: AudioNode = g;
  src.connect(g);
  if (o.pan !== undefined && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    node = p;
  }
  node.connect(o.bus === 'music' ? musicBus : sfxBus);
  src.start(c.currentTime + (o.when ?? 0));
};

type SliceOptions = {
  /** Через сколько секунд начать звук. */
  when?: number;
  /** Откуда в записи брать звук и сколько секунд записи. */
  offset: number;
  duration: number;
  gain: number;
  rate: number;
  pan: number;
  /** Срез частоты фильтра, Гц: чем ниже, тем глуше кубик. */
  lowpass?: number;
};

/** Играет кусок записи удара. Без записи (ещё не декодирована) играет синтезированный удар. */
const playSlice = (o: SliceOptions): void => {
  const c = ctx;
  if (!c) return;
  const buffer = diceBuffer;
  if (!buffer) {
    playBuffer(pickHit(), { when: o.when, gain: Math.abs(o.gain) * 0.8, rate: o.rate, pan: o.pan });
    return;
  }
  const start = c.currentTime + Math.max(0, o.when ?? 0);
  const real = o.duration / o.rate;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate;
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(o.gain, start + 0.002);
  const fade = Math.min(0.03, real * 0.4);
  g.gain.setValueAtTime(o.gain, start + real - fade);
  g.gain.linearRampToValueAtTime(0, start + real);
  let node: AudioNode = src;
  if (o.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lowpass;
    node.connect(lp);
    node = lp;
  }
  node.connect(g);
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, o.pan));
  g.connect(p).connect(sfxBus);
  src.start(start, o.offset, o.duration);
};

/** Положение главного удара в записи, секунды. */
const IMPACT = 0.09;
const SAMPLE_LENGTH = 0.7;
const between = (min: number, max: number): number => min + rand() * (max - min);

const pickHit = (): AudioBuffer => hitBuffers[Math.floor(rand() * hitBuffers.length)] ?? hitBuffers[0]!;

const freqOf = (name: string): number => {
  const semis: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const letter = name.charAt(0);
  const octave = Number(name.slice(1));
  return 440 * 2 ** (((semis[letter] ?? 0) + (octave - 4) * 12) / 12);
};

/** Щипок струны (Карплюс — Стронг) с лёгким затуханием, как у лютни. */
const pluckBuffer = (c: AudioContext, freq: number): AudioBuffer => {
  const key = Math.round(freq * 10);
  const cached = pluckCache.get(key);
  if (cached) return cached;
  const sr = c.sampleRate;
  const period = Math.max(2, Math.round(sr / freq));
  const length = Math.floor(sr * (freq < 140 ? 2.4 : 1.8));
  const buffer = c.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  const line = new Float32Array(period);
  let smooth = 0;
  for (let i = 0; i < period; i += 1) {
    smooth = smooth * 0.55 + (rand() * 2 - 1) * 0.45;
    line[i] = smooth;
  }
  const decay = freq < 140 ? 0.9985 : 0.9962;
  let idx = 0;
  for (let i = 0; i < length; i += 1) {
    const a = line[idx] ?? 0;
    const b = line[(idx + 1) % period] ?? 0;
    out[i] = a;
    line[idx] = (a + b) * 0.5 * decay;
    idx = (idx + 1) % period;
  }
  const fade = Math.floor(sr * 0.15);
  for (let i = 0; i < fade; i += 1) out[length - 1 - i] = (out[length - 1 - i] ?? 0) * (i / fade);
  pluckCache.set(key, buffer);
  return buffer;
};

const lute = (name: string, when: number, gain: number, bus: 'sfx' | 'music' = 'music'): void => {
  const c = ctx;
  if (!c) return;
  const freq = freqOf(name);
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, freq);
  const body = c.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 2600;
  const warmth = c.createBiquadFilter();
  warmth.type = 'peaking';
  warmth.frequency.value = 280;
  warmth.gain.value = 5;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(body).connect(warmth).connect(g).connect(bus === 'music' ? musicBus : sfxBus);
  src.start(c.currentTime + when);
};

const whistle = (name: string, when: number, dur: number, gain: number): void => {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freqOf(name) * 2;
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vibDepth = c.createGain();
  vibDepth.gain.value = 5;
  vib.connect(vibDepth).connect(osc.detune);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
  g.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const breath = c.createBufferSource();
  breath.buffer = noiseBuffer;
  const breathFilter = c.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = freqOf(name) * 2;
  breathFilter.Q.value = 4;
  const breathGain = c.createGain();
  breathGain.gain.value = gain * 0.35;
  breath.connect(breathFilter).connect(breathGain).connect(g);
  osc.connect(g).connect(musicBus);
  for (const node of [osc, vib, breath]) {
    node.start(t);
    node.stop(t + dur + 0.05);
  }
};

const drum = (when: number, velocity: number): void => {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(135, t);
  osc.frequency.exponentialRampToValueAtTime(62, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * velocity, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g).connect(musicBus);
  osc.start(t);
  osc.stop(t + 0.25);
  const skin = c.createBufferSource();
  skin.buffer = noiseBuffer;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.18 * velocity, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  skin.connect(lp).connect(sg).connect(musicBus);
  skin.start(t);
  skin.stop(t + 0.1);
};

/* ---------- музыка: джига в ре-дорийском ладу, 6/8 ---------- */

const EIGHTH = 0.17;
const BAR = 6;

type Bar = { melody: [string, number][]; root: string };

const PART_A: Bar[] = [
  { root: 'D3', melody: [['D4', 1], ['F4', 1], ['A4', 1], ['D5', 2], ['A4', 1]] },
  { root: 'D3', melody: [['C5', 1], ['A4', 1], ['F4', 1], ['A4', 2], ['F4', 1]] },
  { root: 'C3', melody: [['E4', 1], ['G4', 1], ['C5', 1], ['E5', 2], ['C5', 1]] },
  { root: 'C3', melody: [['D5', 1], ['C5', 1], ['A4', 1], ['G4', 3]] },
  { root: 'D3', melody: [['D4', 1], ['F4', 1], ['A4', 1], ['D5', 2], ['F5', 1]] },
  { root: 'A2', melody: [['E5', 1], ['C5', 1], ['A4', 1], ['C5', 2], ['A4', 1]] },
  { root: 'C3', melody: [['G4', 1], ['C5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['G4', 1]] },
  { root: 'D3', melody: [['A4', 1], ['F4', 1], ['D4', 1], ['D4', 3]] },
];

const PART_B: Bar[] = [
  { root: 'F3', melody: [['F4', 1], ['A4', 1], ['C5', 1], ['F5', 2], ['C5', 1]] },
  { root: 'C3', melody: [['E5', 1], ['D5', 1], ['C5', 1], ['G4', 2], ['E4', 1]] },
  { root: 'D3', melody: [['F4', 1], ['A4', 1], ['D5', 1], ['F5', 2], ['D5', 1]] },
  { root: 'A2', melody: [['E5', 1], ['C5', 1], ['A4', 1], ['E4', 3]] },
  { root: 'F3', melody: [['A4', 1], ['C5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1]] },
  { root: 'C3', melody: [['G4', 1], ['C5', 1], ['E5', 1], ['E5', 2], ['C5', 1]] },
  { root: 'D3', melody: [['D5', 1], ['C5', 1], ['A4', 1], ['F4', 1], ['A4', 1], ['C5', 1]] },
  { root: 'D3', melody: [['D4', 1], ['F4', 1], ['A4', 1], ['D5', 3]] },
];

type MusicEvent = { at: number; play: (when: number) => void };

const fifthOf = (root: string): string => {
  const order = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const letter = root.charAt(0);
  const octave = Number(root.slice(1));
  const index = order.indexOf(letter) + 4;
  return `${order[index % 7]}${octave + (index >= 7 ? 1 : 0)}`;
};

const buildLoop = (): { events: MusicEvent[]; length: number } => {
  const events: MusicEvent[] = [];
  const sections = [PART_A, PART_A, PART_B, PART_B];
  let bar = 0;
  sections.forEach((part, section) => {
    const doubled = section % 2 === 1;
    for (const b of part) {
      const start = bar * BAR;
      let step = 0;
      for (const [note, len] of b.melody) {
        const at = start + step;
        events.push({ at, play: (w) => lute(note, w, 0.3) });
        if (doubled) events.push({ at, play: (w) => whistle(note, w, len * EIGHTH * 0.95, 0.07) });
        step += len;
      }
      events.push({ at: start, play: (w) => lute(b.root, w, 0.34) });
      events.push({ at: start + 3, play: (w) => lute(fifthOf(b.root), w, 0.2) });
      [[0, 1], [2, 0.35], [3, 0.65], [5, 0.3]].forEach(([offset, velocity]) => {
        events.push({ at: start + (offset ?? 0), play: (w) => drum(w, velocity ?? 0.5) });
      });
      bar += 1;
    }
  });
  events.sort((a, b) => a.at - b.at);
  return { events, length: bar * BAR };
};

let loop: ReturnType<typeof buildLoop> | null = null;
let schedulerTimer: number | null = null;
let loopBase = 0;
let eventIndex = 0;
let droneNodes: { stop: () => void } | null = null;

const startDrone = (c: AudioContext): void => {
  const g = c.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.05, c.currentTime + 3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 340;
  lp.Q.value = 2;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(lp.frequency);
  const oscs = [73.42, 110, 146.83].map((f, i) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 6;
    o.connect(lp);
    o.start();
    return o;
  });
  lp.connect(g).connect(musicBus);
  lfo.start();
  droneNodes = {
    stop: () => {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
      for (const o of [...oscs, lfo]) o.stop(c.currentTime + 0.5);
    },
  };
};

const schedulerTick = (): void => {
  const c = ctx;
  if (!c || !loop) return;
  const horizon = c.currentTime + 0.4;
  for (;;) {
    const ev = loop.events[eventIndex];
    if (!ev) {
      loopBase += loop.length * EIGHTH;
      eventIndex = 0;
      continue;
    }
    const time = loopBase + ev.at * EIGHTH;
    if (time > horizon) return;
    if (time >= c.currentTime - 0.02) ev.play(Math.max(0, time - c.currentTime));
    eventIndex += 1;
  }
};

const startMusic = (): void => {
  const c = ensure();
  if (!c || musicVolume <= 0 || schedulerTimer !== null) return;
  loop ??= buildLoop();
  loopBase = c.currentTime + 0.6;
  eventIndex = 0;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setTargetAtTime(MUSIC_GAIN * musicVolume, c.currentTime, 0.3);
  startDrone(c);
  schedulerTimer = window.setInterval(schedulerTick, 40);
};

const stopMusic = (): void => {
  if (schedulerTimer !== null) window.clearInterval(schedulerTimer);
  schedulerTimer = null;
  droneNodes?.stop();
  droneNodes = null;
  if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
};

/* ---------- публичный интерфейс ---------- */

const sfx = (fn: () => void): void => {
  if (sfxVolume <= 0 || !ensure()) return;
  if (ctx?.state === 'suspended') void ctx.resume();
  fn();
};

export const audio = {
  unlock: (): void => {
    if (!ensure()) return;
    if (ctx?.state === 'suspended') void ctx.resume();
    if (musicVolume > 0) startMusic();
  },

  /**
   * Удар кубика о стол. `delay` — через сколько секунд кубик ударится, `kind`: 0 — первый удар (вся запись),
   * 1 — второй подскок, 2 — последний тихий стук. `crowd` — сколько кубиков стучит одновременно, чтобы общий звук не раздувался.
   */
  clack: (delay = 0, kind: 0 | 1 | 2 = 0, pan = 0, crowd = 1): void =>
    sfx(() => {
      const trim = 1 / (1 + 0.2 * (crowd - 1));
      const flip = rand() < 0.5 ? -1 : 1;
      if (kind === 0) {
        const rate = between(0.88, 1.12);
        const skip = 0.05;
        playSlice({
          when: delay - (IMPACT - skip) / rate,
          offset: skip,
          duration: SAMPLE_LENGTH - skip,
          gain: flip * 0.95 * trim,
          rate,
          pan,
          lowpass: between(5500, 14000),
        });
      } else if (kind === 1) {
        const rate = between(1.05, 1.25);
        playSlice({ when: delay, offset: IMPACT - 0.012, duration: 0.2, gain: flip * 0.5 * trim, rate, pan, lowpass: between(4500, 9000) });
      } else {
        const rate = between(1.2, 1.5);
        playSlice({ when: delay, offset: IMPACT - 0.012, duration: 0.11, gain: flip * 0.28 * trim, rate, pan, lowpass: between(4000, 7500) });
      }
    }),

  /** Кубики гремят в руке перед броском: россыпь коротких тихих срезов из «хвоста» записи. */
  rattle: (count = 6): void =>
    sfx(() => {
      const n = count * 3;
      for (let i = 0; i < n; i += 1) {
        playSlice({
          when: (i / n) * 0.34 + rand() * 0.02,
          offset: between(0.16, 0.5),
          duration: between(0.04, 0.08),
          gain: between(0.06, 0.16),
          rate: between(1.1, 1.55),
          pan: between(-0.6, 0.6),
          lowpass: between(5000, 11000),
        });
      }
    }),

  /** Короткий стук для интерфейса. */
  select: (): void => sfx(() => playSlice({ offset: IMPACT - 0.012, duration: 0.09, gain: 0.34, rate: 1.55, pan: 0, lowpass: 7000 })),
  deselect: (): void => sfx(() => playSlice({ offset: IMPACT - 0.012, duration: 0.09, gain: 0.22, rate: 1.3, pan: 0, lowpass: 6000 })),
  lock: (): void => sfx(() => playSlice({ offset: IMPACT - 0.012, duration: 0.16, gain: 0.5, rate: 0.85, pan: 0, lowpass: 5000 })),
  click: (): void => sfx(() => playSlice({ offset: IMPACT - 0.012, duration: 0.06, gain: 0.16, rate: 2, pan: 0, lowpass: 8000 })),
  coin: (): void => sfx(() => playBuffer(coinBuffer, { gain: 0.9 })),

  turn: (): void => sfx(() => lute('A4', 0, 0.16, 'sfx')),

  hot: (): void =>
    sfx(() => {
      ['D4', 'F4', 'A4', 'D5', 'F5'].forEach((n, i) => lute(n, i * 0.07, 0.22, 'sfx'));
      playBuffer(coinBuffer, { when: 0.3, gain: 0.5, rate: 1.1 });
    }),

  bust: (): void =>
    sfx(() => {
      drum(0, 1.2);
      lute('D3', 0.02, 0.4, 'sfx');
      lute('E3', 0.02, 0.3, 'sfx');
    }),

  win: (): void =>
    sfx(() => {
      ['D4', 'A4', 'D5', 'F5', 'A5'].forEach((n, i) => lute(n, i * 0.11, 0.25, 'sfx'));
      ['D4', 'F4', 'A4', 'D5'].forEach((n) => lute(n, 0.7, 0.22, 'sfx'));
      drum(0.7, 1);
    }),

  lose: (): void =>
    sfx(() => {
      ['A4', 'F4', 'E4', 'D4'].forEach((n, i) => lute(n, i * 0.24, 0.24, 'sfx'));
      drum(0.75, 0.8);
    }),

  getSfxVolume: (): number => sfxVolume,
  getMusicVolume: (): number => musicVolume,

  /** Громкость эффектов, 0–1. */
  setSfxVolume: (value: number): void => {
    sfxVolume = Math.max(0, Math.min(1, value));
    if (ctx) sfxBus.gain.setTargetAtTime(sfxVolume, ctx.currentTime, 0.02);
  },

  /** Громкость музыки, 0–1. При нуле музыка полностью останавливается. */
  setMusicVolume: (value: number): void => {
    musicVolume = Math.max(0, Math.min(1, value));
    if (musicVolume <= 0) {
      stopMusic();
      return;
    }
    if (schedulerTimer !== null && ctx) musicBus.gain.setTargetAtTime(MUSIC_GAIN * musicVolume, ctx.currentTime, 0.05);
    else startMusic();
  },
};
