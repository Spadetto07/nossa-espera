/* =============================================================================
 *  NOSSA ESPERA — cena 3D do bebê (Three.js, ES Module)
 *
 *  Modelo base: "Baby" de joekarava — https://sketchfab.com/3d-models/baby-f05a87806cad49feb75ac7659d55c368
 *  Licença CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
 *  Alterações: malha simplificada, oclusão ambiente e espessura "assadas" por
 *  vértice (tools/prep_baby.py), proporções e pele ajustadas por semana aqui.
 *
 *  Como fica realista sem texturas pesadas:
 *    • vertex color R = oclusão ambiente (dobras escurecem e avermelham)
 *    • vertex color G = espessura local (orelhas, dedos e nariz deixam a luz
 *      passar — translucidez avermelhada, como pele fina de verdade)
 *    • proporções mudam com a semana: cabeça proporcionalmente maior e corpo
 *      mais magrinho no começo; pele mais fina e rosada, ficando mais opaca
 *      e com tom de recém-nascido perto do parto
 * ========================================================================== */

import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }     from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- configuração do modelo ---------------------------------------- */
const MODEL = {
  url: 'models/baby.glb',
  // pontos de referência no espaço original do modelo (metros do Sketchfab)
  headCenter: new THREE.Vector3(-0.011, 0.150, -0.100),
  headRadius: 0.165,
  headPivot: new THREE.Vector3(-0.011, 0.02, -0.02),   // perto do queixo: a cabeça cresce para cima/trás
  navel: new THREE.Vector3(0.0, -0.19, 0.168),
  thicknessMax: 0.12          // valor de espessura que corresponde a G = 1
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Parâmetros visuais por idade gestacional (semanas, aceita fração).
 * Referências de proporção: ultrassom/Hadlock — a cabeça é ~metade do
 * comprimento cabeça-nádega com 12 semanas e ~1/4 do corpo ao nascer.
 */
export function weekLook(week) {
  const t = clamp((week - 8) / 32, 0, 1);       // 0 = 8 sem, 1 = 40 sem
  const early = Math.pow(1 - t, 1.6);
  return {
    t,
    headScale: 1 + 0.50 * early,                 // 12s ≈ 1.40 · 20s ≈ 1.24 · 40s = 1.0
    skin: new THREE.Color().lerpColors(new THREE.Color(0xe9a093), new THREE.Color(0xf0b8a0), smooth(0, 1, t)),
    crease: new THREE.Color().lerpColors(new THREE.Color(0xa23a36), new THREE.Color(0xb8605a), t),
    sss: new THREE.Color().lerpColors(new THREE.Color(0xff3b2a), new THREE.Color(0xff6a4a), t),
    sssStrength: lerp(0.85, 0.42, t),
    veins: lerp(0.55, 0.0, smooth(0, 0.6, t)),   // vasinhos visíveis só no começo
    roughness: lerp(0.38, 0.5, t),               // pele mais "úmida/brilhante" no começo
    cordRadius: lerp(0.0155, 0.0145, t)
  };
}

/* ---------- material de pele (Physical + translucidez) --------------------- */
function createSkinMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf0bba5,
    vertexColors: true,
    roughness: 0.45,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffb39c),
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
    specularIntensity: 0.55
  });
  mat.userData.uniforms = {
    uCrease: { value: new THREE.Color(0xa23a36) },
    uSss: { value: new THREE.Color(0xff4030) },
    uSssStrength: { value: 0.6 },
    uVeins: { value: 0.5 }
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uCrease; uniform vec3 uSss; uniform float uSssStrength; uniform float uVeins;
        varying vec3 vObj;
        float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y), f.z); }
        float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`)
      // R = oclusão: dobras ficam mais escuras e AVERMELHADAS (não cinza)
      .replace('#include <color_fragment>', `
        float aoV = vColor.r;
        float thin = 1.0 - vColor.g;
        diffuseColor.rgb *= mix(uCrease * 0.55, vec3(1.0), smoothstep(0.0, 1.0, aoV));
        // manchinhas e vasinhos sob a pele fina (mais visíveis no começo)
        float mott = fbm(vObj * 38.0);
        float vein = 1.0 - smoothstep(0.0, 0.035, abs(fbm(vObj * 16.0 + 3.1) - 0.5));
        diffuseColor.rgb *= 1.0 + (mott - 0.5) * 0.10;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.80, 0.84), vein * uVeins * 0.35);`)
      // translucidez: partes finas + bordas acendem em vermelho
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Nn = normalize(vNormal);
          vec3 Vv = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(abs(dot(Nn, Vv)), 0.0, 1.0), 2.2);
          float th = pow(thin, 3.0);
          totalEmissiveRadiance += uSss * uSssStrength * (0.55 * th + 0.30 * rim * (0.4 + 0.6 * thin)) * (0.35 + 0.65 * aoV);
        }`);
  };
  return mat;
}

function createCordMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffd0d8),
    emissive: new THREE.Color(0x2a0a12),
    emissiveIntensity: 0.6
  });
}

/* ---------- cordão umbilical procedural ----------------------------------- */
function createCord(radius) {
  const n = MODEL.navel;
  const pts = [
    [0, 0.004, -0.014], [0.0, -0.008, 0.05], [0.0, -0.06, 0.12], [-0.04, -0.15, 0.15],
    [-0.13, -0.21, 0.07], [-0.25, -0.21, -0.06], [-0.38, -0.16, -0.2], [-0.54, -0.07, -0.32]
  ].map(([x, y, z]) => new THREE.Vector3(n.x + x, n.y + y, n.z + z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tubular = 220, radial = 20;
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);

  // afina a ponta, cria as voltas dos vasos e some no final (alfa)
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 4);
  const jelly = new THREE.Color(0xc9c4da), vein = new THREE.Color(0x343a86), artery = new THREE.Color(0xa3243a);
  const c = new THREE.Color();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    const taper = 1 - smooth(0.82, 1.0, u) * 0.9;
    const alpha = 0.88 * (u < 0.5 ? 1 : Math.pow(1 - smooth(0.5, 0.95, u), 1.3));
    const center = curve.getPointAt(u);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const ang = (j / radial) * Math.PI * 2;
      const p = new THREE.Vector3().fromBufferAttribute(pos, k);
      const twist = 3 * ang - u * 95;
      const bump = 1 + 0.07 * Math.max(0, Math.cos(twist));        // vasos em relevo
      p.sub(center).multiplyScalar(taper * bump).add(center);
      pos.setXYZ(k, p.x, p.y, p.z);
      const v1 = Math.pow(Math.max(0, Math.cos(twist)), 6);
      const v2 = Math.pow(Math.max(0, Math.cos(twist + 2.1)), 8);
      c.copy(jelly).lerp(vein, v1 * 0.85).lerp(artery, v2 * 0.75);
      colors.set([c.r, c.g, c.b, alpha], k * 4);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, createCordMaterial());
  mesh.name = 'cord';
  mesh.renderOrder = 2;
  return mesh;
}

/* ---------- deformação por semana ----------------------------------------- */
function prepareBaby(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const g = mesh.geometry;
  g.userData.basePos = g.attributes.position.array.slice();
  g.userData.baseNor = g.attributes.normal.array.slice();
  mesh.material = createSkinMaterial();
  mesh.castShadow = true;
  mesh.receiveShadow = false;   // sombras de contato vêm da oclusão assada (sem serrilhado)
  return mesh;
}

function applyWeekToMesh(mesh, look) {
  const g = mesh.geometry;
  const P = g.attributes.position.array, base = g.userData.basePos, BN = g.userData.baseNor;
  const col = g.attributes.color;
  const hc = MODEL.headCenter, R = MODEL.headRadius;
  const s = look.headScale;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.length / 3; i++) {
    v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    n.set(BN[i * 3], BN[i * 3 + 1], BN[i * 3 + 2]);
    const d = v.distanceTo(hc);
    const wHead = 1 - smooth(R * 0.75, R * 2.1, d);
    // cabeça proporcionalmente maior (escala suave; pivô no queixo para o
    // rosto não afundar no peito — o crânio cresce para cima e para trás)
    const k = 1 + (s - 1) * wHead;
    v.sub(MODEL.headPivot).multiplyScalar(k).add(MODEL.headPivot);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();

  const u = mesh.material.userData.uniforms;
  mesh.material.color.copy(look.skin);
  mesh.material.roughness = look.roughness;
  u.uCrease.value.copy(look.crease);
  u.uSss.value.copy(look.sss);
  u.uSssStrength.value = look.sssStrength;
  u.uVeins.value = look.veins;
}

