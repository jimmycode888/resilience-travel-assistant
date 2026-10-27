# 風險引擎說明（五因子）

> 負責人：成員 A（Risk / Reliability / Route Ranking）
> 程式碼：`src/lib/risk/**`（權重與門檻 `thresholds.ts`、聚合與因子規則）、`src/lib/reliability/**`（可靠性與路線排序）
> 契約：[PHASE2_CONTRACTS.md](./PHASE2_CONTRACTS.md)（`src/lib/types/risk.ts`、`src/lib/types/reliability.ts`）
> **本文件不含任何未經校準的機率數字。** 風險只輸出定性等級，可靠性只輸出定性信心。

---

## 1 定位：出行決策增強層，不是導航軟體

普通地圖回答「怎麼走最快？」。本專案回答的是「**幾點走更合適、哪條更穩、哪裡擠、哪裡險、出問題怎麼辦**」。

風險引擎是這條鏈上的核心，但它**不是**一個預測模型：

- 它輸出的是**定性風險等級**（`low` / `medium` / `high`），不是「發生機率」。
- 它不聲稱知道精確人數或精確排隊分鐘數；排隊一律以**區間 + 置信度**呈現。
- 每個因子都附 `claim / evidence / source`，讓任何顯示給使用者的結論都能回指到規則或資料
  （延續第一階段 `basis` 機制）。

在完成歷史資料校準之前，任何層級都**不得**宣稱統計依據。這是產品倫理硬約束，不是實作細節。

---

## 2 五因子與權重表

風險模型把一條路線拆成五個因子，每個因子先各自評出 0–100 的分數，再依權重加權聚合。

| 因子 | 代號 | 境內權重 | 跨境權重 |
|---|---|---|---|
| 天氣 | `weather` | 0.25 | 0.15 |
| 人流 | `crowd` | 0.25 | 0.20 |
| 服務中斷 | `disruption` | 0.35 | 0.25 |
| 轉乘 | `transfer` | 0.15 | 0.10 |
| 通關 | `border` | 0 | 0.30 |

> 權重為 `src/lib/risk/thresholds.ts` 的實際值（`RISK_WEIGHTS_DOMESTIC` / `RISK_WEIGHTS_CROSS_BORDER`），
> 先定死、不調參。日後要用真實資料校準時，只改這一個檔案。

**歸一化規則**：`border` 權重為 0 時（境內行程），其餘四因子按比例歸一化，使總和回到 1，
`overall` 因此不會隨權重總和膨脹，跨路線才可比。同理，四種路線模式的因子倍率會改變權重總和，
聚合前一律先歸一化（`normalizeWeights`）。

境內權重（原始）為 `0.25 + 0.25 + 0.35 + 0.15 + 0 = 1.00`，本身已是總和 1，歸一化後不變。

---

## 3 逐因子規則

每個因子都遵循同一套降級原則：**資料缺失時不編造，而是以保守值降級並調低 `confidence`。**
下面各小節的「資料缺失保守值」即該原則的具體落點。

### 3.1 天氣（`weather`）

- **打分區間**：`clear` 低、`cloudy` 略升、`rain` 中、`heavy_rain` 高、`storm` 最高。
  同時把生效中的**警告字串**（例如「黑色暴雨警告信號」）納入考量——警告比天氣現象本身更能反映風險。
- **資料缺失保守值**：**45**（不假設天氣良好）。
- **來源**：成員 B 的 `ContextSnapshot.weather`（正規化為 `RiskWeather`）；缺失時為 `null`。

### 3.2 服務中斷（`disruption`）

- **打分區間**：由路段服務狀態與交通事件共同決定。`ok` 低；`delayed` 隨延誤分鐘上升；
  `disrupted` 或命中事件的走廊 → 高。延誤越大、受影響站點越接近本路線，分數越高。
- **資料缺失保守值**：**40**（「未確認」不等於「零延誤」，沿用第一階段 `UNKNOWN_ROUTE_RULES` 的精神）。
- **來源**：`ContextSnapshot.routes[]`（`RiskService`）與 `ContextSnapshot.incidents[]`（`RiskIncident`）。

### 3.3 轉乘（`transfer`）

- **打分區間**：由轉乘次數與轉乘段本身的風險決定。轉乘越多、越接近臨界時間，分數越高。
- **與中斷的關係**：轉乘會放大中斷的後果——一次延誤就可能連鎖錯過後續班次。因此 `reliable`
  模式對 `transfer` 與 `disruption` 都放大倍率（見 §5）。
