# 契約變更申請：接入 C 的「接口契約 v1」（WorkBuddy）

> **申請人：成員 C（決策引擎與 GenAI）　覆核人：成員 A（契約所有者）　日期：2026-10-06**
> 依據：`INTEGRATION.md §2`「若接口欄位不足，寫入 `docs/DECISION_CONTRACT_CHANGE_REQUEST.md`，請 A 審核」，
> 以及 `API_CONTRACT.md §6` 契約變更流程。
>
> **狀態：程式碼已接入（全部為 additive，未更名或改型別任何鎖定欄位），等待 A 在 `API_CONTRACT.md` 正式登錄。**

---

## 0. 一句話

成員 C 用 WorkBuddy AI 產出的 `接口契约_v1.md`（存檔於 [`docs/contracts/C_接口契约_v1_workbuddy.md`](./contracts/C_接口契约_v1_workbuddy.md)）
提出了三個主體契約目前沒有的能力：**可執行的行動建議（`action`）**、**切換截止時刻（`latest_switch_at`）**、
**可追溯依據（`basis`）與明示不確定（`uncertainty`）**。
本申請把它們以 **additive 欄位**接入決策層，**沒有動到任何鎖定欄位**，並附上測試與黃金檔案更新。

---

## 1. 兩份契約的關係（先講清楚差異）

| 項目 | C 的契約 v1（WorkBuddy 草稿） | 主體契約（已凍結） | 結論 |
|---|---|---|---|
| 走廊 | `CORRIDOR_TM_KLW`（屯門 → 九龍西，**結構佔位**） | `tko-hang-hau-to-central`（坑口 → 中環） | **以主體為準**，C 的走廊不採用 |
| 命名 | snake_case（`arrive_by`、`route_id`） | camelCase（`arriveBy`、`routeId`） | **以主體為準** |
| 輸入契約 | `weather.signal_level` / `pre_announce_at` | `weather.warning`（字串）/ `updatedAt` | 見 §4 待決事項 2 |
| 路線狀態 | `normal / reduced / suspended / unknown` | `ok / delayed / disrupted / unknown` | 對映即可（見 §3.4） |
| 輸出契約 | `verdict.action` / `basis` / `uncertainty` / `switch_condition.latest_switch_at` | 無對應欄位 | **本次接入** |
| GenAI | `explanation` 只可引用 `basis` | `reasons` 由規則產生 | 未實作，但 `basis` 已為它鋪好地基 |

> C 的草稿是在沒有主體 repo 的環境下寫的，因此**走廊與命名是佔位**，真正有價值的是
> **欄位結構與三條設計原則**（缺失優於猜測／每個數字帶出處／模型不產生事實）。

---

## 2. 已接入的四個 additive 欄位

以下欄位已加進 `src/lib/types/decision.ts` 的 `DecisionResponse`，
並由 `src/lib/decision/advisory.ts` 產生（成員 C 的模組，純函式、不讀時鐘、不呼叫網路）：

| 欄位 | 型別 | 說明 | 對應 C 契約 v1 |
|---|---|---|---|
| `action` | `"depart_now" \| "depart_at" \| "wait" \| "hold"` | 把 `status` 翻譯成一步可執行的動作 | `verdict.action` |
| `switchDeadline` | `string`（ISO +08:00，無 Plan B 時為 `""`） | 仍能改乘 Plan B 的最遲時刻；`switchCondition` 文字中的「HH:mm 前」已與它**逐字一致** | `switch_condition.latest_switch_at` |
| `basis` | `DecisionBasis[]`（`claim` / `type` / `source` / `sourceUrl`） | 每個數字與結論的出處 | `basis[]` |
| `uncertainty` | `string[]` | 明確列出「我們不知道什麼」 | `uncertainty[]` |

### 2.1 `action` 的判定順序（互斥，完全確定性）

