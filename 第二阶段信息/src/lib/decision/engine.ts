/**
 * 決策引擎（成員 C 的模組）。
 *
 * 契約：`decideTrip(request, snapshot, options?) => DecisionResponse`
 *   - `options.notices`：適配層的回退訊息，會原樣帶進回應。
 *   - `options.routes`：候選路線定義；預設使用走廊內的三條路線（測試可注入）。
 *   - `options.now`：注入時鐘（ISO）。只有當資料品質為 live / cached 時，
 *     引擎才會用它判斷資料是否過期；fixture 不受時鐘影響。
 *
 * - 不讀取時鐘（時鐘一律由呼叫端注入）、不呼叫網路、不產生隨機值。
 * - 相同輸入永遠得到相同輸出（刷新與重複提交都不會改變結果）。
 * - 大模型不得參與本檔案；路線、時間與切換條件只能由規則與資料產生。
 */
import {
  CORRIDOR,
  CORRIDOR_NODE_LABELS,
  ROUTES,
  baseDurationMinutes,
  findPlace,
  segmentDuration,
  type CorridorNodeId,
  type Place,
  type RouteDefinition,
  type RouteSegment,
} from "@/lib/corridor";
import {
  CONFIDENCE_LABELS,
  CROWDING_LABELS,
  DATA_QUALITY_LABELS,
  SCENARIO_LABELS,
  STATUS_LABELS,
} from "@/lib/labels";
import { addMinutes, diffMinutes, formatHkStamp, formatHkTime, hkMinutesOfDay, parseArriveBy } from "@/lib/time";
import type {
  Confidence,
  ContextSnapshot,
  DecisionAction,
  DecisionResponse,
  ExcludedRoute,
  RoutePlan,
  RouteServiceStatus,
  RouteStep,
  Scenario,
  TripRequest,
} from "@/lib/types";
import {
  applyActionSafety,
  buildAction,
  buildBasis,
  buildSwitchDeadline,
  buildUncertainty,
  detectSevereWeather,
} from "./advisory";
import { computeConfidence, scoreRoute } from "./scoring";
import {
  CONFIDENCE_RULES,
  SCENARIO_PROFILES,
  UNKNOWN_ROUTE_RULES,
  decideStatus,
  type ScenarioProfile,
} from "./thresholds";

export const DISCLAIMER =
  "到達信心是基於演示規則的定性判斷，並非經校準的準時機率。實際出行請同時參考港鐵、運輸署與香港天文台的官方資訊。";

/** 沒有 Plan B 時 switchCondition 為空字串（見 API_CONTRACT.md）。 */
const NO_PLAN_B_SWITCH_CONDITION = "";

interface Candidate {
  definition: RouteDefinition;
  service: RouteServiceStatus;
  baseDuration: number;
  /** 資料實際回報的延誤（不含未確認狀態的保守預留）。 */
  reportedDelay: number;
  plan: RoutePlan;
}

export interface DecideTripOptions {
  /** 適配層的回退訊息，會原樣帶進回應的 notices。 */
  notices?: readonly string[];
  /** 候選路線定義。預設為走廊內的三條路線；測試可注入自訂路線。 */
  routes?: readonly RouteDefinition[];
  /** 注入「現在時間」（ISO）。未提供時視為資料未過期。 */
  now?: string;
}

interface VerifiedRequest {
  request: TripRequest;
  arriveBy: string;
  serviceDate: string;
  origin: Place;
  destination: Place;
  profile: ScenarioProfile;
}

function verifyRequest(request: TripRequest): VerifiedRequest {
  const parsed = parseArriveBy(request.arriveBy);
  if (!parsed.ok) {
    throw new Error(`decide() 收到無效的 arriveBy：${parsed.message}`);
  }

  const origin = findPlace(request.origin);
  const destination = findPlace(request.destination);
  if (!origin || !destination) {
    /// API 層已先做輸入驗證，走到這裡代表有人繞過了 validation.ts。
    throw new Error(
      `decide() 無法解析地點：origin=${request.origin}，destination=${request.destination}。`,
    );
  }
  if (origin.role !== "origin" || destination.role !== "destination") {
    throw new Error("origin 與 destination 的角色不對；請使用正確的預設地點 ID。");
  }

  return {
    request,
    arriveBy: parsed.iso,
    serviceDate: parsed.hkDate,
    origin,
    destination,
    profile: SCENARIO_PROFILES[request.scenario],
  };
}

