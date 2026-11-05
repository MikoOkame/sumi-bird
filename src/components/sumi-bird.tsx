import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type {
  AnimationAction,
  AnimationMixer,
  Material,
  Mesh,
  Object3D,
} from "three";

const CLIP_LABEL: Record<string, string> = {
  idle: "待機",
  takeoff: "飛び立ち",
  flying: "飛行",
  glide: "滑空",
  landing: "着地",
  hop: "跳ね",
  hop_big: "大跳ね",
  hover: "停空",
  turn_L: "左旋回",
  turn_R: "右旋回",
  dive_in: "急降下・入",
  dive: "急降下",
  peck: "ついばみ",
  sit_in: "腰を下ろす",
  sit: "座る",
  sit_out: "立ち上がる",
  stretch: "伸び",
  preen: "羽繕い",
  peer_in: "覗き込み",
  peer: "覗く",
  peer_out: "覗き終わり",
  alert_in: "警戒・入",
  alert: "警戒",
  alert_out: "警戒・出",
  sing: "さえずり",
  sing_hop: "鳴いて跳ね",
  walk: "歩き",
  struggle: "もがき",
};

const INK_VERT = /* glsl */ `
#include <skinning_pars_vertex>
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * objectNormal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const INK_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 n = normalize(vNormal);
  float ndotl = max(dot(n, uLightDir), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 2.5);
  float wash = smoothstep(0.15, 0.75, ndotl);
  float blotch = fbm(vWorldPos * 3.5 + vec3(uTime * 0.04, 1.7, 0.2));
  float grain = fbm(vWorldPos * 18.0);
  float dry = smoothstep(0.4, 0.7, fbm(vWorldPos * 6.0));
  float ink = wash * 0.75 + blotch * 0.18 + rim * 0.25;
  ink = clamp(ink, 0.0, 1.0);
  ink = mix(ink, ink * (0.85 + grain * 0.3), 0.6);
  ink *= mix(1.0, 0.7, dry * 0.4);
  vec3 paper = vec3(0.93, 0.89, 0.82);
  vec3 inkCol = vec3(0.08, 0.07, 0.06);
  vec3 mid = vec3(0.35, 0.32, 0.28);
  vec3 col = mix(paper, mid, ink * 0.6);
  col = mix(col, inkCol, smoothstep(0.45, 0.85, ink));
  float edge = smoothstep(0.55, 0.95, rim);
  col = mix(col, inkCol * 0.7, edge * 0.35);
  col += fbm(vWorldPos * 40.0) * 0.04;
  gl_FragColor = vec4(col, 1.0);
}
`;

type ViewerHandle = {
  play: (name: string) => void;
  setInk: (ink: boolean) => void;
  resetView: () => void;
  dispose: () => void;
};

function labelOf(name: string) {
  return CLIP_LABEL[name] ?? name;
}

