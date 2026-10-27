/**
 * 解釋層（成員 C）—— 把已經算好的 `DecisionResponse` 翻譯成人話。
 *
 * 這是 C 指令第 9 項「可選的 GenAI 解釋函式」的落地。三條設計原則來自 C 的接口契約 v1：
 *
 * 1. **模型不產生事實**：本層只讀 `DecisionResponse`，回傳的文字永遠不影響
 *    `departAt` / `etaRange` / `primaryRoute` / `planB` / `switchCondition` / `confidence` /
 *    `status` / `action`（它只回傳字串，呼叫端拿去替換 `reasons` 的文字）。
 * 2. **沒有金鑰也要能跑**：預設**不呼叫任何模型**，直接輸出模板文案；比賽現場斷網、
 *    沒有 API Key、模型逾時或拋錯，行為都一致。
 * 3. **每個數字帶出處**：模型輸出必須通過 `validateExplanation`（以 `basis` 為中心的
 *    白名單校驗）。任何時刻、數字或路線 ID 若在回應本身找不到出處，即整段退回模板。
 *
 * 這一層是純函式 + 注入式模型，不讀時鐘、不呼叫網路；真正的模型呼叫由呼叫端
 * （成員 A 的部署層）以 `options.model` 注入，金鑰永遠不進入本模組。
 */
import { CONFIDENCE_LABELS, DECISION_ACTION_LABELS } from "@/lib/labels";
import { formatHkTime } from "@/lib/time";
import type { DecisionResponse } from "@/lib/types";

/** 產生解釋的模型函式；由呼叫端注入。可以是 LLM，也可以是任何回傳字串的函式。 */
export type ExplanationModel = (request: ExplanationModelRequest) => Promise<string> | string;

export interface ExplanationModelRequest {
  /** 完整的結構化決策結果；模型只能引用它。 */
  response: DecisionResponse;
  /** 允許引用的字面事實（由 `basis`、`reasons`、時間欄位等組成）。 */
  allowedFacts: readonly string[];
  /** 給模型的固定指示。 */
  instruction: string;
}

export interface ExplainOptions {
  /** 模型實作。未提供時直接使用模板文案（不需要任何 API Key）。 */
  model?: ExplanationModel | null;
  /** 模型逾時（毫秒）。逾時即回退模板。 */
  timeoutMs?: number;
}

export interface ExplanationResult {
  text: string;
  /** `model` = 通過白名單校驗的模型輸出；`template` = 規則模板（回退）。 */
  source: "model" | "template";
  /** 回退原因（`source === "template"` 時才有值），方便除錯與斷言。 */
  reason?: string;
}

export const EXPLANATION_INSTRUCTION =
  "你是出行建議的解釋層。只能改寫 DecisionResponse 已有的結論，不得新增路線、時間、數字或事實；" +
  "不得使用 basis 以外的資訊；輸出 2–4 句繁體中文。";

const DEFAULT_TIMEOUT_MS = 3000;
// 每次都建立新的 regex（避免全域 lastIndex 在多次 match 之間互相污染）。
const timeRe = () => /\b([01]\d|2[0-3]):[0-5]\d\b/g;
const numberRe = () => /\d+(?:\.\d+)?/g;
const routeRe = () => /\bR\d+\b/g;

function stripTimesAndRoutes(text: string): string {
  return text.replace(timeRe(), " ").replace(routeRe(), " ");
}

/** 模型輸出長度上限：過長通常代表模型在自由發揮。 */
export const MAX_EXPLANATION_LENGTH = 600;

export interface AllowedFacts {
  times: ReadonlySet<string>;
  numbers: ReadonlySet<string>;
  routes: ReadonlySet<string>;
  /** 人類可讀的事實清單，供 prompt 使用（等同 basis 的投影）。 */
  facts: readonly string[];
}

function collectTexts(response: DecisionResponse): string[] {
  const texts: string[] = [
    ...response.reasons,
    ...response.uncertainty,
    ...response.notices,
    response.switchCondition,
    response.disclaimer,
    response.generatedFor.origin,
    response.generatedFor.destination,
    response.serviceDate,
  ];
  for (const entry of response.basis) texts.push(entry.claim, entry.source, entry.sourceUrl ?? "");
  for (const source of response.dataSources) texts.push(source.label, source.note ?? "");
  for (const plan of response.candidates) {
    texts.push(plan.label, plan.summary, ...plan.riskNotes);
    for (const step of plan.steps) texts.push(step.instruction, step.note ?? "", step.from, step.to);
  }
  for (const step of response.primaryRoute) texts.push(step.instruction, step.note ?? "");
  return texts;
}

