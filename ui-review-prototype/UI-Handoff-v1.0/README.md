# 韌性出行助手 — UI Baseline v1.0 · D 集成交接包

> 產品名稱以 UI 實際顯示的繁體 **「韌性出行助手」** 為準（簡體寫作「韧性出行助手」，指同一產品）。

| 項目 | 值 |
|---|---|
| **Baseline 版本** | **UI Baseline v1.0** |
| **凍結日期** | 2026-10-08 |
| **Prototype 路徑** | `/workspace/八校黑客松/ui-review-prototype/` |
| **正式專案（事實來源）** | `/workspace/八校黑客松/resilience-travel-assistant/` —— **本交接包未修改它** |
| **狀態** | 已凍結 · Reference only |

---

## 1. 這個交接包是什麼

這是給**前端成員 D** 的 UI 實作參考包。它描述「正式專案應該長成什麼樣」，**不是**可直接複製的 production 程式碼。

Prototype 是一個獨立的 Vite + React 參考實作，用來視覺化已鎖定的 API 契約；正式專案是 Next.js + 台/港中文文案 + 既有元件架構，兩者結構不同。

## 2. D 應該如何使用

1. **先讀** `UI-Screens.md` 了解兩個頁面與資訊層級，再用 `screens/` 的截圖對照。
2. **對照** `API-UI-MAPPING.md`，確認每個 UI 元素對應哪個契約欄位；實作時直接取用正式專案既有的 `src/lib/api-client.ts` 與元件。
3. **照著** `UI-States.md` / `UI-Scenarios.md` 實作五狀態與三情景。
4. **套用** `DESIGN-TOKENS.md` 的既有 token（不要新增規範）。
5. **逐項打勾** `QA-CHECKLIST.md`。
6. 完成後交回 **E** 做 UI regression review。

## 3. 三條紅線

- **Prototype 是 Reference，不是 production code。** 不要把 `ui-review-prototype/` 的程式碼複製或覆蓋到正式專案。
- **正式專案必須繼續以 API Contract / production API / fixture 為事實來源。** 本包只描述「怎麼呈現」，不描述「資料長什麼樣」。
- **不要用本包去改動正式專案的既有架構。** 若正式專案已有對應元件，沿用既有元件與命名。

## 4. 包內檔案

| 檔案 | 內容 |
|---|---|
| `README.md` | 本檔（含 Integration Principles） |
| `BASELINE-MANIFEST.md` | Baseline 清單：範圍、檔案、狀態、已知事項、待決事項 |
| `UI-Screens.md` | 輸入頁 + 結果頁的結構、欄位、驗證、Responsive |
| `UI-States.md` | loading / ready / uncertain / unavailable / error 五狀態 |
| `UI-Scenarios.md` | normal / heavy_rain / disruption 真實資料與畫面 |
| `DESIGN-TOKENS.md` | 從現有程式碼提取的視覺 token |
| `COMPONENT-CHECKLIST.md` | D 需要實作/還原的 UI 元件清單 |
| `API-UI-MAPPING.md` | UI 元素 ↔ 契約欄位 ↔ 顯示行為 |
| `DEMO-MODE.md` | `?demo=1` 機制（僅供演示） |
| `QA-CHECKLIST.md` | 整合後逐項檢查表 |
| `screens/` | 6 張基準截圖（+ 額外參考圖） |

---

### Integration Principles

1. Prototype 是 UI Reference，不是 production source code。
2. 正式專案繼續以 API Contract / production API / fixture 為事實來源。
3. 不要為了還原 UI 而修改 API。
4. 不要為了 UI 增加 contract 中不存在的欄位。
5. 不要創造路線、時間、天氣、confidence、status。
6. 不要把 demo scenario selector 放進正常使用者介面。
7. UI 文案以當前 Baseline 為參考。
8. 資料內容以 production API 為準。
9. 如果 API 欄位與 Prototype 不一致，先和 A/C/E 確認，不要自行修改資料層。
10. D 完成整合後，由 E 進行 UI regression review。
