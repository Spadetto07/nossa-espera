"""
Escultura procedural de um feto humano por semana gestacional.
SDF (signed distance field) com uniões suaves -> marching cubes -> .glb
Cores de vértice (pele, lábios, pálpebras, AO assada) em espaço linear.
"""
import sys, math, numpy as np
from skimage import measure
import trimesh, fast_simplification

def lerp(a, b, t): return a + (b - a) * t
def V(*a): return np.array(a, dtype=np.float64)
def norm(v): return v / np.linalg.norm(v)

# ---------------- primitivas SDF (vetorizadas, P: (N,3)) ----------------
def sd_sphere(P, c, r):
    return np.linalg.norm(P - c, axis=1) - r

def sd_ellipsoid(P, c, rad, R=None):
    q = P - c
    if R is not None: q = q @ R          # R: colunas = eixos locais
    k0 = np.linalg.norm(q / rad, axis=1)
    k1 = np.linalg.norm(q / (rad * rad), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

def sd_cone(P, a, b, ra, rb):
    """cápsula com raio variando linearmente de a até b"""
    pa = P - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - np.outer(h, ba), axis=1) - (ra + (rb - ra) * h)

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def ssub(a, b, k):   # a menos b, suave
    return -smin(-a, b, k)

def frame(fwd, up):
    f = norm(fwd); s = norm(np.cross(f, up)); u = np.cross(s, f)
    return f, u, s

def rotY(deg):
    r = math.radians(deg); c, s = math.cos(r), math.sin(r)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

