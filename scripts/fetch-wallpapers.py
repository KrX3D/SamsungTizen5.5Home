import json, os, re, sys, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
OUT = sys.argv[1]
MANIFEST = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
UA = "HomeDockBuilder/1.1 (personal TV launcher)"
API = "https://commons.wikimedia.org/w/api.php"
CATS = [
    "Category:Featured pictures of landscapes",
    "Category:Featured pictures of mountains",
    "Category:Featured pictures of lakes",
    "Category:Featured pictures of forests",
    "Category:Featured pictures of coasts",
    "Category:Featured pictures of waterfalls",
    "Category:Featured pictures of deserts",
    "Category:Featured pictures of nature",
]
WANT, PER_CAT = 12, 3

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)

def clean(html):
    t = re.sub(r"<[^>]+>", "", html or "")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^[\d][\d_\-. ]*\s+(?=\D)", "", t)   # "20090719 Kotor Bay" -> "Kotor Bay"
    t = re.sub(r"\s*This file was uploaded with Commonist\.?", "", t)
    return t[:80]

picked, seen = [], set()
for cat in CATS:
    if len(picked) >= WANT:
        break
    try:
        data = api({
            "action": "query", "format": "json",
            "generator": "categorymembers", "gcmtitle": cat,
            "gcmtype": "file", "gcmlimit": "60",
            "prop": "imageinfo", "iiprop": "url|mime|size|extmetadata",
            "iiurlwidth": "1920",
        })
    except Exception as e:
        print("cat failed", cat, e); continue
    n = 0
    for p in (data.get("query") or {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        w, h = ii.get("width") or 0, ii.get("height") or 1
        tw, th = ii.get("thumbwidth") or 0, ii.get("thumbheight") or 0
        if ii.get("mime") != "image/jpeg" or not ii.get("thumburl"):
            continue
        # full-HD after scaling, and landscape between 4:3 and 16:9
        if w < 1920 or th < 1080 or not (1.33 <= w / h <= 1.80):
            continue
        if ii["thumburl"] in seen:
            continue
        md = ii.get("extmetadata") or {}
        title = clean((md.get("ObjectName") or {}).get("value")) or p["title"][5:].rsplit(".", 1)[0]
        artist = clean((md.get("Artist") or {}).get("value"))
        lic = clean((md.get("LicenseShortName") or {}).get("value"))
        seen.add(ii["thumburl"])
        picked.append({"url": ii["thumburl"], "credit": " · ".join(x for x in (title, artist, lic) if x)})
        n += 1
        if n >= PER_CAT or len(picked) >= WANT:
            break

walls = []
for i, it in enumerate(picked, 1):
    fn = "wall%02d.jpg" % i
    try:
        req = urllib.request.Request(it["url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            b = r.read()
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(b)
        walls.append({"file": fn, "credit": it["credit"]})
        print("OK", fn, len(b), it["credit"])
    except Exception as e:
        print("dl failed", it["url"], e)

with open(MANIFEST, "w", encoding="utf-8") as f:
    f.write("window.WALLPAPERS = " + json.dumps(walls, ensure_ascii=False) + ";")
print("TOTAL", len(walls))