- **來源**：`Journey.segments` 的段數與模式切換。

### 3.4 人流（`crowd`）

- **打分區間**：由 `CrowdSignal.level`（`low` / `medium` / `high` / `critical`）對映到 0–100。
- **資料缺失保守值**：**50**（以保守中值處理，並以 `low` 置信度標示）。
- **來源**：成員 C 的 `CrowdSignal`（消費端形狀，定義於 `risk.ts`）；C 的 `crowd/**` 尚未落地時為 `null`。
- **硬約束**：`CrowdSignal` **只帶等級 + 置信度 + 依據**，不得帶精確人數。

### 3.5 通關（`border`）

- **打分區間**：由口岸排隊區間與口岸狀態決定。排隊區間越長、越接近或超過可接受門檻，分數越高。
- **資料缺失保守值**：**60**（通關是跨境行程最不可控的一段，缺失時寧可高估）。
- **口岸開放時間校驗（重要）**：跨境行程在計分前必須以 `isPortOpen(port, iso)` 檢查口岸是否在
  當前時段開放。**未開放時 `border` 強制為 100**，該候選因此幾乎不可能被推薦——深夜不能把使用者
  送去已關閉的落馬洲。這條校驗同時是跨境 Plan B（換口岸）的前置條件。
- **來源與優先序**：優先使用成員 C 注入的 `BorderSignal`（消費端形狀），但**必須先比對口岸**——
  只有當訊號的 `portId` 與本行程通關段的口岸一致（或本行程口岸無法判定）時才採用；
  不一致時**忽略該注入訊號**並改用本行程自身的排隊資料，並在 `notices` 說明。
  這是為了避免把落馬洲的排隊時間套到「經羅湖」的候選上（C 的 Border Risk 是按口岸輸出的）。
  其次回退 `JourneySegment.border`（`BorderQueue`，解析器已從供應商資料帶上來的口岸排隊）。
- **硬約束**：排隊時間必須是**區間 + 置信度**，不得是單點精確值。

---

## 4 聚合與等級

### 4.1 加權總分

```text
overall = Σ(score_i × weight_i)      // 各因子分數乘以其歸一化權重後相加
```

`overall` 四捨五入為整數（0–100）。每個因子同時輸出 `contribution = score × weight`，
讓解釋層與 UI 能看出「哪一項推高了總分」（`topRiskFactors` 取貢獻最高的前 N 項）。

### 4.2 風險等級切分

| `overall` | 等級 | 標籤 |
|---|---|---|
| 0–39 | `low` | 低 |
| 40–69 | `medium` | 中 |
| 70–100 | `high` | 高 |

> 對應 `RISK_LEVEL_CUTOFFS = { low: 40, high: 70 }`。

### 4.3 breakdown 的置信度

`RiskBreakdown.confidence` 取**各因子置信度的最小值**，再依資料品質封頂：

- `minConfidence` 逐項取低，避免「一項很確定」掩蓋「另一項全靠估算」。
- `capConfidence`：品質為 `live` 時上限 `high`；**`fixture` / `cached` 一律不得為 `high`**（上限 `medium`）。
  演示資料看起來像即時資料，是最嚴重的一類產品錯誤。

### 4.4 溯源

每個 `RiskFactor` 帶 `claim / evidence / source / sourceUrl`；`source` 可能是資料來源名稱
（例如「香港天文台」）或規則條款（例如「RISK_ENGINE.md §3」）。`sourceUrl` 沒有可公開連結時為 `null`。

---

## 5 四模式路線排序

四種模式**只調權重，不換算法**。同一組候選路線、同一套風險分數，只改變「時間」與「風險」在
排序分裡的佔比，以及風險內部各因子的倍率。

| 模式 | 標籤 | `timeWeight` | `riskWeight` | 因子倍率（weather / crowd / disruption / transfer / border） |
|---|---|---|---|---|
| `fastest` | 最快 | 0.7 | 0.3 | 1 / 1 / 1 / 1 / 1 |
| `reliable` | 最穩 | 0.35 | 0.65 | 1.2 / 1 / 1.6 / 1.4 / 1.2 |
| `less_crowded` | 較不擠 | 0.35 | 0.65 | 1 / 2.2 / 1 / 1.1 / 1.1 |
| `balanced` | 均衡 | 0.5 | 0.5 | 1 / 1 / 1 / 1 / 1 |