```text
1. status === "unavailable"                    → hold
2. 資料已過期（僅 live / cached，now > expiresAt）→ wait
3. 注入的 now ≥ departAt                        → depart_now
4. 其餘                                          → depart_at
```

**`action` 永遠不推翻 `status`。** `wait` 對應的仍然是 `uncertain`（可以出發，但要先核實官方資訊），
不是 `unavailable`；`hold` 只對應 `unavailable`。前端若只用 `status` 渲染，行為完全不變。

> 這一條是本申請**最需要 A 確認**的語意（見 §4 待決事項 3）。

### 2.2 `switchDeadline` 的計算

```text
沒有 Plan B                                   → ""
主路線為路面、Plan B 為鐵路（中斷情景）        → 主路線 departAt + Plan B 候車門檻
其餘（鐵路主線／同類轉乘）                     → Plan B 的 departAt（必須在此之前離開起點）
```

同時 `buildSwitchCondition()` 的「路面 → 鐵路」模板已補上「最遲 HH:mm 前決定是否改乘」，
讓**文字與機器可讀欄位互相對得上**（有測試鎖定）。

### 2.3 回應成員 B 交接文件的兩處口徑修正（2026-10-06 追加）

B 的交接文件（`docs/B_HANDOFF.md`）第 3 條問：`unknown` 路線的 `delayMinutes=0` 是否會被
解釋成零延誤，以及黑雨下有沒有 `hold/wait` 安全規則。核對後確認**是真問題**，已修：

| 改動 | 內容 | 是否改變使用者看到的建議 |
|---|---|---|
| `UNKNOWN_ROUTE_RULES.extraMinutes = 5` | 服務狀態未確認時，在資料延誤之上額外預留 5 分鐘；同時修正「已按保守假設計算」文案與數字不一致的問題 | **不影響三個演示情景**（fixture 沒有 `unknown` 路線，黃金檔案未變）；**會改變實時路徑**（B 只有天氣 live、交通 unknown 時，出發時間提早 5 分鐘） |
| `SEVERE_WEATHER_RULES` + `applyActionSafety` | 黑雨／八號以上信號生效、且建議路線需露天候車（主路線為路面）→ `action` 降為 `wait` | 只覆寫 `action`，不改任何時間數字；三個演示情景都未觸發 |

> 這兩條是**規則層的政策**（不是統計估算），已在 `basis` 與 `uncertainty` 明示，
> 並寫進 `DECISION_ENGINE.md §12.6` 與 `§10` 已知限制第 8、9 條。
> 直譯 B 的措辭：**「交通 unknown」不再被偽裝成「零延誤」**。

**另外回應 B 第 2 條（混合資料品質）**：C 認為可以接受，理由是引擎只用頂層 `quality`
做兩件事（判斷過期、扣 5 分信心），交通事實完全由**逐條路線的 `status`** 承載。
建議 A 明確要求：混合時必須由 `notices` 說明哪一部分是 live、哪一部分是 fixture。

---

## 3. 逐欄位對照（C 契約 v1 → 主體契約）

### 3.1 輸入（B → C）

| C 契約 v1 | 主體契約 | 處理 |
|---|---|---|
| `corridor_id` | `CORRIDOR.id` | 以主體為準 |
| `snapshot_at` | `ContextSnapshot.collectedAt` | 已等價 |
| `weather.signal_level` / `signal_name` | `weather.warning`（字串） | 待決事項 2 |
| `weather.issued_at` | `weather.updatedAt` | 已等價 |
| `weather.pre_announce_at` | ❌ 無 | 待決事項 2（颱風預告是回測關鍵欄位） |
| `routes[].status` | `RouteStatus` | 對映：`normal→ok`、`reduced→delayed`、`suspended→disrupted` |
| `routes[].headway_min` | `RouteDefinition.typicalWaitMinutes`（走廊靜態估算） | 屬 B 的範圍，本次不動 |
| `routes[].eta_confidence` | 整體 `confidence` | 主體只輸出整體信心（範圍較小，較誠實） |
| `routes[].incidents[]` | `snapshot.incidents` + `affectedSegments` | 已覆蓋 |
| `data_freshness_sec` | `now − collectedAt`（可推導） | 不新增欄位 |
| `degraded` / `degraded_reason` | `quality !== "live"` + `notices` | 已等價 |

