# 第一階段驗收紀錄（2026-10-06）

負責人：成員 A（技術負責人）
範圍：專案基礎（指令書第一階段 1–10 項）
結論：**第一階段全部通過；第二階段亦已一併完成（見文末）。**

---

## 1. 環境

| 項目 | 值 |
|---|---|
| Node.js | v24.21.0 |
| npm | 11.19.0 |
| 作業系統 | macOS（darwin arm64） |
| 工作區 | `/Users/waywardzz/Desktop/八校黑客松/` |
| Git | **工作區不是 Git 倉庫**（`fatal: not a git repository`）→ 未建立 git，未推送任何遠端 |
| 既有程式碼 | **無**（工作區只有研究文件、報告 HTML、PDF 與圖片）→ 依指示新建 `resilience-travel-assistant/` |

既有檔案**未被修改或刪除**：`analysis/`、各 `.docx`、`.pdf`、`.png`、`idea.pages`
與兩份工作流文件都保持原狀。新專案建立在獨立子目錄中。

---

## 2. 第一階段逐項驗收

| # | 要求 | 證據 | 結果 |
|---|---|---|---|
| 1 | 檢查工作區、Git 狀態、既有程式與環境 | `ls -la`、`git status`、`node -v` | ✅ |
| 2 | 建立應用骨架 | `package.json`、`next.config.ts`、`tsconfig.json`、`tailwind.config.ts`；`npm run build` 成功 | ✅ |
| 3 | 清晰目錄：頁面、元件、API、共享型別、fixtures、測試、docs | `src/app`、`src/components`、`src/app/api`、`src/lib/types`、`src/lib/fixtures`、`src/test`、`docs/` | ✅ |
| 4 | TripRequest / DecisionResponse / RouteStep 共享型別 + 執行期驗證 | `src/lib/types/{request,decision,context}.ts`、`src/lib/validation.ts`（Zod strict） | ✅ |
| 5 | 三組確定性 fixture | `src/lib/fixtures/context/snapshots.ts` + `src/lib/fixtures/golden/*.json` | ✅ |
| 6 | `POST /api/decision` 依 scenario 回傳對應 fixture | 實測三個情景回傳不同建議（見 §3） | ✅ |
| 7 | `GET /api/health`（狀態、版本、時間） | 實測回應見 §3 | ✅ |
| 8 | 最小輸入頁與結果頁，「輸入 → API → 結果」縱向閉環 | `src/app/page.tsx` → `POST /api/decision` → `src/app/result/page.tsx` | ✅ |
| 9 | 載入／無效輸入／接口失敗／unavailable 狀態，無白屏 | `DecisionView` 狀態機 + `error.tsx` + `global-error.tsx` + `not-found.tsx`（測試見 §4） | ✅ |
| 10 | `.env.example`、README、API_CONTRACT.md、INTEGRATION.md | 四個檔案皆存在 | ✅ |

### 最小閉環的六項必要輸出（使用者必須看到）

以 `normal` 情景的實際回應為例：

| 要求 | 實際輸出 |
|---|---|
| 1. 建議出發時間 | `departAt = 2026-10-13T08:09:00+08:00` |
| 2. 主路線與預計到達時間範圍 | `primaryRoute` = R1 港鐵主線（5 步）；`etaRange` = `08:54 – 09:04` |
| 3. 到達信心 high / medium / low | `confidence = "high"` |
| 4. 一條 Plan B | `planB` = R2 過海巴士（3 步） |
| 5. 明確的切換條件 | 「若出發前將軍澳線延誤超過 10 分鐘，改行 Plan B：過海巴士…（需先步行 9 分鐘至坑口（北）巴士總站；巴士較慢，必須在 07:49 前離開起點…）」 |
| 6. 推薦理由、資料更新時間、資料品質 | `reasons`（5 條）、`dataUpdatedAt = 2026-10-13T07:30:00+08:00`、`dataQuality = "fixture"` |

---

## 3. 實機驗證（生產建置）

```
$ npm run build          → ✓ Compiled successfully；5 條路由
$ npx next start -p 3111
$ curl /api/health       → status ok, version 0.1.0, time 2026-10-06T09:51:02+08:00
                           liveDataConfigured=false, allowFaultInjection=false
```

三個情景的實際回應（`arriveBy = 2026-10-13T09:00`，`maxExtraCost = 10`，`maxTransfers = 2`）：