export function SumiBird() {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewerHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [clips, setClips] = useState<string[]>([]);
  const [active, setActive] = useState("idle");
  const [ink, setInk] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let dead = false;
    let handle: ViewerHandle | null = null;
    const abort = new AbortController();
    setStatus("loading");

    void (async () => {
      try {
        const next = await mountViewer(
          mount,
          (names) => {
            if (dead) return;
            setClips(names);
            setActive((cur) => (names.includes(cur) ? cur : (names[0] ?? cur)));
            setStatus("ready");
          },
          () => dead,
          abort.signal,
        );
        if (!next || dead) {
          next?.dispose();
          return;
        }
        handle = next;
        apiRef.current = next;
      } catch (err) {
        if (dead) return;
        console.error(err);
        setStatus("error");
      }
    })();

    return () => {
      dead = true;
      abort.abort();
      handle?.dispose();
      apiRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (status !== "ready") return;
    apiRef.current?.play(active);
    const row = scrollerRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-clip="${CSS.escape(active)}"]`);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active, status]);

  useEffect(() => {
    if (status !== "ready") return;
    apiRef.current?.setInk(ink);
  }, [ink, status]);

  function step(dir: -1 | 1) {
    if (clips.length === 0) return;
    const i = Math.max(0, clips.indexOf(active));
    const next = clips[(i + dir + clips.length) % clips.length];
    if (next) setActive(next);
  }

  return (
    <main className="relative h-dvh overflow-hidden bg-paper text-ink">
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center border-2 border-seal font-display text-lg font-bold text-seal"
        >
          鳥
        </span>
        <div className="min-w-0 pt-0.5">
          <h1 className="font-display text-2xl leading-none font-bold tracking-wide">墨鳥</h1>
          <p className="mt-1.5 text-sm leading-snug text-wash">
            ドラッグで回す · ピンチで寄る
          </p>
        </div>
      </header>

      {status !== "ready" && (
        <div className="absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <p className="font-display text-lg text-wash">
            {status === "loading" ? "墨をすっています" : "読み込めませんでした"}
          </p>
          {status === "error" && (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="h-11 border border-ink bg-ink px-4 text-sm text-paper"
            >
              もう一度
            </button>
          )}
        </div>
      )}

      <footer className="absolute inset-x-0 bottom-0 border-t border-ink/15 bg-paper px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="flex h-11 shrink-0 border border-ink/20" role="group" aria-label="描き方">
            <button
              type="button"
              aria-pressed={ink}
              onClick={() => setInk(true)}
              className={
                "px-3 text-sm " + (ink ? "bg-ink text-paper" : "bg-paper text-ink")
              }
            >
              墨
            </button>
            <button
              type="button"
              aria-pressed={!ink}
              onClick={() => setInk(false)}
              className={
                "border-l border-ink/20 px-3 text-sm " +
                (!ink ? "bg-ink text-paper" : "bg-paper text-ink")
              }
            >
              素体
            </button>
          </div>

          <p className="min-w-0 flex-1 truncate text-center font-display text-lg leading-none">
            {labelOf(active)}
          </p>

          <button
            type="button"
            onClick={() => apiRef.current?.resetView()}
            className="grid size-11 shrink-0 place-items-center border border-ink/20 bg-chip"
            aria-label="視点を戻す"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={clips.length === 0}
            className="grid size-11 shrink-0 place-items-center border border-ink/20 bg-chip disabled:opacity-40"
            aria-label="前の動き"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </button>
          <div
            ref={scrollerRef}
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
            role="tablist"
            aria-label="動き"
          >
            {clips.map((name) => {
              const on = name === active;
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  data-clip={name}
                  aria-selected={on}
                  onClick={() => setActive(name)}
                  className={
                    "h-11 shrink-0 px-3 text-sm whitespace-nowrap " +
                    (on ? "bg-ink text-paper" : "bg-chip text-ink")
                  }
                >
                  {labelOf(name)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={clips.length === 0}
            className="grid size-11 shrink-0 place-items-center border border-ink/20 bg-chip disabled:opacity-40"
            aria-label="次の動き"
          >
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </footer>
    </main>
  );
}

async function mountViewer(
  mount: HTMLDivElement,
  onReady: (clips: string[]) => void,
  isCancelled: () => boolean,
  signal: AbortSignal,
): Promise<ViewerHandle | null> {
  const THREE = await import("three");
  if (isCancelled()) return null;
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  if (isCancelled()) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e0d0);
  scene.fog = new THREE.Fog(0xe8e0d0, 7, 16);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
  const homePos = new THREE.Vector3(1.7, 1.05, 2.35);
  const homeTarget = new THREE.Vector3(0, 0.72, 0);
  camera.position.copy(homePos);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 500 ? 1.5 : 2));
  renderer.setClearColor(0xe8e0d0, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(homeTarget);
  controls.minDistance = 0.7;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.92;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0xddd4c4 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const enso = ensoTexture(THREE);
  const ensoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({
      map: enso,
      transparent: true,
      depthWrite: false,
    }),
  );
  ensoMesh.rotation.x = -Math.PI / 2;
  ensoMesh.position.y = 0.002;
  scene.add(ensoMesh);

  const inkMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0.35, 0.85, 0.4).normalize() },
    },
    vertexShader: INK_VERT,
    fragmentShader: INK_FRAG,
    side: THREE.DoubleSide,
  });
  const clayMat = new THREE.MeshStandardMaterial({
    color: 0xc8bfb0,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  scene.add(new THREE.AmbientLight(0xfff6ea, 0.65));
  const key = new THREE.DirectionalLight(0xfff8ee, 1.15);
  key.position.set(2.2, 4.2, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd9e2ea, 0.35);
  fill.position.set(-2.5, 1.6, -1.4);
  scene.add(fill);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mixer: AnimationMixer | null = null;
  const actions = new Map<string, AnimationAction>();
  let current: AnimationAction | null = null;
  let useInk = true;
  const skinned: Mesh[] = [];
  let raf = 0;
  let disposed = false;
  const observer = new ResizeObserver(() => resize());

  function resize() {
    const w = mount.clientWidth || window.innerWidth || 1;
    const h = mount.clientHeight || window.innerHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.dispose();
    inkMat.dispose();
    clayMat.dispose();
    enso.dispose();
    ground.geometry.dispose();
    (ground.material as Material).dispose();
    ensoMesh.geometry.dispose();
    (ensoMesh.material as Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  resize();
  observer.observe(mount);
  renderer.render(scene, camera);

  try {
    const buf = await fetchModel(signal);
    if (isCancelled()) {
      dispose();
      return null;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, modelBase());
    if (isCancelled()) {
      dispose();
      return null;
    }

    const model = gltf.scene;
    model.traverse((child: Object3D) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      skinned.push(mesh);
      mesh.material = clayMat;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });

    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
    model.scale.setScalar(1.7 / maxDim);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const grounded = new THREE.Box3().setFromObject(model);
    model.position.y -= grounded.min.y;
    scene.add(model);

    mixer = new THREE.AnimationMixer(model);
    const names = gltf.animations.map((clip) => clip.name);
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      actions.set(clip.name, action);
    }

    const idle = actions.get("idle") ?? actions.values().next().value;
    if (idle) {
      idle.play();
      current = idle;
    }
    renderer.render(scene, camera);
    onReady(names);

    await new Promise((resolve) => setTimeout(resolve, 32));
    if (isCancelled()) {
      dispose();
      return null;
    }

    try {
      for (const mesh of skinned) mesh.material = inkMat;
      renderer.render(scene, camera);
    } catch (err) {
      console.error(err);
      useInk = false;
      for (const mesh of skinned) mesh.material = clayMat;
    }

    let last = performance.now();
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (document.hidden) return;
      if (!reduceMotion && useInk) inkMat.uniforms.uTime.value += dt;
      mixer?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    }
    frame(performance.now());

    return {
      play(name: string) {
        const next = actions.get(name);
        if (!next || next === current) return;
        if (current) current.fadeOut(0.28);
        next.reset().fadeIn(0.28).play();
        current = next;
      },
      setInk(nextInk: boolean) {
        if (useInk === nextInk) return;
        useInk = nextInk;
        const mat = nextInk ? inkMat : clayMat;
        for (const mesh of skinned) mesh.material = mat;
      },
      resetView() {
        camera.position.copy(homePos);
        controls.target.copy(homeTarget);
        controls.update();
      },
      dispose,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}

function modelBase(): string {
  const match = window.location.pathname.match(/^(\/hds-[a-z0-9]+-\d+-[a-z0-9]+)/i);
  return match ? `${match[1]}/` : "/";
}

function modelUrls(): string[] {
  const urls = new Set<string>();
  const base = modelBase();
  urls.add(`${base}bird.glb`);
  urls.add("/bird.glb");
  urls.add(new URL("bird.glb", window.location.href).pathname);
  return [...urls];
}

async function fetchModel(parent: AbortSignal): Promise<ArrayBuffer> {
  let last: unknown = new Error("モデルを取得できません");
  for (const url of modelUrls()) {
    if (parent.aborted) throw new DOMException("aborted", "AbortError");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 8000);
    const onAbort = () => timeout.abort();
    parent.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, { signal: timeout.signal });
      if (!res.ok) {
        last = new Error(`${url} ${res.status}`);
        continue;
      }
      return await res.arrayBuffer();
    } catch (err) {
      if (parent.aborted) throw new DOMException("aborted", "AbortError");
      last =
        err instanceof DOMException && err.name === "AbortError"
          ? new Error("モデルの取得が時間切れです")
          : err;
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    }
  }
  throw last;
}

function ensoTexture(THREE: typeof import("three")) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 512, 512);
    g.translate(256, 256);
    g.rotate(-0.15);
    g.strokeStyle = "rgba(28, 25, 22, 0.45)";
    g.lineWidth = 18;
    g.lineCap = "round";
    g.beginPath();
    g.arc(0, 0, 168, 0.35, Math.PI * 1.72);
    g.stroke();
    g.strokeStyle = "rgba(28, 25, 22, 0.18)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(4, 6, 176, 0.55, Math.PI * 1.35);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
