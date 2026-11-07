/** Все звуки синтезируются Web Audio API, поэтому внешние файлы не нужны. */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let ambientTimer: number | null = null;

const MASTER_VOLUME = 0.8;

const ensure = (): AudioContext | null => {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  master.connect(context.destination);
  const length = Math.floor(context.sampleRate * 0.3);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return context;
};

const output = (): { ctx: AudioContext; out: GainNode } | null => {
  const ctx = ensure();
  if (!ctx || !master || muted) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master };
};

const tone = (
  freq: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  endFreq?: number,
): void => {
  const o = output();
  if (!o) return;
  const t = o.ctx.currentTime + start;
  const osc = o.ctx.createOscillator();
  const gain = o.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(o.out);
  osc.start(t);
  osc.stop(t + duration + 0.05);
};

const noiseBurst = (start: number, duration: number, freq: number, q: number, volume: number): void => {
  const o = output();
  if (!o || !noiseBuffer) return;
  const t = o.ctx.currentTime + start;
  const src = o.ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = o.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = o.ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(o.out);
  src.start(t);
  src.stop(t + duration + 0.02);
};

const PENTATONIC = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

const ambientStep = (): void => {
  const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] ?? 220;
  tone(note, 0, 1.6, 0.05, 'triangle');
  tone(note * 2, 0, 0.8, 0.012, 'sine');
  if (Math.random() < 0.3) tone(note * 1.5, 0.35, 1.2, 0.03, 'triangle');
  ambientTimer = window.setTimeout(ambientStep, 1400 + Math.random() * 2600);
};

export const audio = {
  unlock: (): void => {
    ensure();
    if (context?.state === 'suspended') void context.resume();
  },

  /** Удар кубика о стол. `delay` в секундах, `power` от 0 до 1. */
  clack: (delay = 0, power = 1): void => {
    noiseBurst(delay, 0.05, 2200 + Math.random() * 2200, 3, 0.55 * power);
    tone(520 + Math.random() * 260, delay, 0.07, 0.18 * power, 'triangle', 180);
  },
  select: (): void => tone(880, 0, 0.07, 0.12, 'square', 1100),
  deselect: (): void => tone(660, 0, 0.07, 0.1, 'square', 440),
  lock: (): void => {
    tone(160, 0, 0.12, 0.3, 'sine', 80);
    noiseBurst(0, 0.04, 900, 2, 0.3);
  },
  coin: (): void => {
    tone(1318, 0, 0.18, 0.18, 'triangle');
    tone(1760, 0.09, 0.4, 0.18, 'triangle');
    tone(2637, 0.09, 0.3, 0.05, 'sine');
  },
  hot: (): void => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.07, 0.35, 0.14, 'triangle')),
  bust: (): void => {
    tone(220, 0, 0.35, 0.22, 'sawtooth', 110);
    tone(165, 0.25, 0.5, 0.22, 'sawtooth', 70);
    noiseBurst(0, 0.25, 300, 1, 0.25);
  },
  turn: (): void => {
    tone(392, 0, 0.12, 0.1, 'sine');
    tone(523, 0.1, 0.18, 0.1, 'sine');
  },
  win: (): void => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.14, 0.5, 0.2, 'triangle'));
    tone(1046, 0.6, 1.2, 0.2, 'triangle');
    tone(784, 0.6, 1.2, 0.14, 'triangle');
    tone(523, 0.6, 1.2, 0.14, 'triangle');
  },
  lose: (): void => {
    [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.22, 0.6, 0.18, 'triangle'));
  },
  click: (): void => tone(500, 0, 0.05, 0.1, 'square', 700),

  startAmbient: (): void => {
    if (ambientTimer !== null) return;
    ambientTimer = window.setTimeout(ambientStep, 600);
  },
  stopAmbient: (): void => {
    if (ambientTimer !== null) window.clearTimeout(ambientTimer);
    ambientTimer = null;
  },

  isMuted: (): boolean => muted,
  setMuted: (value: boolean): void => {
    muted = value;
    ensure();
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, context.currentTime, 0.02);
  },
};
