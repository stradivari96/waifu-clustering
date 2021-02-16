import json
from itertools import combinations
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    min_rank = 150

    with open(project_root / "data" / "waifus.json") as f:
        waifus = json.load(f)

    nodes = [
        {
            "id": w["id"],
            "name": w["name"],
            "display_picture": w["display_picture"],
            "like_rank": w["like_rank"],
        }
        for w in waifus.values()
        if (w.get("like_rank") or 1000) <= min_rank
    ]
    with open(project_root / "frontend" / "src" / "waifus.json", "w") as f:
        json.dump(nodes, f)

    with open(project_root / "data" / "users.json") as f:
        users = json.load(f)
    links = {(a, b): 0 for a, b in combinations(sorted(n["id"] for n in nodes), 2)}
    for user in users.values():
        if len(user["liked"]) <= 1:
            continue
        liked = [
            w
            for w in user["liked"]
            if (waifus[str(w)].get("like_rank") or 1000) <= min_rank
        ]
        liked = sorted(liked)
        for a, b in combinations(liked, 2):
            if a != b:
                links[a, b] += 1

    links = [{"source": a, "target": b, "value": v} for (a, b), v in links.items()]
    with open(project_root / "frontend" / "src" / "waifu_links.json", "w") as f:
        json.dump(links, f)
