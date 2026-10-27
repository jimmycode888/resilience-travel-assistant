"""Build a compact, versioned routing snapshot from Transport Department GTFS.
Intermediate times are interpolated between published timepoints by cumulative
stop distance; the output is a reference timetable, never a live ETA feed.
"""
import csv, io, json, zipfile, gzip, hashlib, datetime, math, urllib.request, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/transit'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip'
archive = OUT / 'hk-gtfs.zip'
if not archive.exists() or '--refresh' in sys.argv:
    pending = archive.with_suffix('.zip.part')
    with urllib.request.urlopen(URL, timeout=45) as response:
        pending.write_bytes(response.read())
    pending.replace(archive)
z = zipfile.ZipFile(archive)
def rows(name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig'))
def seconds(s):
    if not s: return None
    h,m,s=map(int,s.split(':')); return h*3600+m*60+s
def km(a,b):
    lat1,lon1,lat2,lon2=map(math.radians,[a['lat'],a['lon'],b['lat'],b['lon']])
    return 6371*2*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2)))
stops=[]; index={}
for r in rows('stops.txt'):
    index[r['stop_id']]=len(stops)
    stops.append({'id':r['stop_id'],'name':r['stop_name'].replace('<BR>',' ').replace('<br>',' '), 'lat':float(r['stop_lat']),'lon':float(r['stop_lon'])})
routes={r['route_id']:r for r in rows('routes.txt')}
trips={r['trip_id']:r for r in rows('trips.txt')}
frequencies={}
for r in rows('frequencies.txt'):
    frequencies.setdefault(r['trip_id'],[]).append([seconds(r['start_time']),seconds(r['end_time']),int(r['headway_secs'])])
calendar={r['service_id']:{'days':[int(r[d]) for d in ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']], 'start':r['start_date'],'end':r['end_date']} for r in rows('calendar.txt')}
exceptions={}
for r in rows('calendar_dates.txt'): exceptions.setdefault(r['date'],{})[r['service_id']]=int(r['exception_type'])
patterns=[]; patternIndex={}; skipped=0; interpolated=0
# Input is sorted by trip; process without retaining 1.37 million CSV rows.
def consume(tid, times):
    global skipped,interpolated
    if not tid or tid not in trips or len(times)<2:return
    trip=trips[tid]; route=routes[trip['route_id']]
    # Old Huanggang cross-border coach terminals cannot be used as local edges.
    if route['agency_id']=='XB':return
    times.sort(key=lambda r:int(r['stop_sequence']))
    if any(t['stop_id'] not in index for t in times): skipped+=1;return
    ids=[index[t['stop_id']] for t in times]
    values=[seconds(t['departure_time'] or t['arrival_time']) for t in times]
    if values[0] is None or values[-1] is None or values[-1]<=values[0]:skipped+=1;return
    distances=[0.0]
    for a,b in zip(ids,ids[1:]):distances.append(distances[-1]+max(0.02,km(stops[a],stops[b])))
    anchors=[i for i,v in enumerate(values) if v is not None]
    approximate=any(v is None for v in values)
    if approximate:interpolated+=1
    for a,b in zip(anchors,anchors[1:]):
        if values[b]<values[a]: skipped+=1;return
        for i in range(a+1,b): values[i]=round(values[a]+(values[b]-values[a])*(distances[i]-distances[a])/(distances[b]-distances[a]))
    offsets=[round((v-values[0])/60,2) for v in values]
    pick=[t.get('pickup_type','0')=='0' for t in times]; drop=[t.get('drop_off_type','0')=='0' for t in times]
    key=(trip['route_id'],tuple(ids),tuple(offsets),tuple(pick),tuple(drop))
    if key not in patternIndex:
        patternIndex[key]=len(patterns)
        mode='ferry' if route['route_type']=='4' else 'tram' if route['route_type'] in ['0','7'] else 'minibus' if route['agency_id']=='GMB' else 'bus'
        patterns.append({'id':trip['route_id'],'line':f"{route['agency_id']} {route['route_short_name']}",'mode':mode,'stops':ids,'offsets':offsets,'pickup':pick,'dropoff':drop,'approximate':approximate,'runs':[]})
    p=patterns[patternIndex[key]]
    for start,end,headway in frequencies.get(tid,[[values[0],values[0],0]]):
        p['runs'].append([trip['service_id'],round(start/60,2),round(end/60,2),round(headway/60,2)])
current=None;times=[]
for r in rows('stop_times.txt'):
    if r['trip_id']!=current:
        consume(current,times); current=r['trip_id'];times=[]
    times.append(r)
consume(current,times)
for p in patterns:p['runs']=[list(v) for v in sorted(set(tuple(r) for r in p['runs']))]
meta={'sourceUrl':URL,'datasetUrl':'https://data.gov.hk/en-data/dataset/hk-td-tis_11-pt-headway-en','importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'feedDate':datetime.datetime(*z.getinfo('stops.txt').date_time).isoformat(),'stopCount':len(stops),'routeCount':len(set(p['id'] for p in patterns)),'patternCount':len(patterns),'skippedTrips':skipped,'interpolatedTrips':interpolated,'limitations':['No MTR heavy rail in this feed','Intermediate arrival times interpolated from official terminal timepoints','No live ETA or temporary diversions','Huanggang XB records excluded because terminals changed']}
with gzip.open(OUT/'hk-network.json.gz.part','wt',encoding='utf-8') as f:json.dump({'meta':meta,'stops':stops,'patterns':patterns,'calendar':calendar,'exceptions':exceptions},f,ensure_ascii=False,separators=(',',':'))
(OUT/'hk-network.json.gz.part').replace(OUT/'hk-network.json.gz')
(OUT/'hk-feed-metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