function serviceStatusFor(snapshot: ContextSnapshot, routeId: string): RouteServiceStatus {
  return (
    snapshot.routes.find((route) => route.routeId === routeId) ?? {
      routeId,
      status: "unknown",
      delayMinutes: 0,
      crowding: "unknown",
      note: "本次資料沒有涵蓋這條路線的服務狀態。",
      affectedSegments: [],
      updatedAt: snapshot.collectedAt,
    }
  );
}

function nodeLabel(id: string): string {
  return CORRIDOR_NODE_LABELS[id as CorridorNodeId] ?? id;
}

function walkEndpoints(
  segment: Extract<RouteSegment, { kind: "walk" }>,
  origin: Place,
  destination: Place,
): { from: string; to: string } {
  return {
    from: segment.fromPlaceId === "ORIGIN" ? origin.name : nodeLabel(segment.fromPlaceId),
    to: segment.toPlaceId === "DESTINATION" ? destination.name : nodeLabel(segment.toPlaceId),
  };
}

/**
 * 把延誤按各段基準時間比例分配，餘數加到最長的一段，
 * 確保所有步驟的時長加總剛好等於含延誤的總時間。
 */
function allocateDelay(nominals: number[], delayMinutes: number): number[] {
  if (delayMinutes <= 0) return [...nominals];
  const base = nominals.reduce((total, value) => total + value, 0);
  if (base <= 0) return [...nominals];

  const shares = nominals.map((value) => Math.floor((delayMinutes * value) / base));
  const allocated = shares.reduce((total, value) => total + value, 0);

  let longestIndex = 0;
  nominals.forEach((value, index) => {
    if (value > (nominals[longestIndex] ?? 0)) longestIndex = index;
  });
  shares[longestIndex] = (shares[longestIndex] ?? 0) + (delayMinutes - allocated);

  return nominals.map((value, index) => value + (shares[index] ?? 0));
}

function longestRideIndex(segments: readonly RouteSegment[]): number {
  return segments.reduce((best, segment, index) => {
    if (segment.kind !== "ride") return best;
    if (best === -1) return index;
    const bestSegment = segments[best];
    if (!bestSegment || bestSegment.kind !== "ride") return index;
    return segment.rideMinutes > bestSegment.rideMinutes ? index : best;
  }, -1);
}

function buildSteps(
  definition: RouteDefinition,
  origin: Place,
  destination: Place,
  startIso: string,
  delayMinutes: number,
  serviceNote: string | null,
): RouteStep[] {
  const nominals = definition.segments.map((segment) =>
    segmentDuration(segment, origin, destination),
  );
  const durations = allocateDelay(nominals, delayMinutes);
  const noteIndex = longestRideIndex(definition.segments);

  const steps: RouteStep[] = [];
  let cursor = startIso;

  definition.segments.forEach((segment, index) => {
    const duration = durations[index] ?? 0;
    const arriveAt = addMinutes(cursor, duration);
    const endpoints =
      segment.kind === "walk"
        ? walkEndpoints(segment, origin, destination)
        : { from: segment.from, to: segment.to };

    steps.push({
      id: segment.id,
      mode: segment.mode,
      line: segment.kind === "ride" ? segment.line : null,
      from: endpoints.from,
      to: endpoints.to,
      departAt: cursor,
      arriveAt,
      durationMinutes: duration,
      instruction: segment.instruction,
      note: index === noteIndex ? serviceNote : null,
    });
    cursor = arriveAt;
  });

  return steps;
}