/* ---------- partículas e brilho de fundo ---------------------------------- */
function createAmnioticParticles(count = 220) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 1.9 + Math.random() * 2.4;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    positions.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const tex = radialTexture(['rgba(255,236,210,1)', 'rgba(255,220,190,0.35)', 'rgba(255,220,190,0)']);
  const mat = new THREE.PointsMaterial({ color: 0xffe2c4, size: 0.05, map: tex, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'amniotic';
  return pts;
}

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createWombGlow() {
  // luz quente difusa atrás do bebê — como a claridade atravessando a barriga
  const tex = radialTexture(['rgba(255,170,130,0.55)', 'rgba(255,140,120,0.18)', 'rgba(255,140,120,0)']);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.name = 'glow';
  return m;
}

function showFallbackNote(on) {
  const el = document.getElementById('modelFallback');
  const debug = new URLSearchParams(location.search).has('debug');
  if (el) el.classList.toggle('hidden', !(on && debug));
}

/* =============================================================================
 *  CENA
 * ========================================================================== */
export const Scene3D = {
  renderer: null, scene: null, camera: null, controls: null, clock: null,
  pivot: null, baby: null, babyMesh: null, cord: null, glow: null,
  autoRotate: true, week: 12,

  init(container, week) {
    const w = container.clientWidth, h = container.clientHeight;
    this.week = week;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 60);
    this.camera.position.set(3.55, 0.3, 2.35);   // 3/4 de perfil

    /* Luz de "estúdio intrauterino": principal quente de cima, contraluz
     * rosada forte por trás (acende as bordas translúcidas), preenchimento
     * frio e suave, e uma luz baixa quente que imita a claridade difusa. */
    this.scene.add(new THREE.HemisphereLight(0xfff1e6, 0x6b4a5a, 0.55));
    const key = new THREE.DirectionalLight(0xffe2c6, 2.4);
    key.position.set(2.2, 3.6, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.8;
    key.shadow.camera.right = key.shadow.camera.top = 1.8;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 12;
    key.shadow.intensity = 0.6;        // sombra suave, como luz difusa
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.015;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9dcff, 0.55);
    fill.position.set(-3.5, 0.6, 2.2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff9c8a, 2.6);
    rim.position.set(-1.2, 1.6, -3.6);
    this.scene.add(rim);
    const under = new THREE.PointLight(0xffa77e, 1.4, 9, 2);
    under.position.set(0.4, -1.8, 1.6);
    this.scene.add(under);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 7.0;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
    this.controls.addEventListener('end', () => { this.controls.autoRotate = this.autoRotate; });

    this.glow = createWombGlow();
    this.scene.add(this.glow);
    this.scene.add(createAmnioticParticles());

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.load();

    this.clock = new THREE.Clock();
    this.animate();
    new ResizeObserver(() => this.onResize(container)).observe(container);
  },

  load() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    let decoder = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/';
    try { decoder = import.meta.resolve('three/addons/libs/draco/gltf/'); } catch (e) { /* CDN padrão */ }
    draco.setDecoderPath(decoder);
    loader.setDRACOLoader(draco);
    loader.load(MODEL.url, (gltf) => {
      this.baby = new THREE.Group();
      this.babyMesh = prepareBaby(gltf.scene);
      this.baby.add(gltf.scene);
      this.pivot.add(this.baby);
      this.setWeek(this.week);
      showFallbackNote(false);
      document.dispatchEvent(new CustomEvent('baby3d:ready'));
    }, undefined, (err) => {
      console.warn('[3D] não carregou o modelo do bebê', err);
      showFallbackNote(true);
    });
  },

  /** Atualiza proporções, pele e cordão para a idade gestacional (semanas, com fração). */
  setWeek(week) {
    this.week = week;
    if (!this.babyMesh) return;
    const look = weekLook(week);
    applyWeekToMesh(this.babyMesh, look);
    if (this.cord) { this.baby.remove(this.cord); this.cord.geometry.dispose(); this.cord.material.dispose(); }
    this.cord = createCord(look.cordRadius);
    this.baby.add(this.cord);

    // enquadra: corpo com ~2.2 unidades na maior dimensão, centralizado
    const box = new THREE.Box3().setFromObject(this.babyMesh);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const sc = 2.2 / Math.max(size.x, size.y, size.z);
    this.baby.scale.setScalar(sc);
    this.baby.position.copy(center).multiplyScalar(-sc);
  },

  // compatibilidade com o boot antigo
  loadWeekModel(week) { this.setWeek(week); },

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
    if (this.pivot) {
      this.pivot.position.y = Math.sin(t * 0.6) * 0.05;
      this.pivot.rotation.z = Math.sin(t * 0.4) * 0.035;
      this.pivot.rotation.x = Math.sin(t * 0.33) * 0.03;
    }
    if (this.glow) this.glow.quaternion.copy(this.camera.quaternion), this.glow.position.copy(this.camera.position).multiplyScalar(-0.35);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  },

  onResize(container) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  },

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
    return this.autoRotate;
  },

  resetView() {
    this.camera.position.set(3.55, 0.3, 2.35);   // 3/4 de perfil
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
};
