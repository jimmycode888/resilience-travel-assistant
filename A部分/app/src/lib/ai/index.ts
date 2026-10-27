/**
 * C5 · AI 解釋層與自然語言輸入（成員 C）。
 *
 * **核心原則：Algorithm decides. AI explains.**
 *   1. 自然語言解析**只產生結構化條件**（目的地／期限／偏好），不得決定路線。
 *   2. 結果解釋**只能引用已經算好的結構化事實**（`evidence`）；沒有出處的時刻、數字、
 *      路線 ID 一律視為幻覺，整段退回模板。
 *   3. **沒有 API Key 也能跑**：預設不呼叫模型，直接用模板；模型逾時／拋錯／未過白名單
 *      都回退模板。金鑰由呼叫端注入，永不進入本模組。
 *   4. 不輸出未校準的精確機率；準時與排隊一律用定性信心 + 區間 + 說明。
 */
import { formatHkTime } from "@/lib/time";
import { CONFIDENCE_LABELS } from "@/lib/labels";
import { PLACES } from "@/lib/geo/places";
import type { Confidence } from "@/lib/types/decision";
import type { TeamCoreResult, TeamDecisionResult, TeamRouteResult } from "@/lib/types/team-integration";

// ─────────────────────────────────────────────────────────────
// 1. 自然語言 → 結構化條件（確定性、無模型）
// ─────────────────────────────────────────────────────────────

export interface ParsedTravelRequest {
  /** 命中的目的地（地點 ID）；未命中時為 null。 */
  destinationId: string | null;
  destinationName: string | null;
  /** 到達期限（`HH:mm`，24 小時制）；未提及時為 null。 */
  arriveBy: string | null;
  /** 人流偏好。 */
  crowdPreference: "low" | "any";
  /** 期限是否被強調（必須／一定）。 */
  deadlinePriority: "high" | "normal";
  /** 原始輸入。 */
  raw: string;
}

const CN_DIGITS: Readonly<Record<string, number>> = Object.freeze({
  零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
});

function parseHourToken(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const value = Number(token);
    return value >= 0 && value <= 23 ? value : null;
  }
  // 十一 / 十九 / 二十 / 二十三 等簡單中文數字
  if (token === "十") return 10;
  if (token.length === 2) {
    const first = CN_DIGITS[token[0]!];
    const second = CN_DIGITS[token[1]!];
    if (token[0] === "十" && second !== undefined) return 10 + second;
    if (first !== undefined && token[1] === "十") return first * 10;
    if (first !== undefined && second !== undefined) return first * 10 + second;
  }
  const single = CN_DIGITS[token];
  return single === undefined ? null : single;
}

