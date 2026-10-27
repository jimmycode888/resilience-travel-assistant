# 決策引擎說明

> 負責人：成員 C（決策與 GenAI）。規則骨架由成員 A 建立，C 負責覆核、調參與補齊。
> 程式碼：`src/lib/decision/`（`thresholds.ts` 參數、`scoring.ts` 評分、`engine.ts` 流程）
> 契約：`API_CONTRACT.md §4`
> **本文件不含任何未經驗證的準時機率。**

---

## 1. 入口

```ts
decideTrip(request: TripRequest, snapshot: ContextSnapshot, options?: DecideTripOptions): DecisionResponse
```

```ts
interface DecideTripOptions {
  notices?: readonly string[];        // 適配層的回退訊息，原樣帶進回應
  routes?: readonly RouteDefinition[]; // 候選路線；預設為走廊內三條
  now?: string;                        // 注入時鐘（ISO）；判斷 live/cached 資料是否過期
}
```

**不變性質**（已由測試鎖定）

- 純函式：不讀取時鐘、不呼叫網路、不使用隨機值、沒有模組層可變狀態。
- 不修改傳入的 `request` 或 `snapshot`。
- 相同輸入永遠得到相同輸出。
- 大模型不參與這個函式。

---

## 2. 流程

```text
1. 驗證請求（arriveBy 解析、地點解析）
2. 判斷資料是否過期（僅 live / cached）
3. 逐條路線套用硬約束過濾 → 被排除者記錄原因
4. 計算時間預算（基準時間 + 延誤 → 有效時間 → 建議出發）
5. 對通過過濾的路線評分並排序
6. 沒有候選 → unavailable
7. 主路線 = 最高分
8. Plan B = 最高分的「不同運輸方式」路線
9. 計算到達信心（規則分數 → high / medium / low）
10. status = low 信心或沒有 Plan B → uncertain，其餘 → ready
11. 產生切換條件、理由與 notices
```

---

## 3. 時間計算

```text
基準時間 base      = Σ(行車時間 + 候車時間 + 步行時間)          ← corridor 定義
有效時間 effective = base + 該路線的延誤分鐘                     ← B 的 snapshot
最遲出發 latest    = arriveBy − effective
建議出發 departAt  = latest − 該情景的緩衝                      ← 本引擎的策略
最早到達           = departAt + base                            ← 無延誤情況
最遲到達           = departAt + effective + 該情景的浮動         ← 延誤疊加情況
```

### 情景參數（`SCENARIO_PROFILES`）

| 情景 | 緩衝 | 浮動 | 鐵路延誤切換門檻 | Plan B 候車切換門檻 |
|---|---|---|---|---|
| `live` | 8 分 | 15 分 | 10 分 | 15 分 |
| `normal` | 6 分 | 10 分 | 10 分 | 15 分 |
| `heavy_rain` | 14 分 | 20 分 | 15 分 | 20 分 |
| `disruption` | 16 分 | 35 分 | 10 分 | 15 分 |

> 緩衝／浮動是**策略參數**，不是統計推論。暴雨與中斷情景調高緩衝，
> 就是把「不確定性」轉換成具體的「提早幾分鐘出門」。

---

## 4. 硬約束過濾（先過濾，再評分）

符合任一項即排除該路線，並記錄可讀原因：

1. `status === "disrupted"` —— 服務中斷的路線**永遠不能**當主路線。
2. `transfers > constraints.maxTransfers`
3. `extraCostHkd > constraints.maxExtraCost`
4. 需要的出發時間早於首班服務時間（`05:30`，見 `corridor.serviceWindowStartMinutes`）

全部被排除 → `status: "unavailable"`，`reasons` 逐條列出原因並提供調整建議。

---

## 5. 評分

```text
分數 = 0.40 × 時間分     （候選中最快 1.0、最慢 0.0，線性內插）
     + 0.25 × 服務狀態分 （ok 1.0 / delayed 0.6 / unknown 0.5 / disrupted 0）
     + 0.15 × 轉乘分     （1 − transfers / maxTransfers）
     + 0.10 × 人流分     （low 1.0 / medium 0.6 / unknown 0.4 / high 0.25）
     + 0.10 × 費用分     （1 − extraCostHkd / maxExtraCost）
```

分數四捨五入到小數 3 位後再比較；同分時按路線 ID 排序（保證可重現）。

### 天氣風險在哪裡？