function firstSegmentMinutes(
  definition: RouteDefinition,
  origin: Place,
  destination: Place,
): number {
  const first = definition.segments[0];
  return first ? segmentDuration(first, origin, destination) : 0;
}

function boardingPoint(steps: RouteStep[]): string {
  return steps[0]?.to ?? "起點";
}

function firstRide(steps: RouteStep[]): RouteStep | null {
  return steps.find((step) => step.line !== null) ?? null;
}

function mainLine(steps: RouteStep[]): string {
  return firstRide(steps)?.line ?? "主路線";
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")));
}

/** 確保句子以句號結尾，但不會出現「。。」。 */
function terminate(text: string): string {
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function buildSwitchCondition(
  primary: Candidate,
  planB: Candidate,
  profile: ScenarioProfile,
  /** `switchDeadline` 的顯示時刻（HH:mm），與機器可讀欄位保證一致。 */
  switchDeadlineTime: string,
): string {
  const waitMinutes = profile.planBWaitSwitchMinutes;
  const planBLeaveBy = formatHkTime(planB.plan.departAt);
  const planBWalk = planB.plan.accessWalkMinutes;

  // 主路線是鐵路、Plan B 是路面：切換點在巴士站，且巴士較慢，
  // 所以必須先說明「要在幾點前離開起點」，否則使用者會以為可以隨時改乘。
  if (primary.definition.primaryMode === "rail" && planB.definition.primaryMode === "road") {
    const busStop = boardingPoint(planB.plan.steps);
    const timingNote =
      Date.parse(planB.plan.departAt) < Date.parse(primary.plan.departAt)
        ? `；巴士較慢，必須在 ${planBLeaveBy} 前離開起點，逾時則維持主路線並改乘下一班`
        : `；${planBLeaveBy} 前離開起點`;
    return (
      `若出發前${mainLine(primary.plan.steps)}延誤超過 ${profile.railDelaySwitchMinutes} 分鐘，改行 Plan B：${planB.plan.label}` +
      `（需先步行 ${planBWalk} 分鐘至${busStop}${timingNote}）。` +
      `若到達${busStop}後 ${waitMinutes} 分鐘內仍未能上車，時間已不可控，請改乘下一個可行班次。`
    );
  }

  // 主路線是路面、Plan B 是鐵路：切換點在使用者現時所在的巴士站。
  if (primary.definition.primaryMode === "road" && planB.definition.primaryMode === "rail") {
    const busStop = boardingPoint(primary.plan.steps);
    const station = firstRide(planB.plan.steps)?.from ?? boardingPoint(planB.plan.steps);
    return (
      `若於${busStop}等候超過 ${waitMinutes} 分鐘仍未能上車，改乘 Plan B：${planB.plan.label}` +
      `（步行 ${planBWalk} 分鐘至${station}；最遲 ${switchDeadlineTime} 前決定是否改乘，${planBLeaveBy} 前離開起點）。`
    );
  }

  return `若${primary.plan.label}由「${STATUS_LABELS[primary.plan.status]}」轉為服務中斷，改行 Plan B：${planB.plan.label}（${planBLeaveBy} 前離開起點）。`;
}

function exclusionReason(args: {
  definition: RouteDefinition;
  service: RouteServiceStatus;
  request: TripRequest;
  effectiveMinutes: number;
  departAt: string;
  serviceDate: string;
}): string | null {
  const { definition, service, request, effectiveMinutes, departAt, serviceDate } = args;

  if (service.status === "disrupted") {
    // 用「—」而不是再一層括號，避免出現「（…（…））」的嵌套。
    return service.note ? `服務中斷 — ${service.note}` : "服務中斷";
  }
  if (definition.transfers > request.constraints.maxTransfers) {
    return `需要轉乘 ${definition.transfers} 次，超過上限 ${request.constraints.maxTransfers} 次`;
  }
  if (definition.extraCostHkd > request.constraints.maxExtraCost) {
    return `額外車費 $${definition.extraCostHkd}，超過上限 $${request.constraints.maxExtraCost}`;
  }

  const departMinutes = diffMinutes(departAt, `${serviceDate}T00:00:00+08:00`);
  if (departMinutes < CORRIDOR.serviceWindowStartMinutes) {
    const startMinutes = CORRIDOR.serviceWindowStartMinutes;
    const clock = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return `需要在 ${clock(departAt ? hkMinutesOfDay(departAt) : 0)} 出發，早於首班服務時間 ${clock(startMinutes)}（行程需 ${effectiveMinutes} 分鐘）`;
  }

  return null;
}

export function decideTrip(
  request: TripRequest,
  snapshot: ContextSnapshot,
  options: DecideTripOptions = {},
): DecisionResponse {
  const verified = verifyRequest(request);
  const { arriveBy, serviceDate, origin, destination, profile } = verified;
  const candidateRoutes = options.routes ?? ROUTES;

  // 資料過期判定。fixture 是刻意標示的演示樣本，不套用實時資料的效期規則
  // （畫面上的「演示固定資料 + 固定時間」已經誠實說明了這件事）。
  const isStale =
    snapshot.quality !== "fixture" &&
    typeof options.now === "string" &&
    Number.isFinite(Date.parse(options.now)) &&
    Date.parse(options.now) > Date.parse(snapshot.expiresAt);

  const notices = [...(options.notices ?? [])];
  if (serviceDate !== snapshot.serviceDate) {
    // 用實際品質稱呼這份資料：實時／快取資料不應被叫成「示範資料」。
    const sampleLabel =
      snapshot.quality === "fixture" ? "示範資料" : DATA_QUALITY_LABELS[snapshot.quality];
    notices.push(
      `本次${sampleLabel}以 ${snapshot.serviceDate} 為服務日樣本；時間已套用到你選擇的 ${serviceDate}。`,
    );
  }
  if (snapshot.quality === "fixture") {
    notices.push("本結果使用演示固定資料（fixture），並非實時路況，請勿當作即時資訊。");
  } else if (snapshot.quality === "cached") {
    notices.push("本結果使用快取資料，實際更新時間見下方資料來源。");
  }
  // 混合來源誠實標示（回應 B 交接第 2 條）：頂層品質只能有一個值，
  // 但實時路徑常見「天氣 live + 靜態路線估算 fixture + 交通 unknown」。
  // 若不逐項說明，使用者會把整份結果當成實時資料。
  const offQualitySources = snapshot.sources.filter(
    (source) => source.quality !== snapshot.quality,
  );
  if (snapshot.quality !== "fixture" && offQualitySources.length > 0) {
    notices.push(
      `本次為混合資料：${offQualitySources
        .map((source) => `${source.label}（${DATA_QUALITY_LABELS[source.quality]}）`)
        .join("、")}與本次標示的${DATA_QUALITY_LABELS[snapshot.quality]}並不同步，請逐項查看下方資料來源。`,
    );
  }
  if (isStale) {
    notices.push(
      `資料已於 ${formatHkStamp(snapshot.expiresAt)} 過期（現在時間 ${formatHkStamp(options.now ?? "")}），到達信心已降為低，請重新查詢。`,
    );
  }

  const hasDisruptedRoute = snapshot.routes.some((route) => route.status === "disrupted");
  const drafts: Array<{
    definition: RouteDefinition;
    service: RouteServiceStatus;
    base: number;
    effective: number;
    departAt: string;
  }> = [];
  const excludedRoutes: ExcludedRoute[] = [];

  for (const definition of candidateRoutes) {
    const service = serviceStatusFor(snapshot, definition.id);
    const base = baseDurationMinutes(definition, origin, destination);
    const dataDelay = service.status === "disrupted" ? 0 : service.delayMinutes;
    // 服務狀態未確認時，不得當成「零延誤」：額外預留保守時間，
    // 讓建議與「已按保守假設計算」的說法一致（契約 §5）。
    const unknownExtra = service.status === "unknown" ? UNKNOWN_ROUTE_RULES.extraMinutes : 0;
    const effective = base + dataDelay + unknownExtra;
    const departAt = addMinutes(arriveBy, -(effective + profile.riskBufferMinutes));

    const reason = exclusionReason({
      definition,
      service,
      request,
      effectiveMinutes: effective,
      departAt,
      serviceDate,
    });
    if (reason) {
      excludedRoutes.push({ routeId: definition.id, label: definition.label, reason });
      continue;
    }
    drafts.push({ definition, service, base, effective, departAt });
  }

  const durations = drafts.map((draft) => draft.effective);
  const fastest = durations.length > 0 ? Math.min(...durations) : 0;
  const slowest = durations.length > 0 ? Math.max(...durations) : 0;

  const candidates: Candidate[] = drafts.map((draft) => {
    const { definition, service, base, effective, departAt } = draft;
    // 未確認狀態的保守時間一併寫進 plan.delayMinutes，
    // 確保 durationMinutes === baseDurationMinutes + delayMinutes 這條不變條件成立。
    const assumedDelay =
      (service.status === "disrupted" ? 0 : service.delayMinutes) +
      (service.status === "unknown" ? UNKNOWN_ROUTE_RULES.extraMinutes : 0);
    return {
      definition,
      service,
      baseDuration: base,
      reportedDelay: service.status === "disrupted" ? 0 : service.delayMinutes,
      plan: {
        routeId: definition.id,
        label: definition.label,
        summary: definition.summary,
        steps: buildSteps(
          definition,
          origin,
          destination,
          departAt,
          assumedDelay,
          service.note,
        ),
        departAt,
        arriveAt: addMinutes(departAt, effective),
        accessWalkMinutes: firstSegmentMinutes(definition, origin, destination),
        durationMinutes: effective,
        baseDurationMinutes: base,
        delayMinutes: assumedDelay,
        transfers: definition.transfers,
        extraCostHkd: definition.extraCostHkd,
        status: service.status,
        crowding: service.crowding,
        riskNotes: unique([
          ...definition.riskNotes,
          service.note ?? "",
          service.status === "unknown"
            ? `服務狀態未確認，已額外預留 ${UNKNOWN_ROUTE_RULES.extraMinutes} 分鐘作保守估算`
            : "",
          ...service.affectedSegments.map((segment) => `受影響區段：${segment}`),
        ]),
        score: scoreRoute({
          durationMinutes: effective,
          fastestMinutes: fastest,
          slowestMinutes: slowest,
          status: service.status,
          transfers: definition.transfers,
          maxTransfers: request.constraints.maxTransfers,
          crowding: service.crowding,
          extraCostHkd: definition.extraCostHkd,
          maxExtraCost: request.constraints.maxExtraCost,
        }),
      },
    };
  });

  // 分數高者優先；分數相同時按路線 ID 排序，確保結果完全可重現。
  candidates.sort((a, b) =>
    b.plan.score !== a.plan.score
      ? b.plan.score - a.plan.score
      : a.definition.id.localeCompare(b.definition.id),
  );

  if (candidates.length === 0) {
    return unavailableResponse({
      request,
      arriveBy,
      serviceDate,
      snapshot,
      excludedRoutes,
      notices,
    });
  }

  const primary = candidates[0]!;
  // Plan B 優先選不同的主要運輸方式（鐵路 ↔ 路面），才能對抗與主路線不同的失效模式；
  // 沒有其他模式時才退回次高分路線。
  const planB =
    candidates
      .slice(1)
      .find((candidate) => candidate.definition.primaryMode !== primary.definition.primaryMode) ??
    candidates[1] ??
    null;

  const { confidence: computedConfidence, score: confidenceScore, penalties } = computeConfidence({
    status: primary.plan.status,
    // 用「資料回報的延誤」計分：未確認狀態的保守預留是政策，不當成觀測到的延誤。
    delayMinutes: primary.reportedDelay,
    crowding: primary.plan.crowding,
    transfers: primary.plan.transfers,
    slackMinutes: profile.riskBufferMinutes,
    dataQuality: snapshot.quality,
    hasDisruptedRoute,
  });

  // 資料過期時，誠實地把信心降為低 → status 變成 uncertain，而不是假裝確定。
  // 規則分數也一併壓到 medium 門檻以下，避免出現「信心低但分數 85/100」的矛盾描述。
  const confidence: Confidence = isStale ? "low" : computedConfidence;
  const effectiveConfidenceScore = isStale
    ? Math.min(confidenceScore, CONFIDENCE_RULES.mediumThreshold - 1)
    : confidenceScore;

  if (excludedRoutes.length > 0) {
    notices.push(
      terminate(
        `已排除 ${excludedRoutes.length} 條路線：${excludedRoutes
          .map((route) => `${route.routeId} ${route.label}：${route.reason}`)
          .join("；")}`,
      ),
    );
  }

  const primaryPlan = primary.plan;

  // 行動建議層（additive）：只把已經算好的 status / 時間 / 資料品質翻譯成
  // 一步可執行的動作，不改變任何時間、路線或信心。
  const status = decideStatus(confidence, planB !== null);
  const latestDepartAt = addMinutes(primaryPlan.departAt, profile.riskBufferMinutes);
  const missedLatestDeparture =
    typeof options.now === "string" &&
    Number.isFinite(Date.parse(options.now)) &&
    Date.parse(options.now) > Date.parse(latestDepartAt);

  if (missedLatestDeparture) {
    notices.push(
      `現在時間已超過最遲起程時間 ${formatHkTime(latestDepartAt)}，按本建議出發已無法保證準時到達，請調整到達時間或改用其他方式。`,
    );
  }

  // 惡劣天氣安全規則：黑雨／八號或以上信號生效、而建議路線需要露天候車時，
  // 行動建議降為 wait。它只覆寫 action，不改變任何時間、路線或信心。
  const severeWeather = detectSevereWeather(snapshot.weather);
  const exposedPrimary = primary.definition.primaryMode === "road";
  const safetyTriggered = severeWeather.severe && exposedPrimary;
  const severeWeatherLabel = safetyTriggered ? severeWeather.label : null;
  const action: DecisionAction = applyActionSafety({
    action: buildAction({
      status,
      departAt: primaryPlan.departAt,
      latestDepartAt,
      isStale,
      now: options.now,
    }),
    severeWeather: severeWeather.severe,
    exposedPrimary,
  });

  if (severeWeatherLabel) {
    notices.push(
      `「${severeWeatherLabel}」生效，而建議路線需要在露天候車；已把行動建議改為「先核實再出發」，請先確認官方最新安排。`,
    );
  }

  const unknownRouteExtraMinutes = primaryPlan.status === "unknown" ? UNKNOWN_ROUTE_RULES.extraMinutes : 0;
  const switchDeadline = planB
    ? buildSwitchDeadline({
        primaryMode: primary.definition.primaryMode,
        planBMode: planB.definition.primaryMode,
        primaryDepartAt: primaryPlan.departAt,
        planBDepartAt: planB.plan.departAt,
        waitSwitchMinutes: profile.planBWaitSwitchMinutes,
      })
    : "";
  const switchCondition = planB
    ? buildSwitchCondition(primary, planB, profile, formatHkTime(switchDeadline))
    : NO_PLAN_B_SWITCH_CONDITION;

  const basis = buildBasis({
    scenario: request.scenario,
    snapshot,
    profile,
    primaryPlan,
    confidence,
    confidenceScore: effectiveConfidenceScore,
    penalties,
    excludedRoutes,
    isStale,
    severeWeatherLabel,
    unknownRouteExtraMinutes,
  });

  const uncertainty = buildUncertainty({
    status,
    snapshot,
    primaryPlan,
    planBPresent: planB !== null,
    confidence,
    excludedRouteCount: excludedRoutes.length,
    hasDisruptedRoute,
    isStale,
    missedLatestDeparture,
    latestDepartAt,
    action,
    severeWeatherLabel,
    unknownRouteExtraMinutes,
  });

  return {
    status,
    departAt: primaryPlan.departAt,
    latestDepartAt,
    etaRange: [
      addMinutes(primaryPlan.departAt, primaryPlan.baseDurationMinutes),
      addMinutes(primaryPlan.departAt, primaryPlan.durationMinutes + profile.varianceMinutes),
    ],
    confidence,
    primaryRoute: primaryPlan.steps,
    planB: planB ? planB.plan.steps : [],
    switchCondition,
    reasons: buildReasons({
      scenario: request.scenario,
      snapshot,
      primary,
      planB,
      profile,
      confidence,
      confidenceScore: effectiveConfidenceScore,
      penalties,
      excludedRoutes,
      isStale,
    }),
    dataUpdatedAt: snapshot.collectedAt,
    dataQuality: snapshot.quality,
    primaryPlan,
    planBPlan: planB ? planB.plan : null,
    candidates: candidates.map((candidate) => candidate.plan),
    excludedRoutes,
    dataSources: snapshot.sources,
    notices,
    disclaimer: DISCLAIMER,
    scenario: request.scenario,
    serviceDate,
    generatedFor: {
      origin: origin.name,
      destination: destination.name,
      arriveBy,
    },
    action,
    switchDeadline,
    basis,
    uncertainty,
  };
}

interface UnavailableInput {
  request: TripRequest;
  arriveBy: string;
  serviceDate: string;
  snapshot: ContextSnapshot;
  excludedRoutes: ExcludedRoute[];
  notices: string[];
}

function unavailableResponse(input: UnavailableInput): DecisionResponse {
  const { request, arriveBy, serviceDate, snapshot, excludedRoutes, notices } = input;
  const profile = SCENARIO_PROFILES[request.scenario];
  const hasDisruptedRoute = snapshot.routes.some((route) => route.status === "disrupted");

  // 沒有可行路線 → action 為 hold：不要出發，留在安全處並調整條件後再查。
  const action: DecisionAction = "hold";
  const basis = buildBasis({
    scenario: request.scenario,
    snapshot,
    profile,
    primaryPlan: null,
    confidence: "low",
    confidenceScore: 0,
    penalties: [],
    excludedRoutes,
    isStale: false,
  });
  const uncertainty = buildUncertainty({
    status: "unavailable",
    snapshot,
    primaryPlan: null,
    planBPresent: false,
    confidence: "low",
    excludedRouteCount: excludedRoutes.length,
    hasDisruptedRoute,
    isStale: false,
    missedLatestDeparture: false,
    latestDepartAt: "",
    action,
  });

  return {
    status: "unavailable",
    departAt: "",
    latestDepartAt: "",
    etaRange: ["", ""],
    confidence: "low",
    primaryRoute: [],
    planB: [],
    switchCondition: NO_PLAN_B_SWITCH_CONDITION,
    reasons: [
      "在目前的資料與你的限制條件下，沒有可行的路線建議。",
      ...excludedRoutes.map((route) => terminate(`${route.routeId} ${route.label}：${route.reason}`)),
      "可以放寬額外車費或轉乘次數上限，或改為較早的到達時間再試一次。",
    ],
    dataUpdatedAt: snapshot.collectedAt,
    dataQuality: snapshot.quality,
    primaryPlan: null,
    planBPlan: null,
    candidates: [],
    excludedRoutes,
    dataSources: snapshot.sources,
    notices,
    disclaimer: DISCLAIMER,
    scenario: request.scenario,
    serviceDate,
    generatedFor: {
      origin: request.origin,
      destination: request.destination,
      arriveBy,
    },
    action,
    switchDeadline: "",
    basis,
    uncertainty,
  };
}

interface ReasonInput {
  scenario: Scenario;
  snapshot: ContextSnapshot;
  primary: Candidate;
  planB: Candidate | null;
  profile: ScenarioProfile;
  confidence: Confidence;
  confidenceScore: number;
  penalties: string[];
  excludedRoutes: ExcludedRoute[];
  isStale: boolean;
}

function buildReasons(input: ReasonInput): string[] {
  const { snapshot, primary, planB, profile, confidence, confidenceScore, penalties, excludedRoutes } =
    input;
  const { scenario } = input;
  const plan = primary.plan;
  const reasons: string[] = [];

  const leadingIncident = snapshot.incidents[0];
  if (leadingIncident) {
    reasons.push(`${leadingIncident.title}：${terminate(leadingIncident.detail)}`);
  } else if (snapshot.weather.warning) {
    reasons.push(terminate(`${snapshot.weather.warning}生效。${snapshot.weather.note ?? ""}`.trim()));
  } else {
    reasons.push(
      terminate(
        `天氣與交通消息未見影響本走廊的事件（資料時間 ${formatHkStamp(snapshot.collectedAt)}）`,
      ),
    );
  }

  if (plan.status === "ok") {
    reasons.push(
      `${plan.label}：現時服務正常，${CROWDING_LABELS[plan.crowding]}，預計全程 ${plan.durationMinutes} 分鐘。`,
    );
  } else if (plan.status === "delayed") {
    reasons.push(
      `${plan.label}：現時延誤約 ${plan.delayMinutes} 分鐘，預計全程 ${plan.durationMinutes} 分鐘。`,
    );
  } else {
    reasons.push(
      `${plan.label}：服務狀態未確認，已在資料延誤之上額外預留 ${UNKNOWN_ROUTE_RULES.extraMinutes} 分鐘作保守估算（預計全程 ${plan.durationMinutes} 分鐘），請預留更多時間。`,
    );
  }

  if (planB) {
    const delta = planB.plan.durationMinutes - plan.durationMinutes;
    if (delta > 0) {
      reasons.push(
        `主路線較 Plan B（${planB.plan.label}）快 ${delta} 分鐘，因此建議先採用主路線，並保留 Plan B 作為切換選項。`,
      );
    } else if (delta < 0) {
      reasons.push(
        `主路線較 Plan B 慢 ${Math.abs(delta)} 分鐘，但服務狀態較穩定（${STATUS_LABELS[plan.status]}）且轉乘次數為 ${plan.transfers} 次，因此以可靠性優先。`,
      );
    } else {
      reasons.push(
        `主路線與 Plan B 的預計時間相同（${plan.durationMinutes} 分鐘），因此以服務狀態、轉乘次數與人流決定主路線。`,
      );
    }
  } else {
    reasons.push("只有一條路線符合你的限制條件，因此本次沒有可用的 Plan B。");
  }

  reasons.push(
    `已按「${SCENARIO_LABELS[scenario]}」情景預留 ${profile.riskBufferMinutes} 分鐘緩衝：建議 ${formatHkTime(plan.departAt)} 出發，不遲於 ${formatHkTime(addMinutes(plan.departAt, profile.riskBufferMinutes))} 起程，預計 ${formatHkTime(addMinutes(plan.departAt, plan.durationMinutes))} 到達。`,
  );

  if (excludedRoutes.length > 0) {
    reasons.push(
      terminate(
        `有 ${excludedRoutes.length} 條路線未被納入：${excludedRoutes
          .map((route) => `${route.label}：${route.reason}`)
          .join("；")}`,
      ),
    );
  }

  reasons.push(
    `到達信心為「${CONFIDENCE_LABELS[confidence]}」（規則分數 ${confidenceScore}/100${penalties.length > 0 ? `；扣分：${penalties.join("、")}` : ""}）。`,
  );

  if (input.isStale) {
    reasons.push(
      `本次資料已於 ${formatHkStamp(snapshot.expiresAt)} 過期，因此不提供高信心的出發建議，請重新查詢後再決定。`,
    );
  }

  return reasons;
}