# ------------------------------------------------------------------------
class Fetus:
    def __init__(self, week):
        self.week = week
        t = np.clip((week - 10) / 30.0, 0, 1)
        self.t = t
        self.rh = lerp(0.66, 0.47, t)          # raio da cabeça
        self.L  = lerp(0.80, 1.05, t)          # comprimento dos membros
        self.F  = lerp(0.85, 1.40, t)          # "gordurinha" dos membros
        self.G  = lerp(0.86, 1.18, t)          # circunferência do tronco
        rh = self.rh
        a = math.radians(28)                   # queixo encostando no peito
        self.Hc = V(0.12, 0.08 + rh * 0.92, 0)
        self.f = V(math.cos(a), -math.sin(a), 0)
        self.u = V(math.sin(a),  math.cos(a), 0)
        self.s = V(0, 0, 1)
        self.R_head = np.stack([self.f, self.u, self.s], axis=1)

    def H(self, x, y, z):
        """ponto em coordenadas locais da cabeça (unidades de rh) -> mundo"""
        rh = self.rh
        return self.Hc + self.f * x * rh + self.u * y * rh + self.s * z * rh

    # ---------- partes ----------
    def head(self, P, feat):
        rh, R = self.rh, self.R_head; t = self.t
        d = sd_ellipsoid(P, self.H(-0.06, 0.08, 0), V(1.0, 0.93, 0.86) * rh, R)
        d = smin(d, sd_ellipsoid(P, self.H(0.42, -0.42, 0), V(0.55, 0.50, 0.62) * rh, R), 0.20 * rh)
        for sg in (-1, 1):   # bochechas
            d = smin(d, sd_sphere(P, self.H(0.60, -0.50, sg * 0.36), (0.22 + 0.10 * t) * rh), 0.12 * rh)
        d = smin(d, sd_ellipsoid(P, self.H(0.62, -0.82, 0), V(0.24, 0.20, 0.30) * rh, R), 0.12 * rh)  # queixo
        # nariz
        nz = 0.75 + 0.3 * t
        nose = sd_ellipsoid(P, self.H(0.93, -0.40, 0), V(0.09, 0.14, 0.13) * rh * nz, R)
        nose = smin(nose, sd_ellipsoid(P, self.H(0.985, -0.49, 0), V(0.07, 0.06, 0.1) * rh * nz, R), 0.04 * rh)
        for sg in (-1, 1):
            nose = ssub(nose, sd_sphere(P, self.H(1.03, -0.545, sg * 0.045), 0.03 * rh), 0.01 * rh)
        d = smin(d, nose, 0.08 * rh)
        # olhos fechados (pálpebras fundidas nesta fase)
        lids = []
        for sg in (-1, 1):
            sock = sd_ellipsoid(P, self.H(0.92, -0.10, sg * 0.36), V(0.10, 0.07, 0.16) * rh, R)
            d = ssub(d, sock, 0.06 * rh)
            e = sd_ellipsoid(P, self.H(0.72, -0.19, sg * 0.36), V(0.14, 0.10, 0.17) * rh, R)
            d = smin(d, e, 0.06 * rh)
            crease = sd_ellipsoid(P, self.H(0.86, -0.215, sg * 0.37), V(0.025, 0.012, 0.13) * rh, R)
            d = ssub(d, crease, 0.008 * rh)
            lids.append(crease)
        feat['lid'] = np.minimum(*lids)
        # boca
        lips = sd_ellipsoid(P, self.H(0.86, -0.66, 0), V(0.10, 0.10, 0.16) * rh, R)
        d = smin(d, lips, 0.05 * rh)
        mouth = sd_ellipsoid(P, self.H(0.96, -0.665, 0), V(0.04, 0.012, 0.12) * rh, R)
        d = ssub(d, mouth, 0.01 * rh)
        feat['lip'] = lips
        feat['mouth'] = mouth
        # orelhas (mais baixas no começo da gestação)
        es = 0.75 + 0.25 * t
        ears = []
        for sg in (-1, 1):
            ey = -0.20 - 0.18 * (1 - t)
            c = self.H(-0.14, ey, sg * 0.80)
            ear = sd_ellipsoid(P, c, V(0.20, 0.27, 0.065) * rh * es, R)
            d = smin(d, ear, 0.04 * rh)
            concha = sd_ellipsoid(P, self.H(-0.10, ey - 0.03, sg * 0.865), V(0.10, 0.15, 0.04) * rh * es, R)
            d = ssub(d, concha, 0.03 * rh)
            ears.append(ear)
        feat['ear'] = np.minimum(*ears)
        feat['cheek'] = np.minimum(sd_sphere(P, self.H(0.66, -0.50, 0.40), 0.2 * rh),
                                   sd_sphere(P, self.H(0.66, -0.50, -0.40), 0.2 * rh))
        return d

    def torso(self, P):
        G = self.G
        pts = [V(-0.05, 0.08, 0), V(-0.12, -0.22, 0), V(-0.13, -0.52, 0), V(-0.08, -0.80, 0), V(-0.20, -1.00, 0)]
        rs  = [0.17 * G, 0.33 * G, 0.36 * G, 0.34 * G, 0.27 * G]
        d = None
        for i in range(len(pts) - 1):
            c = sd_cone(P, pts[i], pts[i + 1], rs[i], rs[i + 1])
            d = c if d is None else smin(d, c, 0.1)
        d = smin(d, sd_ellipsoid(P, V(0.06, -0.62, 0), V(0.30, 0.32, 0.31) * G), 0.15)    # barriguinha
        for sg in (-1, 1):
            d = smin(d, sd_sphere(P, V(-0.24, -0.95, sg * 0.11), 0.20 * G), 0.12)       # bumbum
        # pescoço até a base do crânio
        d = smin(d, sd_cone(P, V(-0.05, 0.05, 0), self.H(-0.15, -0.55, 0), 0.16 * G, 0.30 * self.rh), 0.12)
        return d

    def hand(self, P, W, d_dir, n_dir, side, feat_list):
        L, F = self.L, self.F
        dd, nn = norm(d_dir), norm(n_dir - np.dot(n_dir, norm(d_dir)) * norm(d_dir))
        b = np.cross(dd, nn) * side
        Rm = np.stack([dd, nn, b], axis=1)
        pc = W + dd * 0.075 * L
        h = sd_ellipsoid(P, pc, V(0.085, 0.040, 0.075) * L * np.array([1, F ** 0.5, F ** 0.3]), Rm)
        fr = 0.021 * L * F ** 0.4
        for i, off in enumerate((-0.048, -0.016, 0.016, 0.046)):
            ln = (0.9, 1.0, 0.95, 0.78)[i]
            base = pc + dd * 0.06 * L + b * off * L
            m1 = base + (dd * 0.045 - nn * 0.012) * L * ln
            tip = m1 + (dd * 0.020 - nn * 0.035) * L * ln
            f1 = sd_cone(P, base, m1, fr * 1.05, fr)
            f2 = sd_cone(P, m1, tip, fr, fr * 0.85)
            h = smin(h, smin(f1, f2, 0.01), 0.012)
            feat_list.append(sd_sphere(P, tip, fr * 1.4))
        tb = W + (dd * 0.03 - b * 0.055) * L
        tm = tb + (dd * 0.045 - b * 0.03 - nn * 0.02) * L
        tt = tm + (dd * 0.03 - nn * 0.025) * L
        h = smin(h, smin(sd_cone(P, tb, tm, fr * 1.25, fr * 1.05), sd_cone(P, tm, tt, fr * 1.05, fr * 0.9), 0.01), 0.02)
        return h

    def arms(self, P, feat):
        L, F, G = self.L, self.F, self.G
        tips = []
        d = None
        for side in (1, -1):
            Sh = V(-0.06, -0.12, side * 0.30 * G)
            if side == 1:   # mão perto do rosto
                E = Sh + L * V(0.26, -0.36, 0.12)
                W = E + L * V(0.20, 0.36, -0.12)
                nrm = V(-0.3, 0.2, -1)
            else:           # mão sobre o peito
                E = Sh + L * V(0.20, -0.38, -0.10)
                W = E + L * V(0.25, 0.08, 0.14)
                nrm = V(-1, 0.1, 0.3)
            up = sd_cone(P, Sh, E, 0.105 * F, 0.085 * F)
            fo = sd_cone(P, E, W, 0.085 * F, 0.065 * F)
            a = smin(up, fo, 0.04)
            a = smin(a, self.hand(P, W, W - E, nrm, side, tips), 0.035)
            d = a if d is None else np.minimum(d, a)
        feat['tip'] = np.min(np.stack(tips), axis=0)
        return d

    def legs(self, P, feat):
        L, F, G = self.L, self.F, self.G
        d = None; toes = []
        for side in (1, -1):
            Hp = V(-0.12, -0.86, side * 0.20 * G)
            if side == 1:
                K = Hp + L * V(0.44, 0.20, 0.10)
                A = K + L * V(-0.06, -0.42, -0.04)
            else:
                K = Hp + L * V(0.46, 0.30, -0.12)
                A = K + L * V(-0.02, -0.44, 0.10)
            th = sd_cone(P, Hp, K, 0.155 * F, 0.10 * F)
            sh = sd_cone(P, K, A, 0.10 * F, 0.065 * F)
            l = smin(th, sh, 0.05)
            fw = norm(V(0.9, 0.05, -side * 0.35))
            toe = A + fw * 0.17 * L
            ft = sd_ellipsoid(P, (A + toe) / 2 + V(0, -0.015, 0), V(0.105 * L, 0.042 * F, 0.058 * F),
                              np.stack(frame(fw, V(0, 1, 0)), axis=1))
            ft = smin(ft, sd_sphere(P, A + V(-0.02, -0.02, 0), 0.06 * F), 0.03)
            l = smin(l, ft, 0.03)
            toes.append(sd_sphere(P, toe, 0.05))
            d = l if d is None else np.minimum(d, l)
        feat['toe'] = np.minimum(*toes)
        return d

    def sdf(self, P, feat=None):
        if feat is None: feat = {}
        d = self.head(P, feat)
        d = smin(d, self.torso(P), 0.10)
        d = smin(d, self.arms(P, feat), 0.045)
        d = smin(d, self.legs(P, feat), 0.06)
        return d

    # ---------- cordão umbilical (malha tubular separada) ----------
    def cord_curve(self):
        G = self.G
        ctrl = np.array([
            [0.20 * G, -0.70, 0.0], [0.45, -0.84, 0.04], [0.47, -1.12, 0.14],
            [0.24, -1.40, 0.34], [-0.18, -1.56, 0.55], [-0.66, -1.62, 0.62],
            [-1.12, -1.52, 0.42], [-1.50, -1.30, 0.10]])
        # Catmull-Rom
        pts = []
        C = np.vstack([ctrl[0], ctrl, ctrl[-1]])
        for i in range(1, len(C) - 2):
            p0, p1, p2, p3 = C[i - 1], C[i], C[i + 1], C[i + 2]
            for s in np.linspace(0, 1, 24, endpoint=False):
                s2, s3 = s * s, s * s * s
                pts.append(0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3))
        pts.append(ctrl[-1])
        return np.array(pts)

