"""
Prepara o modelo "Baby" (joekarava, CC BY 4.0) para o app Nossa Espera.
  1. une cabeça + corpo numa única malha fechada (booleana, manifold3d)
  2. suaviza a costura do pescoço
  3. simplifica (~190 mil triângulos)
  4. assa por vértice: R = oclusão ambiente, G = espessura local
Uso: python3 prep_baby.py baby_original.glb saida.glb   (depois: gltf-transform draco)
"""
import sys, numpy as np, trimesh, fast_simplification, manifold3d as mf
from scipy.sparse import coo_matrix

src, out = sys.argv[1], sys.argv[2]
parts = trimesh.load(src).dump()
def weld(ms):
    m = trimesh.util.concatenate(ms); m.merge_vertices(digits_vertex=6); return m
H = weld([g for g in parts if 'testa' in g.metadata['name']])
B = weld([g for g in parts if 'testa' not in g.metadata['name']])

def to_mf(m):
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
U = (to_mf(H) + to_mf(B)).to_mesh()
M = trimesh.Trimesh(U.vert_properties[:, :3], U.tri_verts, process=True)
print('union', len(M.vertices), len(M.faces), 'watertight', M.is_watertight)

# --- suaviza a costura: vértices perto das DUAS superfícies originais ---
from scipy.spatial import cKDTree
dh = cKDTree(H.vertices).query(M.vertices)[0]
db = cKDTree(B.vertices).query(M.vertices)[0]
seam = np.maximum(dh, db)
w = np.clip(1 - seam / 0.022, 0, 1) ** 0.7   # 1 na costura, 0 a 2,2 cm
print('seam verts', int((w > 0).sum()))
E = M.edges_unique
n = len(M.vertices)
A = coo_matrix((np.ones(len(E) * 2), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()
deg = np.asarray(A.sum(1)).ravel()
V = M.vertices.copy()
for it in range(120):
    lap = (A @ V) / deg[:, None] - V
    lam = 0.5 if it % 2 == 0 else -0.53       # Taubin (sem encolher)
    V += lap * (lam * w)[:, None]
M.vertices = V

r = max(0.0, 1 - 190000 / len(M.faces))
v, f = fast_simplification.simplify(M.vertices.astype(np.float32), M.faces.astype(np.int32), r)
M = trimesh.Trimesh(v, f, process=True)
print('simplified', len(M.faces))
# leve Taubin global para tirar o "serrilhado" da simplificação
trimesh.smoothing.filter_taubin(M, lamb=0.5, nu=0.52, iterations=4)

# --- AO (hemisfério cosseno) ---
rng = np.random.default_rng(1)
V, N = M.vertices, M.vertex_normals
scale = np.linalg.norm(M.extents); maxd = scale * 0.18
occl = np.zeros(len(V)); nray = 64
tvec = np.cross(N, np.where(np.abs(N[:, :1]) < 0.9, [[1, 0, 0]], [[0, 1, 0]])); tvec /= np.maximum(np.linalg.norm(tvec, axis=1, keepdims=True), 1e-9)
bvec = np.cross(N, tvec)
origins = V + N * scale * 2e-4
for k in range(nray):
    u1, u2 = rng.random(len(V)), rng.random(len(V))
    rr, ph = np.sqrt(u1), 2 * np.pi * u2
    d = tvec * (rr * np.cos(ph))[:, None] + bvec * (rr * np.sin(ph))[:, None] + N * np.sqrt(1 - u1)[:, None]
    loc, idx, _ = M.ray.intersects_location(origins, d, multiple_hits=False)
    dist = np.full(len(V), np.inf); dist[idx] = np.linalg.norm(loc - origins[idx], axis=1)
    occl += np.clip(1 - dist / maxd, 0, 1)
ao = 1 - occl / nray
# --- espessura local (raio para dentro) ---
o2 = V - N * scale * 2e-4
loc, idx, _ = M.ray.intersects_location(o2, -N, multiple_hits=False)
th = np.full(len(V), 0.12); th[idx] = np.linalg.norm(loc - o2[idx], axis=1)
th = np.clip(th, 0, 0.12)
nb = M.vertex_neighbors
for _ in range(3):
    ao = np.array([0.5 * ao[i] + 0.5 * ao[x].mean() for i, x in enumerate(nb)])
    th = np.array([0.5 * th[i] + 0.5 * th[x].mean() for i, x in enumerate(nb)])
ao = np.clip(np.nan_to_num(ao, nan=1.0), 0, 1) ** 1.2
th = np.nan_to_num(th, nan=0.12)
print('AO mean', ao.mean().round(3), 'thick p10/p50', np.percentile(th, [10, 50]).round(3))
col = np.stack([ao, th / 0.12, np.zeros_like(ao), np.ones_like(ao)], 1)
M.visual = trimesh.visual.ColorVisuals(M, vertex_colors=(col * 255).round().astype(np.uint8))
sc = trimesh.Scene(); sc.add_geometry(M, node_name='skin', geom_name='skin')
open(out, 'wb').write(trimesh.exchange.gltf.export_glb(sc, include_normals=True))
print('bounds', M.bounds.round(4).tolist())
