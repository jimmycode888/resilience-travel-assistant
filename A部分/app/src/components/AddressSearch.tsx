'use client';
import { useEffect, useRef, useState } from 'react';
import { findPlace, searchPlaces } from '@/lib/geo/places';
import type { AddressPlace } from '@/lib/geo/address-search';

export function AddressSearch({ label, value, place, onChange, onEditing }: { label: string; value: string; place?: AddressPlace; onChange: (place: AddressPlace) => void; onEditing: (editing: boolean) => void }) {
  const selected = place ?? findPlace(value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<AddressPlace[]>([]);
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setQuery(selected?.name ?? ''); setOpen(false); }, [value, selected?.name]);
  useEffect(() => {
    if (!open) return;
    setMatches(searchPlaces(query, { limit: 5 })); setActive(-1);
    if (query.trim().length < 2) { setStatus('輸入至少 2 個字，搜尋香港／深圳的地名或地址。'); return; }
    const controller = new AbortController();
    setStatus('正在搜尋地址…');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error('搜尋失敗');
        const body = await response.json();
        if (controller.signal.aborted) return;
        setMatches(body.places); setStatus(body.message || '請選取地址以確認位置。');
      } catch { if (!controller.signal.aborted) setStatus('搜尋暫時不可用，請重試。'); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  function choose(item: AddressPlace) { onChange(item); onEditing(false); setQuery(item.name); setOpen(false); }
  function cancel() { setQuery(selected?.name ?? ''); setOpen(false); onEditing(false); }
  return <div ref={root} className="journey-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) cancel(); }}>
    <label className="field-label" htmlFor={`place-${label}`}>{label}</label>
    <input id={`place-${label}`} className="field-input" value={query} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={`choices-${label}`} aria-activedescendant={active >= 0 ? `choice-${label}-${active}` : undefined} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); onEditing(true); }} placeholder="輸入地名、建築或詳細地址" autoComplete="off" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(i => matches.length ? (i < 0 ? (e.key === 'ArrowDown' ? 0 : matches.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length) : -1); }
      if (e.key === 'Enter' && open) { e.preventDefault(); if (matches[active]) choose(matches[active]); else setStatus('請先從候選地址中選取一個地點。'); }
    }} />
    {open ? <div className="journey-search-options"><p role="status" className="text-xs text-slate-500">{status}</p><div id={`choices-${label}`} role="listbox" aria-label={`${label}候選地址`}>
      {matches.map((item, index) => <button id={`choice-${label}-${index}`} type="button" role="option" aria-selected={active === index} style={active === index ? { background: '#e2f2f7' } : undefined} key={item.id} onMouseDown={e => e.preventDefault()} onClick={() => choose(item)}>{item.name}<span>{item.side === 'hk' ? '香港' : '深圳'} · {item.address || '已有地點'}</span></button>)}
    </div><p className="text-xs text-slate-500">地址來源：香港政府 ALS · Photon / © OpenStreetMap · 高德（如啟用）</p><button type="button" onClick={cancel}>關閉搜尋</button></div> : null}
  </div>;
}
