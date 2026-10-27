/**
 * B · 口岸排队区间估算原型（提案，**未接入主代码**）
 * ------------------------------------------------------------------
 * 目的：回答「根据已有数据，口岸能不能估出数据」。
 *
 * 只用公开免费、无需密钥的来源：
 *   - MTR Next Train（东铁过境段 LMC / LOW）→ 实测班距 = 铁路运力信号
 *   - 城巴 ETA（B3X @深圳湾口岸、B7/B8 @香园围口岸）→ 实测班距 = 巴士运力信号
 *   - HKO rhrread / warnsum → 天气加成
 *   - 运输署特别交通消息（中文）→ 口岸相关事件加成
 *
 * 诚实边界：
 *   - 没有任何公开来源**直接观测**口岸排队时间 → 只能输出「区间 + 置信度」。
 *   - 基础区间是**先验假设**，未用历史排队数据校准（本机没有该数据）。
 *   - 口岸开放时间沿用 src/lib/geo/ports.ts 的现值，而**那些值 B 尚未核实**。
 *
 * 运行：node scripts/port-queue-estimate-probe.mjs
 */
const TZ = 8 * 3600_000;
const now = new Date();
const hk = new Date(now.getTime() + TZ);

const PORTS = [
  { id: "lok-ma-chau",    name: "落馬洲支線", family: "rail",  open: [390, 1350], modes: "東鐵 + 步行" },
  { id: "lo-wu",          name: "羅湖",       family: "rail",  open: [390, 1440], modes: "東鐵 + 步行" },
  { id: "huanggang",      name: "皇崗",       family: "coach", open: [0, 1440],   modes: "皇巴（24h）" },
  { id: "shenzhen-bay",   name: "深圳灣",     family: "coach", open: [390, 1440], modes: "跨境巴士" },
  { id: "man-kam-to",     name: "文錦渡",     family: "small", open: [450, 1320], modes: "跨境巴士（班次少）" },
  { id: "heung-yuen-wai", name: "香園圍",     family: "coach", open: [420, 1320], modes: "跨境巴士 + 步行" },
];

/** ⚠️ 先验假设，未经历史排队数据校准。单位：分钟。 */
const BASE = {
  rail:  { peak: [15, 35], offPeak: [5, 15], late: [3, 10] },
  coach: { peak: [20, 45], offPeak: [10, 25], late: [5, 15] },
  small: { peak: [25, 55], offPeak: [15, 35], late: [8, 20] },
};
const PEAK = { hk_to_sz: [[420, 600]], sz_to_hk: [[1020, 1200]] }; // 07:00-10:00 / 17:00-20:00
const ADJ = {
  weekend: [10, 20],
  heavyWeather: [10, 25],
  railDisruption: [15, 35],
  portIncident: [10, 30],
  capacityThin: [5, 15],   // 实测班距明显大于常态 → 运力变薄
  lateNight: [-3, 0],      // 深夜需求低
};

const minutesOfDay = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

