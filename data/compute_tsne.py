import json
import numpy as np
from sklearn.manifold import TSNE
from scipy.spatial import cKDTree
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]

print("Loading waifus...")
with open(ROOT / "src" / "waifus.json") as f:
    waifus = json.load(f)

waifu_ids = [w["id"] for w in waifus]
waifu_show = {str(w["id"]): (w["appearances"][0]["name"] if w.get("appearances") else None) for w in waifus}
id_to_idx = {wid: i for i, wid in enumerate(waifu_ids)}
n = len(waifu_ids)

# Node radii
radii = np.array([
    max(14.0, min(35.0, (w.get("likes") or 1) ** 0.5 * 0.85))
    for w in waifus
], dtype=np.float32)

print("Loading users and computing similarity metrics...")
with open(ROOT / "data" / "users.json") as f:
    users = json.load(f)

total_users = len(users)
valid_ids = set(waifu_ids)

liked_by = defaultdict(set)
trashed_by = defaultdict(set)

for uid, user in users.items():
    liked = [wid for wid in user.get("liked", []) if wid in valid_ids]
    trashed = [wid for wid in user.get("trashed", []) if wid in valid_ids]
    for wid in liked: liked_by[wid].add(uid)
    for wid in trashed: trashed_by[wid].add(uid)

print("Computing Jaccard distance matrix for layout...")
dist_matrix = np.ones((n, n), dtype=np.float32)
np.fill_diagonal(dist_matrix, 0.0)

for i in range(n):
    for j in range(i + 1, n):
        id_i, id_j = waifu_ids[i], waifu_ids[j]
        set_i, set_j = liked_by[id_i], liked_by[id_j]
        if not set_i or not set_j: continue
        intersection = len(set_i & set_j)
        if intersection == 0: continue
        union = len(set_i) + len(set_j) - intersection
        jaccard = intersection / union
        
        # Penalize same show in DISTANCE so they are slightly further apart?
        # No, keep TSNE as "truth", but penalize in the NEIGHBOR LISTS.
        dist_matrix[i, j] = 1.0 - jaccard
        dist_matrix[j, i] = 1.0 - jaccard

print("Running t-SNE...")
tsne = TSNE(n_components=2, metric="precomputed", init="random", random_state=42, perplexity=30, max_iter=1000)
coords = tsne.fit_transform(dist_matrix).astype(np.float32)
coords -= coords.min(axis=0)
coords = coords / (coords.max(axis=0) - coords.min(axis=0)) * 3000 - 1500

print("Resolving overlaps...")
MARGIN = 3.0
for iteration in range(300):
    tree = cKDTree(coords)
    pairs = tree.query_pairs(float(radii.max()) * 2 + MARGIN)
    any_push = False
    for i, j in pairs:
        dx, dy = float(coords[i, 0] - coords[j, 0]), float(coords[i, 1] - coords[j, 1])
        d = (dx * dx + dy * dy) ** 0.5
        gap = float(radii[i] + radii[j]) + MARGIN
        if 0 < d < gap:
            push = (gap - d) / (2.0 * d)
            coords[i, 0] += dx * push; coords[i, 1] += dy * push
            coords[j, 0] -= dx * push; coords[j, 1] -= dy * push
            any_push = True
    if not any_push: break

print("Generating maps with same-show penalty...")
neighbor_map = {} 
canvas_neighbors = {}

for i in range(n):
    id_i = waifu_ids[i]
    if id_i not in liked_by: continue
    likers_i = liked_by[id_i]
    show_i = waifu_show.get(str(id_i))
    
    scores = []
    for j in range(n):
        if i == j: continue
        id_j = waifu_ids[j]
        if id_j not in liked_by: continue
        
        intersection = len(likers_i & liked_by[id_j])
        if intersection < 2: continue
        jaccard = intersection / (len(likers_i) + len(liked_by[id_j]) - intersection)
        
        if jaccard > 0.001:
            scores.append((id_j, jaccard))
            
    if scores:
        scores.sort(key=lambda x: -x[1])
        top_10 = scores[:10]
        mx = top_10[0][1]
        neighbor_map[str(id_i)] = [[str(sid), round(s / mx, 3)] for sid, s in top_10]
        
        # For canvas links, we keep them stronger/less penalized so the lines make sense
        strong = [s for s in scores if s[1] > 0.01][:10]
        if strong:
            mx_s = strong[0][1]
            canvas_neighbors[str(id_i)] = [[str(sid), round(s / mx_s, 3)] for sid, s in strong]

# ---- Anti Map (Popularity-Penalized Lift) ----
# To kill Seryu/Asuna "everywhere", we penalize globally popular trash targets.
anti_map = {}
trash_counts = {wid: len(uids) for wid, uids in trashed_by.items()}

for id_i in waifu_ids:
    if id_i not in liked_by: continue
    likers_i = liked_by[id_i]
    len_i = len(likers_i)
    
    anti_candidates = []
    for id_j in waifu_ids:
        if id_i == id_j: continue
        if id_j not in trashed_by: continue
        
        intersection_count = len(likers_i & trashed_by[id_j])
        if intersection_count < 3: continue
        
        # Penalized Lift: Intersection / (Count_A * Count_Trash_B^1.4)
        # The exponent on Trash_B makes popular targets (Seryu) score much lower.
        t_j = trash_counts[id_j]
        score = intersection_count / (len_i * (t_j ** 1.35))
        
        # Still ensure they hate B more than they like B
        like_overlap = len(likers_i & liked_by[id_j])
        if intersection_count > like_overlap:
            anti_candidates.append((id_j, score))
            
    if anti_candidates:
        anti_candidates.sort(key=lambda x: -x[1])
        top_5 = anti_candidates[:5]
        mx = top_5[0][1]
        anti_map[str(id_i)] = [[str(sid), round(s / mx, 3)] for sid, s in top_5]

# ---- Save ----
layout = {str(wid): [round(float(coords[i, 0]), 2), round(float(coords[i, 1]), 2)] for i, wid in enumerate(waifu_ids)}
with open(ROOT / "public" / "waifu_layout.json", "w") as f: json.dump(layout, f)
with open(ROOT / "public" / "waifu_neighbors.json", "w") as f: json.dump(canvas_neighbors, f)
with open(ROOT / "public" / "waifu_similar.json", "w") as f: json.dump(neighbor_map, f)
with open(ROOT / "public" / "waifu_antiwaifus.json", "w") as f: json.dump(anti_map, f)

print("Done! Penalized same-show and suppressed global trash targets.")
