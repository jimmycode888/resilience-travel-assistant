'use client';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {BASEMAP_URL,BASEMAP_OPTIONS} from '@/lib/geo/basemap';
import {leafletGeometry,routeStyle,VISUALS} from './presentation';
import type {TeamRouteResult} from '@/lib/types/team-integration';
export default function TeamMap({routes,selectedId,onSelect}:{routes:TeamRouteResult[];selectedId:string|null;onSelect:(id:string)=>void}){
 const root=useRef<HTMLDivElement>(null), map=useRef<L.Map|null>(null), layer=useRef<L.LayerGroup|null>(null);
 const [failed,setFailed]=useState(false);
 const select=useRef(onSelect);select.current=onSelect;
 useEffect(()=>{
  if(!root.current)return;
  const instance=L.map(root.current,{scrollWheelZoom:false}).setView([22.41,114.1],10);map.current=instance;
  L.tileLayer(BASEMAP_URL,BASEMAP_OPTIONS).on('tileerror',()=>setFailed(true)).addTo(instance);
  layer.current=L.layerGroup().addTo(instance);
  const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(root.current);
  return ()=>{observer.disconnect();instance.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const group=layer.current,instance=map.current;if(!group||!instance)return;
  group.clearLayers();const points:L.LatLngTuple[]=[];
  const ordered=[...routes].sort((a,b)=>Number(a.candidate.id===selectedId)-Number(b.candidate.id===selectedId));
  for(const route of ordered){
   for(const segment of route.candidate.journey.segments){
    const coordinates=leafletGeometry(segment);points.push(...coordinates);
    const style=routeStyle(route,segment,route.candidate.id===selectedId);
    L.polyline(coordinates,{...style,color:'#ffffff',weight:style.weight+3,interactive:false}).addTo(group);
    const line=L.polyline(coordinates,{...style,className:`dt-line-${route.candidate.id}`}).on('click',()=>select.current(route.candidate.id)).addTo(group);
    // DOM text, never supplier HTML. Accessible duplicate controls below the map.
    const label=document.createElement('span');label.textContent=`${route.candidate.label} · ${segment.line??segment.mode} · ${route.eligible?'查看詳情':'不可行，僅供檢視'}`;line.bindTooltip(label);
    if(segment.kind==='border_crossing'&&coordinates[0])L.circleMarker(coordinates[0],{radius:6,color:VISUALS.border.color,fillOpacity:0.6}).addTo(group);
   }
  }
  if(points.length)instance.fitBounds(L.latLngBounds(points),{padding:[24,24],maxZoom:13});
 },[routes,selectedId]);
 return <section aria-label="路線地圖" className="dt-map-section">
  <div className="dt-map" ref={root} data-testid="team-map" data-selected-id={selectedId??''}/>
  {failed&&<p role="status">底圖未能載入；仍可查看示意折線及下方分段文字。</p>}
  <p className="dt-note">參考座標未經官方核實 · 折線為示意，非導航路網。紫虛線：通關；灰點線 ×：不可行。</p>
  <div className="dt-map-controls" role="group" aria-label="鍵盤地圖路線選擇">{routes.map(r=><button type="button" key={r.candidate.id} aria-pressed={r.candidate.id===selectedId} onClick={()=>onSelect(r.candidate.id)}>地圖查看：{r.candidate.label}{!r.eligible?'（不可行）':''}</button>)}</div>
 </section>;
}