async function getJson(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "port-queue-probe/0.1" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function getText(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "port-queue-probe/0.1" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** 从一串 ISO 时间算实测班距（分钟）。需要 >=2 班。 */
function headway(times) {
  const ts = times.filter(Boolean).map((s) => Date.parse(s)).filter(Number.isFinite).sort((a, b) => a - b);
  if (ts.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(Math.round((ts[i] - ts[i - 1]) / 60000));
  return { gaps, median: gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] };
}

function mtrTimes(payload, station) {
  const s = payload?.data?.[station];
  if (!s) return [];
  return [...(s.DOWN ?? []), ...(s.UP ?? [])].map((t) => t.time.replace(" ", "T") + "+08:00");
}
const ctbTimes = (payload) => (payload?.data ?? []).map((r) => r.eta);

function weatherFrom(icon = [], warnsum = {}) {
  const active = Object.values(warnsum ?? {}).filter((w) => w.actionCode !== "CANCEL");
  const codes = active.map((w) => w.code);
  const storm = codes.some((c) => /^TC(8|9|10)/.test(c)) || codes.includes("WTS") || icon.includes(65);
  const heavy = codes.some((c) => ["WRAINA", "WRAINR", "WRAINB"].includes(c)) || icon.includes(64);
  return { condition: storm ? "storm" : heavy ? "heavy_rain" : icon.some((i) => [53, 54, 62, 63].includes(i)) ? "rain" : "clear", warnings: codes };
}

const PORT_KEYWORDS = ["口岸", "深圳灣", "落馬洲", "羅湖", "港珠澳", "香園圍", "皇崗", "文錦渡", "福田", "大橋"];

function incidentPorts(xml) {
  const hits = new Set();
  for (const msg of xml.split("<message>").slice(1)) {
    const text = msg.slice(0, 3000);
    if (!/CLOSED|取消|封閉|close/i.test(text) ? false : true) { /* keep */ }
    for (const k of PORT_KEYWORDS) if (text.includes(k)) hits.add(k);
  }
  return [...hits];
}

// ---------------------------------------------------------------- 抓取
const [hko, warnsum, lmc, low, b3x, b7, b8, newsXml] = await Promise.all([
  getJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc").catch((e) => ({ __err: String(e) })),
  getJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc").catch(() => ({})),
  getJson("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=LMC&lang=TC").catch((e) => ({ __err: String(e) })),
  getJson("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=LOW&lang=TC").catch((e) => ({ __err: String(e) })),
  getJson("https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/003208/B3X").catch((e) => ({ __err: String(e) })),
  getJson("https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/003714/B7").catch((e) => ({ __err: String(e) })),
  getJson("https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/003714/B8").catch((e) => ({ __err: String(e) })),
  getText("https://resource.data.one.gov.hk/td/tc/specialtrafficnews.xml").catch(() => ""),
]);

const weather = weatherFrom(hko?.icon, warnsum);
const signals = {
  "lok-ma-chau":  { hw: headway(mtrTimes(lmc, "EAL-LMC")), src: "MTR Next Train EAL-LMC" },
  "lo-wu":        { hw: headway(mtrTimes(low, "EAL-LOW")), src: "MTR Next Train EAL-LOW" },
  "shenzhen-bay": { hw: headway(ctbTimes(b3x)),            src: "城巴 B3X @深圳灣口岸" },
  "heung-yuen-wai": { hw: headway([...ctbTimes(b7), ...ctbTimes(b8)]), src: "城巴 B7/B8 @香園圍口岸" },
  "huanggang":    { hw: null, src: "皇巴無公開 ETA API" },
  "man-kam-to":   { hw: null, src: "文錦渡無公開 ETA API" },
};
const incidentHits = incidentPorts(newsXml);

// ---------------------------------------------------------------- 模型
const mod = minutesOfDay(hk);
const dow = (hk.getUTCDay() + 0) % 7;              // 0=Sun
const weekend = dow === 0 || dow === 6;
const late = mod >= 1350 || mod < 390;             // 22:30 后 / 06:30 前
const severe = weather.condition === "storm" || weather.condition === "heavy_rain";

const out = PORTS.map((p) => {
  const open = mod >= p.open[0] && mod < p.open[1];
  const direction = mod < 720 ? "hk_to_sz" : "sz_to_hk";
  const peak = PEAK[direction].some(([a, b]) => mod >= a && mod < b);
  const band = late ? "late" : peak ? "peak" : "offPeak";

  let range = [...BASE[p.family][band]];
  const basis = [`${p.family} / ${band} 先验区间 ${range[0]}–${range[1]}`];
  if (weekend) { range = add(range, ADJ.weekend); basis.push(`週末 +${ADJ.weekend[0]}~${ADJ.weekend[1]}`); }
  if (severe) { range = add(range, ADJ.heavyWeather); basis.push(`惡劣天氣(${weather.condition}) +${ADJ.heavyWeather[0]}~${ADJ.heavyWeather[1]}`); }
  if (late) { range = add(range, ADJ.lateNight); basis.push("深夜需求低 -3~0"); }

  const sig = signals[p.id];
  if (sig.hw?.median != null) {
    const typical = p.family === "rail" ? 6 : 15;
    if (sig.hw.median >= typical * 1.6) { range = add(range, ADJ.capacityThin); basis.push(`實測班距 ${sig.hw.median} 分 ≥ ${typical}×1.6 → 運力變薄 +${ADJ.capacityThin[0]}~${ADJ.capacityThin[1]}`); }
    else basis.push(`實測班距 ${sig.hw.median} 分（${sig.src}）→ 運力正常，不加成`);
  } else {
    basis.push(`${sig.src} → **無運力信號**`);
  }

  const hitPorts = incidentHits.filter((k) => p.name.includes(k) || k.includes(p.name));
  if (hitPorts.length) { range = add(range, ADJ.portIncident); basis.push(`運輸署公告命中 ${hitPorts.join("/")} +${ADJ.portIncident[0]}~${ADJ.portIncident[1]}`); }

  const liveSignals = [sig.hw?.median != null, !hko?.__err, incidentHits.length > 0 || newsXml.length > 0].filter(Boolean).length;
  const confidence = !open ? "n/a" : liveSignals >= 3 ? "medium" : "low";

  return {
    id: p.id, name: p.name, 通行方式: p.modes,
    現在可通行: open, 服務時段: `${String(Math.floor(p.open[0] / 60)).padStart(2, "0")}:${String(p.open[0] % 60).padStart(2, "0")}–${p.open[1] >= 1440 ? "24:00" : `${String(Math.floor(p.open[1] / 60)).padStart(2, "0")}:${String(p.open[1] % 60).padStart(2, "0")}`}`,
    排隊區間: open ? [Math.max(0, range[0]), Math.max(1, range[1])] : null,
    置信度: confidence,
    依據: basis,
    運力信號: sig.hw ? `實測班距 ${sig.hw.gaps.join("/")} 分（${sig.src}）` : null,
  };
});

console.log(`\n時刻：${hk.toISOString().replace("T", " ").slice(0, 19)} (HK) | 週${"日一二三四五六"[dow]} | 天氣：${weather.condition} ${weather.warnings.join(",") || "(無警告)"}`);
console.log(`運輸署公告口岸關鍵詞命中：${incidentHits.length ? incidentHits.join(", ") : "無"}\n`);
console.log("口岸".padEnd(8) + "可通行  排隊區間(分)  置信度  運力信號");
for (const r of out) {
  console.log(
    r.name.padEnd(7) +
    (r.現在可通行 ? " ✅ " : " ❌ ") + "   " +
    (r.排隊區間 ? `${r.排隊區間[0]}–${r.排隊區間[1]}`.padEnd(12) : "（關閉，不可行）".padEnd(13)) +
    String(r.置信度).padEnd(7) +
    (r.運力信號 ?? "無")
  );
}
console.log("\n依據明細：");
for (const r of out) console.log(`  ${r.name}: ${r.依據.join("；")}`);
console.log("\n⚠️ 全部為估算區間，非官方實時排隊；基礎區間未經歷史資料校準。");

// 落盤證據
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("docs/data", { recursive: true });
const stamp = new Date().toISOString();
const path = `docs/data/port-queue-estimate-${stamp.slice(0, 10)}.json`;
await writeFile(path, JSON.stringify({
  checkedAt: stamp,
  note: "估算原型輸出，非官方實時排隊資料，不作決策輸入",
  modelTimeHk: hk.toISOString().replace("T", " ").slice(0, 19),
  weekday: "日一二三四五六"[dow],
  weather,
  tdPortKeywordHits: incidentHits,
  assumptions: { BASE, PEAK, ADJ, note: "基礎區間為先驗假設，未經歷史排隊資料校準；口岸開放時間沿用 geo/ports.ts 的未核實值" },
  ports: out,
}, null, 2));
console.log(`證據已寫入 ${path}`);

