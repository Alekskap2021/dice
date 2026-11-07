import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { audio } from './audio.ts';

/** За сколько секунд до касания стола запускается звук удара: у записи есть короткий разбег. */
const CLACK_LEAD = 0.06;

const DICE = 6;
const HALF = 0.5;
const FREE_Z = -0.3;
const LOCKED_Z = 3.05;
const SPACING = 1.32;

/** Порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z. Противоположные грани дают в сумме 7. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5] as const;
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]],
};

const faceTexture = (value: number): THREE.CanvasTexture => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas 2d недоступен');
  const bg = g.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.75);
  bg.addColorStop(0, '#f1e4c3');
  bg.addColorStop(1, '#d4bf8f');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i += 1) {
    g.fillStyle = `rgba(110,80,40,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  for (const [x, y] of PIPS[value] ?? []) {
    const r = value === 1 ? size * 0.12 : size * 0.075;
    const pip = g.createRadialGradient(x * size - 3, y * size - 3, 2, x * size, y * size, r);
    pip.addColorStop(0, value === 1 ? '#a32d1f' : '#4a2f1b');
    pip.addColorStop(1, value === 1 ? '#5e1209' : '#1f1209');
    g.fillStyle = pip;
    g.beginPath();
    g.arc(x * size, y * size, r, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const woodTexture = (): THREE.CanvasTexture => {
  const w = 1024;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas 2d недоступен');
  g.fillStyle = '#4a2e1a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i += 1) {
    const y = Math.random() * h;
    g.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},5,${0.1 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

const feltTexture = (): THREE.CanvasTexture => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas 2d недоступен');
  g.fillStyle = '#2f4a32';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

type Die = {
  mesh: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  value: number;
  locked: boolean;
  selected: boolean;
  homeX: number;
  baseY: number;
  anim: { update: (now: number) => boolean } | null;
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const quaternionForValue = (value: number, yaw: number): THREE.Quaternion => {
  const faceIndex = FACE_VALUES.indexOf(value as (typeof FACE_VALUES)[number]);
  const normal = FACE_NORMALS[faceIndex] ?? FACE_NORMALS[2]!;
  const up = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 1, 0));
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return spin.multiply(up);
};

export type DiceTable = {
  /** Мгновенно расставить кубики в исходное положение. */
  reset: (values: number[], locked: boolean[]) => void;
  /** Бросить кубики с указанными индексами; значения уже решены сервером. */
  throwDice: (indices: number[], values: number[]) => Promise<void>;
  /** Отложить кубики в сторону — они дали очки. */
  lockDice: (indices: number[]) => Promise<void>;
  /** Вернуть все кубики в центр. */
  gather: () => Promise<void>;
  /** Встряска при болте. */
  shake: () => Promise<void>;
  /** Замедляет время на сцене: `scale` от 0 до 1 на `ms` миллисекунд, затем плавно возвращает. */
  slowMo: (scale: number, ms: number) => void;
  /** Трясёт камеру: `amount` — размах в единицах сцены. */
  shakeCamera: (amount: number, ms: number) => void;
  setSelected: (selected: ReadonlySet<number>) => void;
  setPickable: (indices: ReadonlySet<number>, cb: (index: number) => void) => void;
  dispose: () => void;
};

