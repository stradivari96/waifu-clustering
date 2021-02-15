import json

import requests
from sqlitedict import SqliteDict

HEADERS = {"x-requested-with": "XMLHttpRequest"}


def main():
    # Users
    db = SqliteDict("mywaifulist_users.sqlite", autocommit=True)
    for user_id in range(1, 73_336):
        if user_id not in db:
            user_waifus = get_user_waifus(user_id)
            print(user_id)
            print(str(user_waifus))
            db[user_id] = user_waifus

    users = {k: v for k, v in db.items() if v["liked"] or v["trashed"]}
    with open("./data/users.json", "w") as f:
        json.dump(users, f, ensure_ascii=False)

    # Waifus
    db = SqliteDict("mywaifulist_waifus.sqlite", autocommit=True)
    waifu_ids = {
        waifu_id for v in users.values() for waifu_id in v["liked"] + v["trashed"]
    }
    for waifu_id in waifu_ids:
        if waifu_id not in db:
            print(f"Requesting waifu {waifu_id}")
            db[waifu_id] = get_waifu_data(waifu_id)
    with open("./data/waifus.json", "w") as f:
        json.dump(dict(db), f)


def get_user_waifus(user_id: int):
    result = {}
    url_template = "https://mywaifulist.moe/api/user/{user}/waifus/{type}"
    for type_ in ["liked", "trashed"]:
        waifus = []
        url = url_template.format(user=user_id, type=type_)
        while True:
            try:
                r = requests.get(url, headers=HEADERS, timeout=1).json()
                waifus.extend(d["id"] for d in r["data"])
            except (
                KeyError,
                requests.exceptions.MissingSchema,
                requests.exceptions.Timeout,
            ):
                break
            url = r["links"]["next"]
        result[type_] = waifus
    return result


def get_waifu_data(waifu_id: int):
    url = f"https://mywaifulist.moe/api/waifu/{waifu_id}"
    try:
        return requests.get(url, headers=HEADERS, timeout=1).json()["data"]
    except (KeyError, requests.exceptions.Timeout):
        return {}


if __name__ == "__main__":
    main()
