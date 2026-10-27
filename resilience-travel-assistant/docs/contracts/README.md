# 契約存檔

這裡放**外部來源或歷史版本**的契約文件，原文不改動，只在檔首加上來源說明。
現行有效的契約仍然是根目錄的 [`API_CONTRACT.md`](../../API_CONTRACT.md)。

| 檔案 | 來源 | 狀態 | 接入記錄 |
|---|---|---|---|
| [`C_接口契约_v1_workbuddy.md`](./C_接口契约_v1_workbuddy.md) | 成員 C 用 WorkBuddy AI 產出（2026-10-06 分享連結匯入） | 草案；走廊與命名為結構佔位 | [`../DECISION_CONTRACT_CHANGE_REQUEST.md`](../DECISION_CONTRACT_CHANGE_REQUEST.md) |

## 讀這份存檔時要注意

1. 它用的是 **snake_case** 與 **`CORRIDOR_TM_KLW`（屯門 → 九龍西）** 的結構佔位；
   主體專案用的是 camelCase 與 **`tko-hang-hau-to-central`（坑口 → 中環）**。
2. 可沿用的是**欄位結構與三條設計原則**（模型不產生事實／缺失優於猜測／每個數字帶出處），
   而不是它假設的走廊。
3. 它提出的 `action`、`latest_switch_at`、`basis`、`uncertainty` 已以 additive 欄位接入主體，見
   [`../DECISION_CONTRACT_CHANGE_REQUEST.md`](../DECISION_CONTRACT_CHANGE_REQUEST.md)。
