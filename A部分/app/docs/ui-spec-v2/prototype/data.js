/**
 * 原型演示資料（Prototype demo data）
 *
 * ⚠️ 誠實聲明（請勿移除）：
 *  - 幾何折線、各段時間、口岸排隊區間 **逐字取自** 生產專案的離線 fixture：
 *      src/lib/route/providers/fixture.ts
 *      src/lib/geo/places.ts（coordinatesVerified: false）
 *      src/lib/geo/ports.ts
 *  - 幾何為「演示參考折線」，**非導航路網**；座標未經官方核實。
 *  - 風險等級、信心、推薦結果為 **原型演示值**，由本檔人工指定，
 *    用來展示 UI 狀態；**不是** 風險引擎的輸出，也不代表任何演算法結論。
 *  - 排隊一律「區間 + 信心 + 估算」，無任何即時排隊或精確人數。
 */

export const SERVICE_DATE = '2026-10-13';
export const DEPART_HHMM = '08:00';
export const RETRIEVED_AT = '2026-10-13 07:30';

/** 口岸（取自 geo/ports.ts） */
export const PORTS = [
  { id: 'lok-ma-chau',  name: '落馬洲支線口岸', hk: '落馬洲站',      lon: 114.0656, lat: 22.5145, openFrom: '06:30', openTo: '22:30' },
  { id: 'lo-wu',        name: '羅湖口岸',       hk: '羅湖站',        lon: 114.113,  lat: 22.53,   openFrom: '06:30', openTo: '24:00' },
  { id: 'shenzhen-bay', name: '深圳灣口岸',     hk: '深圳灣口岸（香港側）', lon: 113.944, lat: 22.502, openFrom: '00:00', openTo: '24:00' },
];

/** 排隊區間（取自 fixture.ts 的 QUEUES） */
export const QUEUES = {
  'lok-ma-chau':  { range: [12, 28], confidence: 'low', note: '估算：依時段規律推算，非官方即時排隊資料。' },
  'lo-wu':        { range: [18, 40], confidence: 'low', note: '估算：依時段規律推算，非官方即時排隊資料。' },
  'shenzhen-bay': { range: [20, 45], confidence: 'low', note: '估算：跨境巴士班次與時段規律推算，非官方即時排隊資料。' },
};

/** 折線座標（取自 fixture.ts，[lon, lat]） */
const GEO = {
  eastRailToLmc:   [[114.165,22.279],[114.182,22.303],[114.179,22.373],[114.21,22.413],[114.128,22.502],[114.0656,22.5145]],
  eastRailToLowu:  [[114.165,22.279],[114.182,22.303],[114.179,22.373],[114.21,22.413],[114.128,22.502],[114.113,22.53]],
  busToShenzhenBay:[[114.165,22.279],[114.12,22.3],[113.99,22.42],[113.944,22.502]],
  // 市區短段（fixture 用起終點兩點連線）
  centralToStation:[[114.159,22.284],[114.158,22.282]],
  stationToAdmiralty:[[114.158,22.282],[114.165,22.279]],
  lmcToFutian:[[114.0656,22.5145],[114.068,22.519]],
  futianToStation:[[114.068,22.519],[114.055,22.535]],
  lowuToLuohu:[[114.113,22.53],[114.116,22.532]],
  luohuToConvention:[[114.116,22.532],[114.09,22.54]],
  conventionToFutian:[[114.09,22.54],[114.055,22.535]],
  sbayHkToSz:[[113.944,22.502],[113.95,22.505]],
  sbayToFutian:[[113.95,22.505],[114.055,22.535]],
};