### 3.2 輸出（C → D）

| C 契約 v1 | 主體契約 | 處理 |
|---|---|---|
| `verdict.action` | ❌ → **`action`** | **已接入** |
| `verdict.depart_at` | `departAt` | 已等價 |
| `verdict.arrival_estimate` | `etaRange`（區間） | 主體給區間，比單點更誠實 |
| `verdict.buffer_min` | `riskBufferMinutes` | 未輸出成欄位，但已寫進 `reasons` 與 `basis` 文字 |
| `verdict.confidence` | `confidence` | 已等價（皆為 high/medium/low，無百分比） |
| `alternatives[].role` / `worth_it` / `reason` | `planB` / `planBPlan` / `switchCondition` | 已覆蓋 |
| `switch_condition.trigger` | `switchCondition` | 已覆蓋 |
| `switch_condition.latest_switch_at` | ❌ → **`switchDeadline`** | **已接入** |
| `basis[]` | ❌ → **`basis`** | **已接入** |
| `uncertainty[]` | `notices`（原本混在一起） | **已接入**，獨立成正向欄位 |
| `explanation`（GenAI） | `reasons`（規則文案） | 維持規則版；GenAI 仍是 C 的加分項 |
| `disclaimer` | `disclaimer` | 已等價 |

### 3.3 C 契約 v1 的第 3 條契約（規則層 vs 模型層）

| 層 | C 契約 v1 | 主體現況 |
|---|---|---|
| **規則層** | 確定性規則、精確時刻 | ✅ 已實作（`thresholds.ts` / `scoring.ts` / `engine.ts`） |
| **模型層** | 由歷史回測學「非規則性提前量」的分布 | ⛔ **刻意不做**：目前沒有歷史資料，任何「提前量分布」都會是編造的 |

> 把兩層分開是對的。主體現在**只交付規則層**，並在 `basis` 與 `uncertainty` 中明示
> 「未經歷史資料校準」；模型層待有資料後再做（寫在 `DECISION_ENGINE.md §10`）。

### 3.4 路線狀態對映（供 B 接入實時資料時使用）

```ts
normal    → ok
reduced   → delayed
suspended → disrupted
unknown   → unknown          // 不確定時填 unknown，不要猜 normal
```

---

## 4. 需要 A 決定的八件事

| # | 問題 | 建議 | 影響 |
|---|---|---|---|
| 1 | 是否把 §2 的四個欄位正式寫入 `API_CONTRACT.md §2` 的「附加欄位（additive）」表？ | **建議寫入**（維持文件與實作一致，避免格式漂移） | 文件；D 可選擇是否顯示 |
| 2 | 是否讓 B 在 `ContextSnapshot.weather` 加入 `signalLevel: number` 與 `preAnnounceAt: string`？ | 建議加入，但**先不要改型別**，等 B 真的有官方來源再一起改 | B 的模組 + fixtures |
| 3 | `action.wait` 的語意（資料過期 → 先核實再出發）是否接受？ | 建議接受；`status` 仍是權威，`wait` 只是建議 | 決策語意、文件 |
| 4 | 前端（D/E）是否顯示 `action` 與 `switchDeadline`？ | 建議第一屏顯示 `action` 一顆主按鈕、`switchDeadline` 併入切換條件 | UI，屬 D/E |
| 5 | 走廊以主體為準（C 草稿的屯門 → 九龍西是佔位） | 建議確認 | 全組 |
| 6 | 是否接受 `unknown` 路線的 **5 分鐘政策預留**（會讓實時路徑的建議出發時間提早 5 分鐘）？ | 建議接受；否則「狀態未確認」會被當成「零延誤」 | 決策語意、B 的實時路徑 |
| 7 | 惡劣天氣安全規則只在主路線為**路面**時觸發，是否足夠？（沒有考慮個別路段的實際遮蔽） | 建議接受為首版規則，已知限制已寫入 §10 | 決策語意、E 的文案 |
| 8 | 是否讓 B 在 `RouteServiceStatus` 加入可選的 `affectedLineSegments`（結構化中斷範圍）？ | 建議加入；C 的引擎已就緒（`src/lib/decision/disruption.ts`），**未提供時行為不變** | B 的模組 + fixtures；解 B 的 P0（R1/R3 共享區段） |
 
