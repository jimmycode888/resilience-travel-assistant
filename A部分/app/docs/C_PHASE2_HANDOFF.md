# C 第二階段交付交接（決策 / 智能）· 2026-10-12

**負責**：成員 C（決策引擎與 GenAI）　**基線**：`/workspace/八校黑客松/A部分/app`
**一句話**：C1–C5 五個模組與**正式決策入口 `decide`** 已落地並接進 `POST /api/team-journey`，
`decision` 不再是 `null`；同時把第一階段尚未合併的 `explain.ts` / `disruption.ts` 補進本基線。

凍結後範圍說明：本輪**只新增模組與接線，不動 A 的共享型別、B 的適配層、D 的元件**；
所有新增都是 additive，黃金輸出（三情景 `08:09 / 07:58 / 07:22`）與既有 457 項測試全部未變。

---

## 1. 交付內容

| 模組 | 位置 | 契約 / 輸出 |
|---|---|---|
| C1 擁擠風險 | `src/lib/crowd/{index,thresholds}.ts` | `assessCrowd(input) → CrowdRiskResult`（level + confidence + factors + A 的 `CrowdSignal`） |
| C2 通關風險 | `src/lib/border/{index,thresholds}.ts` | `assessBorder(input) → BorderRiskResult`（排隊**區間** + 開放時間校驗 + A 的 `BorderSignal`） |
| C3 最佳出發窗口 | `src/lib/departure/index.ts` | `searchDepartureWindow(opts) → DepartureWindow \| null`（風險序列 + 窗口 + 理由） |
| C4 Plan B（含跨境換口岸） | `src/lib/plan/index.ts` | `selectBackup(primary, others) → PlanSelection \| null`（獨立性硬校驗 + 切換條件） |
| C5 AI 解釋 / 自然語言 | `src/lib/ai/index.ts` | `parseTravelRequest(text)`、`explainRoute(...)`、`explainTeamDecision(...)`（模板 + 白名單 + 可注入模型） |
| 正式決策入口 | `src/lib/decision/team-decide.ts` | `decideTeamJourney(core) → TeamDecisionResult`（= `TeamJourneyModules.decide`） |
| 第一階段補件 | `src/lib/decision/{explain,disruption}.ts` + `engine.ts` 接線 | GenAI 解釋層（白名單 + 模板回退）、中斷區段重疊排除（P0） |

接線點（A 的檔案，**最小修改**）：`src/lib/api/team-journey-handler.ts` 的 `teamModules` 新增
`decide: async (core) => decideTeamJourney(core)`，並把「C 未交付」的註記更新為「C 已接入、B 待注入」。

---

## 2. `decide` 的行為（有測試鎖定的不變條件）

| 不變條件 | 測試 |
|---|---|
| `action === "unavailable"` ⇔ 沒有可行主路 | `c-team-decide.test.ts` |
| `primaryRouteId` / `backupRouteIds` **只引用** `eligible && exclusions.length === 0` 的路線；即使 A 的推薦指向被排除路線也不升用 | `c-team-decide.test.ts`、`team-journey-api.test.ts` |
| 只有 `action === "go"` 才提供 `departureWindow`；`hold` / `unavailable` 一律 `null` | `c-team-decide.test.ts` |
| `hold` 觸發：天氣因子 ≥ 70 **且** 主路以路面為主（室內候車的鐵路主線不觸發），或主路趕不上到達期限 | `c-team-decide.test.ts` |
| Plan B 必須與主路真正獨立（不同口岸、不共用主要長途線路），否則回傳 `null` | `c-plan.test.ts` |
| 同輸入同輸出（含決定性） | `c-team-decide.test.ts`、`team-journey-api.test.ts` |

決策樣本（`POST /api/team-journey`，中環交易廣場 → 福田，08:00 出發，11:00 前到達）：

```json
{
  "action": "go",
  "primaryRouteId": "xb-1-lok-ma-chau",
  "backupRouteIds": ["xb-3-shenzhen-bay"],
  "departureWindow": { "start": "2026-10-13T08:00:00+08:00", "end": "2026-10-13T09:00:00+08:00", "confidence": "low", "evidence": "風險序列（10 分鐘粒度…）" },
  "explanations": [ { "routeId": "xb-1-lok-ma-chau", "text": "…", "evidence": ["主路線 …", "到達信心為「低」…", "口岸排隊約 12–28 分鐘（估算）", "口岸 lok-ma-chau 預計排隊 12–28 分鐘（信心「低」，估算）"] } ]
}
```

---

## 3. 產品原則（延續第一階段的硬約束）

1. **只輸出定性等級 + 區間 + 信心**：C1 不報人數、C2 不報單點排隊、C3 不報準時機率；
   三者的文案都內建「未經歷史校準」聲明。
2. **每個數字可溯源**：C5 的解釋只引用 `evidence`（路線標籤、信心、ETA、風險因子、口岸排隊）；
   任何時刻 / 路線編號若不在事實中，`validateExplanation` 直接拒絕並整段退回模板。
3. **AI 不決定路線**：`parseTravelRequest` 只產生 `{destinationId, arriveBy, crowdPreference, deadlinePriority}`；
   解釋層只回傳字串，`decideTeamJourney` 的決策欄位與模型無關。
