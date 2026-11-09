/* =============================================================================
 *  NOSSA ESPERA — cena 3D do bebê (Three.js, ES Module)
 *
 *  Modelo base: "Baby" de joekarava — https://sketchfab.com/3d-models/baby-f05a87806cad49feb75ac7659d55c368
 *  Licença CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
 *  Alterações (tools/prep_baby.py): cabeça e corpo unidos, malha refeita e
 *  alisada, e dados "assados" por vértice que este arquivo usa:
 *
 *    COLOR_0.r  oclusão ambiente (dobras escurecem e avermelham)
 *    COLOR_0.g  espessura local (orelhas, dedos, nariz deixam a luz passar)
 *    COLOR_0.b  rubor: lábios, bochechas, nariz, pontas dos dedos
 *    COLOR_0.a  1 − sombra das pálpebras
 *    _SLIM      deslocamento para o corpo magrinho do começo da gestação
 *    _LIMB      pesos de movimento (antebraços e pernas)
 *
 *  O que muda com a semana está em weekLook(): proporção da cabeça, gordurinha,
 *  cor e transparência da pele, vasinhos. O ambiente imita o interior do útero:
 *  luz quente atravessando a parede, líquido levemente turvo e partículas.
 * ========================================================================== */

import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }     from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

/* ---------- configuração do modelo ---------------------------------------- */
const MODEL = {
  url: 'models/baby.glb',
  // pontos de referência no espaço original do modelo
  headCenter: new THREE.Vector3(-0.011, 0.150, -0.100),
  headRadius: 0.165,
  headPivot: new THREE.Vector3(-0.011, 0.02, -0.02),   // perto do queixo: a cabeça cresce para cima/trás
  navel: new THREE.Vector3(0.0, -0.19, 0.168),
  // cotovelos e joelhos (pivô + eixo; ângulo positivo = estender) — de tools/prep_baby.py
  joints: [
    { pivot: [-0.2081, -0.0897, 0.0060], axis: [0.5774, -0.7836, 0.2292] },   // antebraço direito
    { pivot: [0.2196, -0.1004, -0.0211], axis: [0.5517, 0.8004, -0.2346] },   // antebraço esquerdo
    { pivot: [-0.0857, -0.1497, 0.2370], axis: [-0.9292, -0.3683, 0.0318] },  // perna direita
    { pivot: [0.0808, -0.1346, 0.2501], axis: [-0.9407, 0.3314, -0.0729] }    // perna esquerda
  ]
};

const QUERY = new URLSearchParams(location.search);
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CAMERA_HOME = [3.55, 0.3, 2.35];           // 3/4 de perfil

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => new THREE.Color().lerpColors(new THREE.Color(a), new THREE.Color(b), t);

/**
 * Aparência por idade gestacional (semanas, aceita fração).
 * Referências: a cabeça é ~metade do comprimento cabeça-nádega com 12 semanas
 * e ~1/4 do corpo ao nascer; a gordura sob a pele só se acumula no 3º
 * trimestre; até lá a pele é fina, avermelhada e deixa ver os vasos.
 */
export function weekLook(week) {
  const t = clamp((week - 8) / 32, 0, 1);        // 0 = 8 sem · 1 = 40 sem
  const early = Math.pow(1 - t, 1.6);
  return {
    t,
    headScale: 1 + 0.50 * early,                  // 12s ≈ 1,40 · 16s ≈ 1,32 · 24s ≈ 1,17 · 40s = 1
    slim: 0.8 * (1 - smooth(18, 37, week)),       // magrinho até ~18s, "enche" até o parto
    skin: mix3(0xdc8f80, 0xefbba4, smooth(0, 1, t)),
    crease: mix3(0x9c2f2c, 0xb45a54, t),
    sss: mix3(0xff3a22, 0xff6442, t),
    sssStrength: lerp(1.0, 0.5, t),               // pele mais translúcida no começo
    veins: lerp(0.6, 0.0, smooth(0, 0.6, t)),     // vasinhos visíveis só no começo
    blush: lerp(0.75, 1.0, t),
    lids: lerp(0.9, 0.45, t),                     // pálpebras finas e escuras no começo
    roughness: lerp(0.52, 0.6, t),
    cordRadius: lerp(0.0155, 0.0145, t)
  };
}

