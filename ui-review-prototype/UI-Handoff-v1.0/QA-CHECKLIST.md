# QA Checklist — D 整合後逐項檢查（UI Baseline v1.0）

> 使用方式：D 完成整合後，在正式專案上逐項打勾。
> 「參考」欄指向本 Baseline 的對應截圖或文件。

---

## 1. Input（輸入頁）

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ 起點選擇 | 只有契約列舉值 `坑口（富寧花園）` / `坑口站 A 出口` | `screens/desktop-input.png` |
| □ 終點選擇 | 只有契約列舉值 `中環（交易廣場）` / `中環（國際金融中心二期）` | 同上 |
| □ 日期時間 | 可選**日期＋時間**（不是只有時刻） | — |
| □ 額外車費 = 0 | **可通過驗證**，不被當成空值 | `UI-Screens.md §1.3` |
| □ 轉乘 = 0 | **可通過驗證** | 同上 |
| □ 必填校驗 | 空值／超範圍會擋下提交 | `UI-Screens.md §1.3` |
| □ 錯誤提示 | 出現在**欄位下方、CTA 上方**，紅框清單，不跳頁 | `UI-Screens.md §1.4` |
| □ Submit | 驗證通過才切到結果頁；文案 `獲取出行建議` | `UI-Screens.md §1.5` |
| □ CTA 不遮擋 | 捲動時**不得**覆蓋任何欄位（不可 sticky/fixed 疊在欄位上） | `UI-Screens.md §1.5` |

## 2. Result（五狀態）

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ loading | 提交後先出現 loading；**無白屏、無錯誤**；文案 `正在讀取路線狀態與天氣資料` | `screens/desktop-state-loading.png` |
| □ ready | 顯示完整正常結果 | `screens/desktop-normal.png` |
| □ uncertain | **保留完整建議** + 琥珀橫幅；**不是 error、不是 unavailable**；信心 low 明顯 | `screens/desktop-disruption.png` |
| □ unavailable | 不假裝有可執行路線；三出口（調整條件／查看原因／留在安全處觀察） | `screens/desktop-state-unavailable.png` |
| □ error | 可讀錯誤 + `重試` + `返回輸入頁`；**不偽造 error code** | `screens/desktop-state-error.png` |

## 3. Decision（決策內容）

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ `departAt` | 最大字級顯示建議出發時間 | `screens/desktop-normal.png` |
| □ `latestDepartAt` | 與建議出發時間**並列可見** | 同上 |
| □ `etaRange` | 顯示為**區間**（`HH:mm – HH:mm`），不是單點 | 同上 |
| □ `action` | 文案與 `labels.ts` 一致（立即出發／按建議時間出發／先核實再出發／留在安全處持續觀察） | `API-UI-MAPPING.md §5` |
| □ `confidence` | 只出現**高／中／低**；**不得出現百分比**；附「未經校準」說明 | 同上 |
| □ primary route | 路線名 + 全程 + 轉乘 + 額外車費 + 時間軸 | `screens/desktop-normal.png` |
| □ Plan B | 路線名 + 耗時 + 車費 +（可折疊）步驟；**不顯示 Plan B confidence** | `API-UI-MAPPING.md §4` |
| □ switch condition | 獨立成塊；`switchDeadline` 以明顯方式呈現 | `screens/desktop-normal.png` |
| □ risk | 文字 + 圖示 + 顏色三者並用（不只靠顏色） | `UI-States.md` |
| □ reasons | 逐條列出；**不得加入統計暗示** | `API-UI-MAPPING.md §7` |

## 4. Responsive

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ 1440 × 900 | 輸入頁兩欄；結果頁 `1.5fr : 0.8fr` 雙欄；切換條件在首屏內 | `screens/desktop-normal.png` |
| □ 390 × 844 | 單欄；時間軸預設折疊；切換條件需捲動但**不被隱藏** | `screens/mobile-normal.png` |
| □ no horizontal overflow | 兩個尺寸皆**無橫向溢出** | — |
| □ no CTA overlap | 輸入頁捲動時 CTA 不遮擋欄位 | — |
| □ 向下有內容可辨 | 行動版讓使用者知道下方還有內容（不被誤認為到底） | `UI-Screens.md §2.3` |

## 5. Demo

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ `?demo=1` | demo 面板出現（可折疊，標明「僅用於演示」） | `DEMO-MODE.md` |
| □ 預設模式 | **完全不渲染** scenario selector | 同上 |
| □ 三情景只在 demo 可用 | 正常使用者看不到情景切換 | 同上 |
| □ 系統狀態 | 預設模式仍顯示 `當前狀態：…`，由資料/系統判定 | 同上 |

## 6. 資料與契約

| 檢查項 | 預期 | 參考 |
|---|---|---|
| □ 事實來源 | 使用 production API / fixture，未改 API | `README.md` Integration Principles |
| □ 未新增欄位 | 沒有為了 UI 新增 contract 不存在的欄位 | `API-UI-MAPPING.md §11` |
| □ 未創造資料 | 未自行生成路線／時間／天氣／confidence／status | 同上 |
| □ 資料品質標示 | fixture 不得標成 live；顯示中文「演示固定資料」而非 `FIXTURE` | `API-UI-MAPPING.md §9` |
| □ 免責聲明 | 顯示 `disclaimer` | — |

## 7. 交回 E

| 檢查項 | 預期 |
|---|---|
| □ UI regression review | 由 **E** 逐屏對照 `screens/` 進行 |
| □ 差異清單 | 與本 Baseline 的**所有**差異需列明並經 E 確認 |
| □ 新 Baseline | 若差異屬刻意的設計變更 → 需提出**新的 Baseline 版本**，不得默默覆蓋 v1.0 |