/** 收集「這份回應自己說過的事實」：時間、數字、路線 ID。 */
export function collectAllowedFacts(response: DecisionResponse): AllowedFacts {
  const texts = collectTexts(response);
  const times = new Set<string>();
  const numbers = new Set<string>();
  const routes = new Set<string>();

  const structuredTimes = [
    response.departAt,
    response.latestDepartAt,
    response.etaRange[0],
    response.etaRange[1],
    response.switchDeadline,
    response.dataUpdatedAt,
    response.generatedFor.arriveBy,
  ].filter((value) => value !== "");

  for (const iso of structuredTimes) {
    const token = formatHkTime(iso);
    if (/^\d{2}:\d{2}$/.test(token)) times.add(token);
    for (const match of iso.match(numberRe()) ?? []) numbers.add(match);
  }
  for (const text of texts) {
    for (const match of text.match(timeRe()) ?? []) times.add(match);
    for (const match of text.match(routeRe()) ?? []) routes.add(match);
    // 先移除時刻與路線 ID，避免把「R1」裡的 1、或時刻裡的數字誤當成獨立數字。
    for (const match of stripTimesAndRoutes(text).match(numberRe()) ?? []) numbers.add(match);
  }
  for (const plan of response.candidates) {
    routes.add(plan.routeId);
    for (const value of [
      plan.durationMinutes,
      plan.baseDurationMinutes,
      plan.delayMinutes,
      plan.transfers,
      plan.extraCostHkd,
      plan.accessWalkMinutes,
      plan.score,
    ]) {
      numbers.add(String(value));
    }
  }

  const facts = [
    ...response.basis.map((entry) => `${entry.claim}（來源：${entry.source}）`),
    ...response.reasons,
  ];

  return { times, numbers, routes, facts };
}

/** 抽出文字中「需要出處」的事實：時刻、數字、路線 ID。 */
export function extractClaimedFacts(text: string): {
  times: string[];
  numbers: string[];
  routes: string[];
} {
  return {
    times: text.match(timeRe()) ?? [],
    numbers: stripTimesAndRoutes(text).match(numberRe()) ?? [],
    routes: text.match(routeRe()) ?? [],
  };
}

/**
 * 白名單校驗：模型文字裡的每個時刻／數字／路線 ID 都必須在回應裡出現過。
 * 回傳問題清單；空陣列代表通過。
 */
export function validateExplanation(text: string, response: DecisionResponse): string[] {
  if (text.trim() === "") return ["解釋為空"];
  if (text.length > MAX_EXPLANATION_LENGTH) return [`解釋過長（${text.length} > ${MAX_EXPLANATION_LENGTH}）`];

  const allowed = collectAllowedFacts(response);
  const claimed = extractClaimedFacts(text);
  const issues: string[] = [];

  for (const token of claimed.times) if (!allowed.times.has(token)) issues.push(`時刻 ${token} 無出處`);
  for (const token of claimed.routes) if (!allowed.routes.has(token)) issues.push(`路線 ${token} 無出處`);
  for (const token of claimed.numbers) if (!allowed.numbers.has(token)) issues.push(`數字 ${token} 無出處`);

  return issues;
}

/** 規則模板文案：只重組回應既有內容，不新增任何事實。 */
export function buildTemplateExplanation(response: DecisionResponse): string {
  const parts: string[] = [`行動建議：${DECISION_ACTION_LABELS[response.action]}。`];
  if (response.primaryPlan) {
    parts.push(`主路線為「${response.primaryPlan.label}」，預計全程 ${response.primaryPlan.durationMinutes} 分鐘。`);
  }
  if (response.reasons[0]) parts.push(response.reasons[0]);
  if (response.switchCondition) parts.push(`切換條件：${response.switchCondition}`);
  parts.push(`到達信心為「${CONFIDENCE_LABELS[response.confidence]}」。`);
  if (response.uncertainty[0]) parts.push(response.uncertainty[0]);
  return parts.join("");
}

function withTimeout<T>(value: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("解釋模型逾時")), timeoutMs);
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function templateResult(response: DecisionResponse, reason: string): ExplanationResult {
  return { text: buildTemplateExplanation(response), source: "template", reason };
}

/**
 * 產生解釋。任何失敗（沒有模型、逾時、拋錯、空字串、白名單不合格）都回退到規則模板，
 * 因此呼叫端可以無條件使用回傳的 `text`。
 */
export async function explainDecision(
  response: DecisionResponse,
  options: ExplainOptions = {},
): Promise<ExplanationResult> {
  const model = options.model;
  if (!model) return templateResult(response, "no_model");

  const allowed = collectAllowedFacts(response);
  try {
    const raw = await withTimeout(
      Promise.resolve(
        model({
          response,
          allowedFacts: allowed.facts,
          instruction: EXPLANATION_INSTRUCTION,
        }),
      ),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") return templateResult(response, "empty_model_output");

    const issues = validateExplanation(text, response);
    if (issues.length > 0) return templateResult(response, `rejected: ${issues.join("；")}`);
    return { text, source: "model" };
  } catch (error) {
    return templateResult(response, `model_error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