/* ---------- ruído (compartilhado pelos shaders) ---------------------------- */
const NOISE_GLSL = `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/* ---------- material de pele ----------------------------------------------- */
function createSkinMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xe6a593,
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    // dentro do líquido a pele quase não tem brilho "molhado": reflexo baixo e largo
    specularIntensity: 0.32,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    sheen: 0.55,                      // penugem / contorno macio
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xffa98c)
  });
  const J = MODEL.joints;
  mat.userData.uniforms = {
    uCrease: { value: new THREE.Color(0xa23a36) },
    uSss: { value: new THREE.Color(0xff4030) },
    uSssStrength: { value: 0.7 },
    uVeins: { value: 0.5 },
    uBlush: { value: 1.0 },
    uLids: { value: 0.6 },
    uBump: { value: 0.016 },
    uBackDir: { value: new THREE.Vector3(0, 0, -1) },   // luz de trás, em espaço de câmera
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uNM: { value: new THREE.Matrix3() },                // normalMatrix da malha
    uPiv: { value: J.map(j => new THREE.Vector3(...j.pivot)) },
    uAxis: { value: J.map(j => new THREE.Vector3(...j.axis).normalize()) },
    uAng: { value: [0, 0, 0, 0] }
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 limbW;
        uniform vec3 uPiv[4]; uniform vec3 uAxis[4]; uniform float uAng[4];
        varying vec3 vObj;
        vec3 rotAx(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        for (int i = 0; i < 4; i++) objectNormal = rotAx(objectNormal, uAxis[i], uAng[i] * limbW[i]);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position;
        for (int i = 0; i < 4; i++) transformed = uPiv[i] + rotAx(transformed - uPiv[i], uAxis[i], uAng[i] * limbW[i]);`);
    // luz "enrolada": na pele a luz se espalha por baixo da superfície, então a passagem
    // de claro para escuro é larga e macia (sem a linha dura típica de computação gráfica)
    // (só a parte difusa; o reflexo continua com o cálculo físico normal)
    const DIFF = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
    const lights = THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIFF,
      `float wrapNL = pow( saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 ), 1.7 );
       reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseColor );`);
    if (lights === THREE.ShaderChunk.lights_physical_pars_fragment) console.warn('[3D] luz macia da pele não aplicada');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', lights)
      .replace('#include <common>', `#include <common>
        uniform vec3 uCrease; uniform vec3 uSss; uniform float uSssStrength; uniform float uVeins;
        uniform float uBlush; uniform float uLids; uniform float uBump;
        uniform vec3 uBackDir; uniform vec3 uKeyDir; uniform mat3 uNM;
        varying vec3 vObj;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `
        float aoV = vColor.r;
        float thin = 1.0 - vColor.g;
        float blush = vColor.b;
        float lids = 1.0 - vColor.a;
        // dobras: mais escuras e AVERMELHADAS (não cinza)
        diffuseColor.rgb *= mix(uCrease * 0.55, vec3(1.0), smoothstep(0.0, 1.0, aoV));
        // manchinhas e vasinhos sob a pele fina
        float mott = fbm(vObj * 38.0);
        float vein = 1.0 - smoothstep(0.0, 0.035, abs(fbm(vObj * 16.0 + 3.1) - 0.5));
        diffuseColor.rgb *= 1.0 + (mott - 0.5) * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.78, 0.84), vein * uVeins * 0.4);
        // rubor: mais sangue perto da superfície (lábios, bochechas, nariz, pontas dos dedos)
        float bl = clamp(blush * uBlush, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.60, 0.62) + vec3(0.035, 0.0, 0.004), bl * 0.85);
        // pálpebras: pele finíssima sobre o olho escuro
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.46, 0.52), lids * uLids);`)
      // microrrelevo: quebra o brilho liso de "boneco"
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float e = 0.4;
          vec3 q1 = vObj * 260.0, q2 = vObj * 62.0;
          float a0 = vnoise(q1), b0 = vnoise(q2);
          vec3 g = vec3(vnoise(q1 + vec3(e,0,0)) - a0, vnoise(q1 + vec3(0,e,0)) - a0, vnoise(q1 + vec3(0,0,e)) - a0)
                 + vec3(vnoise(q2 + vec3(e,0,0)) - b0, vnoise(q2 + vec3(0,e,0)) - b0, vnoise(q2 + vec3(0,0,e)) - b0) * 1.6;
          vec3 gv = uNM * g;
          gv -= normal * dot(normal, gv);
          normal = normalize(normal - gv * (uBump / e));
        }`)
      // luz por dentro da pele
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Nn = normalize(normal);
          vec3 Vv = normalize(vViewPosition);
          // contraluz atravessando as partes finas (orelhas, dedos, nariz, lábios)
          float back = pow(clamp(dot(Vv, -normalize(uBackDir + Nn * 0.4)), 0.0, 1.0), 2.5);
          // faixa avermelhada onde a luz vira sombra (marca registrada de pele de verdade)
          float bleed = exp(-pow((dot(Nn, uKeyDir) + 0.18) / 0.32, 2.0));
          float rim = pow(1.0 - clamp(dot(Nn, Vv), 0.0, 1.0), 2.4);
          vec3 sss = uSss * uSssStrength * (back * (0.22 + 1.25 * pow(thin, 1.6)) + 0.30 * pow(thin, 3.0) + 0.20 * rim * (0.4 + 0.6 * thin));
          sss += diffuseColor.rgb * vec3(1.0, 0.30, 0.20) * bleed * 0.24 * uSssStrength;
          totalEmissiveRadiance += sss * (0.35 + 0.65 * aoV);
        }`);
  };
  mat.customProgramCacheKey = () => 'baby-skin-v4';
  return mat;
}

function createCordMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffd0d8),
    emissive: new THREE.Color(0x2a0a12),
    emissiveIntensity: 0.7
  });
}

/* ---------- cordão umbilical procedural ----------------------------------- */
function createCord(radius, start) {
  const pts = [
    [0, 0.004, -0.016], [0.0, -0.008, 0.05], [0.0, -0.06, 0.12], [-0.04, -0.15, 0.15],
    [-0.13, -0.21, 0.07], [-0.25, -0.21, -0.06], [-0.38, -0.16, -0.2], [-0.54, -0.07, -0.32]
  ].map(([x, y, z], i) => {
    // os primeiros pontos acompanham o umbigo (que recua quando o corpo está magrinho)
    const k = 1 - smooth(1, 4, i);
    return new THREE.Vector3(MODEL.navel.x + x, MODEL.navel.y + y, MODEL.navel.z + z).addScaledVector(start.clone().sub(MODEL.navel), k);
  });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tubular = 220, radial = 20;
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);

  // afina a ponta, cria as voltas dos vasos e some no final (alfa)
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const jelly = new THREE.Color(0xe0cfd2), vein = new THREE.Color(0x4a4480), artery = new THREE.Color(0xa3243a);
  const c = new THREE.Color();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    const taper = 1 - smooth(0.82, 1.0, u) * 0.9;
    const alpha = 0.9 * (u < 0.5 ? 1 : Math.pow(1 - smooth(0.5, 0.95, u), 1.3));
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

/* ---------- malha do bebê --------------------------------------------------- */
function prepareBaby(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const g = mesh.geometry;
  g.userData.basePos = g.attributes.position.array.slice();

  // pesos de movimento → atributo float 0..1 (no .glb vêm como bytes 0..255)
  const lw = g.attributes._limb, n = g.attributes.position.count;
  const w = new Float32Array(n * 4);
  if (lw) {
    const k = lw.normalized ? 1 : 1 / 255;
    for (let i = 0; i < n; i++) { w[i * 4] = lw.getX(i) * k; w[i * 4 + 1] = lw.getY(i) * k; w[i * 4 + 2] = lw.getZ(i) * k; w[i * 4 + 3] = lw.getW(i) * k; }
    g.deleteAttribute('_limb');
  }
  g.setAttribute('limbW', new THREE.BufferAttribute(w, 4));

  // vértice do umbigo: é dele que sai o cordão, mesmo com o corpo deformado
  let best = 0, bd = Infinity; const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const d = p.fromBufferAttribute(g.attributes.position, i).distanceToSquared(MODEL.navel); if (d < bd) { bd = d; best = i; } }
  g.userData.navelIndex = best;

  mesh.material = createSkinMaterial();
  mesh.material.userData.uniforms.uNM.value = mesh.normalMatrix;
  mesh.frustumCulled = false;                    // os membros se mexem no shader
  return mesh;
}

function applyWeekToMesh(mesh, look) {
  const g = mesh.geometry;
  const P = g.attributes.position.array, base = g.userData.basePos;
  const S = g.attributes._slim ? g.attributes._slim.array : null;
  const hc = MODEL.headCenter, R = MODEL.headRadius, piv = MODEL.headPivot;
  const s = look.headScale, slim = look.slim;
  const v = new THREE.Vector3();
  for (let i = 0, n = P.length / 3; i < n; i++) {
    const j = i * 3;
    v.set(base[j], base[j + 1], base[j + 2]);
    const wHead = 1 - smooth(R * 0.75, R * 2.1, v.distanceTo(hc));
    // corpo magrinho (sem a gordurinha do fim da gestação)
    if (S) { v.x += S[j] * slim; v.y += S[j + 1] * slim; v.z += S[j + 2] * slim; }
    // cabeça proporcionalmente maior; pivô no queixo para o rosto não afundar no peito
    v.sub(piv).multiplyScalar(1 + (s - 1) * wHead).add(piv);
    P[j] = v.x; P[j + 1] = v.y; P[j + 2] = v.z;
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();

  const m = mesh.material, u = m.userData.uniforms;
  m.color.copy(look.skin);
  m.roughness = look.roughness;
  u.uCrease.value.copy(look.crease);
  u.uSss.value.copy(look.sss);
  u.uSssStrength.value = look.sssStrength;
  u.uVeins.value = look.veins;
  u.uBlush.value = look.blush;
  u.uLids.value = look.lids;
}

/* ---------- ambiente: interior do útero ----------------------------------- */
function createWombMaterial(lightDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uLight: { value: lightDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uLight; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.6 + 4.0);
        float glow = pow(max(dot(d, uLight), 0.0), 4.5);            // claridade atravessando a parede
        float halo = pow(max(dot(d, uLight) * 0.5 + 0.5, 0.0), 3.0);
        vec3 col = mix(vec3(0.012, 0.002, 0.003), vec3(0.075, 0.012, 0.009), n);
        col += vec3(0.80, 0.22, 0.07) * glow * (0.35 + 0.5 * n) + vec3(0.13, 0.022, 0.012) * halo;
        // vasos da parede uterina, desfocados
        float v1 = 1.0 - smoothstep(0.0, 0.10, abs(fbm(d * 2.6 + 11.0) - 0.5));
        float v2 = 1.0 - smoothstep(0.0, 0.07, abs(fbm(d * 5.0 + 23.0) - 0.5));
        col *= 1.0 - 0.30 * v1 - 0.12 * v2;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
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

/** Partículas em suspensão no líquido: finas ao longe, desfocadas perto da câmera. */
function createAmnioticParticles() {
  const group = new THREE.Group(); group.name = 'amniotic';
  const tex = radialTexture(['rgba(255,225,190,1)', 'rgba(255,190,150,0.30)', 'rgba(255,190,150,0)']);
  for (const [count, size, opacity, r0, r1] of [[260, 0.035, 0.55, 1.6, 4.6], [26, 0.22, 0.10, 1.5, 3.2]]) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = r0 + Math.random() * (r1 - r0), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.75, r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc9a0, size, map: tex, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
  }
  return group;
}

/** Acabamento de "foto": vinheta suave e grão fino. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // contraste e saturação de revelação (a imagem já chega em sRGB)
      c.rgb = clamp(c.rgb, 0.0, 1.0);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.45);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.14);
      float v = smoothstep(0.82, 0.20, length(vUv - 0.5));
      c.rgb *= mix(0.50, 1.0, v);
      c.rgb += (h(vUv * 917.0 + fract(uTime) * 7.0) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
    }`
};

