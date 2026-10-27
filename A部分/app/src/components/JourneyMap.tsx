'use client';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { BASEMAP_URL, BASEMAP_OPTIONS } from '@/lib/geo/basemap';
import { PLACES, findPlace, type PlaceEntry } from '@/lib/geo/places';
import { BORDER_PORTS } from '@/lib/geo/ports';
import { metersBetween, type UserPosition } from '@/lib/geo/geolocation';
import type { AnalyzedJourney } from '@/lib/types/journey-analysis';

interface Props {
  routes: AnalyzedJourney[]; selectedId: string | null;
  originPlace?: PlaceEntry; destinationPlace?: PlaceEntry;
  origin: string; destination: string; position: UserPosition | null;
  onPick: (place: PlaceEntry) => void;
  onSelect: (id: string) => void;
}
const COLORS = { low: '#16736b', medium: '#b46b0c', high: '#ba4144' };
export default function JourneyMap({ routes, selectedId, origin, destination, originPlace, destinationPlace, position, onPick, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlays = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPick, onSelect });
  const [riskLayer, setRiskLayer] = useState(true);
  const [ports, setPorts] = useState(true);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [message, setMessage] = useState('點選地點標記，或點附近位置選取已收錄地點。');
  useEffect(() => { callbacks.current = { onPick, onSelect }; }, [onPick, onSelect]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { center: [22.42, 114.1], zoom: 10, scrollWheelZoom: false });
    map.current = instance;
    const tile = L.tileLayer(BASEMAP_URL, BASEMAP_OPTIONS).addTo(instance);
    tile.on('tileerror', () => setTilesFailed(true));
    overlays.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const point = { lat: event.latlng.lat, lon: event.latlng.lng };
      const nearest = [...PLACES].sort((a, b) => metersBetween(point, a) - metersBetween(point, b))[0];
      if (!nearest || metersBetween(point, nearest) > 2000) { setMessage('此處距離已收錄地點超過 2 公里，請點選標記或使用地點搜尋。'); return; }
      callbacks.current.onPick(nearest);
      setMessage(`已選取附近的${nearest.name}（相距 ${metersBetween(point, nearest)} 米），並非原點座標。`);
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; overlays.current = null; };
  }, []);
  useEffect(() => {
    const layer = overlays.current; const instance = map.current;
    if (!layer || !instance) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const route of [...routes].sort((a, b) => Number(a.candidate.id === selectedId) - Number(b.candidate.id === selectedId))) {
      const selected = route.candidate.id === selectedId;
      for (const segment of route.candidate.journey.segments) {
        const points = segment.geometry.map(([lon, lat]) => [lat, lon] as L.LatLngTuple);
        bounds.push(...points);
        const path = L.polyline(points, { color: !route.eligible ? '#8b99a1' : segment.kind === 'border_crossing' ? '#8653ad' : riskLayer ? COLORS[route.assessment.risk.level] : '#2577a4', weight: selected ? 7 : 4, opacity: selected ? 1 : 0.5, dashArray: segment.kind === 'border_crossing' || !route.eligible ? '7 7' : undefined, bubblingMouseEvents: false }).addTo(layer);
        const text = document.createElement('div');
        text.textContent = `${route.candidate.label} · ${segment.line ?? '步行'} · ${segment.from.name} → ${segment.to.name} · ${segment.durationMinutes} 分${segment.border ? ` · 排隊估算 ${segment.border.queueMinutesRange.join('–')} 分` : ''}`;
        path.bindPopup(text).on('click', () => callbacks.current.onSelect(route.candidate.id));
      }
    }
    const points = new Map(PLACES.map(p => [p.id, p]));
    for (const p of [originPlace ?? findPlace(origin), destinationPlace ?? findPlace(destination)]) if (p) { points.set(p.id, p); bounds.push([p.lat, p.lon]); }
    for (const place of points.values()) {
      const active = place.id === origin || place.id === destination;
      const marker = L.circleMarker([place.lat, place.lon], { radius: active ? 9 : 4, color: active ? '#123e54' : '#6a8290', fillColor: active ? '#123e54' : '#fff', fillOpacity: 1, weight: 2, bubblingMouseEvents: false }).addTo(layer);
      const label = document.createElement('span'); label.textContent = `${place.id === origin ? '起點 · ' : place.id === destination ? '終點 · ' : ''}${place.name}`;
      marker.bindTooltip(label, { permanent: active, direction: 'top' });
      marker.on('click', () => callbacks.current.onPick(place));
    }
    if (ports) for (const port of BORDER_PORTS) {
      const pin = L.circleMarker([port.hkNode.lat, port.hkNode.lon], { radius: 6, color: '#8653ad', fillOpacity: 0.6, bubblingMouseEvents: false }).addTo(layer);
      const node = document.createElement('div'); node.textContent = `${port.name} · 參考開放時間 ${port.openFrom}–${port.openTo} · 座標未核實`;
      pin.bindPopup(node);
    }
    if (position) {
      L.circle([position.lat, position.lon], { radius: position.accuracyM, color: '#2688d2', weight: 1, fillOpacity: 0.12 }).addTo(layer);
      L.circleMarker([position.lat, position.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#2688d2', fillOpacity: 1 }).bindTooltip('目前位置').addTo(layer);
    }
    if (bounds.length) instance.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 13, animate: false });
  }, [routes, selectedId, origin, destination, originPlace, destinationPlace, position, riskLayer, ports]);
  useEffect(() => {
    if (position) map.current?.setView([position.lat, position.lon], 13, { animate: false });
  }, [position]);
  return <section className="journey-map-panel" aria-label="候選路線地圖">
    <div className="journey-map-toolbar"><strong>港深路線圖</strong><label><input type="checkbox" checked={riskLayer} onChange={e => setRiskLayer(e.target.checked)} /> 風險上色</label><label><input type="checkbox" checked={ports} onChange={e => setPorts(e.target.checked)} /> 口岸</label></div>
    <div ref={container} className="journey-map" role="region" aria-label="可拖動縮放地圖；鍵盤可使用下方搜尋選點" />
    <p className="journey-map-caption" role="status">{tilesFailed ? '底圖暫時無法載入；參考路線與選點仍可使用。' : message}</p>
    <p className="journey-map-caption">綠：低風險 · 黃：中風險 · 紅：高風險 · 紫虛線：通關 · 灰：不可行。公交折線可能連接站點；通關線為示意，非導航路網。</p>
  <p className="journey-map-caption"><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">回報 OSM 路網問題 ↗</a></p></section>;
}
