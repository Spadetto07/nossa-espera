"""
Prepara o modelo "Baby" (joekarava, CC BY 4.0) para o app Nossa Espera.

Etapa 1 — malha: une cabeça + corpo (booleana), suaviza a costura do pescoço e os
  degraus da cabeça original, e refaz a malha com triângulos regulares.
Etapa 2 — dados por vértice:
  COLOR_0.r = oclusão ambiente        COLOR_0.g = espessura local (0..12 cm → 0..1)
  COLOR_0.b = rubor (lábios, bochechas, nariz, pontas dos dedos, orelhas)
  COLOR_0.a = 1 − sombra de pálpebras, linha dos cílios e linha entre os lábios
  _SLIM     = deslocamento (xyz) para o corpo "magrinho" do começo da gestação
  _LIMB     = pesos de movimento: antebraço D, antebraço E, perna D, perna E
  + joints.json com pivôs e eixos de cotovelos e joelhos (copiados para baby3d.js)

Uso:  python3 prep_baby.py baby_original.glb baby_full.glb joints.json
      gltf-transform draco baby_full.glb baby.glb
Requer: numpy scipy trimesh embreex manifold3d pymeshlab
"""
import sys, json, numpy as np, trimesh, manifold3d as mf, pymeshlab as pml
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree


