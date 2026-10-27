# 任務清單

**狀態圖例**：✅ 已完成並已驗證 ｜ 🔄 進行中 ｜ ⬜ 未開始 ｜ ⛔ 刻意不做

驗證方式欄位必須是可觀察、可執行的，不接受「完善系統」這類描述。

---

## 第一階段：專案基礎（10 月 6 日）✅

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 1.1 | 檢查工作區、Git 狀態、既有程式與環境 | A | `node -v`、`git status`、工作區清單 | ✅ |
| 1.2 | 建立專案骨架（Next.js 15 + TS + Tailwind，無資料庫） | A | `npm run build` 成功 | ✅ |
| 1.3 | 建立目錄：頁面／元件／API／共享型別／fixtures／測試／docs | A | 見 README §3 | ✅ |
| 1.4 | 把 TripRequest、DecisionResponse、RouteStep 定義為共享型別 | A | `src/lib/types/`，`npm run typecheck` 通過 | ✅ |
| 1.5 | 加入執行期輸入驗證（strict、拒絕未知欄位） | A | `src/test/validation.test.ts` 20 個案例 | ✅ |
| 1.6 | 建立 normal / heavy_rain / disruption 三組確定性 fixture | A（B 待接手） | 三組快照 + 黃金檔案 | ✅ |
| 1.7 | 建立 `POST /api/decision`，依 scenario 回傳對應結果 | A | `curl` 三個情景得到不同建議 | ✅ |
| 1.8 | 建立 `GET /api/health`（狀態、版本、時間） | A | `curl /api/health` 回傳 `status: ok` | ✅ |
| 1.9 | 最小輸入頁與結果頁，完成縱向閉環 | A | 瀏覽器：輸入 → 建議卡片 | ✅ |
| 1.10 | 載入／無效輸入／接口失敗／unavailable 狀態，禁止白屏 | A | 見 INTEGRATION §3 狀態表 | ✅ |
| 1.11 | `.env.example`、README、API_CONTRACT.md、INTEGRATION.md | A | 檔案存在且與實作一致 | ✅ |
| 1.12 | 決策引擎、資料適配層、展示層解耦 | A | 單向依賴（見 ARCHITECTURE §2） | ✅ |

**階段驗收：** `npm run verify` 全綠 ｜ 三個情景在瀏覽器各跑一次成功 ｜ 已經達成 ✅

---

## 第二階段：可共享版本（10 月 7 日前）✅

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 2.1 | 手機與電腦都能完成核心流程 | D | 375px / 1280px 各跑一次 | ✅（版面已響應式；待 D 實機覆核） |
| 2.2 | 情景切換器，三個情景產生不同且合理的建議 | D | `src/test/decision-scenarios.test.ts` 斷言三者主路線與信心都不同 | ✅ |
| 2.3 | 重新整理與重複提交不產生隨機結果 | A | `src/test/determinism.test.ts`：10 次相同、5 次並發相同 | ✅ |
| 2.4 | 開發／建置／檢查／測試腳本 | A | `package.json` 的 scripts | ✅ |
| 2.5 | 執行 lint、型別檢查、測試、生產建置並修復阻塞錯誤 | A | `npm run verify` | ✅ |
| 2.6 | README 寫清啟動方式、目錄結構、接口用法、接入位置 | A | README §1–§8 | ✅ |
| 2.7 | 輸出給 B / C / D 的介面文件 | A | INTEGRATION.md §1–§3 | ✅ |

**階段驗收：** 另一位成員 clone 後執行 `npm ci && npm run dev` 能完成核心流程 ✅

---

