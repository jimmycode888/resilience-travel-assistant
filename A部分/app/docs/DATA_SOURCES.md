# 数据来源与限制（B 更新）

固定 normal、heavy_rain、disruption 始终使用已标记 fixture 的 2026-10-13 样本，完全不联网。live 模式可选启用官方天气、港铁抵站和运输署公告。行车时间、步行时间、额外费用仍是演示估算，不是官方全程 ETA。

## 来源与字段

| 来源 | 官方输入 → 统一字段 | 状态与刷新 | 限制 |
|---|---|---|---|
| [HKO 天气](https://www.hko.gov.hk/en/abouthko/opendata_intro.htm) | rhrread.icon → condition；temperature 中将军澳站 → temperatureC；updateTime → weather.updatedAt | 已实作、实测。报告每小时及更新时；warnsum 随警告变更 | rainfall 分区 max 不是沿路点雨量率，rainfallMmPerHour=null；temperature 缺站为 null |
| HKO warnsum | 生效 name/code → warning；过滤 CANCEL 和过期警告 | 与报告并行请求 | 无警告为 null；issueTime 与 updateTime 不同。preAnnounceAt 不在该响应中 |
| [港铁 Next Train](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data) | TKL-HAH 往 NOP；ISL-NOP/ISL-QUB 往 KET 的 time → arrival.at | 已实作、实测。客户端 30 秒复用，来源效期 2 分钟 | ttnt/valid 是官方字典 dummy 字段，不用；isdelay 无延误分钟值；alert 不等于全线停驶 |
| [城巴 ETA](https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta) | CTB/690S/002910/I → arrivals | 已实作、实测。30 秒复用，来源效期 2 分钟 | 只涵盖城巴；无 ETA / 九巴时段不代表停驶；候选起站明德邨不是现行 R2 坑口北，尚未接入路线计算 |
| [运输署第二代交通消息](https://data.gov.hk/en-data/dataset/hk-td-tis_19-special-traffic-news-v2) | XML 非 CLOSED 的走廊相关公告 → incidents | 已实作、实测，按请求获取 | ANNOUNCEMENT_DATE 为本条公告时间，非首次事件时间；关键词相关不能证明路线中断；无消息不能证明正常 |
| [港铁静态资料](https://data.gov.hk/en-data/dataset/mtr-data-routes-fares-barrier-free-facilities) | 站序、坑口→中环票价核查 | 月度数据，一次核查存档 | 未替换共享路线。票价不包含公交差额或优惠，不能自动算额外费用 |

官方字段文档：[HKO API](https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf)、[天气图示](https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm)、[港铁 Next Train 字典](https://opendata.mtr.com.hk/doc/Next_Train_DataDictionary_v1.7.pdf)、[城巴字典](https://www.citybus.com.hk/datagovhk/bus_eta_data_dictionary.pdf)、[运输署 XML 字典](https://static.data.gov.hk/td/special-traffic-news/en/Data_Specification_for_STN_Eng_v4.0.pdf)。

这些已核查官方端点无需密钥。遵守各数据提供者使用条款并标注来源；开放资料不代表代码／商标／完整文档可任意转载。

## 启用与使用

.env.example 默认不开启网络。可在环境配置：

```dotenv
HKO_OPEN_DATA_BASE_URL=https://data.weather.gov.hk/weatherAPI/opendata/weather.php
TD_SPECIAL_TRAFFIC_NEWS_URL=https://www.td.gov.hk/en/special_news/trafficnews.xml
MTR_NEXT_TRAIN_ENABLED=1
```

`scenario=live` 时 HKO 天气进入快照，TD 公告进入 incidents，港铁抵站观察进入 route.note；交通仍 unknown，全程模型与静态费用仍 fixture。城巴资料由 `transportTimeClient.citybus()` 独立交付，待 A 确认起站、服务窗口与路线映射。

## 超时、缓存与降级

- 主适配器默认每源 2500ms 强制超时；单源失败会记录 notices，其他成功源可保留。live → cached → normal fixture。
- snapshot 快取最多 10 分钟；expiresAt 取天气报告 +60 分钟、擷取 +10 分钟与已接入铁路观测 +2 分钟中较早值。回退不会延长效期。整体快照可过期并由 C 降级，不能当最新事实。
- 独立 TransportTimeClient 有30秒读缓存和2分钟来源效期；失败使用仍有效 cached，否则固定空资料 fixture。空回退不含虚构班次。
- 所有缓存进程内保存，重启后清空，无用户位置或个人行程持久化。
- ISO 时间必须带时区；港铁无时区时间按官方香港本地格式转换。TD 本地公告时间显式转换为 +08:00。
- 校验畸形 JSON/XML、实体声明、有限数值、方向、过期响应、未知状态；不把上游格式泄漏给 C。

## 品质口径与决策边界

snapshot.quality / resolution.quality 始终一致。cached 来源不冒充 live；成功来源才加入 sources。顶层 live 表示本请求使用实时天气等资料，**不表示全程实时**，sources 中的行程时间／费用保留 fixture。A/C 应确认这一混合口径；见 B_COLLABORATION_REVIEW.md。

delayMinutes=0 在 unknown 路线是契约占位，不能解释为无延误。下一班车 ETA 是当前车站抵站，不是未来出发时刻的候车预测、班距、全程旅时或终点 ETA。C 已有 unknown 保守规则，B 不改决策算法。

## 实测与验收

- docs/data/live-source-check.json：一次官方端点实测，包括三个港铁站、城巴站、HKO 与 TD，以及 live 快照。文件 checkedAt 表示核查时间，不是当前实时接口。
- docs/data/official-bus-service-reference.json：2026-03-31 官方时刻表中的 690S 起站、服务日及城巴／九巴班次子集，不等于实时 ETA。
- docs/data/official-rail-reference.json：核查时的官方站序和票价子集，保留 sourceUrl，非决策输入。
- 手动联网核查：`npx vitest run --config scripts/probe.config.ts`。标准测试不联网。
- 新增 transport-times.test.ts 涵盖方向、dummy 字段、空 ETA、警示、HTTP/格式错误、来源过期、缓存回退、TD 时间及 XML、部分源超时。

共享路线仍需处理公交起站、服务日窗口、R1/R3 共用区段及不一致行车时间，具体问题在 B_COLLABORATION_REVIEW.md。未核实的全程旅时继续 fixture，不能承诺真实准时率。

## 跨境数据源（单独一节）

> 跨境是第二阶段的最高优先级。**排队时间没有任何公开官方来源**（香港侧、深圳侧皆无 API；
> 开放数据目录检索 `control point waiting time` 命中 0 条），因此只能由**可观测的运力信号**估算，
> 且一律输出「区间 + 置信度 + 估算」标注。实作见 `src/lib/adapters/port-conditions.ts`。

### 口岸基础数据（P0）

| 项目 | 来源 | 状态 | 已知限制 |
|---|---|---|---|
| 口岸清单、开放时间、可通行方式 | `src/lib/geo/ports.ts`（6 个口岸） | ⚠️ **未官方核实**（`coordinatesVerified: false` ×6） | 现有数值为近似参考值，**未核实前不得当官方事实对外说明** |
| 口岸香港侧／深圳侧节点坐标 | 同上 | ⚠️ 同上 | 仅用于结构化判定跨境边界，非导航级精度 |

### 口岸运力信号（排队估算的依据，全部公开免费、无需密钥）

| 口岸 | 来源 | 官方识别码 | 抓取方式 | 失败退路 | 已知限制 |
|---|---|---|---|---|---|
| 落马洲支线 | 港铁 Next Train · 九巴 B1 | `EAL-LMC`（往 ADM）· stop `81567ACCCF40DD4B` | 每源 2.5s 超时 | cached（2 分钟）→ fixture | 只有抵站预测，无排队人数；港铁 `isdelay` 无分钟值 |
| 罗湖 | 港铁 Next Train | `EAL-LOW`（往 ADM） | 同上 | 同上 | 只有铁路一种运力信号 |
| 深圳湾 | 城巴 B3X／B3／B3M | stop `003208` | 同上 | 同上 | 只有城巴，未含其他营办商 |
| 香园围 | 城巴 B7／B8 · 九巴 B9 | stop `003714` · stop `3ED28170B05A236E` | 同上 | 同上 | 同上 |
| 皇岗 | **无公开 ETA API**（皇巴） | — | — | 先验估算 | 只能 low 置信度，**不得用其他口岸的班次冒充** |
| 文锦渡 | **无公开 ETA API** | — | — | 先验估算 | 同上，且班次疏落 |

巴士一律取「以口岸为起点」的方向；stop id 以官方 `route-stop`／`stop` API 逐站查名核对得出。

### 排队估算模型

```
排队区间 = 先验区间(口岸性质 × 时段) + 週末 + 深夜修正 + 恶劣天气 + 铁路中断
         + 口岸公告事件 + 运力变薄（实测班距 ≥ 常态班距 ×1.6）
```

- 口岸性质：`rail`（落马洲、罗湖）／`coach`（深圳湾、香园围、皇岗）／`remote`（文锦渡）。
- 时段：北向高峰 07:00–10:00、南向高峰 17:00–20:00、深夜 22:30 后。
- 口岸未开放时**不输出数字**，直接判不可行。
- **置信度上限一律 `medium`**（全是间接代理），无运力信号或退回 fixture 时为 `low`。

### 跨境部分的硬限制（必须与结论一起讲）

1. 没有任何来源直接观测排队本身；班距是时刻表驱动、不是需求驱动，**不能反推客流**。
2. 基础区间是**先验假设**，未经历史排队数据校准。
3. 皇岗、文锦渡无公开信号，只有先验估算。
4. 口岸开放时间／坐标尚未官方核实——判定「口岸开没开」的地基仍未稳。

### 启用与实测

```dotenv
TEAM_LIVE_DATA_ENABLED=1   # 或设定 HKO_OPEN_DATA_BASE_URL／TD_SPECIAL_TRAFFIC_NEWS_URL／MTR_NEXT_TRAIN_ENABLED
```

- 正式端点的实作：`src/lib/adapters/team-data.ts`（`resolveRouteData`）。
- 手动联网探测：`npx vitest run --config scripts/probe-team-data.config.ts`（标准测试不联网）。
- 一次实测存檔：`docs/data/team-data-probe-2026-10-12.json`（2026-10-12：罗湖、深圳湾 medium；落马洲当时无班次可算，low）。


## 2026-10-14 补齐与当前口径（取代上方对应旧状态）

- 六口岸开放时间与港方官方代表点已取得CSDI证据；入口／深圳侧未全部核实，不能把coordinatesVerified整项改true。详见`src/lib/adapters/data/port-facts.json`。
- 正式天气/公告现已用硬截止与独立有效缓存；resolver最多30秒复用，不再永久缓存departAt。
- 来源updatedAt与expiresAt取真实源时钟；公告采用本次采集时刻，不再采用行程出发时刻。
- 排队方向来自跨境段，时段取预计抵达口岸；当前观测不用于超过两小时的未来事实。
- 班距比较常数为未校准政策基准，不称官方班距。公众假期加入官方1823日历2025–2027。
- 690S联营补齐九巴独立观测；仍未映射现行R2起站。POI加入官方ALS，可查不到就回退空数据，不猜入口。
- 上水站／大学站两处地址代表点已核实；其余20处保留未核实。
- 新皇岗10/12迁移、地理契约与旧预览API404问题，见`B_补齐交付_2026-10-14.md`。
