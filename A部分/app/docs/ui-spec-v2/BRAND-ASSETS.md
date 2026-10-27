# 品牌資產說明 · BRAND ASSETS

Owner **E** ｜ 消費方 **D** ｜ 版本 v1.0 · 2026-10-10
適用：第二階段 UI 原型（`docs/ui-spec-v2/prototype/`）與後續 production 整合

---

## 1. 產品名稱

**韌性出行助手**（繁體）

- Header **必須**使用真實文字，**不得**把名稱合併進圖片。
- 圖形在左、名稱在右。

## 2. Slogan

**本次不使用 Slogan。**

- Header 只呈現「Logo 圖形 + 產品名稱」，不加入任何標語。
- 補充事實（供團隊參考）：目前專案**沒有任何文件把某句話正式定義為 slogan**；
  界面主標在一／二階段各有一套（第一階段「把複雜路況，變成一個清晰決定。」；
  第二階段「走哪條，何時走，心裡有數。」），且皆**硬編碼於元件**，不屬設計規範。
  若要正式定案 Slogan，須由 E／團隊決定，**本文件不自行創造**。

---

## 3. Logo 檔案與格式

### 3.1 原始母檔

| 項目 | 值 |
|---|---|
| 檔名 | `assets/logo-source-master-3000.png` |
| 原始檔名 | `logo 透明底.png`（專案外部提供） |
| 尺寸 | **3000 × 3000 px** |
| 格式 | PNG RGBA（**真實 Alpha 透明通道**，bit depth 8，非交錯） |
| 檔案大小 | 約 1.1 MB |

**透明性實測**（以 Pillow 讀取像素）：

| 檢查 | 結果 |
|---|---|
| 顏色類型 | `6 = RGBA`（**有真實 alpha**） |
| alpha 範圍 | 0 – 255（含完全透明與完全不透明） |
| 四角像素 | 全部 `(0,0,0,0)` → **無多餘背景** |
| 棋盤格 | **未烘焙進圖片**（四周為真透明，非灰白方格） |
| 完全透明像素佔比 | 71.7% |
| 圖形實際範圍（bbox） | `(357,440) – (2643,2560)` → 2286 × 2120 |

> ✅ **可直接放在網頁上**，不需去背。

### 3.2 是否為「多版本拼圖」

**不是。** alpha 分佈圖顯示為**單一連續圖形**（六角形外框 + 內部斜向車道線），
**沒有**四版本拼貼、**沒有**文字、**沒有** Slogan、**沒有**背景。

> ⚠️ 注意：本資產**只有單一品牌圖形**，未提供「四種版本對照板」。

### 3.3 原型使用的衍生資產

| 檔名 | 尺寸 | 格式 | 用途 |
|---|---|---|---|
| `logo-symbol.png` | 512 × 512 | PNG RGBA | **Header 主用**（去邊留白後置中，保留透明） |
| `logo-symbol-256.png` | 256 × 256 | PNG RGBA | 備用（低解析度情境） |
| `favicon.png` | 64 × 64 | PNG RGBA | 瀏覽器分頁圖示（見 §6） |
| `favicon-180.png` | 180 × 180 | PNG RGBA | `apple-touch-icon` |
| `logo-source-master-3000.png` | 3000 × 3000 | PNG RGBA | 母檔（不直接用於頁面） |

**衍生方式**：以 alpha bbox 裁切 → 補成正方形畫布並置中 → LANCZOS 縮放。
**未改變圖形本身**（未重新設計、未改色、未加裝飾或動畫）。

---

## 4. Header 組合形式

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  韌性出行助手          ● 當前狀態：正常 │ 資料更新：…  │
└──────────────────────────────────────────────────────────────┘
   圖形      真實文字（非圖片）        系統狀態        資料時間
```

| 規則 | 說明 |
|---|---|
| 排列 | 圖形在左、名稱在右 |
| 對齊 | flex + `align-items:center` → 垂直居中（實測 icon 與文字中心線一致） |
| 名稱 | **真實文字**，不合併進圖片 |
| 裝飾 | **不加** 背景、邊框、光暈、陰影、動畫 |
| 佈局 | **不改變**既有 Header 高度與資訊層級 |

### 4.1 尺寸建議

| 視口 | Logo 尺寸 | 實測結果 |
|---|---|---|
| 桌面（1440 × 1000） | **32 × 32 px** | Logo 32px、Topbar 高度 **64px**（與加入前相同）、產品名 1 行 |
| 行動（390 × 844） | **28 × 28 px** | Logo 28px、產品名 1 行、**無異常換行**、無橫向溢出 |

> 一般建議範圍：桌面 28–36px、行動 24–32px。**不得大於產品名字高**，避免搶過核心出行資訊。

---

## 5. 品牌顏色

### 5.1 既有 Design Token（**沿用，不新增**）

| 用途 | Token | 值 |
|---|---|---|
| 品牌藍 | `--c-primary` | `#2F6FE0` |
| 深藍 | `--c-primary-strong` | `#245FC4` |
| 淺藍 | `--c-primary-soft` | `#EAF1FE` |
| 深色文字 | `--c-text-primary` | `#18222D` |

### 5.2 ⚠️ 待確認：Logo 用色與 Token 不完全一致

實測 Logo 圖形的主要不透明色為 **`#0043C3`**（另有淺藍 `#ACCCFE`），
與 Token 的深藍 `#245FC4` **並不相同**。