function showFallbackNote(on) {
  const el = document.getElementById('modelFallback');
  if (el) el.classList.toggle('hidden', !(on && QUERY.has('debug')));
}

/* =============================================================================
 *  CENA
 * ========================================================================== */
export const Scene3D = {
  renderer: null, composer: null, bloom: null, finish: null,
  scene: null, camera: null, controls: null, clock: null,
  pivot: null, baby: null, babyMesh: null, cord: null, particles: null,
  keyLight: null, backLight: null,
  autoRotate: true, week: 12,
  motion: null, postChecked: false, perf: { frames: 0, acc: 0, level: 0 },

  init(container, week) {
    const w = container.clientWidth, h = container.clientHeight;
    this.week = week;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;   // tons de pele mais naturais que o ACES em luz vermelha
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x240705, 0.05);          // líquido levemente turvo
    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 60);
    this.camera.position.set(...CAMERA_HOME);

    /* Luz: uma principal quente (como a de uma fetoscopia), a claridade
     * alaranjada que atravessa a parede do útero por trás — é ela que acende
     * orelhas, dedos e contornos — e o resto do ambiente em vermelho escuro. */
    const backDir = new THREE.Vector3(-1.5, 1.3, -3.4);
    const womb = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), createWombMaterial(backDir));
    womb.name = 'womb';
    this.scene.add(womb);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(womb.geometry, womb.material));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    this.scene.environmentIntensity = 1.5;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffb49a, 0x3a0c0a, 0.55));
    this.keyLight = new THREE.DirectionalLight(0xfff0e4, 2.7);
    this.keyLight.position.set(2.6, 3.2, 3.4);
    this.scene.add(this.keyLight);
    const fill = new THREE.DirectionalLight(0xff8f6e, 0.5);
    fill.position.set(-3.5, -0.4, 2.4);
    this.scene.add(fill);
    this.backLight = new THREE.DirectionalLight(0xff8552, 2.4);
    this.backLight.position.copy(backDir);
    this.scene.add(this.backLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.7;
    this.controls.maxDistance = 7.0;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
    this.controls.addEventListener('end', () => { this.controls.autoRotate = this.autoRotate; });

    this.particles = createAmnioticParticles();
    this.scene.add(this.particles);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.setupPost(w, h);
    this.motion = { ang: [0, 0, 0, 0], kick: { limb: 2, start: 5, dur: 1.6, amp: 0.3 } };
    this.load();

    this.clock = new THREE.Clock();
    this.animate();
    new ResizeObserver(() => this.onResize(container)).observe(container);
  },

  /** Brilho suave nas partes claras + vinheta e grão. Sem isso a cena ainda funciona. */
  setupPost(w, h) {
    try {
      const pr = this.renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.85, 0.78);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.finish = new ShaderPass(FinishShader);        // por último: trabalha na imagem já revelada
      this.composer.addPass(this.finish);
    } catch (e) {
      console.warn('[3D] pós-processamento indisponível', e);
      this.composer = null;
    }
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
    const g = this.babyMesh.geometry;
    const navel = new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.userData.navelIndex);
    this.cord = createCord(look.cordRadius, navel);
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

  /** Movimentos leves, como no ultrassom: mãos e pés mexendo devagar e um chutinho de vez em quando. */
  updateMotion(t) {
    const m = this.motion, u = this.babyMesh.material.userData.uniforms;
    if (QUERY.has('pose')) { u.uAng.value = QUERY.get('pose').split(',').map(Number); return; }   // teste: ângulos fixos
    if (REDUCED_MOTION || QUERY.has('still')) { u.uAng.value = [0, 0, 0, 0]; return; }
    const wave = (f, p) => Math.max(0, Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 0.37 + p * 1.7) * 0.4);
    const a = [0.10 * wave(0.50, 0.3), 0.12 * wave(0.41, 2.1), 0.07 * wave(0.33, 4.0), 0.07 * wave(0.29, 1.2)];
    const k = m.kick;
    if (t > k.start + k.dur) {            // agenda o próximo chutinho
      k.limb = Math.random() < 0.75 ? 2 + (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 0 : 1);
      k.start = t + 5 + Math.random() * 9;
      k.dur = 1.2 + Math.random() * 0.8;
      k.amp = k.limb >= 2 ? 0.20 + Math.random() * 0.12 : 0.12 + Math.random() * 0.10;
    }
    const x = (t - k.start) / k.dur;
    if (x > 0 && x < 1) a[k.limb] += k.amp * Math.pow(Math.sin(Math.PI * Math.pow(x, 0.6)), 2);   // estica rápido, volta devagar
    for (let i = 0; i < 4; i++) m.ang[i] += (a[i] - m.ang[i]) * 0.2;
    u.uAng.value = m.ang;
  },

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = this.clock.getDelta(), t = this.clock.elapsedTime;
    if (this.pivot) {
      this.pivot.position.y = Math.sin(t * 0.6) * 0.05;
      this.pivot.rotation.z = Math.sin(t * 0.4) * 0.035;
      this.pivot.rotation.x = Math.sin(t * 0.33) * 0.03;
    }
    if (this.particles) { this.particles.rotation.y = t * 0.012; this.particles.position.y = Math.sin(t * 0.21) * 0.08; }
    this.controls.update();

    if (this.babyMesh) {
      this.updateMotion(t);
      // direções das luzes em espaço de câmera, para a translucidez da pele
      const u = this.babyMesh.material.userData.uniforms, vi = this.camera.matrixWorldInverse;
      u.uBackDir.value.copy(this.backLight.position).normalize().transformDirection(vi);
      u.uKeyDir.value.copy(this.keyLight.position).normalize().transformDirection(vi);
    }

    if (this.composer) {
      this.finish.uniforms.uTime.value = t;
      this.composer.render(dt);
      if (this.babyMesh && !this.postChecked) this.checkPost();
    } else this.renderer.render(this.scene, this.camera);
    this.watchPerformance(dt);
  },

  /** Se a placa de vídeo não der conta do pós-processamento (tela preta), volta ao desenho direto. */
  checkPost() {
    this.postChecked = true;
    try {
      const gl = this.renderer.getContext(), px = new Uint8Array(4);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      let sum = 0;
      for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.4], [0.5, 0.6]]) {
        gl.readPixels(Math.floor(W * fx), Math.floor(H * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sum += px[0] + px[1] + px[2];
      }
      if (sum === 0) { console.warn('[3D] pós-processamento desligado (quadro preto)'); this.composer = null; }
    } catch (e) { /* segue com o pós-processamento */ }
  },

  /** Em aparelho lento: primeiro baixa a resolução, depois desliga o brilho. */
  watchPerformance(dt) {
    const p = this.perf;
    if (QUERY.has('hq') || p.level >= 2 || !this.babyMesh || document.hidden) return;
    p.frames++; if (p.frames < 20) return;          // ignora o arranque
    p.acc += dt;
    if (p.frames < 80) return;
    const avg = p.acc / 60; p.frames = 0; p.acc = 0;
    if (avg < 0.034) return;
    p.level++;
    if (p.level === 1) { this.renderer.setPixelRatio(1); this.composer?.setPixelRatio(1); }
    else if (this.bloom) this.bloom.enabled = false;
  },

  onResize(container) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  },

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
    return this.autoRotate;
  },

  resetView() {
    this.camera.position.set(...CAMERA_HOME);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
};
