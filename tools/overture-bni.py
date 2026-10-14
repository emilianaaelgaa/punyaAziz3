#!/usr/bin/env python3
"""
Ambil semua tempat bernama/berbrand BNI di Indonesia dari Overture Maps (tema places).

Keluaran: JSON ringkas untuk tools/build-overture-bni.js, yang menyaring dan
menyusun data/kantor-bni-overture.json. Butuh: pip install pyarrow

  python3 tools/overture-bni.py > /tmp/bni-overture-raw.json
  python3 tools/overture-bni.py --release 2026-09-23.1 > /tmp/bni-overture-raw.json
"""
import argparse, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

BUCKET = 'overturemaps-us-west-2'
LIST_URL = 'https://' + BUCKET + '.s3.us-west-2.amazonaws.com/?list-type=2&prefix='
W, E, S, N = 94.5, 141.5, -11.5, 6.5  # bbox Indonesia
NAME_RE = r'(?i)(^|[^a-z])bni([^a-z]|$)|negara indonesia'
BNI_WIKIDATA = 'Q2882611'
COLS = ['id', 'names.primary', 'brand.wikidata', 'brand.names.primary', 'basic_category', 'confidence',
        'addresses', 'phones', 'sources', 'bbox.xmin', 'bbox.ymin']


def s3_keys(prefix):
    xml = urllib.request.urlopen(LIST_URL + prefix, timeout=60).read().decode()
    return re.findall(r'<Key>([^<]+)</Key>', xml), re.findall(r'<Prefix>([^<]+)</Prefix>', xml)


def latest_release():
    xml = urllib.request.urlopen(LIST_URL + 'release/&delimiter=/', timeout=60).read().decode()
    rel = sorted(re.findall(r'<Prefix>release/([^<]+)/</Prefix>', xml))
    if not rel:
        sys.exit('Tidak ada rilis Overture yang terbaca.')
    return rel[-1]


def overlapping_row_groups(fs, key):
    md = pq.ParquetFile(BUCKET + '/' + key, filesystem=fs).metadata
    paths = [md.schema.column(i).path for i in range(md.num_columns)]
    ix = {p: paths.index(p) for p in ('bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax')}
    hits = []
    for r in range(md.num_row_groups):
        st = {p: md.row_group(r).column(i).statistics for p, i in ix.items()}
        if not all(s is not None and s.has_min_max for s in st.values()):
            hits.append(r)
        elif not (st['bbox.xmax'].max < W or st['bbox.xmin'].min > E or st['bbox.ymax'].max < S or st['bbox.ymin'].min > N):
            hits.append(r)
    return hits


def read_group(fs, key, rg):
    t = pq.ParquetFile(BUCKET + '/' + key, filesystem=fs).read_row_group(rg, columns=COLS).flatten().flatten()
    x, y = t['bbox.xmin'], t['bbox.ymin']
    inside = pc.and_(pc.and_(pc.greater_equal(x, W), pc.less_equal(x, E)),
                     pc.and_(pc.greater_equal(y, S), pc.less_equal(y, N)))
    name = pc.fill_null(t['names.primary'], '')
    brand = pc.fill_null(t['brand.names.primary'], '')
    is_bni = pc.or_(pc.match_substring_regex(name, NAME_RE),
                    pc.or_(pc.equal(pc.fill_null(t['brand.wikidata'], ''), BNI_WIKIDATA),
                           pc.match_substring_regex(brand, NAME_RE)))
    out = []
    for r in t.filter(pc.and_(inside, is_bni)).to_pylist():
        a = (r.get('addresses') or [{}])[0] or {}
        out.append({
            'id': r['id'], 'name': r['names.primary'] or r['brand.names.primary'] or '',
            'cat': r['basic_category'], 'conf': round(r['confidence'] or 0, 3),
            'lat': round(r['bbox.ymin'], 6), 'lon': round(r['bbox.xmin'], 6),
            'addr': a.get('freeform') or '', 'city': a.get('locality') or '', 'region': a.get('region') or '',
            'postcode': a.get('postcode') or '', 'country': a.get('country') or '',
            'phone': (r.get('phones') or [''])[0] or '',
            'src': sorted({s['dataset'] for s in (r.get('sources') or []) if s.get('dataset') != 'Overture'}),
            'license': sorted({s['license'] for s in (r.get('sources') or []) if s.get('license')})
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--release', help='mis. 2026-09-23.1 (bawaan: rilis terbaru)')
    args = ap.parse_args()
    release = args.release or latest_release()
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    fs = pafs.S3FileSystem(anonymous=True, region='us-west-2', **({'proxy_options': proxy} if proxy else {}))
    keys, _ = s3_keys('release/' + release + '/theme=places/type=place/')
    keys = [k for k in keys if k.endswith('.parquet')]
    if not keys:
        sys.exit('Rilis ' + release + ' tidak punya file places.')
    tasks = []
    for k in keys:
        tasks += [(k, rg) for rg in overlapping_row_groups(fs, k)]
    print('rilis %s: %d row group di area Indonesia' % (release, len(tasks)), file=sys.stderr)
    rows = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for part in ex.map(lambda t: read_group(fs, *t), tasks):
            rows += part
    rows.sort(key=lambda r: r['id'])
    print('%d tempat bernama BNI' % len(rows), file=sys.stderr)
    json.dump({'release': release, 'items': rows}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