| 做法 | 決定 |
|---|---|
| 重新調色 Logo 以對齊 Token | ❌ **不做**（不得重新設計 Logo） |
| 修改 Design Token 去遷就 Logo | ❌ **不做**（不得擅自改動設計系統） |
| 現況 | ✅ Header 直接使用 Logo 原色；**記錄為待 E／團隊確認事項** |

> E 判斷建議（僅供參考，未執行）：Logo 原色可視為**品牌資產自有色**，與介面語意色分開管理；
> 若團隊要求「Logo 必須等於 `#245FC4`」，屬**品牌決策**，需提供調色後的正式版本，不由前端自行改色。

---

## 6. 正式 Logo 與 App 圖標的區別

| 類型 | 用途 | 背景 | 是否提供 |
|---|---|---|---|
| **Header Logo**（正式品牌圖形） | 網頁 Header | **透明** | ✅ 已提供（`logo-symbol.png`） |
| **Favicon**（分頁圖示） | 瀏覽器分頁 | 白色圓角底（**衍生**） | ✅ 已提供（`favicon.png` / `favicon-180.png`） |
| **App 圖標（藍底）** | 安裝到主畫面／App Store | 品牌藍底 | ❌ **未提供** |

**重要區分**：

- `favicon.png` 是**從透明 Logo 衍生的**，用**白色圓角底**讓它在深／淺色分頁列都可辨；
  它**不是**藍底 App 圖標，**不可**當作 App 圖標使用。
- **藍底 App 圖標目前缺件** → 若 D 需要 PWA／App 圖標，屬**待補資產**（見 §9）。

---

## 7. 檔案位置

```
docs/ui-spec-v2/prototype/assets/
├── logo-source-master-3000.png   3000×3000  母檔（透明）
├── logo-symbol.png                512×512   Header 主用（透明）
├── logo-symbol-256.png            256×256   備用
├── favicon.png                     64×64    分頁圖示（白底圓角）
└── favicon-180.png                180×180   apple-touch-icon
```

引用方式（原型已實作）：

```html
<link rel="icon" type="image/png" href="assets/favicon.png">
<link rel="apple-touch-icon" href="assets/favicon-180.png">
...
<img class="brand-logo" src="assets/logo-symbol.png" alt="" width="512" height="512" aria-hidden="true">
<span class="brand-name">韌性出行助手</span>
```

> `alt=""` + `aria-hidden="true"`：圖形為**裝飾**，語意由相鄰的產品名稱文字承擔（無障礙）。

---

## 8. Production 接入說明（給 D）

> ⚠️ **原型是 Reference，不是 production 程式碼。** 不要把 `prototype/` 整個複製進 production。

D 需要做的是：

1. **把兩個資產檔複製到 production 的靜態資源目錄**（如 `public/`）：
   `logo-symbol.png`（Header 用）、`favicon.png`（分頁圖示）。
2. **在既有 Header 元件**（`A部分/app/src/app/layout.tsx` 的 `<header>`）把純文字品牌名改為「圖形 + 文字」組合。
3. **沿用既有設計規範**（`DESIGN-TOKENS-v2.md`），**不要**新增品牌色 Token。
4. **保持既有 API 與業務邏輯不變**。
5. 在 **1440×1000 與 390×844** 驗證 Header：對齊、無換行、無溢出、Topbar 高度無異常增高。
6. **提供截圖交由 E 做視覺驗收**。

**實作要點**（對應原型的做法，供 D 參考）：

```css
.brand { display: flex; align-items: center; gap: 10px; }
.brand-logo { display: block; width: 32px; height: 32px; flex: 0 0 auto; object-fit: contain; }
.brand-name { white-space: nowrap; }        /* 避免產品名換行 */
@media (max-width: 700px) { .brand-logo { width: 28px; height: 28px; } }
```

> production 的 Header 目前是 `<Link>韌性出行助手</Link>`（純文字），
> **Logo 應接在這裡**；不要改動右側的走廊標示與其他元素。

---

## 9. 待確認事項

| # | 事項 | 需要誰 | 級別 |
|---|---|---|---|
| 1 | **Logo 藍色 `#0043C3` 與 Token 深藍 `#245FC4` 不一致** —— 是否需提供調色版，或維持「品牌自有色」 | **E / 品牌方** | P1 |
| 2 | **藍底 App 圖標缺件** —— PWA／主畫面圖標是否為第二階段範圍 | **E + A** | P2 |
| 3 | **Slogan 是否正式定案** —— 目前專案無正式定義，界面主標一／二階段不一致 | **E / 團隊** | P1 |
| 4 | Logo 是否需要在深色背景（如 `--c-bg-deep` 深色卡）上使用淺色版本 | **E** | P2 |
| 5 | production 是否也需要 favicon（目前 production 未設定） | **D + E** | P2 |

---

## 10. 本次未做的事（刻意）

- 未重新設計 Logo 圖形、未改色、未加裝飾或動畫。
- 未加入 Slogan。
- 未把四種版本放進 Header（本資產本來就只有單一圖形）。
- 未修改 `DESIGN-TOKENS-v2.md`、`RISK-VISUAL-SPEC-v2.md`、`MAP-LAYERS-SPEC-v2.md` 或任何既有規範。
- 未修改 production 的 `src/`、favicon 或任何設定。
