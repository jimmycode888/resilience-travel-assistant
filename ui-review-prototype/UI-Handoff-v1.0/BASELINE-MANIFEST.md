# Baseline Manifest — 韌性出行助手 UI Baseline v1.0

| 欄位 | 值 |
|---|---|
| **Baseline 名稱** | 韌性出行助手 — UI Baseline v1.0 |
| **Baseline 日期** | 2026-10-08 |
| **狀態** | 已凍結（frozen）· Reference only |
| **Prototype 路徑** | `/workspace/八校黑客松/ui-review-prototype/` |
| **Handoff 路徑** | `/workspace/八校黑客松/ui-review-prototype/UI-Handoff-v1.0/` |
| **Git tag** | 未建立 —— 該目錄不是 git repository（`fatal: not a git repository`），依指示不強行建立；改用本 manifest + 文件記錄 |
| **產品名稱** | 韌性出行助手（UI 顯示為繁體） |

## 1. Prototype 納入 Baseline 的檔案

| 檔案 | 角色 |
|---|---|
| `src/App.tsx` | 全部 UI 元件與資料綁定（單檔） |
| `src/index.css` | 全部樣式與設計 token |
| `src/data/decisions.ts` | 真實資料逐字複本（golden fixture + 真實 unavailable 回應） |
| `src/main.tsx` | React 入口 |
| `index.html` | Vite HTML 外殼 |
| `vite.config.ts` | Vite 設定 + `/api` 代理 + 健康來源挑選 |
| `.figma/make/site.json` | 站點 metadata（title、`lang=zh-HK`、`noindex`） |
| `package.json` / `pnpm-lock.yaml` / `tsconfig.json` | 工具鏈 |

**不納入**：`node_modules/`、`dist/`、`.figma/make/*` 腳本（Figma Make 產生，非應用程式碼）。

## 2. 支援的畫面與狀態

- **畫面**：輸入頁、結果頁（同一 SPA 的兩個視圖，無路由）
- **狀態（5）**：`loading` / `ready` / `uncertain` / `unavailable` / `error`
- **情景（3）**：`normal`（正常通勤）/ `heavy_rain`（暴雨影響）/ `disruption`（交通中斷）
- **Demo 機制**：`?demo=1`（唯一）；預設使用者看不到情景切換

## 3. Responsive 目標

| 目標 | 尺寸 | 結果 |
|---|---|---|
| Desktop | 1440 × 900 | 通過（無橫向溢出；切換條件 y=512，位於首屏內） |
| Mobile | 390 × 844 | 通過（無橫向溢出；CTA 不遮擋欄位；切換條件 y=1199） |

斷點：`>900px` 桌面雙欄 ／ `601–900px` 重排為單欄 ／ `≤600px` 行動優化。
輸入頁最大寬 1200px；結果頁最大寬 1260px。

## 4. API / contract 對齊狀態

- 結果頁**全部欄位**由真實 API 驅動；取數優先呼叫既有服務（`/api` dev proxy，自動挑選健康的 `:5173` / `:5180`），不可用時回退到 `src/data/decisions.ts`（與 API 輸出**逐字一致**）。
- 本包**未修改**任何 contract / API / fixture / 決策引擎 / 正式前端。
- 已對齊欄位共 29 個，明細見 `API-UI-MAPPING.md`。

## 5. 已知非阻塞事項（僅記錄，不修改）

| # | 事項 | 影響 |
|---|---|---|
| 1 | Mobile 切換條件位於 y=1199（約 1.42 屏），未進 844px 首屏 | 非阻塞；使用者向下捲動即可看到，且不隱藏 |
| 2 | `dataSources[].note` 內含後端原文「（fixture）」英文詞 | 非阻塞；屬真實資料，不由 UI 改寫 |
| 3 | 瀏覽器 console 偶見 `net::ERR_ABORTED` | 非阻塞；React StrictMode 在 dev 模式重複觸發 effect 所致，production build 無此現象 |
| 4 | Plan B 無「到達信心」可顯示（契約無 per-route confidence） | 非阻塞；UI 不編造，改顯示真實 `status` / `crowding` |
| 5 | 界面文案為繁體、部分來源備註為後端原文（繁體） | 已一致；正式專案若採用不同文案，以 E 的 regression review 為準 |

## 6. 待團隊決策事項（本包不自行修改）

1. **B**：補 `dataSources[].url`（目前全為 `null`）。
2. **E**：決定移動端 switch condition 的位置（接受現況 / 在摘要加 `switchDeadline` 提示 / 調整順序）。
3. **A+C**：是否新增「服務恢復提示」（立項 §5 有要求，契約目前無欄位）。
4. **C+A**：是否新增 Plan B confidence（`RoutePlan.confidence`）。
5. **A**：`action` / `switchDeadline` / `basis` / `uncertainty` 是否正式登記進 `API_CONTRACT.md §2.2`。
6. **A+E**：`?demo=1` 是否為團隊認可的演示開關。

## 7. 凍結聲明

自 2026-10-08 起，`UI Baseline v1.0` 進入 **frozen / reference only** 狀態：

- 不再主動修改 `src/App.tsx` 的 UI 結構、`src/index.css` 的視覺系統、資訊層級、三情景、五狀態、以及 API / fixture 對齊邏輯。
- 任何後續 UI 變更**必須先提出新的 Baseline 版本**（v1.1、v2…），不得直接改動 v1.0。
- 若發現非阻塞性問題：只記錄。
- 若發現真正阻塞 Demo 的 P0/P1：先報告，經確認後才修，並重新回歸測試、以修復後版本作為新 Baseline。

## 8. Baseline 內容指紋（SHA-256）

用於驗證「UI Baseline v1.0 未被改動」。若下列檔案的雜湊與你手上的版本不同，代表 UI 已被修改。

| 檔案 | 位元組 | SHA-256 |
|---|---|---|
| `src/App.tsx` | 37972 | `d230e23632dd92bcee7db4d0ef9b1f5e88cc1d8d6c5136de5ecaf2e34abc3c59` |
| `src/index.css` | 28111 | `b2892e36402c1ead25e3afea1dbefa4b5bb366bbf39a9c942e45f41cc38146e7` |
| `src/data/decisions.ts` | 71928 | `9119fc3008ae850447bfabb8e0e6813103a65c50c208746402a97ca7255ef5a2` |
| `vite.config.ts` | 13728 | `a046ec077034d0814e361c6a06dfef42dd12ce45859155b1df360a2ae06278bf` |
| `index.html` | 440 | `768eac67e6271681de61c23f1c94a6bf688607bbad2d0bccafd8f4bfe789a079` |
| `.figma/make/site.json` | 348 | `f125350d2f0717ae054fc1ae169712258a0609ff17de8e8c24d924a007166a16` |

**依賴版本**：`react@^19.0.0`, `react-dom@^19.0.0`, `@types/node@^22.0.0`, `@types/react@^19.0.0`, `@types/react-dom@^19.0.0`, `@vitejs/plugin-react@^6.0.0`, `tailwindcss@^4.0.0`, `@tailwindcss/vite@^4.0.0`, `oxfmt@^0.2.0`, `typescript@^5.7.0`, `vite@^8.0.5`

**工具鏈**：Node v24.18.0 ／ pnpm 11.25.0（`.mise.toml` 宣告 node 22 / pnpm 10.34.3，實測 node 24 + pnpm 11 可正常運行）