/** 三條跨境候選路線（步驟時間取自 fixture.ts） */
export const JOURNEYS = [
  {
    id: 'xb-1-lok-ma-chau',
    label: '經落馬洲支線口岸',
    portId: 'lok-ma-chau',
    steps: [
      { mode: 'walk', line: null,          from: '中環（交易廣場）', to: '中環站',        min: 5,  geo: GEO.centralToStation },
      { mode: 'mtr',  line: '港島線',       from: '中環站',          to: '金鐘站',        min: 3,  geo: GEO.stationToAdmiralty },
      { mode: 'mtr',  line: '東鐵線',       from: '金鐘站',          to: '落馬洲站',      min: 52, geo: GEO.eastRailToLmc, via: ['紅磡','大圍','大學','上水'] },
      { mode: 'walk', line: null,          from: '落馬洲站',        to: '福田口岸',      min: 12, geo: GEO.lmcToFutian, border: true },
      { mode: 'mtr',  line: '深圳地鐵 4 號線', from: '福田口岸',     to: '福田站',        min: 9,  geo: GEO.futianToStation, via: ['福民','會展中心'] },
    ],
  },
  {
    id: 'xb-2-lo-wu',
    label: '經羅湖口岸',
    portId: 'lo-wu',
    steps: [
      { mode: 'walk', line: null,      from: '中環（交易廣場）', to: '中環站',   min: 5,  geo: GEO.centralToStation },
      { mode: 'mtr',  line: '港島線',   from: '中環站',          to: '金鐘站',   min: 3,  geo: GEO.stationToAdmiralty },
      { mode: 'mtr',  line: '東鐵線',   from: '金鐘站',          to: '羅湖站',   min: 56, geo: GEO.eastRailToLowu, via: ['紅磡','大圍','大學','上水'] },
      { mode: 'walk', line: null,      from: '羅湖站',          to: '羅湖口岸', min: 10, geo: GEO.lowuToLuohu, border: true },
      { mode: 'mtr',  line: '深圳地鐵 1 號線', from: '羅湖口岸', to: '會展中心', min: 12, geo: GEO.luohuToConvention, via: ['國貿','大劇院'] },
      { mode: 'mtr',  line: '深圳地鐵 4 號線', from: '會展中心', to: '福田站',   min: 5,  geo: GEO.conventionToFutian },
    ],
  },
  {
    id: 'xb-3-shenzhen-bay',
    label: '經深圳灣口岸',
    portId: 'shenzhen-bay',
    steps: [
      { mode: 'walk', line: null,            from: '中環（交易廣場）', to: '中環站',       min: 5,  geo: GEO.centralToStation },
      { mode: 'mtr',  line: '港島線',         from: '中環站',          to: '金鐘站',       min: 3,  geo: GEO.stationToAdmiralty },
      { mode: 'xbus', line: '跨境巴士（深圳灣線）', from: '金鐘站',     to: '深圳灣口岸（香港側）', min: 75, geo: GEO.busToShenzhenBay, via: ['屯門','南山區'] },
      { mode: 'walk', line: null,            from: '深圳灣口岸（香港側）', to: '深圳灣口岸', min: 14, geo: GEO.sbayHkToSz, border: true },
      { mode: 'bus',  line: '深圳巴士',        from: '深圳灣口岸',      to: '福田站',       min: 35, geo: GEO.sbayToFutian },
    ],
  },
];

/**
 * 三個演示情景（對應生產專案的 JourneyScenario）
 * scenario.risk = 「原型演示值」，僅供展示 UI 狀態，非演算法輸出。
 */