## 第三階段：集成保護（10 月 8–10 日）

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 3.1 | fixture／數據適配／決策／展示層解耦，可並行替換 | A | ARCHITECTURE §2 的單向依賴；`adapters` 可整體替換 | ✅ |
| 3.2 | 為 live 資料預留 timeout → cached → fixture 回退鏈 | A（B 接手實作） | `src/test/api.test.ts` 5 個回退案例 | ✅ 骨架完成，實時來源待 B |
| 3.3 | 關鍵決策流程測試：三情景、無效時間、缺少路線、接口失敗 | A/D | 97 個測試全過 | ✅ |
| 3.4 | 明確標示資料來源、更新時間與 fixture | A/D/E | `DataFreshnessBadge` + `dataSources` + `notices` | ✅ |
| 3.5 | `docs/DEMO_RUNBOOK.md`：正常演示、斷網演示、一鍵重置、故障恢復 | A | 文件存在且步驟可執行 | ✅ |
| 3.6 | 檢查金鑰洩露、硬編碼個人路徑、不可複現的隨機結果、只在本機有效的設定 | A | 見下方「安全與可複現性檢查」 | ✅ |

### 安全與可複現性檢查（3.6 的執行結果）

| 檢查 | 指令 | 結果 |
|---|---|---|
| 硬編碼個人路徑 | `grep -rn "/Users/" src/` | 無 ✅ |
| 硬編碼金鑰 | `grep -rniE "api[_-]?key\s*=\s*['\"][^'\"]{8,}" src/` | 無 ✅ |
| 隨機值 | `grep -rn "Math.random" src/` | 無 ✅ |
| 決策層讀取時鐘 | `grep -rn "Date.now\|new Date()" src/lib/decision/` | 無 ✅ |
| 絕對路徑設定 | `grep -rn "file://" src/` | 無 ✅ |
| 測試可重現 | `npm test` 連跑三次 | 結果一致 ✅ |
| 環境變數 | `.env.example` 只有變數名稱 | ✅ |

---

## 第四階段：功能凍結（10 月 11 日）

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 4.1 | 停止新增頁面、資料源與功能 | 全組 | 凍結後只修 Bug／文案／視覺 | ⬜ 待 10/11 執行 |
| 4.2 | 關閉不穩定或未完成的入口 | A | 目前沒有未完成入口；`live` 已明確標示回退 | ⬜ 待 10/11 覆核 |
| 4.3 | 三個情景各連續執行 5 次並記錄 | A | `npm run smoke` | ✅ 腳本已就緒（15/15 成功） |
| 4.4 | 再次執行 lint、型別檢查、測試、生產建置 | A | `npm run verify` | ✅ |
| 4.5 | 產生 `FEATURE_FREEZE_CHECKLIST.md` | A | 檔案存在，含已知限制、演示路徑、回退方式、P0/P1 | ⬜ 待 10/11 產出 |
| 4.6 | 整理建議的凍結標籤與提交訊息（不推送） | A | 見下方建議 | ⬜ 待 10/11 |

### 建議的凍結標籤與提交訊息（未推送）

```
v0.1.0-mvp-freeze         # 10/11 功能凍結
v0.1.0-final              # 10/17 最終凍結

feat(mvp): 完成韌性出行助手縱向閉環與三個確定性演示情景
test(freeze): 三個情景各 5 次通過，黃金檔案鎖定決策輸出
docs: 補齊 API 契約、集成指南、資料來源與演示手冊
```

---

## 刻意不做的功能（範圍凍結）

| 功能 | 原因 |
|---|---|
| 登入、帳號、支付、社交、後台管理 | 超出產品範圍；黑客松不需要 |
| 推送通知、自動訂票 | 超出範圍且需要排程基礎設施 |
| 全港任意路線搜尋 | 首版刻意限定一條走廊 |
| 深港跨境路線 | 需要兩地資料覆蓋與用戶招募，賽後評估 |
| 複雜資料庫 | 沒有需要持久化的狀態 |
| 自研天氣預測 | 依賴官方資料即可 |
| 真實擁擠預測 | 需要歷史資料與校準 |
| 精確準時機率 | **未經校準，輸出會誤導使用者**；只輸出定性信心 |
| 原生 App / 小程式 | 只交付一個行動友善的 Web 版本 |

---

## 移交給其他成員的下一步

