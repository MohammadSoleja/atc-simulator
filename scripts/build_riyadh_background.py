"""Extract Riyadh urban context from a local Natural Earth v5.1.2 GeoJSON.

Download the public-domain ne_10m_urban_areas.geojson from the URL recorded in
simulator/airports/oerk.json, then run this script with that file as argument.
No network lookup or external GIS library is needed by the game or this script.
"""
import hashlib
import json
from pathlib import Path
import sys


def extract(source):
    urban = []
    for feature in source['features']:
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        for polygon in polygons:
            points = polygon[0]
            # Retain whole intersecting polygons: no fake edges along the viewport.
            if max(p[0] for p in points) < 45.5 or min(p[0] for p in points) > 47.9 or max(p[1] for p in points) < 23.9 or min(p[1] for p in points) > 26:
                continue
            rings = []
            for ring in polygon:
                rounded = []
                for lon, lat in ring:
                    point = [round(lon, 5), round(lat, 5)]
                    if not rounded or point != rounded[-1]:
                        rounded.append(point)
                if rounded[-1] != rounded[0]:
                    rounded.append(rounded[0])
                if len(rounded) >= 4:
                    rings.append(rounded)
            if rings:
                urban.append(rings)
    return {'urban': urban, 'rivers': []}


if __name__ == '__main__':
    data = Path(sys.argv[1]).read_bytes()
    result = extract(json.loads(data))
    destination = Path(__file__).resolve().parents[1] / 'simulator/static/simulator/js/map-oerk.js'
    destination.write_text('// Natural Earth v5.1.2 urban areas, public domain. Source SHA256: '+hashlib.sha256(data).hexdigest()+'\n// Geographic context only; wadis are not drawn as invented perennial rivers.\nwindow.ATC_MAP_DATA = '+json.dumps(result, separators=(',', ':'))+';\n')
    print(f'Extracted {len(result["urban"])} urban polygons.')
