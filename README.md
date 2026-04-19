# Waifu Clustering

An interactive 2D visualization of anime character relationships, powered by real user preference data from MyWaifuList. Characters who are loved together appear close together — revealing the hidden structure of anime fandom taste.

**[Live Demo](https://xiang.es/waifu-clustering/)**

---

## What It Does

The app places ~850 anime characters on a 2D canvas based on how similarly they are liked by users. Closeness = shared fans. Characters from the same show often cluster together, but so do characters that transcend series — sharing a "type" that fans gravitate toward.

- Zoom in to see character portraits fade into view
- Click a character to see their similar waifus, anti-waifus (characters their fans tend to dislike), and stats
- Search by name or series
- Filter by top series using the legend

---

## Features

- **Canvas-based rendering** — smooth zoom (0.03x–20x) and pan with D3, device-pixel-ratio aware for sharp Retina display rendering
- **Relationship overlays** — teal lines for similar characters, red lines for anti-waifus
- **Detail panel** — rank, likes, trash count, controversy score, links to MyWaifuList
- **Fuzzy search** — search by character name or series with thumbnail suggestions (Fuse.js)
- **Series filtering** — filter by top 12 series with colored legend buttons
- **Popularity sizing** — character dot radius scales with √(likes)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Canvas 2D API |
| Interactions | D3.js (zoom/pan) |
| Search | Fuse.js |
| Data pipeline | Python — scikit-learn, scipy, NumPy |

---

## How the Layout Is Computed

The data pipeline in [data/compute_tsne.py](data/compute_tsne.py) runs once to generate the layout:

1. **Jaccard similarity** — for every pair of characters, compute `|shared likers| / |union of likers|`
2. **t-SNE** — reduce the similarity matrix to 2D coordinates (perplexity=30, 1000 iterations)
3. **Overlap resolution** — iteratively push overlapping circles apart using a spatial index (cKDTree)
4. **Relationship maps** — output top-10 similar neighbors and top-5 anti-waifus per character

The anti-waifu metric applies a popularity penalty (`trash_count^1.35`) to suppress universally-trashed characters and surface genuine taste disagreements.

Generated files are saved to `public/` and served statically — no backend needed at runtime.

---

## Getting Started

### Prerequisites

- Node.js 14+
- Python 3.8+

### Frontend

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build → dist/
```

### Data Pipeline (optional — prebuilt data is included)

```bash
pip install -r data/requirements.txt
python data/compute_tsne.py
# Outputs: public/waifu_layout.json, waifu_neighbors.json,
#          waifu_similar.json, waifu_antiwaifus.json
```

> **Note:** t-SNE on the full dataset takes ~6 minutes. The precomputed output is already in `public/`, so you only need to rerun this if you update the source data.

---

## Data

| File | Description |
|------|-------------|
| `src/waifus.json` | ~850 characters with name, series, portrait URL, rank, likes, trash count |
| `data/users.json` | Raw preference data — user IDs mapped to liked/trashed character IDs |
| `public/waifu_layout.json` | t-SNE x/y coordinates per character |
| `public/waifu_neighbors.json` | Top-10 similar characters (canvas link overlays) |
| `public/waifu_similar.json` | Top-10 similar characters (sidebar) |
| `public/waifu_antiwaifus.json` | Top-5 anti-waifus per character |

Source data is from [MyWaifuList](https://mywaifulist.moe).

---

## Deployment

The app is a fully static SPA — deploy the `dist/` folder anywhere. It is configured for GitHub Pages hosting at the `/waifu-clustering/` subpath via `vite.config.js`.

```bash
npm run build
# Deploy dist/ to GitHub Pages or any static host
```