天氣**不另外計一個分數項**，避免重複計算。天氣透過兩條路徑影響結果：

1. **經由資料**：B 的 snapshot 把天氣影響轉成每條路線的 `delayMinutes` 與 `crowding`
   （暴雨時巴士 +15 分、港鐵露天段 +4 分）。
2. **經由策略**：情景參數把緩衝從 6 分提高到 14 分。

這樣「天氣 → 時間 → 決策」的因果鏈是可追溯的，而不是一個說不清的黑箱權重。

---

## 6. 主路線與 Plan B

- **主路線** = 分數最高者。
- **Plan B** = 分數最高的**不同主要運輸方式**路線（`rail` ↔ `road`）。
  選不同方式而不是次高分路線，是為了讓 Plan B 能對抗與主路線**不同的失效模式**：
  鐵路主路線的 Plan B 應該是巴士，反之亦然。
- 沒有其他方式可選時才退回次高分路線。
- 只有一條可行路線 → `planB = []`、`switchCondition = ""`，且 `status` 至少為 `uncertain`。

---

## 7. 到達信心

起始分依主路線狀態（`ok` 90 / `delayed` 60 / `unknown` 45），再扣分：

| 扣分項 | 分數 |
|---|---|
| 延誤（每分鐘 −1，上限 −25） | −1/分 |
| 人流 `high` | −15 |
| 人流 `unknown` | −10 |
| 轉乘次數 ≥ 2 | −10 |
| 緩衝 < 5 分鐘 | −15 |
| 資料品質非 `live`（fixture 或 cached） | −5 |
| 本走廊存在任何中斷路線 | −10 |

`≥ 70` → `high`；`45–69` → `medium`；`< 45` → `low`。

### 資料過期

當 `now > snapshot.expiresAt` 且資料品質為 `live` / `cached` 時：

- 到達信心**強制降為 `low`** → `status` 變成 `uncertain`；
- 顯示的規則分數一併壓到 45 以下，避免出現「信心低但分數 85/100」的矛盾敘述；
- 增加一條理由說明資料已於何時過期。

`fixture` 不套用此規則：它是刻意標示的演示樣本，畫面上的「演示固定資料 + 固定時間」
已經誠實說明，若套用實時效期會讓演示日過後整個介面變成「資料過期」。

---

## 8. status 判定

| status | 條件 | 使用者動作 |
|---|---|---|
| `ready` | 有候選，信心非 `low`，且**有** Plan B | 依建議出發，記住切換條件 |
| `uncertain` | 有候選，但信心為 `low`，**或**沒有 Plan B | 可以出發，但要預留更多時間 |
| `unavailable` | 沒有路線能同時滿足服務狀態與限制條件 | 調整限制或改時間 |

---

## 9. 切換條件的產生規則

切換條件由資料組合而成，不是固定文案。三種模板：

**主路線為鐵路、Plan B 為路面**（`normal` / `heavy_rain`）
> 若出發前{主要鐵路線}延誤超過 {N} 分鐘，改行 Plan B：{Plan B 名稱}
> （需先步行 {W} 分鐘至{巴士站}；巴士較慢，必須在 {HH:mm} 前離開起點，逾時則維持主路線並改乘下一班）。
> 若到達{巴士站}後 {M} 分鐘內仍未能上車，時間已不可控，請改乘下一個可行班次。

**主路線為路面、Plan B 為鐵路**（`disruption`）
> 若於{主要巴士站}等候超過 {M} 分鐘仍未能上車，改乘 Plan B：{Plan B 名稱}
> （步行 {W} 分鐘至{車站}；最遲 {HH:mm} 前決定是否改乘，{HH:mm} 前離開起點）。

**同類運輸方式**
> 若{主路線}由「{目前狀態}」轉為服務中斷，改行 Plan B：{Plan B 名稱}（{HH:mm} 前離開起點）。

刻意包含「巴士較慢，必須在幾點前離開起點」這句話：Plan B 的出發時間通常**早於**主路線，
不說明清楚會讓使用者誤以為可以隨時切換。

文字裡的「最遲 {HH:mm} 前決定」與機器可讀欄位 `switchDeadline` **逐字一致**（有測試鎖定），
因此 UI、語音或自動提醒可以直接用 `switchDeadline` 排程，不需要解析中文。

---

## 10. 已知限制