| 成員 | 下一步 | 截止 |
|---|---|---|
| **B** | 接上至少一個真實天氣源；補齊 `docs/DATA_SOURCES.md` 的欄位對照與核對證據；填寫 `DataSourceInfo.url`；確認巴士路線編號 | 10/9 |
| **C** | 覆核 `thresholds.ts` 的權重與門檻；定稿 `docs/DECISION_ENGINE.md`；補上「暫緩出發」規則（若時間不足） | 10/9 |
| **D** | 執行 `docs/QA_CHECKLIST.md`；手機實機走查；建立問題表（P0/P1/P2）；10/13 執行 `docs/USER_TEST_SCRIPT.md` | 10/10 |
| **E** | 提供資訊層級設計（第一屏三件事）；確認 `labels.ts` 的中文用語 | 10/9 |

---

## 與成員 B / C / D 指令書的對接（成員 A 已完成）

為避免其他成員抵達時找不到介面，已逐項對齊三份指令書的要求：

### 成員 B（資料）

| 指令書要求 | 已完成 |
|---|---|
| `scenario` | ✅ `ContextSnapshot.scenario` |
| `weather` 狀態、警告、降雨等級**和更新時間** | ✅ 新增 `weather.updatedAt` |
| transit 路線狀態、延誤、中斷區段**和更新時間** | ✅ `routes[]` 新增 `updatedAt`、`affectedSegments` |
| `source` 名稱與**來源 URL**或說明 | ✅ `DataSourceInfo.url`（fixture 目前為 `null`，待 B 填） |
| `dataQuality` | ✅ 已有，且已有測試禁止 fixture 冒充 live |
| `collectedAt` 和 `expiresAt` | ✅ `collectedAt`（原名 `capturedAt`）、新增 `expiresAt` |
| timeout → cached → fixture 回退 | ✅ `src/lib/adapters/index.ts`，5 個測試 |
| `docs/DATA_SOURCES.md` | ✅ 已建立（待 B 補核對證據） |
| `docs/FIXTURE_CATALOG.md` | ✅ 已建立（待 B 補官方來源） |

### 成員 C（決策）

| 指令書要求 | 已完成 |
|---|---|
| 純函式決策入口 `decideTrip(request, snapshot, ...)` | ✅ 已統一命名為 `decideTrip` |
| 可傳入 `candidateRoutes` | ✅ `options.routes`（可注入自訂路線） |
| 硬約束過濾 → 再評分 | ✅ 中斷／轉乘／費用／服務時間 |
| 中斷路線不得成為主路線 | ✅ 有測試 |
| heavy_rain 增加緩衝 | ✅ 6 → 14 分鐘 |
| disruption 降級受影響路線 + Plan B | ✅ 有測試 |
| 資料過期、不足 → 降 confidence / uncertain | ✅ `expiresAt` 過期 → 強制 low → uncertain |
| unavailable + 暫緩建議 | ✅ 逐條說明原因與調整方式 |
| 相同輸入相同輸出 | ✅ 黃金檔案 + 10 次重複測試 |
| high / medium / low，不輸出百分比 | ✅ 定性分級，無任何機率 |
| `docs/DECISION_ENGINE.md` | ✅ 已建立（待 C 定稿與補充校准計畫） |

### 成員 D（前端 / QA）

| 指令書要求 | 已完成 |
|---|---|
| 輸入區（預設起終點、到達時間、限制、三情景清楚標示為演示） | ✅ `TripForm` |
| 決策結果區八項 | ✅ `DecisionCard` |
| 完整頁面狀態（初始／載入／成功／uncertain／unavailable／輸入錯／接口錯／離線回退） | ✅ 全部實作，見 `docs/QA_CHECKLIST.md §1` |
| 手機／平板／電腦響應式 | ✅ 已在 390px 與 1280px 截圖驗證 |
| 可及性（label、鍵盤、焦點、非顏色風險提示） | ✅ 已實作；待 D 逐項覆核 |
| 資訊順序（出發時間 → 主路線 + ETA + 信心 → Plan B + 切換 → 理由／來源） | ✅ 與指令書一致 |
| `docs/QA_CHECKLIST.md` / `docs/USER_TEST_SCRIPT.md` | ✅ 已建立骨架（待 D 填結果） |

