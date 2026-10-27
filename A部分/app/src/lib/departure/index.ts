/**
 * C3 · 最佳出發窗口（成員 C）。
 *
 * 把「未來一段時間的風險序列」變成一個可執行、可解釋的建議窗口：
 *
 *   17:30 Risk 78
 *   17:40 Risk 72
 *   ...
 *   18:10 Risk 41   ← 窗口起
 *   18:20 Risk 39   ← 最低
 *   18:30 Risk 45   ← 窗口訖
 *   → Best Departure Window: 18:10–18:30
 *
 * 設計：
 *   - 純函式；風險序列由呼叫端以 `sampleRisk(departAt)` 注入（可來自 C 的
 *     Crowd/Border 時段模型，或 A 的風險引擎）。
 *   - 固定 10 分鐘粒度、無隨機性；同輸入同輸出。
 *   - **不輸出準時機率**；只給窗口 + 定性信心 + 理由。
 *   - 窗口是「離散取樣後的最佳連續區段」，不是連續函數的最優解（文案已明示）。
 */
import { addMinutes, formatHkTime } from "@/lib/time";
import type { Confidence } from "@/lib/types/decision";

export interface DepartureSample {
  departAt: string;
  /** 該出發時點的最佳可行路線；null 表示此刻沒有可行路線。 */
  routeId: string | null;
  /** 風險分（0–100，越低越好）；沒有可行路線時為 null。 */
  riskScore: number | null;
  meetsDeadline: boolean | null;
}

export interface DepartureWindow {
  start: string;
  end: string;
  confidence: Confidence;
  /** 為什麼推薦這個窗口（可顯示）。 */
  evidence: string;
  /** 完整風險序列（供 UI 畫折線或表格）。 */
  samples: DepartureSample[];
  /** 窗口內的樣本數。 */
  sampleCount: number;
}

export interface DepartureSearchOptions {
  /** 起算時間（ISO，含 +08:00）；通常是 request.departAt。 */
  from: string;
  /** 往前看多久（分鐘），預設 120。 */
  horizonMinutes?: number;
  /** 取樣粒度（分鐘），預設 10。 */
  stepMinutes?: number;
  /** 風險取樣器：給定出發時點，回傳最佳可行路線與風險分。 */
  sampleRisk: (departAt: string) => DepartureSample;
  /** 允許比最低分高多少仍算同一窗口，預設 10。 */
  windowSlack?: number;
}

const DEFAULT_HORIZON = 120;
const DEFAULT_STEP = 10;
const DEFAULT_SLACK = 10;

/** 依 `from` 產生固定粒度的取樣時點（含 `from` 本身）。 */
export function departureGrid(from: string, horizonMinutes = DEFAULT_HORIZON, stepMinutes = DEFAULT_STEP): string[] {
  const step = stepMinutes > 0 ? stepMinutes : DEFAULT_STEP;
  const horizon = horizonMinutes >= 0 ? horizonMinutes : DEFAULT_HORIZON;
  const times: string[] = [];
  for (let offset = 0; offset <= horizon; offset += step) {
    times.push(addMinutes(from, offset));
  }
  return times;
}

/**
 * 找出最佳出發窗口。
 *
 * 規則（確定性）：
 *   1. 只考慮「有可行路線且不違反到達期限」的樣本。
 *   2. 取風險最低者；同分取**最早**時點。
 *   3. 以該點為中心，向兩側擴張，納入風險 ≤ 最低分 + `windowSlack` 的連續樣本。
 *   4. 窗口 `end` = 最後一個樣本時點 + 一個粒度。
 *
 * 沒有任何合格樣本時回傳 null（呼叫端應據此不提供出發窗口）。
 */
export function searchDepartureWindow(options: DepartureSearchOptions): DepartureWindow | null {
  const step = options.stepMinutes && options.stepMinutes > 0 ? options.stepMinutes : DEFAULT_STEP;
  const slack = options.windowSlack ?? DEFAULT_SLACK;
  const grid = departureGrid(options.from, options.horizonMinutes ?? DEFAULT_HORIZON, step);
  const samples = grid.map((departAt) => options.sampleRisk(departAt));

  const usable = samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => sample.routeId !== null && sample.riskScore !== null && sample.meetsDeadline !== false);

  if (usable.length === 0) return null;

  let best = usable[0]!;
  for (const entry of usable) {
    if (entry.sample.riskScore! < best.sample.riskScore!) best = entry;
  }

  const floor = best.sample.riskScore! + slack;
  let lo = best.index;
  let hi = best.index;
  while (lo - 1 >= 0) {
    const candidate = samples[lo - 1]!;
    if (candidate.routeId === null || candidate.riskScore === null || candidate.meetsDeadline === false) break;
    if (candidate.riskScore > floor) break;
    lo -= 1;
  }
  while (hi + 1 < samples.length) {
    const candidate = samples[hi + 1]!;
    if (candidate.routeId === null || candidate.riskScore === null || candidate.meetsDeadline === false) break;
    if (candidate.riskScore > floor) break;
    hi += 1;
  }

  const start = samples[lo]!.departAt;
  const end = addMinutes(samples[hi]!.departAt, step);
  const count = hi - lo + 1;
  const evidence =
    `風險序列（${step} 分鐘粒度，共 ${samples.length} 點）：最低 ${best.sample.riskScore}（${formatHkTime(best.sample.departAt)}）；` +
    `建議窗口 ${formatHkTime(start)}–${formatHkTime(end)}（${count} 點），風險均不高於 ${floor}。` +
    `此為離散取樣比較，非連續最優解；未經歷史校準，不得當成準時機率。`;

  return {
    start,
    end,
    confidence: "low",
    evidence,
    samples,
    sampleCount: count,
  };
}