1. 所有權重與門檻都是**演示設定，未經歷史資料校準**。因此只輸出定性信心，不輸出機率。
2. 「暫緩出發」只以 `action: "hold"`（無可行路線）與 `action: "wait"`（資料過期）表達，
   **沒有**考慮「等下一班更好」的最佳化：所有時間都是連續值，未對齊真實班表。
3. 沒有考慮路線擁擠的**動態**變化（同一情景內人流固定）。
4. 沒有處理「多段中斷」的組合最佳化；Plan B 只取次優路線。
5. 沒有成本／時間的個人化權衡（權重固定，不可由使用者調整）。
6. **沒有模型層**：C 的介面契約 v1 把決策分成「規則層」與「用歷史資料回測出延誤提前量的模型層」，
   本專案目前只交付規則層。在沒有真實歷史事件資料前，任何「提前量分布」都會是編造的，
   因此刻意不做（見 `DECISION_CONTRACT_CHANGE_REQUEST.md §3.3`）。
7. `action` 需要呼叫端注入「現在時間」（`options.now`）才能判斷 `depart_now`；未注入時一律回 `depart_at`。
   這是刻意的：決策層永遠不自己讀時鐘。
8. `UNKNOWN_ROUTE_RULES.extraMinutes = 5` 是**政策常數**，用來避免把「狀態未確認」當成「零延誤」；
   它不是從資料推導出來的延誤估計，日後有真實資料時應以實際分布校準或取代。
9. 惡劣天氣安全規則只看「警告字串 + 主要運輸方式」，沒有考慮個別路段的實際暴露程度
   （例如全程有蓋行人天橋的路面路線仍會被視為露天候車）。

### 未來如何校準

1. 累積同一走廊的實際出發／到達記錄（至少數週，涵蓋平日與雨天）。
2. 以實際到達分佈檢定 `riskBufferMinutes` 與 `varianceMinutes` 是否合理。
3. 把 `confidence` 的三檔門檻對應到實際準時率區間後，才考慮輸出百分比。
4. 校準前，介面與文件一律不得聲稱準確的準時機率。

---

## 11. GenAI 解釋層（C 的待辦）

設計約束：

- 只讀 `DecisionResponse`，**不得**修改 `departAt`、`etaRange`、`primaryRoute`、`planB`、
  `switchCondition`、`switchDeadline`、`confidence`、`status`、`action`。
- 只能改寫 `reasons` 的文字。
- 解釋裡出現的**任何事實**都必須能在 `basis` 找到對應條目；`basis` 沒有的，不准寫進解釋。
- 沒有 API Key、逾時或回應格式錯誤時，**必須**直接沿用規則產生的 `reasons`。
- 不得把金鑰送到前端；不得使用 `NEXT_PUBLIC_` 前綴。
- 必須有測試：無 Key 時仍能得到完整、可讀的 `reasons`。

> 目前程式碼中**沒有**任何 LLM 呼叫。這是刻意的：先讓規則版本穩定並通過凍結驗收，
> GenAI 只作為解釋層的加分項。

---

## 12. 行動建議層（`action` / `switchDeadline` / `basis` / `uncertainty`）

> 程式碼：`src/lib/decision/advisory.ts`（純函式、不讀時鐘、不呼叫網路）
> 來源：成員 C 的介面契約 v1（WorkBuddy），接入記錄見 `DECISION_CONTRACT_CHANGE_REQUEST.md`
> 性質：**全部是 additive 欄位**，不改名、不改型別任何鎖定欄位；它們只描述規則層已算出的事實。

### 12.1 `action`：把 `status` 翻譯成一步可執行的動作

| 值 | 條件 | 使用者應該做什麼 |
|---|---|---|
| `hold` | `status === "unavailable"` | 不要出發；留在安全處，調整限制或改時間後再查 |
| `wait` | 資料已過期（`live` / `cached` 且 `now > expiresAt`） | 先核實官方資訊，再按 `departAt` 出發 |
| `depart_now` | 注入的現在時間 ≥ `departAt` | 立即出發（出發窗口正在關閉） |
| `depart_at` | 其餘 | 按 `departAt` 出發（最常見） |

**`action` 永遠不推翻 `status`。** `wait` 對應的仍然是 `uncertain`（可以出發，但要先核實），
不是 `unavailable`；舊前端即使完全忽略 `action`，行為也與接入前一致。

### 12.2 `switchDeadline`：切換條件的機器可讀版本

```text
沒有 Plan B                                  → ""
主路線為路面、Plan B 為鐵路（中斷情景）       → 主路線 departAt + Plan B 候車切換門檻
其餘（鐵路主線／同類轉乘）                    → Plan B 的 departAt
```

