# 韌性出行助手 · Resilience Travel Assistant

把天氣與交通資訊，轉成「幾點走、走哪條、什麼時候切換」的可執行出行決定。

香港八校 GenAI 黑客松 2026（HK Inter-University GenAI Hackathon for SDGs 2026）第一賽道
「綠色出行」參賽作品，跨校五人團隊。本倉庫收錄第一與第二階段的完整交付。

**線上演示：** <https://jimmycode888.github.io/resilience-travel-assistant/>

> ⚠️ 這是一個黑客松演示原型。所有路線時間、車費與服務狀態都是標記為 `fixture` 的
> **固定演示數據**，不是實時路況。介面上的「到達信心 高／中／低」是定性判斷，
> 不是經過校準的準點概率。

---

## 它解決什麼問題

香港的惡劣天氣出行決策有一個具體痛點：天文台發出八號風球或黑雨時，公共交通的
停駛門檻、班次調整與復常時間並不一致，通勤者要同時查天氣、查路線、查停駛公告，
再自己拼出一個「現在該不該出門」的判斷。

本專案把這個判斷做成結構化輸出：

| 輸出欄位 | 含義 |
|---|---|
| 建議出發時間 | 在給定「最遲到達時間」下的最晚可行出發時刻 |
| 到達範圍 | 最早／最晚到達時間區間 |
| 到達信心 | 高／中／低（定性） |
| 主路線 | 首選路線與各段行程 |
| Plan B | 備用路線，附**最遲切換時間** |
| 切換條件 | 什麼情況下應該切換到 Plan B |
| 理由 | 決策依據的可讀說明 |
| 數據時間與質量 | `live` / `cached` / `fixture` 三層標記 |

四種決策動作：**立即出發 / 等待 / 改道 / 暫緩**。

## 設計要點

**規則層與模型層分離。** 停駛門檻、班次間隔這類確定性的服務規則由程式碼精確計算，
只有非規則類的中斷才交給模型。這樣模型不會「猜」一個本可查證的數字。

**反幻覺護欄。** GenAI 只負責把結構化結果轉成可讀解釋，且被限制為不得陳述
底層數據不支持的事實。

**三層數據回退鏈。** `live → cached → fixture`，任何一層失敗都不會讓 API 500，
也不會讓前端白屏；使用者會在 `notices` 與 `dataQuality` 看到實際使用的是哪一層。

**結果可重現。** 行程參數全部編進 URL，結果頁因此可分享、可重放。

## 倉庫結構

```
resilience-travel-assistant/   主應用：Next.js 15 + React 19 + TypeScript
  src/lib/decision/            決策引擎
  src/lib/adapters/            數據適配層（三層回退）
  src/lib/fixtures/            演示數據與黃金測試基準
  src/test/                    單元、整合與凍結驗收測試
A部分/app/                     第一階段整合版
第二阶段信息/                   第二階段基線
ui-review-prototype/           UI 參考基線（Vite，非生產代碼）
analysis/                      現有方案調研、UI 設計評審
progress-2026-10-08/           進度頁
progress-2026-10-12/           進度頁
generated/                     演示截圖
docs/                          靜態演示構建產物（GitHub Pages 來源）
*.docx / *.pdf                 立項說明、選題、參考論文
```

> `ui-review-prototype/` 下的介面截圖以 **Git LFS** 儲存（沿用原專案的 `.gitattributes`）。
> clone 前請先安裝 `git-lfs`，否則只會取得指標檔案。

## 本地運行

需要 Node.js ≥ 20.11（建議 22 或 24）。**不需要數據庫，也不需要任何 API 密鑰**。

```bash
cd resilience-travel-assistant
npm install
npm run dev          # http://localhost:3000
```

常用命令：

| 命令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 生產構建（伺服器模式，含 `/api/decision`） |
| `npm run build:static` | 靜態匯出到 `out/`，供 GitHub Pages 使用 |
| `npm run test` | Vitest 全量測試 |
| `npm run smoke` | 三個演示情景各連跑 5 次的功能凍結驗收 |
| `npm run lint` / `npm run typecheck` | 代碼檢查 / 類型檢查 |
| `npm run verify` | lint → typecheck → test → build 一次跑完 |

### 兩種構建模式的差別

一般模式把決策引擎跑在伺服器端，前端 `POST /api/decision`。

靜態模式（`build:static`）沒有伺服器，因此前端直接呼叫同一個
`handleDecisionRequest`——驗證、回退鏈與決策邏輯完全共用，差別只在於不經過 HTTP。
構建腳本會在建置期間暫時移開 `src/app/api/`，完成後還原，主分支源碼保持完整。

## 可選：接入實時數據

默認全部走 `fixture`。若要嘗試實時來源：

```bash
cp .env.example .env.local
```

`.env.example` 內已註明各變量含義；不填任何值也能完整運行。
請勿把真實密鑰提交到倉庫。

## 測試狀態

在本機以 Node.js 22 驗證：`npm run typecheck` 通過；
`npm run test` → **19 個測試文件、267 個測試全部通過**；
`npm run build` 伺服器模式構建成功；`npm run build:static` 靜態匯出成功。

## 團隊

香港八校 GenAI 黑客松 2026 · 第一賽道「綠色出行」· 跨校五人團隊。

本倉庫由團隊成員共同完成；決策引擎、GenAI 解釋層與反幻覺護欄由
[LIU Jia Ming (Jimmy)](https://jimmycode888.github.io/portfolio/) 負責。

## 授權與數據來源

參考論文與外部資料的版權歸原作者所有，僅作研究引用收錄於本倉庫。
演示數據為自建 fixture，不含任何真實乘客或商業數據。