def srgb2lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def build(week, h=0.0095, target_faces=44000, out=None):
    fe = Fetus(week)
    lo, hi = V(-0.75, -1.35, -0.78), V(1.05, 1.40, 0.78)
    xs = np.arange(lo[0], hi[0], h); ys = np.arange(lo[1], hi[1], h); zs = np.arange(lo[2], hi[2], h)
    vol = np.empty((len(xs), len(ys), len(zs)), dtype=np.float32)
    Y, Z = np.meshgrid(ys, zs, indexing='ij')
    for i, x in enumerate(xs):
        P = np.stack([np.full(Y.size, x), Y.ravel(), Z.ravel()], axis=1)
        vol[i] = fe.sdf(P).reshape(Y.shape)
    verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(h, h, h))
    verts += lo
    # simplifica mantendo a forma
    ratio = max(0.0, 1.0 - target_faces / len(faces))
    if ratio > 0:
        verts, faces = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), ratio)
    verts = verts.astype(np.float64)
    # projeta de volta na superfície (1 passo de Newton) e normais pelo gradiente do SDF
    e = 0.002
    def grad(Pt):
        g = np.zeros_like(Pt)
        for k in range(3):
            dv = np.zeros(3); dv[k] = e
            g[:, k] = (fe.sdf(Pt + dv) - fe.sdf(Pt - dv)) / (2 * e)
        return g
    for _ in range(2):
        g = grad(verts); n = g / np.linalg.norm(g, axis=1, keepdims=True)
        verts = verts - n * fe.sdf(verts)[:, None]
    g = grad(verts); normals = g / np.linalg.norm(g, axis=1, keepdims=True)

    # ---------- cor da pele ----------
    t = fe.t
    feat = {}
    fe.sdf(verts, feat)
    base = np.array(lerp(V(0.91, 0.55, 0.49), V(0.92, 0.61, 0.50), t))
    col = np.tile(base, (len(verts), 1))
    def tint(key, color, sigma, amt):
        w = np.exp(-(np.maximum(feat[key], 0) / sigma) ** 2) * amt
        col[:] = col * (1 - w[:, None]) + np.array(color) * w[:, None]
    tint('lip', (0.86, 0.47, 0.48), 0.012, 0.75)
    tint('cheek', (0.95, 0.60, 0.58), 0.10, 0.35)
    tint('ear', (0.92, 0.58, 0.56), 0.03, 0.45)
    tint('lid', (0.50, 0.24, 0.24), 0.006, 0.9)
    tint('mouth', (0.45, 0.18, 0.20), 0.006, 0.95)
    tint('tip', (0.95, 0.62, 0.60), 0.02, 0.5)
    tint('toe', (0.95, 0.62, 0.60), 0.04, 0.4)
    # variação suave de pele (ruído de baixa frequência)
    rng = np.random.default_rng(week)
    noise = np.zeros(len(verts))
    for _ in range(6):
        k = rng.normal(size=3) * 9; ph = rng.uniform(0, 6.28)
        noise += np.sin(verts @ k + ph)
    col *= (1 + 0.025 * noise / 6)[:, None]
    # oclusão ambiente "assada" via SDF (dobras ficam mais escuras e avermelhadas)
    occ = np.zeros(len(verts)); sca = 1.0
    for i in range(1, 6):
        hh = 0.012 * i * i * 0.6 + 0.01
        dd = fe.sdf(verts + normals * hh)
        occ += (hh - dd) * sca; sca *= 0.7
    ao = np.clip(1 - 2.2 * occ, 0, 1)
    crease = np.array([0.70, 0.36, 0.34])
    col = col * (0.55 + 0.45 * ao[:, None]) + crease * (1 - ao[:, None]) * 0.12
    col = np.clip(col, 0, 1)
    lin = srgb2lin(col)
    rgba = np.hstack([lin, np.ones((len(lin), 1))])

    # orientação final: rosto em 3/4 para a câmera
    R = rotY(-48)
    verts_r = verts @ R.T; normals_r = normals @ R.T
    skin = trimesh.Trimesh(verts_r, faces, vertex_normals=normals_r, process=False)
    skin.visual = trimesh.visual.ColorVisuals(skin, vertex_colors=(rgba * 255).round().astype(np.uint8))

    # ---------- cordão ----------
    curve = fe.cord_curve()
    ncurve = len(curve); seg = 18
    T = np.gradient(curve, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    N0 = np.cross(T[0], V(0, 0, 1)); N0 /= np.linalg.norm(N0)
    Ns = [N0]
    for i in range(1, ncurve):  # transporte paralelo
        n = Ns[-1] - np.dot(Ns[-1], T[i]) * T[i]; Ns.append(n / np.linalg.norm(n))
    Ns = np.array(Ns); Bs = np.cross(T, Ns)
    rad = 0.06 * lerp(0.9, 1.3, t)
    cv, cn, cc = [], [], []
    for i in range(ncurve):
        u = i / (ncurve - 1)
        r = rad * (1 + 0.08 * math.sin(u * 60)) * min(1.0, (1 - u) / 0.12 + 0.02)
        alpha = 1.0 if u < 0.5 else max(0.0, 1 - (u - 0.5) / 0.42) ** 1.5
        for j in range(seg):
            ang = 2 * math.pi * j / seg
            nd = Ns[i] * math.cos(ang) + Bs[i] * math.sin(ang)
            cv.append(curve[i] + nd * r); cn.append(nd)
            vessel = 0.5 + 0.5 * math.cos(3 * ang - u * 70)     # vasos em espiral
            c = lerp(V(0.90, 0.74, 0.76), V(0.66, 0.34, 0.46), vessel ** 4 * 0.85)
            cc.append(list(srgb2lin(c)) + [alpha])
    cf = []
    for i in range(ncurve - 1):
        for j in range(seg):
            a = i * seg + j; b = i * seg + (j + 1) % seg; c = a + seg; d = b + seg
            cf += [[a, c, b], [b, c, d]]
    cv = np.array(cv) @ R.T; cn = np.array(cn) @ R.T
    cord = trimesh.Trimesh(cv, np.array(cf), vertex_normals=cn, process=False)
    cord.visual = trimesh.visual.ColorVisuals(cord, vertex_colors=(np.array(cc) * 255).round().astype(np.uint8))

    scene = trimesh.Scene()
    scene.add_geometry(skin, node_name='skin', geom_name='skin')
    scene.add_geometry(cord, node_name='cord', geom_name='cord')
    data = trimesh.exchange.gltf.export_glb(scene, include_normals=True)
    out = out or f'week_{week}.glb'
    open(out, 'wb').write(data)
    print(f'week {week}: {len(faces)} faces skin, {len(data)/1024:.0f} KB -> {out}', flush=True)

if __name__ == '__main__':
    for w in sys.argv[1:]:
        build(int(w), out=f'/home/claude/sculpt/out/week_{w}.glb')