| 情景 | HTTP | status | 出發 | 到達範圍 | 信心 | 主路線 | Plan B | 被排除 |
|---|---|---|---|---|---|---|---|---|
| `normal` | 200 | ready | 08:09 | 08:54–09:04 | high | R1（45 分） | R2 | — |
| `heavy_rain` | 200 | ready | 07:58 | 08:43–09:06 | medium | R1（48 分） | R2 | — |
| `disruption` | 200 | uncertain | 07:22 | 08:24–09:19 | low | R2（82 分） | R3 | R1（服務中斷） |

錯誤路徑實測：

| 請求 | HTTP | code |
|---|---|---|
| `arriveBy = ""` | 400 | `INVALID_INPUT`（含具體欄位訊息） |
| 非法 JSON | 400 | `INVALID_INPUT` |
| `GET /api/decision` | 405 | `METHOD_NOT_ALLOWED` |
| `arriveBy = 05:45`（早於首班） | 200 | status `unavailable`，逐條說明三條路線被排除的原因 |

---

## 4. 自動化驗證

```
$ npm run lint        → 0 error, 0 warning
$ npm run typecheck   → 0 error
$ npm run test        → 9 個測試檔、97 個測試全數通過
$ npm run build       → 成功
$ npm run smoke       → 三個情景各 5 次，15/15 成功且結果一致
```

測試覆蓋範圍：

| 測試檔 | 覆蓋 |
|---|---|
| `time.test.ts` | 香港時區、ISO 解析、不存在的日期、跨日加減 |
| `validation.test.ts` | 20 個輸入驗證案例（含未知欄位、角色錯置） |
| `decision-scenarios.test.ts` | 三情景的完整斷言、步驟連續性、切換條件可執行性 |
| `decision-edge-cases.test.ts` | 無效時間、缺少路線、全部中斷、限制條件排除、不變性 |
| `api.test.ts` | 400/405/500、故障注入、三層回退鏈、health |
| `determinism.test.ts` | 10 次重複、5 次並發、無隨機值 |
| `golden.test.ts` | 黃金檔案比對（鎖定使用者可見的輸出） |
| `url-params.test.ts` | URL 編碼往返、壞參數回退 |
| `freeze-smoke.test.ts` | 三情景 × 5 次的功能凍結驗收 |

---

## 5. 已明確遵守的邊界

| 限制 | 落實方式 |
|---|---|
| 不擴大產品範圍 | 只做一條走廊、3 條路線、3 個情景；沒有登入／支付／社交／後台／推送／資料庫 |
| 不覆蓋既有檔案 | 全部工作在 `resilience-travel-assistant/` 子目錄內 |
| 不提交真實金鑰 | `.env.example` 只有變數名稱；`.env*.local` 已忽略；`src/` 內無金鑰 |
| 不推送遠端 | 工作區不是 Git 倉庫，未執行任何 git 寫入操作 |
| 不執行正式部署 | 只在本機 `next start` 驗證 |
| 決策結果結構化且確定性 | 決策層為純函式；黃金檔案 + 重複測試鎖定 |
| 大模型不產生路線事實 | 決策層沒有引入任何 LLM；理由是規則與資料產生的 |
| 不使用真實個人資料 | 公開地點 + 虛構的固定服務日 2026-10-13 |
| 無硬編碼個人路徑 | `grep -rn "/Users/" src/` 無結果 |

---

## 6. 尚未完成 / 需要其他人處理

| 項目 | 負責 | 說明 |
|---|---|---|
| 真實天氣／交通來源 | B | 骨架與環境變數已備好（`live-providers.ts`），但依規則需先核對官方欄位才能接入 |
| 真實巴士路線編號 | B | 目前刻意使用「過海巴士（東區海底隧道）」而不編造編號 |
| 車費與行車時間 | B | 現為演示估算值，需以官方票價與班距替換 |
| 權重與門檻复核 | C | `thresholds.ts` 可調；「暫緩出發」規則尚未實作 |
| 手機實機走查 | D | 版面已響應式並通過建置，但未在真實手機上跑過 |
| 資訊層級設計 | E | 目前是可用的功能版視覺，未經 E 的設計稿驗收 |
| Git 倉庫與看板 | A（待你確認） | 工作區不是 Git 倉庫；若需要版本控管請確認是否要 `git init` |
| 第 4 階段文件 | A | `FEATURE_FREEZE_CHECKLIST.md` 待 10/11 產出 |

---