function extractDeadline(text: string): string | null {
  const match = /([0-9]{1,2}|[零〇一二兩三四五六七八九十]{1,3})\s*[點点:時时]\s*([0-9]{1,2}|[零〇一二兩三四五六七八九十]{1,3})?\s*(分)?\s*(前)?/.exec(text);
  if (!match) return null;
  const hour = parseHourToken(match[1]!);
  if (hour === null) return null;
  const minute = match[2] ? parseHourToken(match[2]) ?? 0 : 0;
  if (minute > 59) return null;
  let h = hour;
  // 「晚上七點」「下午三點」等：下午／晚上 +12
  if (/(下午|晚上|晚間|傍晚|夜)/.test(text) && h < 12) h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractDestination(text: string): { id: string; name: string } | null {
  // 以地點名稱或別名做子字串比對；取最長命中，避免「福田口岸」被「福田」搶先。
  let best: { id: string; name: string; length: number } | null = null;
  for (const place of PLACES) {
    const needles = [place.name, ...(place.aliases ?? [])];
    for (const needle of needles) {
      if (needle.length === 0) continue;
      if (text.includes(needle) && (!best || needle.length > best.length)) {
        best = { id: place.id, name: place.name, length: needle.length };
      }
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** 解析自然語言出行請求（純字串規則，不呼叫模型、不決定路線）。 */
export function parseTravelRequest(text: string): ParsedTravelRequest {
  const destination = extractDestination(text);
  const crowdPreference = /(不想(太|那么|那麼)?[擠挤]|不要(太|那么|那麼)?[擠挤]|唔想(太)?迫|少人|[^不]擠|[^不]挤|避開人潮|避开人潮|less crowded)/.test(text) ? "low" : "any";
  const deadlinePriority = /(一定|必須|务必|一定要|趕不及|赶不上)/.test(text) ? "high" : "normal";
  return {
    destinationId: destination?.id ?? null,
    destinationName: destination?.name ?? null,
    arriveBy: extractDeadline(text),
    crowdPreference,
    deadlinePriority,
    raw: text,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. 結果解釋（模板 + 白名單 + 可注入模型）
// ─────────────────────────────────────────────────────────────

export type ExplanationModel = (input: { instruction: string; allowedFacts: readonly string[] }) => Promise<string> | string;

export interface ExplainTeamOptions {
  model?: ExplanationModel | null;
  timeoutMs?: number;
}

export interface TeamExplanation {
  routeId: string;
  text: string;
  evidence: string[];
}

export const EXPLANATION_INSTRUCTION =
  "你只能複述輸入的結構化事實。不得新增任何時刻、數字、路線名稱或口岸名稱。若沒有把握，直接重述事實清單。";

const MAX_EXPLANATION_LENGTH = 600;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function confidencePhrase(confidence: Confidence, note: string): string {
  return `到達信心為「${CONFIDENCE_LABELS[confidence]}」（${note}）`;
}

/** 從一條 `TeamRouteResult` 抽出可顯示、可溯源的事實。 */
export function routeFacts(route: TeamRouteResult): string[] {
  const facts: string[] = [`主路線 ${route.candidate.label}`];
  const reliability = route.assessment.reliability;
  facts.push(confidencePhrase(reliability.onTimeConfidence, reliability.confidenceNote));
  facts.push(`預計到達 ${formatHkTime(reliability.etaRange[0])}–${formatHkTime(reliability.etaRange[1])}`);
  const top = [...route.assessment.risk.breakdown.factors]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);
  for (const factor of top) facts.push(factor.claim);
  for (const segment of route.candidate.journey.segments) {
    if (segment.border) {
      facts.push(`口岸 ${segment.border.portId} 預計排隊 ${segment.border.queueMinutesRange[0]}–${segment.border.queueMinutesRange[1]} 分鐘（信心「${CONFIDENCE_LABELS[segment.border.confidence]}」，估算）`);
    }
  }
  if (route.meetsDeadline === false) facts.push("保守 ETA 已超出到達期限，不能承諾準時");
  return facts;
}

/** 模板解釋：只用傳入的事實拼句，永遠不會編造。 */
export function buildTemplateExplanation(facts: readonly string[]): string {
  return `${facts.join("；")}。以上為規則結果，未經歷史校準，不得當成準時機率。`;
}

/**
 * 檢查模型輸出：任何時刻（HH:mm）、路線編號或數字若不在允許事實中，即拒絕。
 * 回傳 true 表示通過。
 */
export function validateExplanation(text: string, allowedFacts: readonly string[]): boolean {
  const haystack = allowedFacts.join(" \n ");
  // 允許事實中出現的「時間區間」（例如 20–40 分鐘、08:20–08:30）：區間內的時刻算有出處。
  const ranges: Array<[number, number]> = [];
  for (const match of haystack.matchAll(/(\d{1,2}):(\d{2})\s*[–\-~至]\s*(\d{1,2}):(\d{2})/g)) {
    ranges.push([Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])]);
  }
  const toMinutes = (value: string): number => {
    const [h, m] = value.split(":");
    return Number(h) * 60 + Number(m);
  };
  const times = text.match(/\d{1,2}:\d{2}/g) ?? [];
  for (const time of times) {
    if (haystack.includes(time)) continue;
    const minutes = toMinutes(time);
    if (ranges.some(([start, end]) => minutes >= start && minutes <= end)) continue;
    return false;
  }
  const identifiers = text.match(/\b(?:R\d+|XB-\d+)\b/g) ?? [];
  for (const id of identifiers) {
    if (!haystack.includes(id)) return false;
  }
  return true;
}

/**
 * 產生解釋。
 *
 * - 預設（無 `model`）→ 模板。
 * - 有 `model` → 呼叫；逾時／拋錯／空字串／未過白名單 → 回退模板。
 * - 只回傳文字，永不修改任何決策欄位。
 */
export async function explainRoute(
  route: TeamRouteResult,
  options: ExplainTeamOptions = {},
): Promise<{ text: string; source: "model" | "template"; reason?: string }> {
  const facts = routeFacts(route);
  const template = buildTemplateExplanation(facts);
  if (!options.model) return { text: template, source: "template" };

  try {
    const result = withTimeout(
      Promise.resolve(options.model({ instruction: EXPLANATION_INSTRUCTION, allowedFacts: facts })),
      options.timeoutMs ?? 4000,
    );
    const text = (await result).trim();
    if (text === "") return { text: template, source: "template", reason: "empty" };
    if (text.length > MAX_EXPLANATION_LENGTH) return { text: template, source: "template", reason: "too-long" };
    if (!validateExplanation(text, facts)) return { text: template, source: "template", reason: "unsupported-fact" };
    return { text, source: "model" };
  } catch {
    return { text: template, source: "template", reason: "model-error" };
  }
}

/**
 * 為整個決策結果產生每條路線的解釋（供 `TeamDecisionResult.explanations` 使用）。
 */
export async function explainTeamDecision(
  core: TeamCoreResult,
  decision: TeamDecisionResult,
  options: ExplainTeamOptions = {},
): Promise<TeamExplanation[]> {
  const referenced = new Set<string>([decision.primaryRouteId, ...decision.backupRouteIds].filter((id): id is string => Boolean(id)));
  const order = [decision.primaryRouteId, ...decision.backupRouteIds].filter((id): id is string => Boolean(id));
  const routes = order
    .map((id) => core.routes.find((route) => route.candidate.id === id))
    .filter((route): route is TeamRouteResult => Boolean(route));
  // 若沒有任何被引用的路線（例如 unavailable），就為可行候選各給一條。
  const pool = routes.length > 0 ? routes : core.routes.filter((route) => route.eligible);

  const out: TeamExplanation[] = [];
  for (const route of pool) {
    const explained = await explainRoute(route, options);
    out.push({ routeId: route.candidate.id, text: explained.text, evidence: routeFacts(route) });
  }
  if (referenced.size === 0 && pool.length === 0) {
    out.push({
      routeId: "",
      text: "目前沒有可行的正式建議；請調整時間或目的地，或查閱替代方案。",
      evidence: ["沒有可行候選路線"],
    });
  }
  return out;
}

export { MAX_EXPLANATION_LENGTH };
