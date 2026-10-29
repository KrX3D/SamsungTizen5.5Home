"""Builds the weather-location data in app/places/ from GeoNames (CC BY 4.0).

    places/index.json         countries -> states (names in en and de)
    places/<CC>/<STATE>.json  that state's districts -> places [name, lat, lon]

One file per state, so the TV only loads the state being browsed.
Germany comes from the full DE dump (every village, grouped by Kreis);
the other countries from cities1000 (towns of 1000+), grouped by admin2.

Inputs, all from https://download.geonames.org/export/dump/ :
    python scripts/build-places.py <dir with cities1000.txt DE.txt admin1CodesASCII.txt admin2Codes.txt> app/places
"""
import json
import os
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
sys.stdout.reconfigure(encoding="utf-8")

COUNTRIES = {   # code: (en, de)
    "DE": ("Germany", "Deutschland"), "AT": ("Austria", "Österreich"), "CH": ("Switzerland", "Schweiz"),
    "NL": ("Netherlands", "Niederlande"), "BE": ("Belgium", "Belgien"), "LU": ("Luxembourg", "Luxemburg"),
    "FR": ("France", "Frankreich"), "IT": ("Italy", "Italien"), "ES": ("Spain", "Spanien"),
    "PT": ("Portugal", "Portugal"), "GB": ("United Kingdom", "Vereinigtes Königreich"), "IE": ("Ireland", "Irland"),
    "DK": ("Denmark", "Dänemark"), "SE": ("Sweden", "Schweden"), "NO": ("Norway", "Norwegen"),
    "FI": ("Finland", "Finnland"), "PL": ("Poland", "Polen"), "CZ": ("Czechia", "Tschechien"),
    "SK": ("Slovakia", "Slowakei"), "HU": ("Hungary", "Ungarn"), "SI": ("Slovenia", "Slowenien"),
    "HR": ("Croatia", "Kroatien"), "GR": ("Greece", "Griechenland"), "TR": ("Türkiye", "Türkei"),
    "US": ("United States", "Vereinigte Staaten"), "CA": ("Canada", "Kanada"),
}
# German names for the German-speaking countries' states; the rest use GeoNames' names.
STATE_DE = {
    "DE": {"01": "Baden-Württemberg", "02": "Bayern", "03": "Bremen", "04": "Hamburg", "05": "Hessen",
           "06": "Niedersachsen", "07": "Nordrhein-Westfalen", "08": "Rheinland-Pfalz", "09": "Saarland",
           "10": "Schleswig-Holstein", "11": "Brandenburg", "12": "Mecklenburg-Vorpommern", "13": "Sachsen",
           "14": "Sachsen-Anhalt", "15": "Thüringen", "16": "Berlin"},
    "AT": {"01": "Burgenland", "02": "Kärnten", "03": "Niederösterreich", "04": "Oberösterreich",
           "05": "Salzburg", "06": "Steiermark", "07": "Tirol", "08": "Vorarlberg", "09": "Wien"},
    "CH": {"AG": "Aargau", "AI": "Appenzell Innerrhoden", "AR": "Appenzell Ausserrhoden", "BE": "Bern",
           "BL": "Basel-Landschaft", "BS": "Basel-Stadt", "FR": "Freiburg", "GE": "Genf", "GL": "Glarus",
           "GR": "Graubünden", "JU": "Jura", "LU": "Luzern", "NE": "Neuenburg", "NW": "Nidwalden",
           "OW": "Obwalden", "SG": "St. Gallen", "SH": "Schaffhausen", "SO": "Solothurn", "SZ": "Schwyz",
           "TG": "Thurgau", "TI": "Tessin", "UR": "Uri", "VD": "Waadt", "VS": "Wallis", "ZG": "Zug", "ZH": "Zürich"},
}
SKIP_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}   # city districts, historical, abandoned


def rows(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n").split("\t")


def district(name):
    """'Landkreis Limburg-Weilburg' -> 'Limburg-Weilburg', 'Kreisfreie Stadt Kassel' -> 'Kassel (Stadt)'."""
    m = re.match(r"^(Kreisfreie Stadt|Stadtkreis) (.+)$", name)
    if m:
        return m.group(2) + " (Stadt)"
    return re.sub(r"^(Landkreis|Kreis|Politischer Bezirk|Bezirk|District de|Distretto|Bezirk) ", "", name)


admin1 = {}
for f in rows("admin1CodesASCII.txt"):
    admin1[f[0]] = f[1]
admin2 = {}
for f in rows("admin2Codes.txt"):
    admin2[f[0]] = f[1]

# Germany: Kreis (ADM3) and Gemeinde (ADM4) names come from the full dump itself.
kreis, gemeinde, de_places = {}, {}, []
for f in rows("DE.txt"):
    cls, code, a1, a3, a4 = f[6], f[7], f[10], f[12], f[13]
    if code == "ADM3":
        kreis[a3] = district(f[1])
    elif code == "ADM4":
        gemeinde[a4] = re.sub(r"\s*,.*$", "", f[1])      # "Merenberg, Marktflecken" -> "Merenberg"
    elif cls == "P" and code not in SKIP_CODES and a1 in STATE_DE["DE"]:
        de_places.append(f)

data = {}   # cc -> state code -> district -> {label: [lat, lon]}


def add(cc, st, grp, label, lat, lon):
    data.setdefault(cc, {}).setdefault(st, {}).setdefault(grp, {}).setdefault(label, [round(lat, 3), round(lon, 3)])


for f in de_places:
    name, a1, a3, a4 = f[1], f[10], f[12], f[13]
    if a3 not in kreis:          # a few entries carry no Kreis; they would form a nameless group
        continue
    g = gemeinde.get(a4, "")
    label = name if not g or g.startswith(name) or name.startswith(g) else name + " · " + g
    add("DE", a1, kreis.get(a3, ""), label, float(f[4]), float(f[5]))

for f in rows("cities1000.txt"):
    cc, code, a1, a2 = f[8], f[7], f[10], f[11]
    if cc not in COUNTRIES or cc == "DE" or code in SKIP_CODES or not a1:
        continue
    grp = district(admin2.get("%s.%s.%s" % (cc, a1, a2), "")) if a2 else ""
    add(cc, a1, grp, f[1], float(f[4]), float(f[5]))

index = []
total = 0
for cc, (en, de) in COUNTRIES.items():
    states = []
    for st, groups in data.get(cc, {}).items():
        name = STATE_DE.get(cc, {}).get(st) or admin1.get("%s.%s" % (cc, st)) or st
        out = []
        for grp in sorted(groups, key=lambda s: s.lower()):
            places = sorted(([lbl] + ll for lbl, ll in groups[grp].items()), key=lambda p: p[0].lower())
            out.append([grp, places])
            total += len(places)
        path = os.path.join(OUT, cc)
        os.makedirs(path, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9_-]", "_", st)
        with open(os.path.join(path, safe + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"g": out}, fh, ensure_ascii=False, separators=(",", ":"))
        states.append({"code": safe, "name": name})
    states.sort(key=lambda s: s["name"].lower())
    index.append({"cc": cc, "en": en, "de": de, "states": states})

with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
    json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
print("countries", len(index), "places", total)