### 仍刻意不做

- GenAI 解釋層（C 的加分項；插件位置已寫在 `INTEGRATION.md §2` 與 `docs/DECISION_ENGINE.md §11`）。
- 真實 API 接入（需要 B 先核對官方欄位；環境變數與 provider 骨架已就緒）。
- `git init`（工作區原本不是 Git 倉庫，未經你確認不建立與推送）。

---

## C 的介面契約 v1 接入（2026-10-06）

成員 C 用 WorkBuddy AI 產出的 `接口契约_v1.md` 已接入主體。**只新增 additive 欄位，未動任何鎖定欄位。**

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 5.1 | 存檔 C 的原始契約（含來源與走廊差異說明） | C | `docs/contracts/C_接口契约_v1_workbuddy.md` | ✅ |
| 5.2 | 產出契約變更申請（逐欄位對照 + 5 個待 A 決定的問題） | C | `docs/DECISION_CONTRACT_CHANGE_REQUEST.md` | ✅ 待 A 覆核 |
| 5.3 | 接入 `action`（`depart_now` / `depart_at` / `wait` / `hold`） | C | `src/test/decision-advisory.test.ts` | ✅ |
| 5.4 | 接入 `switchDeadline`，並讓 `switchCondition` 文字與它逐字一致 | C | 同上（normal 07:49／heavy_rain 07:29／disruption 07:37） | ✅ |
| 5.5 | 接入 `basis`（每個數字帶出處，未校準前不得出現 `statistics`） | C | 同上 | ✅ |
| 5.6 | 接入 `uncertainty`（明示不知道什麼，`unavailable` 也有內容） | C | 同上 | ✅ |
| 5.7 | 補上「暫緩出發」規則（原 §移交 B/C/D 的 C 待辦） | C | `action: "hold"`（無路線）／`"wait"`（資料過期） | ✅ |
| 5.8 | 定稿 `docs/DECISION_ENGINE.md`（新增 §12 行動建議層） | C | 文件存在且與實作一致 | ✅ |
| 5.9 | 回歸驗收：三個情景建議完全不變，僅新增欄位 | C | `npm run verify`（137 tests）＋ `npm run smoke`（15/15） | ✅ |

### 5b. 回應成員 B 的交接文件（2026-10-06）

| # | 任務 | 負責 | 驗證方式 | 狀態 |
|---|---|---|---|---|
| 5b.1 | 核對 `unknown` 路線的 `delayMinutes=0` 是否被當成零延誤 | C | 確認**是真問題**：數字用 0、文案卻寫「已按保守假設」 | ✅ 已修 |
| 5b.2 | `UNKNOWN_ROUTE_RULES.extraMinutes = 5`：狀態未確認時額外預留保守時間 | C | `src/test/decision-live-safety.test.ts`；黃金檔案未變 | ✅ |
| 5b.3 | 惡劣天氣安全規則：黑雨／八號以上 + 露天候車 → `action` 降為 `wait` | C | 同上（觸發／不觸發／`hold` 不變條件） | ✅ |
| 5b.4 | 產出 `docs/C_HANDOFF.md`，逐條回應 B 的 5 項 | C | 文件存在，第 4 節逐條對應 | ✅ |
| 5b.5 | 回歸驗收 | C | `npm run verify`（12 檔案 / 154 tests）＋ `npm run smoke`（15/15） | ✅ |

### 仍待 A 決定（見變更申請 §4）

1. 是否把四個 additive 欄位正式寫入 `API_CONTRACT.md §2`。
2. 是否讓 B 在 `ContextSnapshot.weather` 加入 `signalLevel` / `preAnnounceAt`。
3. `action: "wait"`（資料過期 → 先核實再出發）的語意是否接受。
4. 前端是否顯示 `action` 與 `switchDeadline`（屬 D/E）。
5. 確認走廊以主體為準（C 草稿的屯門 → 九龍西是結構佔位）。
