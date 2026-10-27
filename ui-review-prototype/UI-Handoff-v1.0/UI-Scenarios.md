# UI-Scenarios — 三個真實情景（UI Baseline v1.0）

> **全部數值取自當前真實 API 輸出**（`POST /api/decision`，實測於 2026-10-08），與
> `resilience-travel-assistant/src/lib/fixtures/golden/*.json` 逐字一致。
>
> ⚠️ 若正式專案目前的實際值與下表不同，**以真實數據為準**，不要回改數據來符合本文件。

**固定示範行程**：

| 欄位 | 值 |
|---|---|
| origin | `坑口（富寧花園）` |
| destination | `中環（交易廣場）` |
| arriveBy | `2026-10-13T09:00` |
| constraints | `maxExtraCost = 10`、`maxTransfers = 2` |
| dataQuality | `fixture`（三情景相同） |
| dataUpdatedAt | `2026-10-13T07:30:00+08:00`（三情景相同） |
| serviceDate | `2026-10-13` |

---

## normal（正常通勤）

| 欄位 | 值 |
|---|---|
| `status` | `ready` |
| `departAt` | `08:09` |
| `latestDepartAt` | `08:15` |
| `etaRange` | `08:54 – 09:04` |
| `confidence` | `high`（到達信心：高） |
| `action` | `depart_at`（按建議時間出發） |
| `primary` | **R1 港鐵主線（將軍澳線 → 港島線）** ・45 分鐘・轉乘 1 次・額外車費 $0 |
| `Plan B` | **R2 過海巴士（東區海底隧道）** ・65 分鐘・$6 |
| `switchCondition` | 「若出發前將軍澳線延誤超過 10 分鐘，改行 Plan B…」 |
| `switchDeadline` | `07:49` |
| `candidates` | R1 (45) / R3 (51) / R2 (65) |
| `excludedRoutes` | 無 |
| `reasons` / `basis` / `uncertainty` / `notices` | 5 / 7 / 2 / 1 條 |
| 頂欄狀態徽章 | `當前狀態：正常`（綠） |
| 風險 | 低風險・服務正常・人流一般 |

畫面：`screens/desktop-normal.png`、`screens/mobile-normal.png`

---

## heavy_rain（暴雨影響）

| 欄位 | 值 |
|---|---|
| `status` | `ready` |
| `departAt` | `07:58` |
| `latestDepartAt` | `08:12` |
| `etaRange` | `08:43 – 09:06` |
| `confidence` | `medium`（到達信心：中） |
| `action` | `depart_at`（按建議時間出發） |
| `primary` | **R1 港鐵主線（將軍澳線 → 港島線）** ・48 分鐘・轉乘 1 次・$0 |
| `Plan B` | **R2 過海巴士（東區海底隧道）** ・77 分鐘・$6 |
| `switchCondition` | 「若出發前將軍澳線延誤超過 15 分鐘，改行 Plan B…」 |
| `switchDeadline` | `07:29` |
| `candidates` | R1 (48) / R3 (55) / R2 (77) |
| `excludedRoutes` | 無 |
| `reasons` / `basis` / `uncertainty` / `notices` | 5 / 7 / 3 / 1 條 |
| 頂欄狀態徽章 | `當前狀態：暴雨影響`（琥珀） |
| 風險 | 中風險・服務延誤・人流一般 |

**天氣事實（來自 fixture，未經 UI 改寫）**：`黑色暴雨警告信號`、降雨 45 mm/h。

畫面：`screens/desktop-heavy-rain.png`、`screens/mobile-heavy-rain.png`

---

## disruption（交通中斷）← 同時是 `uncertain` 狀態實例

| 欄位 | 值 |
|---|---|
| `status` | **`uncertain`** |
| `departAt` | `07:22` |
| `latestDepartAt` | `07:38` |
| `etaRange` | `08:24 – 09:19` |
| `confidence` | **`low`**（到達信心：低） |
| `action` | `depart_at`（按建議時間出發） |
| `primary` | **R2 過海巴士（東區海底隧道）** ・82 分鐘・轉乘 0 次・$6 |
| `Plan B` | **R3 港鐵（鰂魚涌轉乘）** ・106 分鐘 |
| **`excludedRoutes`** | **R1 港鐵主線（將軍澳線 → 港島線）** —— 服務中斷（信號故障，坑口 ↔ 北角列車服務暫停） |
| `switchCondition` | 「若於坑口（北）巴士總站等候超過 15 分鐘仍未能上車，改乘 Plan B…」 |
| `switchDeadline` | `07:37` |
| `candidates` | R2 (82) / R3 (106) |
| `reasons` / `basis` / `uncertainty` / `notices` | 6 / 8 / 5 / 2 條 |
| 頂欄狀態徽章 | `當前狀態：交通中斷`（紅） |
| 風險 | 高風險・服務正常（R2 巴士本身正常）・人流高 |

**畫面必須同時出現：**

1. 琥珀色橫幅「**建議可用但不確定**」（因為 `status === "uncertain"`）
2. **完整的出行建議**（決策摘要、路線概覽、Plan B、切換條件、風險、理由）
3. 只有 1 格亮起的信心量表 + `到達信心：低`
4. 「其他候選路線」卡片內的 **`已排除路線`** 區塊，逐條列出 R1 與排除原因
5. 「我們不知道什麼」卡片，5 條 `uncertainty`

畫面：`screens/desktop-disruption.png`、`screens/mobile-disruption.png`

---

## 三情景一致性

- **共用同一個結果頁骨架**，只替換真實狀態與資料（不是三套頁面）。
- 情景本身**由資料與系統判定**，使用者不選擇（見 `DEMO-MODE.md`）。
- 三個情景的 `departAt` / 主路線 / 信心**彼此不同**，且由規則產生、可重複驗證。