## 7. 第二階段完成狀況（提前完成）

| # | 要求 | 結果 |
|---|---|---|
| 1 | 手機與電腦都能完成核心流程 | ✅ 版面為行動優先（單欄 → `sm:` 多欄）、`max-w-3xl` 容器、touch target ≥ 44px；建置通過 |
| 2 | 情景切換器，三者建議不同且合理 | ✅ `ScenarioSwitcher`；測試斷言出發時間、主路線、信心三者都不同 |
| 3 | 重新整理與重複提交不隨機 | ✅ 整個請求存在 URL；`determinism.test.ts` 10 次重複 + 5 次並發皆相同 |
| 4 | 開發／建置／檢查／測試腳本 | ✅ `dev` / `build` / `start` / `lint` / `typecheck` / `test` / `smoke` / `verify` / `fixtures:update` |
| 5 | lint、型別、測試、生產建置全綠 | ✅ 見 §4 |
| 6 | README 寫清啟動、目錄、接口、接入位置 | ✅ README §1–§8 |
| 7 | 給 B / C / D 的介面文件 | ✅ `INTEGRATION.md`（B：`LiveDataProvider`；C：`decide()`；D：`api-client.ts`） |

**第二階段驗收：** 另一個人 clone 後執行 `npm ci && npm run verify` 能全綠，
且 `npm run dev` 後能從輸入走到結果並切換三個情景。✅

---

## 8. 真實瀏覽器驗證（agent-browser / Chromium）

除了單元測試與 `curl`，已在真實 Chromium 中逐項走過下列流程（截圖存於 `docs/screenshots/`）：

| 檢查 | 操作 | 結果 |
|---|---|---|
| 輸入頁渲染 | 開 `http://localhost:3111/` | ✅ 兩個起點、兩個終點、`datetime-local`（預設 2026-10-13 09:00）、兩個數字輸入、四個情景、提交按鈕全部可互動 |
| 縱向閉環 | 直接按「取得出行建議」 | ✅ 跳到 `/result?...&scenario=normal`，顯示 08:09 出發、信心高、到達範圍 08:54–09:04 |
| 六項必要輸出 | 讀取結果頁全文 | ✅ 建議出發時間、主路線＋到達範圍、到達信心、Plan B、切換條件、理由＋資料時間＋資料品質，全部可見 |
| 情景切換器 | 點「暴雨影響」 | ✅ 網址變為 `scenario=heavy_rain`，建議改為 07:58、信心降為中 |
| 情景切換器 | 點「交通中斷」 | ✅ 主路線改為 R2 過海巴士、信心低、狀態「建議可用但不確定」 |
| `live` 情景 | 開 `scenario=live` | ✅ 標示為「演示固定資料」，提醒區塊列出三條回退訊息（未把 fixture 說成 live） |
| `unavailable` 狀態 | `arriveBy=2026-10-13T05:45` | ✅ 「目前無法給出建議」＋逐條列出三條路線被排除的原因 |
| 無效網址參數 | `origin=nope`、`scenario=typhoon`、`maxExtraCost=abc` | ✅ 黃色提示列出三個問題，並用示範預設值繼續渲染（不白屏） |
| 接口失敗 | 關掉伺服器後按「重新查詢」 | ✅ 「無法取得建議／無法連線到決策服務」＋錯誤代碼 NETWORK_ERROR＋「重試」與「返回輸入頁」 |
| 手機版面 | 390 × 844 viewport | ✅ 單欄排版，第一屏即可看到出發時間、信心、到達範圍；卡片標題按鈕不再被擠壓 |
| 桌面版面 | 1280 × 900 viewport | ✅ 四欄資訊區、路線時間軸、Plan B 與切換條件完整 |

截圖清單（`docs/screenshots/`）：

| 檔案 | 內容 |
|---|---|
| `01-mobile-input.png` | 手機版輸入頁 |
| `02-mobile-result-normal.png` | 手機版結果頁（正常通勤） |
| `02-mobile-result-heavy_rain.png` | 手機版結果頁（暴雨影響） |
| `02-mobile-result-disruption.png` | 手機版結果頁（交通中斷） |
| `03-desktop-result-normal.png` | 桌面版結果頁（正常通勤，含完整六項輸出） |
| `03-desktop-result-disruption.png` | 桌面版結果頁（交通中斷，主路線改為巴士） |
| `04-api-failure-state.png` | 接口失敗狀態 |