def build_mesh(src, target=0.003):
    parts = trimesh.load(src).dump()
    def weld(ms):
        m = trimesh.util.concatenate(ms); m.merge_vertices(digits_vertex=6); return m
    H = weld([g for g in parts if 'testa' in g.metadata['name']])
    B = weld([g for g in parts if 'testa' not in g.metadata['name']])
    def to_mf(m):
        return mf.Manifold(mf.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
    U = (to_mf(H) + to_mf(B)).to_mesh()
    M = trimesh.Trimesh(U.vert_properties[:, :3], U.tri_verts, process=True)
    print('union', len(M.vertices), len(M.faces), M.is_watertight)

    def adjacency(M):
        E = M.edges_unique; n = len(M.vertices)
        A = coo_matrix((np.ones(len(E) * 2), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()
        return A, np.asarray(A.sum(1)).ravel()
    def taubin(M, w, iters, lam=0.5, mu=-0.53):
        A, deg = adjacency(M); V = M.vertices.copy()
        for it in range(iters):
            lap = (A @ V) / deg[:, None] - V
            V += lap * ((lam if it % 2 == 0 else mu) * w)[:, None]
        M.vertices = V

    dh = cKDTree(H.vertices).query(M.vertices)[0]
    db = cKDTree(B.vertices).query(M.vertices)[0]
    seam = np.clip(1 - np.maximum(dh, db) / 0.022, 0, 1) ** 0.7
    taubin(M, seam, 120)
    # a cabeça original é facetada (degraus de ~2 mm em lábios, nariz, pálpebras): alisa só ela
    headw = (dh < 1e-4).astype(float)
    A, deg = adjacency(M)
    for _ in range(6): headw = 0.5 * headw + 0.5 * (A @ headw) / deg
    taubin(M, np.maximum(headw * 0.9, 0.15), 14)

    ms = pml.MeshSet(); ms.add_mesh(pml.Mesh(M.vertices, M.faces))
    ms.meshing_isotropic_explicit_remeshing(iterations=6, adaptive=True, targetlen=pml.PureValue(target),
                                            featuredeg=60, checksurfdist=True, maxsurfdist=pml.PureValue(0.0004))
    m = ms.current_mesh()
    R = trimesh.Trimesh(m.vertex_matrix(), m.face_matrix(), process=True)
    taubin(R, np.ones(len(R.vertices)), 4)
    print('remeshed', len(R.vertices), len(R.faces), 'watertight', R.is_watertight)
    # qualidade: triângulos "virados" em relação aos vizinhos
    ang = R.face_adjacency_angles
    print('dihedral >100deg:', int((ang > np.radians(100)).sum()), ' >140deg:', int((ang > np.radians(140)).sum()))
    q = trimesh.triangles.area(R.triangles); print('area min/median', q.min(), np.median(q))
    return R


def bake(M, out, jout):
    V, N = np.asarray(M.vertices), np.asarray(M.vertex_normals)
    n = len(V)
    E = M.edges_unique
    A = coo_matrix((np.ones(len(E) * 2), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel()
    def blur(x, it):
        for _ in range(it): x = 0.5 * x + 0.5 * ((A @ x) / (deg[:, None] if x.ndim == 2 else deg))
        return x
    sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

    # ---------- AO + espessura ----------
    rng = np.random.default_rng(1)
    scale = np.linalg.norm(M.extents); maxd = scale * 0.18
    tv = np.cross(N, np.where(np.abs(N[:, :1]) < 0.9, [[1, 0, 0]], [[0, 1, 0]])); tv /= np.maximum(np.linalg.norm(tv, axis=1, keepdims=True), 1e-9)
    bv = np.cross(N, tv); org = V + N * scale * 2e-4
    occl = np.zeros(n); nray = 96
    for k in range(nray):
        u1, u2 = rng.random(n), rng.random(n); rr, ph = np.sqrt(u1), 2 * np.pi * u2
        d = tv * (rr * np.cos(ph))[:, None] + bv * (rr * np.sin(ph))[:, None] + N * np.sqrt(1 - u1)[:, None]
        loc, idx, _ = M.ray.intersects_location(org, d, multiple_hits=False)
        dist = np.full(n, np.inf); dist[idx] = np.linalg.norm(loc - org[idx], axis=1)
        occl += np.clip(1 - dist / maxd, 0, 1)
    ao = np.clip(blur(np.nan_to_num(1 - occl / nray, nan=1.0), 2), 0, 1) ** 1.2
    o2 = V - N * scale * 2e-4
    loc, idx, _ = M.ray.intersects_location(o2, -N, multiple_hits=False)
    th = np.full(n, 0.12); th[idx] = np.linalg.norm(loc - o2[idx], axis=1)
    th = blur(np.clip(np.nan_to_num(th, nan=0.12), 0, 0.12), 4)
    print('AO mean', ao.mean().round(3), 'thick p10/p50', np.percentile(th, [10, 50]).round(3))

    # ---------- rosto: pontos de referência (x, y) → superfície ----------
    def surf(x, y):
        loc, _, _ = M.ray.intersects_location([[x, y, 1.0]], [[0, 0, -1.0]], multiple_hits=True)
        return loc[np.argmax(loc[:, 2])]
    def blob(p, r):                       # gaussiana 3D em volta de um ponto da superfície
        return np.exp(-(np.linalg.norm(V - p, axis=1) / r) ** 2)
    def ell(p, rx, ry, rz=0.03, pw=2.0):  # elipse no plano do rosto
        q = (V - p) / np.array([rx, ry, rz]); return np.exp(-(q ** 2).sum(1) ** (pw / 2))
    lips = surf(0.024, 0.019); nose = surf(0.022, 0.064); chin = surf(0.022, -0.010)
    chR, chL = surf(-0.052, 0.040), surf(0.092, 0.040)
    eyR, eyL = surf(-0.040, 0.106), surf(0.086, 0.106)
    thin = 1 - th / 0.12
    blush = np.zeros(n)
    blush = np.maximum(blush, 1.00 * ell(lips, 0.031, 0.0155, 0.022, pw=3.0))
    blush = np.maximum(blush, 0.34 * blob(chR, 0.040)); blush = np.maximum(blush, 0.34 * blob(chL, 0.040))
    blush = np.maximum(blush, 0.30 * blob(nose, 0.020)); blush = np.maximum(blush, 0.16 * blob(chin, 0.024))
    blush = np.maximum(blush, 0.45 * sm(0.70, 0.93, thin))          # dedos, orelhas, artelhos
    blush = np.clip(blur(blush, 1), 0, 1)
    eyes = np.clip(np.maximum(ell(eyR, 0.036, 0.016, 0.03), ell(eyL, 0.034, 0.016, 0.03)), 0, 1)
    # vincos finos (linha dos cílios, linha entre os lábios): concavidade local da superfície
    A2 = A @ A; deg2 = np.asarray(A2.sum(1)).ravel()
    Lm = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1).mean()
    conc = blur((((A2 @ V) / deg2[:, None] - V) * N).sum(1) / Lm, 1)
    eyeReg = np.maximum(ell(eyR, 0.040, 0.014, 0.03, pw=4.0), ell(eyL, 0.038, 0.014, 0.03, pw=4.0))
    lipReg = ell(lips, 0.031, 0.008, 0.02, pw=4.0)
    print('conc eye p50/p90/p99', np.percentile(conc[eyeReg > 0.5], [50, 90, 99]).round(3), 'lip', np.percentile(conc[lipReg > 0.5], [50, 90, 99]).round(3))
    lash = sm(0.035, 0.11, conc) * eyeReg
    mouthline = sm(0.035, 0.11, conc) * lipReg
    eyes = np.clip(np.maximum(eyes * 0.55, np.maximum(lash, mouthline * 0.8)), 0, 1)
    print('lips', lips.round(3), 'nose', nose.round(3), 'eyes', eyR.round(3), eyL.round(3))

    # ---------- corpo magrinho (delta) ----------
    HC, HR = np.array([-0.011, 0.150, -0.100]), 0.165
    wHead = 1 - sm(HR * 0.9, HR * 1.7, np.linalg.norm(V - HC, axis=1))
    Ns = blur(N.copy(), 6); Ns /= np.linalg.norm(Ns, axis=1, keepdims=True)
    ths = blur(th.copy(), 10)
    crease = sm(0.50, 0.88, blur(ao.copy(), 3))          # dobras (axila, virilha) quase não se mexem
    slim = -Ns * (0.17 * ths * (1 - wHead) * crease)[:, None]
    slim = blur(slim, 14)
    print('slim max (mm)', (np.linalg.norm(slim, axis=1).max() * 1000).round(1))

    # ---------- membros: pesos geodésicos + articulações ----------
    L = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    G = coo_matrix((np.r_[L, L], (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()
    back = np.argmin(np.linalg.norm(V - np.array([0.0, -0.15, -0.2]), axis=1))
    d0 = dijkstra(G, indices=back)
    limbs = [  # nome, caixa da ponta, distância geodésica da articulação
     ('armR', (-0.30, -0.02, -0.05, 0.12, 0.05, 0.40), 0.29),
     ('armL', (0.17, 0.30, -0.06, 0.03, 0.05, 0.45), 0.29),
     ('legR', (-0.20, 0.0, -0.36, -0.10, 0.25, 0.50), 0.27),
     ('legL', (0.0, 0.20, -0.36, -0.05, 0.25, 0.50), 0.27)]
    W = np.zeros((n, 4)); joints = []; ends = np.zeros(n)
    for i, (name, (x0, x1, y0, y1, z0, z1), dj) in enumerate(limbs):
        m = (V[:, 0] > x0) & (V[:, 0] < x1) & (V[:, 1] > y0) & (V[:, 1] < y1) & (V[:, 2] > z0) & (V[:, 2] < z1)
        idx = np.where(m)[0]; tip = idx[np.argmax(d0[idx])]
        dt = dijkstra(G, indices=tip)
        ring = lambda d: V[(dt > d - 0.012) & (dt < d + 0.012)].mean(0)
        piv, dist_, prox = ring(dj), ring(dj - 0.13), ring(dj + 0.10)
        f, u = dist_ - piv, prox - piv
        ax = np.cross(u, f); ax /= np.linalg.norm(ax)        # ângulo positivo = estender (abrir)
        W[:, i] = 1 - sm(dj - 0.055, dj + 0.03, dt)
        ends = np.maximum(ends, 1 - sm(0.10, 0.16, dt))          # mãos e pés
        joints.append({'name': name, 'pivot': piv.round(4).tolist(), 'axis': ax.round(4).tolist()})
        print(name, 'tip', V[tip].round(3), 'pivot', piv.round(3), 'axis', ax.round(3), 'verts', int((W[:, i] > 0.5).sum()))
    json.dump(joints, open(jout, 'w'), indent=1)
    # mãos e pés quase não afinam (dedos já são finos); canelas afinam menos
    keep = blur(np.clip(1 - 0.75 * ends - 0.35 * np.maximum(W[:, 2], W[:, 3]), 0.2, 1), 6)
    slim *= keep[:, None]

    col = np.stack([ao, th / 0.12, blush, 1 - 0.9 * eyes], 1)
    M.visual = trimesh.visual.ColorVisuals(M, vertex_colors=(np.clip(col, 0, 1) * 255).round().astype(np.uint8))
    M.vertex_attributes = {'_SLIM': slim.astype(np.float32), '_LIMB': (np.clip(W, 0, 1) * 255).round().astype(np.uint8)}
    sc = trimesh.Scene(); sc.add_geometry(M, node_name='skin', geom_name='skin')
    open(out, 'wb').write(trimesh.exchange.gltf.export_glb(sc, include_normals=True))


if __name__ == '__main__':
    bake(build_mesh(sys.argv[1]), sys.argv[2], sys.argv[3])