`switchCondition` 的文字與這個欄位逐字一致（例如「最遲 07:37 前決定是否改乘…」），
因此前端或提醒功能可以直接排程，不必解析中文。

### 12.3 `basis`：每個數字帶出處

每筆為 `{ claim, type, source, sourceUrl }`：

- `type: "rule"` —— 專案規則（緩衝、排除條件、信心扣分、未校準聲明）。
- `type: "data"` —— 本次資料快照（資料來源、路線狀態、人流）。
- `type: "statistics"` —— **目前不會出現**：沒有歷史校準，就沒有統計依據可以引用。

規則條目優先於資料條目，上限 8 筆（`ADVISORY_RULES.maxBasisEntries`）。
這份清單同時是 GenAI 解釋層的**唯一事實來源**：`basis` 沒有的，解釋不准寫。

### 12.4 `uncertainty`：明確列出「我們不知道什麼」

由資料品質、路線狀態、Plan B 有無、被排除路線、中斷事件、信心與是否已過最遲起程時間組合而成，
最後固定補上一句「不構成出行保證」。`unavailable` 情景也有內容（說明為何不給建議），
所以任何狀態下都不會出現空清單。

### 12.5 不變條件（已由 `src/test/decision-advisory.test.ts` 鎖定）

1. 三個情景的 `departAt`、`etaRange`、主路線、Plan B、信心**與接入前完全相同**。
2. `switchDeadline` 的 `HH:mm` 必定出現在 `switchCondition` 文字中。
3. 相同輸入 → `action`、`basis`、`uncertainty` 逐位元組相同。
4. `unavailable` ⇒ `action === "hold"` 且 `switchDeadline === ""`。
5. 沒有歷史校準 ⇒ 不得出現 `type: "statistics"` 的依據。

### 12.6 資料不足與惡劣天氣的安全規則

> 程式碼：`UNKNOWN_ROUTE_RULES`、`SEVERE_WEATHER_RULES`（`thresholds.ts`）；
> `detectSevereWeather`、`applyActionSafety`（`advisory.ts`）
> 測試：`src/test/decision-live-safety.test.ts`
> 起因：成員 B 的交接文件第 3 條 ——「unknown 路線的 `delayMinutes=0` 僅為數值契約佔位，
> 請核對引擎不會據此解釋為零延誤，及黑雨下的安全規則」。

**① 服務狀態未確認 ≠ 零延誤。**

契約 §5 規定缺少的路線要當 `unknown`（不得當成「服務正常」）。但只降信心並不足夠：
若行程時間仍按 0 延誤計算，引擎就會一邊寫「已按保守假設計算」，一邊排出一個正常班次的出發時間。

```text
有效時間 effective = base + 資料延誤(unknown 視為 0) + 5 分鐘保守預留
plan.delayMinutes  = 資料延誤 + 保守預留        // 保持 duration = base + delay 的不變條件
信心扣分用的延誤   = 資料延誤（不含保守預留）   // 政策不被當成「觀測到的延誤」
```

保守預留會同時出現在 `reasons`、`primaryPlan.riskNotes`、`uncertainty` 與 `basis`，
四處措辭一致。**三個演示 fixture 沒有任何 `unknown` 路線，所以黃金輸出完全不變**；
這條規則主要作用在成員 B 的實時路徑（只有天氣是 live、交通為 unknown）。

**② 惡劣天氣安全規則。**

```text
detectSevereWeather(weather):  condition === "storm"
                            或 warning 含「黑色暴雨」「八號／九號／十號」「暴風」「烈風」
applyActionSafety:  以上警告生效 且 主路線主要運輸方式為路面（露天候車）→ action = "wait"
```

- 它**只覆寫 `action`**，不改變 `departAt`、`etaRange`、路線或信心（有不變條件測試）。
- 為什麼不用 `hold`：`hold` 的語意是「沒有可行路線、不提供出發時間」。硬把它用在
  「叫使用者不要出門」會讓真正需要通勤的人無所適從，也會破壞 `hold ⇔ unavailable` 這個不變條件。
  「如非必要，請留在安全處」的措辭放在 `uncertainty` 裡表達。
- 主路線是港鐵時不觸發：鐵路行程以室內候車為主（`heavy_rain` fixture 就是黑雨 + 港鐵主線，
  行動建議維持 `depart_at`）。