export const createDiceTable = (container: HTMLElement): DiceTable => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x120b06, 14, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const camBase = new THREE.Vector3();

  scene.add(new THREE.HemisphereLight(0xffe2b0, 0x2a170c, 0.55));
  const key = new THREE.DirectionalLight(0xffd9a0, 1.4);
  key.position.set(-4, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const candle = new THREE.PointLight(0xff9a3c, 22, 14, 1.6);
  candle.position.set(5.5, 3.5, -2);
  scene.add(candle);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.4;
  table.receiveShadow = true;
  scene.add(table);

  const felt = new THREE.Mesh(
    new THREE.BoxGeometry(11.5, 0.3, 8.4),
    new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 1 }),
  );
  felt.position.set(0, -0.25, 1.3);
  felt.receiveShadow = true;
  scene.add(felt);

  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2314, roughness: 0.7 });
  const addRim = (w: number, d: number, x: number, z: number): void => {
    const rim = new THREE.Mesh(new RoundedBoxGeometry(w, 0.7, d, 3, 0.1), rimMaterial);
    rim.position.set(x, -0.05, z);
    rim.castShadow = true;
    rim.receiveShadow = true;
    scene.add(rim);
  };
  addRim(12.5, 0.5, 0, -3.15);
  addRim(12.5, 0.5, 0, 5.75);
  addRim(0.5, 9.4, -6.0, 1.3);
  addRim(0.5, 9.4, 6.0, 1.3);

  const geometry = new RoundedBoxGeometry(1, 1, 1, 5, 0.14);
  const textures = [1, 2, 3, 4, 5, 6].map(faceTexture);
  const dice: Die[] = Array.from({ length: DICE }, (_, i) => {
    const materials = FACE_VALUES.map(
      (value) =>
        new THREE.MeshStandardMaterial({
          map: textures[value - 1],
          roughness: 0.38,
          metalness: 0.02,
          emissive: new THREE.Color(0xffb020),
          emissiveIntensity: 0,
        }),
    );
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const homeX = (i - (DICE - 1) / 2) * SPACING;
    mesh.position.set(homeX, HALF, FREE_Z);
    mesh.quaternion.copy(quaternionForValue(1, 0));
    scene.add(mesh);
    return { mesh, materials, value: 1, locked: false, selected: false, homeX, baseY: HALF, anim: null };
  });

  const restPosition = (die: Die): THREE.Vector3 =>
    new THREE.Vector3(die.homeX, die.baseY + (die.selected ? 0.38 : 0), die.locked ? LOCKED_Z : FREE_Z);

  const resize = (): void => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Камера отъезжает, пока стол не поместится по ширине (важно для вертикальных экранов).
    const halfWidth = 5.4;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(15.5, halfWidth / (tanHalfFov * camera.aspect));
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = distance * 0.9;
      scene.fog.far = distance * 2.2;
    }
    camBase.set(0, distance * 0.78, 1.3 + distance * 0.66);
    camera.position.copy(camBase);
    camera.lookAt(0, 0, 1.3);
    camera.updateProjectionMatrix();
  };
  // Собственные часы сцены: умеют замедляться. Все анимации и звуки бросков идут по ним.
  let clock = 0;
  let timeScale = 1;
  let slowUntil = 0;
  const SLOW_EASE_MS = 250;
  let cameraShake: { amount: number; start: number; ms: number } | null = null;
  const timers: { at: number; run: () => void }[] = [];
  const schedule = (seconds: number, run: () => void): void => {
    timers.push({ at: clock + seconds * 1000, run });
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const runAnimation = (die: Die, update: (progress: number) => void, duration: number, delay = 0): Promise<void> =>
    new Promise((resolve) => {
      const start = clock + delay * 1000;
      die.anim = {
        update: (now) => {
          if (now < start) return true;
          const t = Math.min(1, (now - start) / (duration * 1000));
          update(t);
          if (t >= 1) {
            die.anim = null;
            resolve();
            return false;
          }
          return true;
        },
      };
    });

  const throwDice = async (indices: number[], values: number[]): Promise<void> => {
    audio.rattle(indices.length);
    const jobs = indices.map((index, order) => {
      const die = dice[index];
      const value = values[order] ?? 1;
      if (!die) return Promise.resolve();
      die.locked = false;
      die.selected = false;
      die.value = value;
      for (const m of die.materials) m.emissiveIntensity = 0;

      const finalQuat = quaternionForValue(value, Math.random() * Math.PI * 2);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const turns = 2.5 + Math.random() * 2.5;
      const from = new THREE.Vector3(die.homeX * 0.5 + 5 + Math.random() * 2, 0, 7 + Math.random() * 2);
      const to = new THREE.Vector3(die.homeX + (Math.random() - 0.5) * 0.25, 0, FREE_Z + (Math.random() - 0.5) * 0.9);
      const duration = 1.05 + Math.random() * 0.35;
      const height = 3.2 + Math.random() * 1.6;
      const bounces = 2.5;
      const delay = order * 0.05;

      const pan = die.homeX / 6;
      const crowd = indices.length;
      [0.2, 0.6, 1].forEach((fraction, k) =>
        schedule(Math.max(0, delay + duration * fraction - CLACK_LEAD), () =>
          audio.clack(CLACK_LEAD, k === 0 ? 0 : k === 1 ? 1 : 2, pan, crowd),
        ),
      );

      const spinQuat = new THREE.Quaternion();
      return runAnimation(
        die,
        (t) => {
          const move = easeOutCubic(t);
          const y = HALF + height * (1 - t) ** 1.6 * Math.abs(Math.cos(Math.PI * bounces * t));
          die.mesh.position.set(
            from.x + (to.x - from.x) * move,
            y,
            from.z + (to.z - from.z) * move,
          );
          spinQuat.setFromAxisAngle(axis, (1 - easeOutCubic(t)) * turns * Math.PI * 2);
          die.mesh.quaternion.copy(spinQuat).multiply(finalQuat);
        },
        duration,
        delay,
      );
    });
    await Promise.all(jobs);
    for (const index of indices) {
      const die = dice[index];
      if (die) die.mesh.position.copy(restPosition(die));
    }
  };

  const moveTo = (die: Die, target: THREE.Vector3, duration: number, hop: number, delay = 0): Promise<void> => {
    const from = die.mesh.position.clone();
    return runAnimation(
      die,
      (t) => {
        const k = easeInOut(t);
        die.mesh.position.set(
          from.x + (target.x - from.x) * k,
          from.y + (target.y - from.y) * k + Math.sin(Math.PI * t) * hop,
          from.z + (target.z - from.z) * k,
        );
      },
      duration,
      delay,
    );
  };

  const lockDice = async (indices: number[]): Promise<void> => {
    const jobs = indices.map((index, order) => {
      const die = dice[index];
      if (!die) return Promise.resolve();
      die.locked = true;
      die.selected = false;
      for (const m of die.materials) m.emissiveIntensity = 0;
      schedule(0.3 + order * 0.07, () => audio.lock());
      return moveTo(die, restPosition(die), 0.38, 0.9, order * 0.07);
    });
    await Promise.all(jobs);
  };

  const gather = async (): Promise<void> => {
    const jobs = dice.map((die, order) => {
      die.locked = false;
      die.selected = false;
      for (const m of die.materials) m.emissiveIntensity = 0;
      return moveTo(die, restPosition(die), 0.4, 0.5, order * 0.03);
    });
    await Promise.all(jobs);
  };

  const shake = async (): Promise<void> => {
    await Promise.all(
      dice.map((die) => {
        const base = die.mesh.position.clone();
        return runAnimation(
          die,
          (t) => {
            die.mesh.position.x = base.x + Math.sin(t * Math.PI * 10) * 0.12 * (1 - t);
            for (const m of die.materials) m.emissive.setHex(0xff2a10);
            for (const m of die.materials) m.emissiveIntensity = 0.45 * (1 - t);
            if (t >= 1) for (const m of die.materials) m.emissive.setHex(0xffb020);
          },
          0.5,
        );
      }),
    );
  };

  const reset = (values: number[], locked: boolean[]): void => {
    dice.forEach((die, index) => {
      die.anim = null;
      die.value = values[index] ?? 1;
      die.locked = locked[index] ?? false;
      die.selected = false;
      for (const m of die.materials) m.emissiveIntensity = 0;
      die.mesh.position.copy(restPosition(die));
      die.mesh.quaternion.copy(quaternionForValue(die.value, ((index * 1.7) % 1) * 0.6 - 0.3));
    });
  };

  const setSelected = (selected: ReadonlySet<number>): void => {
    dice.forEach((die, index) => {
      const next = selected.has(index);
      if (next === die.selected) return;
      die.selected = next;
      for (const m of die.materials) m.emissiveIntensity = next ? 0.35 : 0;
      if (die.anim === null) {
        void moveTo(die, restPosition(die), 0.14, 0.12);
      }
    });
  };

  // выбор кубиков кликом
  let pickable: ReadonlySet<number> = new Set();
  let onPick: (index: number) => void = () => undefined;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitIndex = (event: PointerEvent): number => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(dice.map((d) => d.mesh), false);
    const mesh = hits[0]?.object;
    return dice.findIndex((d) => d.mesh === mesh);
  };
  const handleClick = (event: PointerEvent): void => {
    const index = hitIndex(event);
    if (index >= 0 && pickable.has(index)) onPick(index);
  };
  const handleMove = (event: PointerEvent): void => {
    const index = hitIndex(event);
    renderer.domElement.style.cursor = index >= 0 && pickable.has(index) ? 'pointer' : 'default';
  };
  renderer.domElement.addEventListener('pointerdown', handleClick);
  renderer.domElement.addEventListener('pointermove', handleMove);

  const slowMo = (scale: number, ms: number): void => {
    timeScale = scale;
    slowUntil = performance.now() + ms;
  };
  const shakeCamera = (amount: number, ms: number): void => {
    cameraShake = { amount, start: performance.now(), ms };
  };

  let frame = 0;
  let lastFrame = 0;
  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop);
    const dt = lastFrame === 0 ? 16 : Math.min(100, now - lastFrame);
    lastFrame = now;
    if (timeScale < 1) {
      const over = now - slowUntil;
      timeScale = over <= 0 ? timeScale : Math.min(1, timeScale + (1 - timeScale) * Math.min(1, over / SLOW_EASE_MS));
      if (over > SLOW_EASE_MS) timeScale = 1;
    }
    clock += dt * timeScale;
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      const timer = timers[i];
      if (timer && timer.at <= clock) {
        timers.splice(i, 1);
        timer.run();
      }
    }
    for (const die of dice) die.anim?.update(clock);
    if (cameraShake) {
      const progress = (now - cameraShake.start) / cameraShake.ms;
      if (progress >= 1) {
        cameraShake = null;
        camera.position.copy(camBase);
      } else {
        const amp = cameraShake.amount * (1 - progress) ** 2;
        camera.position.set(camBase.x + (Math.random() - 0.5) * amp * 2, camBase.y + (Math.random() - 0.5) * amp, camBase.z);
      }
    }
    candle.intensity = 22 + Math.sin(now * 0.011) * 2 + Math.sin(now * 0.027) * 1.5;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return {
    reset,
    throwDice,
    lockDice,
    gather,
    shake,
    slowMo,
    shakeCamera,
    setSelected,
    setPickable: (indices, cb) => {
      pickable = indices;
      onPick = cb;
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handleClick);
      renderer.domElement.removeEventListener('pointermove', handleMove);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
