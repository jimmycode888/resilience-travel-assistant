# UI Baseline v1.0 — 已凍結（Reference only）

本目錄是 **韌性出行助手** 的 **UI Reference / UI Baseline v1.0**，凍結於 **2026-10-08**。

- **完整交接包（給前端成員 D）** → [`UI-Handoff-v1.0/`](./UI-Handoff-v1.0/)
- **Baseline 清單與已知事項** → [`UI-Handoff-v1.0/BASELINE-MANIFEST.md`](./UI-Handoff-v1.0/BASELINE-MANIFEST.md)

## 凍結範圍

自凍結起，不再主動修改：

- `src/App.tsx` 的 UI 結構
- `src/index.css` 的視覺系統
- 資訊層級、三種情景、五種狀態
- API / fixture 對齊邏輯

## 執行方式

```bash
cd ui-review-prototype
pnpm install
PORT=8443 pnpm run dev        # http://localhost:8443/
PORT=8443 pnpm run dev        # Demo 機制：http://localhost:8443/?demo=1
```

## 重要

- 本目錄是 **UI Reference**，**不是** production source code。
- 事實來源仍是正式專案 `/workspace/八校黑客松/resilience-travel-assistant/` 的 API Contract / production API / fixture。
- 任何後續 UI 變更**必須先提出新的 Baseline 版本**，不得直接改動 v1.0。
