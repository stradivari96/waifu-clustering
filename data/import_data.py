import json
from itertools import combinations, product
from pathlib import Path

import numpy as np
from sklearn.preprocessing import MinMaxScaler

project_root = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    max_rank = 1000

    with open(project_root / "data" / "waifus.json") as f:
        waifus = json.load(f)
    valid_waifus_ids = {
        w["id"]
        for w in waifus.values()
        if w.get("like_rank") and w["like_rank"] <= max_rank
    }

    nodes = [
        {
            "id": w["id"],
            "name": w["name"],
            "display_picture": w["display_picture"],
            "like_rank": w["like_rank"],
        }
        for w in waifus.values()
        if w and w["id"] in valid_waifus_ids
    ]
    with open(project_root / "frontend" / "src" / "waifus.json", "w") as f:
        json.dump(nodes, f)

    with open(project_root / "data" / "users.json") as f:
        users = json.load(f)
    links = {(a, b): 0 for a, b in combinations(sorted(n["id"] for n in nodes), 2)}
    for user in users.values():
        if len(user["liked"]) <= 1:
            continue
        # Like
        liked = [w for w in user["liked"] if w in valid_waifus_ids]
        liked = sorted(liked)
        for a, b in combinations(liked, 2):
            if a != b:
                links[a, b] += 1
        # Trash
        # trashed = [w for w in user["trashed"] if w in valid_waifus_ids]
        # trashed = sorted(trashed)
        # for a, b in combinations(trashed, 2):
        #     if a != b:
        #         links[a, b] += 0.1
        # Like x Trash
        # for a, b in product(liked, trashed):
        #     a, b = sorted([a, b])
        #     if a != b:
        #         links[a, b] -= 0.1

    # TODO: correct impopular waifus values
    scaler = MinMaxScaler()
    scaler.fit(np.array(list(links.values())).reshape(-1, 1))
    links = [
        {"source": a, "target": b, "value": 1 / (1 + scaler.transform([[v]])[0][0])}
        for (a, b), v in links.items()
    ]
    with open(project_root / "frontend" / "src" / "waifu_links.json", "w") as f:
        json.dump(links, f)