**若 A 不同意第 1 項**：實作可以保留（additive、不影響舊前端），但 `API_CONTRACT.md` 不會登錄，
`basis` / `action` 就只是「決策層的內部除錯欄位」；請告知，C 會把它們從契約文件移除。

### 4.1 第 8 項的欄位形狀（建議）

```ts
// ContextSnapshot.routes[] 上新增可選欄位
affectedLineSegments?: Array<
  | { kind: "line"; line: string; from: string; to: string }                  // 某線某段列車服務停運
  | { kind: "station"; station: string; impact: "interchange" | "service" }  // 只有該站受影響
>;
```

- `kind: "line"`：引擎以官方站序判斷「候選路線在同一線上的區段是否被完全覆蓋」。
  例：R1 坑口→北角停運 → R3 的坑口→鰂魚涌同樣不可用。
- `kind: "station"` + `impact: "interchange"`：列車仍行駛、只有轉乘受阻。
  例：北角站轉乘通道受阻 → R1 不可用，R3（鰂魚涌轉乘）仍可作 Plan B。
- 欄位缺失或格式不符時，`readDisruptionScopes()` 回傳 `[]`，**完全不作用**（保守且不破壞既有輸出）。

---

## 5. 驗收（已執行）

```bash
npm run lint       # 綠
npx tsc --noEmit   # 綠
npm test           # 154 passed（13 個檔案；原 114 + C 新增 33 + B 新增 7）
npm run smoke      # 三個情景各 5 次，15/15 成功且結果一致
npm run build      # 綠
```

> 2026-10-07 更新：全項目已達 **19 個檔案 / 267 項測試**（B/D 後續加入測試；C 本輪新增解釋層、
> 中斷區段重疊能力與屬性/整合測試）。本文 §4 的待決事項現為 **8 項**，尚未收到 A 的正式回覆；
> 最新核對與開發進度見 [`C_INTEGRATION_RECONCILIATION.md`](./C_INTEGRATION_RECONCILIATION.md)
> 與 [`C_DEV_PLAN.md`](./C_DEV_PLAN.md)。

- 新增回歸測試：`src/test/decision-advisory.test.ts`（23 個案例）、
  `src/test/decision-live-safety.test.ts`（10 個案例，回應 B 第 3 條）。
- 黃金檔案已更新（`npm run fixtures:update`）：三個情景的 `departAt`、`etaRange`、路線與信心**全部未變**，
  只有新增欄位被寫入。
- 確定性：`action` / `basis` / `uncertainty` 在相同輸入下逐位元組相同。

### 相容性保證

1. 只新增欄位，`DecisionResponse` 的所有鎖定欄位（`status`、`departAt`、`etaRange`、`confidence`、
   `primaryRoute`、`planB`、`switchCondition`、`reasons`、`dataUpdatedAt`、`dataQuality`）未改名、未改型別。
2. `isDecisionResponse()` 只驗證鎖定欄位，舊前端不受影響。
3. `switchCondition` 的文字在「路面 → 鐵路」模板新增了「最遲 HH:mm 前決定是否改乘」一句
   —— 這是**使用者可見的改變**，已用 `npm run fixtures:update` 明確登記。