export const SCENARIOS = {
  normal: {
    key: 'normal',
    label: '正常服務',
    systemStatus: { text: '當前狀態：正常', tone: 'ok' },
    banner: null,
    routes: {
      'xb-1-lok-ma-chau':  { risk: 'low',    confidence: 'medium', feasible: true,  recommended: true,  note: null },
      'xb-2-lo-wu':        { risk: 'medium', confidence: 'low',    feasible: true,  recommended: false, note: null },
      'xb-3-shenzhen-bay': { risk: 'medium', confidence: 'low',    feasible: true,  recommended: false, note: null },
    },
    factors: [
      { id: 'weather',    name: '天氣',     level: 'low',    claim: '天氣良好，無警告信號生效。', evidence: '演示規則：無暴雨或颱風警告。', source: '香港天文台（演示）' },
      { id: 'crowd',      name: '人流',     level: 'medium', confidence: 'low', claim: '假設高峰時段人流一般。', evidence: '演示規則：07:30–09:30 為假設高峰；未使用歷史客流或即時人數。', source: '演示規則（CrowdSignal）' },
      { id: 'disruption', name: '交通中斷', level: 'low',    claim: '東鐵線及市區線服務正常。', evidence: '演示規則：無中斷事件。', source: '港鐵服務狀態（演示）' },
      { id: 'transfer',   name: '轉乘',     level: 'medium', claim: '需要跨境鐵路轉乘。', evidence: '演示規則：東鐵線 + 深圳地鐵。', source: '路線分段資料' },
      { id: 'border',     name: '通關',     level: 'medium', claim: '落馬洲排隊估算 12–28 分鐘。', evidence: 'demo rule: 時段規律推算，非官方即時排隊。', source: '口岸排隊估算（信心：低）' },
    ],
  },
  heavy_rain: {
    key: 'heavy_rain',
    label: '黑色暴雨（演示）',
    systemStatus: { text: '當前狀態：暴雨影響', tone: 'warn' },
    banner: { tone: 'warn', title: '黑色暴雨警告信號生效（演示）', body: '露天段與地面接駁預計延長；以下路線僅供比較。' },
    routes: {
      'xb-1-lok-ma-chau':  { risk: 'medium', confidence: 'low', feasible: true,  recommended: true,  note: null },
      'xb-2-lo-wu':        { risk: 'high',   confidence: 'low', feasible: true,  recommended: false, note: null },
      'xb-3-shenzhen-bay': { risk: 'medium', confidence: 'low', feasible: true,  recommended: false, note: null },
    },
    factors: [
      { id: 'weather',    name: '天氣',     level: 'high',   claim: '黑色暴雨警告生效，露天段需限速。', evidence: '演示規則：暴雨警告 → 天氣因子提高。', source: '香港天文台（演示）' },
      { id: 'crowd',      name: '人流',     level: 'medium', confidence: 'low', claim: '雨天轉乘通道人流增加。', evidence: '演示規則：假設高峰時段。', source: '演示規則（CrowdSignal）' },
      { id: 'disruption', name: '交通中斷', level: 'medium', claim: '鐵路露天段或需限速。', evidence: '演示規則：暴雨情景。', source: '港鐵服務狀態（演示）' },
      { id: 'transfer',   name: '轉乘',     level: 'medium', claim: '需要跨境鐵路轉乘。', evidence: '演示規則。', source: '路線分段資料' },
      { id: 'border',     name: '通關',     level: 'medium', claim: '排隊估算維持區間，未因暴雨上調。', evidence: '演示規則：口岸排隊不隨天氣變動。', source: '口岸排隊估算（信心：低）' },
    ],
  },
  disruption: {
    key: 'disruption',
    label: '東鐵中斷（演示）',
    systemStatus: { text: '當前狀態：交通中斷', tone: 'bad' },
    banner: { tone: 'bad', title: '東鐵線服務中斷（演示）', body: '經落馬洲支線及經羅湖口岸的路線不可行；建議改用深圳灣口岸。' },
    routes: {
      'xb-1-lok-ma-chau':  { risk: 'high',   confidence: 'low', feasible: false, recommended: false, note: '東鐵線服務中斷（演示情景）' },
      'xb-2-lo-wu':        { risk: 'high',   confidence: 'low', feasible: false, recommended: false, note: '東鐵線服務中斷（演示情景）' },
      'xb-3-shenzhen-bay': { risk: 'medium', confidence: 'low', feasible: true,  recommended: true,  note: null },
    },
    factors: [
      { id: 'weather',    name: '天氣',     level: 'low',    claim: '天氣無特殊影響。', evidence: '演示規則：本次中斷來自行車服務。', source: '香港天文台（演示）' },
      { id: 'crowd',      name: '人流',     level: 'critical', confidence: 'low', claim: '東鐵中斷導致替代口岸人流極高。', evidence: '演示規則：東鐵中斷情景提高人流信號（人流信號等級，非路線風險等級）。', source: '演示規則（CrowdSignal.critical）' },
      { id: 'disruption', name: '交通中斷', level: 'high',   claim: '東鐵線服務中斷。', evidence: '演示規則：中斷情景。', source: '港鐵服務狀態（演示）' },
      { id: 'transfer',   name: '轉乘',     level: 'medium', claim: '改用深圳灣需巴士轉乘。', evidence: '演示規則。', source: '路線分段資料' },
      { id: 'border',     name: '通關',     level: 'high',   claim: '深圳灣排隊估算 20–45 分鐘。', evidence: '演示規則：需求轉移推高排隊。', source: '口岸排隊估算（信心：低）' },
    ],
  },
};

/** Replay 時間軸的三格（對應生產專案的 REPLAY 常數） */
export const REPLAY_FRAMES = [
  { label: '正常',     scenario: 'normal',     offset: 0,  clock: '08:00' },
  { label: '暴雨',     scenario: 'heavy_rain', offset: 20, clock: '08:20' },
  { label: '東鐵中斷', scenario: 'disruption', offset: 40, clock: '08:40' },
];

/** 地點（供起終點下拉；取自 geo/places.ts） */
export const PLACES = [
  { id: 'central-exchange-square', name: '中環（交易廣場）', side: 'hk' },
  { id: 'central-station',         name: '中環站',           side: 'hk' },
  { id: 'hkcec',                   name: '香港會議展覽中心', side: 'hk' },
  { id: 'futian-station-sz',       name: '福田站',           side: 'sz' },
  { id: 'civic-center',            name: '市民中心',         side: 'sz' },
  { id: 'convention-center',       name: '會展中心',         side: 'sz' },
];