4. **可降級**：無 API Key／模型逾時／拋錯／輸出未過白名單 → 一律模板，功能不失效。
5. **口岸開放時間校驗**：已關閉口岸 `signal = null`，`decide` 不會把它算進方案（沿用 `geo/ports` 的參考時間表）。

---

## 4. 驗證（2026-10-12 本機）

```bash
cd /workspace/八校黑客松/A部分/app
npm run lint        # 退出 0
npx tsc --noEmit    # 退出 0
npx vitest run      # 37 個檔案 / 498 項全過（本輪新增 6 個檔案 / 41 項）
npm run smoke       # 三情景各 5 次：08:09 / 07:58 / 07:22，未變
npm run build       # 見下方環境註記
```

- 第一階段補件測試：`decision-explain`(14) / `decision-disruption-scope`(11) / `decision-properties`(61) / `c-ab-integration`(9) 全過。
- **環境註記**：本工作區的 `.next/` 快取含**其他帳號**（另一 Agent session）產生的 `route-cache/`，
  導致 `npm run build` 在清理階段 `EACCES`。以乾淨輸出目錄（`NEXT_DIST_DIR` 臨時覆寫 `distDir`）
  建置**成功**（10 個路由：`/`、`/journey`、`/journey-team`、`/API/*`、`/result`）。
  這是跨帳號快取污染，非程式碼問題；擁有該快取的 session 重建後即恢復。

---

## 5. 仍需他人配合

| 項目 | 歸屬 | 說明 |
|---|---|---|
| B 注入實時資料（`resolveRouteData`） | B | 現為 `null`，風險與排隊為保守估算；C1/C2 的 `CrowdSignal` / `BorderSignal` 可直接餵入 A 的風險引擎 |
| 把 C1/C2 型別收進 `src/lib/types/` | A | C 依分工只在自己的目錄定義；若要成為共享契約需 A 收編（C 未改 `types/**`） |
| 契約登記 `TeamDecisionResult` 的 `explain/backup` 語義 | A | `departureWindow` 的 10 分鐘粒度與 `backupRouteIds` 獨立性建議寫進 `API_CONTRACT.md` |
| 前端正式模式消費新的 `decision` | D | 由 mock 切到正式回應後，第一屏顯示 `action` / 出發窗口 / 備選 / 解釋 |
| 走廊與口岸事實核實 | B | 座標與開放時間仍為演示假設 |
| 模型層校準（用歷史事件替換固定規則） | C（賽後） | 校準前不得輸出準時機率 |

---

## 6. 本輪新增 / 修改檔案

**新增**
`src/lib/crowd/index.ts`、`src/lib/crowd/thresholds.ts`、`src/lib/border/index.ts`、`src/lib/border/thresholds.ts`、
`src/lib/departure/index.ts`、`src/lib/plan/index.ts`、`src/lib/ai/index.ts`、`src/lib/decision/team-decide.ts`、
`src/lib/decision/explain.ts`、`src/lib/decision/disruption.ts`、
`src/test/{c-crowd,c-border,c-departure,c-plan,c-ai,c-team-decide,decision-explain,decision-disruption-scope,decision-properties,c-ab-integration}.test.ts`、
本文件。

**修改**
`src/lib/decision/engine.ts`（接入中斷區段重疊過濾）、`src/lib/decision/index.ts`（導出）、
`src/lib/api/team-journey-handler.ts`（注入 `decide` + 更新註記）、`src/test/team-journey-api.test.ts`（改寫「C 未接入」用例）。

---

## 7. 2026-10-12 追加：進度匯報 C 缺口收口

依《第二階段進度匯報》（`progress-2026-10-12/index.html`）C 段的缺口欄與 §6 下一步第 2 條，逐項處理如下（詳見 [`C_PHASE2_GAP_CLOSURE.md`](./C_PHASE2_GAP_CLOSURE.md)）：

- **已收口（程式碼 + 測試）**
  1. 排隊估算改為**完全委派 B 的 `estimateBorderQueue()`**，刪除 C 自帶的 `BORDER_QUEUE_BASE`／加成常數（單一權威來源）。
  2. `hold` 的惡劣天氣門檻改取 **A 的 `RISK_LEVEL_CUTOFFS.high`**（不再硬編 70），口徑與 A 的嚴重天氣暫緩一致。
  3. D2-05：`pickPrimary()` 不再採用「趕不上到達期限」的推薦候選，改選其他可行候選並在 `notices` 說明（C 側）。
- **已提供文本，待 A 登記／收編**：`TeamDecisionResult` 的 `action` / `primaryRouteId` / `backupRouteIds` / `departureWindow` 語義；C1/C2 結果型別（見收口文件 §2、§3）。
- **C 側就緒、待 B/A**：D2-03 的中斷區段重疊過濾已實作（`decision/disruption.ts`），等結構化中斷範圍或演示事件收窄。
- **如實保留**：模型層校準（P3）—— 無歷史資料前不輸出準時機率，校準路徑見收口文件 §4。

**驗證更新**：`npm run lint` 0 error、`npx tsc --noEmit` 退出 0、`npx vitest run` **39 檔案 / 545 項全過**；
原地 `npm run build` 仍受跨帳號 `.next` 快取 EACCES 阻塞（環境問題），改以乾淨輸出目錄建置成功（10 條路由）。
正式端點樣張與第一階段黃金三情景輸出**均未改變**。
