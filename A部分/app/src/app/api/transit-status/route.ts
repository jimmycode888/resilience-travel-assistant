import { NextResponse } from 'next/server';
import { loadHkNetwork } from '@/lib/transit/hk-data';
import { amapConfigured } from '@/lib/transit/amap';
import { TRANSIT_PORTS } from '@/lib/transit/service';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const network = await loadHkNetwork();
    return NextResponse.json({ hk: { available: true, stops: network.meta.stopCount, routes: network.meta.routeCount, feedDate: network.meta.feedDate, includesMtrHeavyRail: false }, shenzhen: { configured: amapConfigured(), verified: false }, ports: TRANSIT_PORTS.map(p => ({ id: p.id, name: p.name })), note: '配置狀態不等於路線覆蓋；每次查詢仍需核驗。' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ hk: { available: false }, shenzhen: { configured: amapConfigured(), verified: false }, note: '香港交通資料未載入。' }, { status: 503 });
  }
}