> 數值取自 `ROUTE_MODE_PROFILES`（`src/lib/risk/thresholds.ts`）。

- **`fastest`**：時間為主，風險只佔少數。
- **`reliable`**：優先避開服務中斷與多重轉乘，寧可慢一點也要穩（`disruption`、`transfer` 倍率最高）。
- **`less_crowded`**：把人流風險權重放大，換取更舒適的乘車體驗。
- **`balanced`**：時間與風險各佔一半，為預設模式。

**排序分組成**：`rankScore = timeWeight × timeScore + riskWeight × (100 − riskScore)`。
其中 `timeScore` 為同組中最快者 100、最慢者 0 的線性內插；`riskScore` 越低越好。
模式倍率經 `applyWeights` 逐項相乘後**再次歸一化**，確保 `overall` 不隨倍率膨脹。

---

## 6 可靠性

可靠性評估把風險分數轉成使用者看得懂的三件事：定性準時信心、ETA 區間、可追溯依據。

### 6.1 規則分數（內部用）

```text
ruleScore = 100 − risk.score − 罰分
```

`ruleScore` 越高越可靠，**只用於同一組候選之間的排序**。

> ⚠️ **`ruleScore` 不得當成準時機率對使用者顯示。** 它是一個規則分數，不是統計推論。

### 6.2 定性準時信心

| `ruleScore` | `onTimeConfidence` |
|---|---|
| ≥ 70 | 高（`high`） |
| ≥ 45 | 中（`medium`） |
| 其餘 | 低（`low`） |

`ReliabilityResult` 必須同時輸出 `confidenceNote`（未校準聲明），與 `onTimeConfidence` 一起顯示。

### 6.3 ETA 區間

```text
etaRange = [arriveAt, arriveAt + 浮動]
```

浮動依 `onTimeConfidence` 取值：

| `onTimeConfidence` | 浮動 |
|---|---|
| 低（`low`） | 10 分鐘 |
| 中（`medium`） | 20 分鐘 |
| 高（`high`） | 35 分鐘 |

> 浮動是**策略參數**，不是統計推論；具體常數由可靠性模組（`src/lib/reliability/**`）定義，
> 對應 `onTimeConfidence` 的三檔。`etaRange` 的下界固定為 `arriveAt`，上界加上浮動。

### 6.4 產品倫理硬約束

> **不得輸出「準時機率 88%」這類數字。**

在完成歷史資料校準之前，對外一律使用 `onTimeConfidence`（高／中／低）＋ `confidenceNote` 說明。
這與第一階段「到達信心 高/中/低」的做法一致，也對應 DoD 第 9 條。

---

## 7 局限與校準計畫

1. **未經歷史校準**：所有權重、門檻、倍率、浮動都是演示設定，不是從資料推導出來的統計量。
2. **排隊為區間估算**：官方即時排隊資料不一定存在，因此口岸排隊一律以「歷史規律 + 時段模型」
   輸出**區間 + 置信度**，並在文案標明「估算」。
3. **人流為定性等級**：`CrowdSignal` 只到 `low / medium / high / critical`，不含精確人數。
4. **模式倍率是策略選擇**：`reliable` / `less_crowded` 的放大倍率表達的是產品偏好，不是統計結論。

**校準計畫（標為 P3）**：累積同一走廊的實際出發／到達記錄（涵蓋平日與雨天），以實際分布檢定
權重與浮動是否合理；把三檔信心對應到實際準時率區間後，才考慮輸出百分比。校準前，介面與文件
一律不得聲稱準確的準時機率或精確排隊時間。

---

## 8 驗收方式

```bash
npx vitest run src/test/risk-engine.test.ts        # 五因子聚合、等級切分、置信度封頂、口岸開放校驗
npx vitest run src/test/reliability-ranking.test.ts # 四模式排序差異、ETA 區間、定性信心、不得輸出機率
npm run verify                                      # lint + typecheck + test + build
npm run probe:risk                                  # 看四模式風險排序（離線，必成功）
```

**驗收要點**

- 境內候選使用四因子（`border` 權重 0 且已歸一化）；跨境候選含 `border` 因子。
- 四種路線模式對同一組候選得到**不同排序**。
- 未開放口岸的候選 `border = 100`，不會被推薦。
- `fixture` / `cached` 品質下 `confidence` 不得為 `high`。
- 可靠性輸出**只有**定性信心與 ETA 區間，**沒有任何百分比**。
