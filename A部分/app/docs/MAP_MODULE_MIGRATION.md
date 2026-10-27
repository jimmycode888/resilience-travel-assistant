# 地图模块迁移评估记录 · CampusMapApp → 韧性出行助手第二阶段

记录日期：2026-10-09
评估人：成员 A
来源项目：<https://github.com/jijie114514-oss/CampusMapApp>（嶺南大學校園地圖 v2.1 · Electron / Web）
用途：为第二阶段「地图交互」与「路径读取」提供可复用资产

---

## 0 结论

**可以迁移，但不是整套搬过来，而是分三层取用。**

| 层级 | 内容 | 迁移成本 | 价值 |
|---|---|---|---|
| **Tier 1 直接可用** | 分步指示生成、路径 Provider 错误码分类、定位降级 | 低（移植为 TS 即可） | **高** |
| **Tier 2 模式复用** | Leaflet 容器、官方图叠加、POI 多层兑底 | 中（重写为 React/TS） | 中 |
| **Tier 3 不采用** | 校园数据、Semantic Zoom 策略引擎、矢量底图自定义样式 | — | 超出时间与精度需求 |

**两个决策前提（已确认）**

1. **校园内数据不记录、不迁移**（无相关场景）。
2. **地图不需要校园地图那么精确** → Semantic Zoom 策略引擎（585 行）
   与矢量底图自定义样式（146 行）**不迁移**，只用 OSM 栅格瓦片 + Leaflet。

**最值得拿的**（我们的项目目前完全没有）：

1. **分步导航指示生成**（中英双语转向词、八方位、depart/arrive 特判）
2. **浏览器定位的三条降级路径**（权限拒绝 / 位置不可用 / 超时，已分错误码）

其余部分与我们已经建好的 `src/lib/route/**` 高度重叠，**应合并而不是替换**。

---

## 1 来源项目概况

| 项目 | 内容 |
|---|---|
| 技术栈 | 原生 JS（IIFE 全局命名空间 `App.xxx`）＋ Leaflet ＋ MapLibre GL（经 `leaflet-maplibre-gl` 适配）＋ OSM |
| 构建 | **无构建步骤**，无 `package.json`，库以 vendor 方式提交 |
| 规模 | 受版本控制 39 个文件；`src/` 2817 行（14 文件）；`vendor/` 约 1.3MB；`data/` 224KB |
| 底图 | 矢量瓦片 **OpenFreeMap**（`tiles.openfreemap.org/planet`，OpenMapTiles schema）—— **免密钥、免注册** |
| 路由 | **FOSSGIS OSRM** `routed-foot`（步行） |
| POI | **Overpass API**（按视口查询）＋ 内置快照兜底 |
| 测试 | ❌ **无**（README 提到的 `tools/smoke-display.cjs`、`regression.cjs`、`screenshot.cjs` 未提交，`tools/` 目录不存在） |
| 许可 | 顶层**未声明 LICENSE**；`vendor/maplibre/` 内含 Leaflet BSD-2 与 MapLibre BSD-3 许可文件 |
| 提交历史 | 仅 1 个提交（`c9e7d44`），无分支演进记录 |

> ⚠️ 因为是你自己的项目，代码迁移没有授权障碍；但 **vendor 内的第三方库、嶺南大學校园数据与官方校园图各有其条款**，见第 6 节。

---

## 2 与我们项目的技术对照

| 维度 | CampusMapApp | 我们的第二阶段 | 迁移含义 |
|---|---|---|---|
| 框架 | 无（IIFE + `window`） | Next.js 15 + React 19 + TS | **必须改写**：`window.xxx` 在 import 时求值会让 SSR 崩 |
| 库引入 | vendor 目录 | npm | 改用 `leaflet` / `maplibre-gl` / `@maplibre/maplibre-gl-leaflet` |
| 地图引擎 | Leaflet 容器 ＋ MapLibre **只替换最底层瓦片层** | 工作流写的是「MapLibre **或** Leaflet」 | 该仓库**验证了混合模式可行**，见第 5 节风险 |
| 状态 | 全局 `App.state` | React 状态／props | 策略层需依赖注入 |
| 路由抽象 | `routing-service` + `providers/osrm.js` | `src/lib/route/adapter.ts` + `providers/osrm.ts` | **同一模式，应合并** |
| 测试 | 无 | vitest，224 测试 | 迁移的纯逻辑要**由我们补测试** |

---

## 3 Tier 1 · 可直接迁移（优先做）

### 3.1 分步导航指示生成 ⭐ 我们完全缺失

| 项 | 内容 |
|---|---|
| 来源 | `src/routing/providers/osrm.js` 内的 `instructionFor()` / `compass()` / `turnWord()` / `streetSuffix()` |
| 能力 | 八方位（北/東北/東…）、转向词（左轉/右轉/稍向左/向左急轉/掉頭）、`depart` 与 `arrive` 特判、目的地左右侧提示、**中英双语** |
| 迁移到 | **新建 `src/lib/route/instructions.ts`**，输出中文分步指示 |
| 为什么重要 | 我们的 `Journey.segment` 目前只有「起點、終點、時長、幾何」，**没有给使用者看的步行/换乘指示**。这是 `navigation.js` 与结果页都要用的东西 |
| 改动 | 把 IIFE 改成纯函数并加类型；`App.state.lang` 改成参数传入（我们目前只需要中文） |

### 3.2 浏览器定位与三条降级路径 ⭐ 正好补上 D 的缺口

| 项 | 内容 |
|---|---|
| 来源 | `src/geolocate.js`（70 行） |
| 能力 | 权限拒绝(code 1) / 位置不可用(2) / 超时(3) **分别给出用户可读消息**；并发呼叫去重（`locatingPromise`）；精度圈；`flyTo`；`distanceTo` |
| 迁移到 | `src/lib/geo/geolocation.ts` + 一个 React hook |
| 为什么重要 | 我们的第二阶段工作流要求「无定位权限 / 无网络 / 无路线」三条降级路径，这份实现**已经把前两条处理好并分了错误码** |
| 改动 | `App.toast()` 改为回传结果对象；`L.marker`／`L.circle` 由组件层负责 |

### 3.3 路径 Provider 的错误码分类（合并进我们的模块）

| 项 | 内容 |
|---|---|
| 来源 | `src/routing/routing-service.js`（68 行） |
| 能力 | Provider 注册表、坐标合法性校验（`INVALID_COORDINATE`）、`CONFIG`（找不到 provider）、`TIMEOUT`（**区分「自己超时」与「上游报错」**） |
| 迁移到 | 合并进 `src/lib/route/adapter.ts` 的 `RouteResolutionErrorCode` |
| 现状差异 | 我们已有 `INVALID_DEPART_AT` / `NO_ROUTES` / `PROVIDER_FAILED`，**缺 `INVALID_COORDINATE` 与 `CONFIG`**，且未区分「超时」与「上游错误」 |
| 结论 | **增量合并**，不替换 |

### 3.4 不迁移：地图显示策略层（Semantic Zoom）

| 项 | 内容 |
|---|---|
| 来源 | `src/display-config.js`（277 行）＋ `src/display-strategy.js`（585 行） |
| 能力 | Semantic Zoom、`collisionRank` 标签碰撞消解、住宅抑制、贪心圆聚类、图标缩放、图例控件、搜索越级显示 |
| **决策** | **不迁移** |
| 原因 | ①**地图精度需求已降低**（不需校园级 z13–19 的逐级展开）；②780+ 行且深度耦合 `App.state`／`App.search`；③时间盒内收益低于成本 |
| 保留参考 | 若日后需要「地图上标签不重叠」的能力，再回来取 `collisionRank` 与碰撞消解算法（第 7 节已记录来源） |

---

## 4 Tier 2 · 模式可复用（需重写为 React/TS）

| 来源文件 | 行数 | 可复用的模式 | 落点 |
|---|---|---|---|
| `src/map-view.js` | 85 | Leaflet 初始化、自定义定位按钮 Control、**官方地图图片叠加层（已正北化，`L.imageOverlay` + bounds）** | `src/components/map/MapCanvas.tsx` |
| `src/poi.js` | 353 | Overpass 视口查询 ＋ **多层兑底**（持久化缓存 → 内置快照 → 空列表）；先输入关键字后完成查询的竞态处理 | **C 的 POI Adapter 候选** |
| `src/search.js` | 69 | 建筑代码 / 教室代码 / 中英文名 / 描述统一匹配器，代码命中优先于文本匹配 | 与 `geo/places.ts` 的 `searchPlaces` 合并 |
| `src/navigation.js` | 330 | 导航状态机、地图自选起点、取消导航 | `src/components/map/` |

> `src/ui.js`（461 行）与 `style.css` 是**普通前端界面**，与我们的结果页差异大（它是校园信息浏览，我们是出行决策），只借鉴信息层级，不建议逐行移植。

---

## 5 Tier 3 · 校园数据 —— **不采用**

**决策：不迁移、不记录。**

原因：我们的 Demo 场景是中环—福田跨境走廊，**没有「校园目的地」需求**；
校园数据（建筑轮廓、31 个校园地点、官方校园图）在这个场景下没有用处。

同时避免了版权确认开销（`map-north.png` 是官方校园图，版权属嶺南大學；
校园数据的再散布许可也未声明）。

> 附带发现（供参考，不作为迁移目标）：`data/rooms.json` 仅 8 行、`data/poi-seed.js` 仅 5 行，
> 即使需要校园场景，这两个文件也几乎没有可用内容。

---

## 6 许可与署名义务（迁移后必须满足）

| 组件 | 许可 | 义务 |
|---|---|---|
| Leaflet | BSD-2-Clause | 保留版权声明 |
| MapLibre GL JS | BSD-3-Clause | 保留版权声明 |
| `leaflet-maplibre-gl` | 见 `vendor/maplibre/LEAFLET-ADAPTER-LICENSE` | 保留许可文件 |
| OpenStreetMap 数据 | ODbL | **必须署名** `© OpenStreetMap contributors` |
| OpenMapTiles / OpenFreeMap | 见其站点条款 | 署名；**确认可否商用与请求量限制** |
| FOSSGIS OSRM | 公共实例，有使用政策 | 不得滥用；正式产品需自建或换付费源 |
| Overpass API | 使用政策（限流） | 控制查询频率；**不得当作生产级依赖** |
| 嶺南大學校园数据／官方图 | **未声明** | **使用前须确认授权** |

---

## 7 不建议迁移

| 内容 | 原因 |
|---|---|
| Electron 打包部分 | 我们只交付移动端友好的 Web 版本（第一阶段已明确） |
| **校园数据（建筑轮廓／校园地点／官方校园图）** | **无校园场景；且版权未声明** |
| **地图显示策略层（`display-config.js` + `display-strategy.js`）** | **地图精度需求已降低，780+ 行且深度耦合全局状态；时间盒内收益低于成本** |
| **矢量底图自定义样式（`vector-basemap.js`）** | 先用 OSM 栅格瓦片即可；避免双引擎 zoom 换算复杂度 |
| `src/rooms.js` 房间号查询 | 与出行决策无关 |
| 全局状态 `App.state` | 与 React 状态模型冲突，改为 props／store |
| vendor 目录下的库文件 | 应改用 npm 依赖，避免 1.3MB 重复提交 |

> 若日后确实需要「地图标签不重叠」，再单独取 `display-strategy.js` 的 `collisionRank`
> 与屏幕空间贪心碰撞消解算法（其余 8 项策略不需要）。

---

## 8 迁移风险与对策

| 风险 | 说明 | 对策 |
|---|---|---|
| **SSR 崩溃** | 原代码是 `window` 全局，Next.js 会在服务端 import 时执行 | 一律 `"use client"`；地图库用 `dynamic(() => import(...), { ssr: false })` |
| **双地图引擎复杂度** | Leaflet 容器 ＋ MapLibre 底层瓦片，两套 zoom 体系（256px vs 512px）差 1 | 第二阶段**先只用 Leaflet + OSM 栅格**；矢量底图列为可选升级 |
| **无测试可继承** | 原仓库无任何测试，`tools/` 未提交 | 迁移的纯逻辑（显示策略、指示生成、定位降级）**必须由我们补 vitest 用例** |
| **策略层耦合全局状态** | `display-strategy.js` 直接读 `App.state` / `App.search` | 迁移时改为参数注入，保持纯函数 |
| **外部服务依赖** | Overpass / OSRM / OpenFreeMap 都是公共实例，有限流 | 沿用我们的三退路（live → cached → fixture）；不得当作生产依赖 |
| **版权不确定** | 校园数据与官方图未声明许可 | 使用前确认；不确定就不使用 |

---

## 9 迁移落点（对应现有工作流）

| 我们的阶段 | 迁移什么 | 负责人 | 状态 |
|---|---|---|---|
| **W4** 供应商 | 新增 `src/lib/route/instructions.ts`（分步指示） | A | ✅ 已完成 |
| **W4** 供应商 | 合并 `routing-service` 的错误码分类（`INVALID_COORDINATE` / `CONFIG` / 超时区分） | A | ✅ 已完成 |
| **W8** 地图交付 | 定位三降级路径（`src/lib/geo/geolocation.ts`） | D（A 已代迁） | ✅ 已完成 |
| **W8** 地图交付 | Leaflet 容器 ＋ 官方图叠加模式（OSM 栅格瓦片，不接矢量底图） | D | 待做 |
| POI 数据 | `poi.js` 的「Overpass ＋ 缓存 ＋ 快照」多层兑底模式 | C | 待评估 |
| ~~策略层~~ | ~~Semantic Zoom / 碰撞消解~~ | — | **不迁移** |

**迁移顺序**（已按“价值高、耦合低”排序）：

```text
1  src/lib/route/instructions.ts        分步指示（纯函数，最独立，立刻可用）
2  src/lib/geo/geolocation.ts           定位三降级路径（D 的 W8 前置）
3  src/lib/route/adapter.ts             合并错误码分类（增量）
```

---

## 10 待办

- [x] **A**：迁移 `instructions.ts` 分步指示（含测试）
- [x] **A**：迁移 `geolocation.ts` 定位三降级路径（含测试）
- [x] **A**：合并 `routing-service` 错误码分类
- [ ] **D**：Leaflet 容器（OSM 栅格瓦片）与风险图层实现
- [ ] **C**：评估 Overpass 作为 POI 数据源（含限流与使用条款）
- [ ] **某人**：确认 OpenFreeMap / FOSSGIS OSRM / Overpass 的使用条款与商用限制
- [x] ~~确认嶺南大學数据授权~~ → 已决策不使用校园数据，无需确认
- [x] 迁移的纯逻辑已补 vitest 用例（原仓库无测试可继承）

---

## 11 本地副本

评估时克隆的位置：`/tmp/CampusMapApp`（临时，随时可重新克隆）

```bash
git clone --depth 1 https://github.com/jijie114514-oss/CampusMapApp.git
```

---

## 12 迁移完成记录（2026-10-09）

### 新增文件

| 文件 | 行数 | 迁移自 | 说明 |
|---|---|---|---|
| `src/lib/route/instructions.ts` | 268 | `providers/osrm.js` | 分步指示：八方位、转向词、depart/arrive 特判、`describeSegment` / `describeJourney` / `describeModes` |
| `src/lib/geo/geolocation.ts` | 215 | `src/geolocate.js` | 定位四类降级（UNSUPPORTED / PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT）＋ **防御性逾时**（原版没有） |
| `src/test/instructions.test.ts` | 216 | 新增 | 21 测试（原专案无测试） |
| `src/test/geolocation.test.ts` | 205 | 新增 | 18 测试（原专案无测试） |

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/lib/route/adapter.ts` | `RouteResolutionErrorCode` 新增 `INVALID_COORDINATE` / `CONFIG` / `PROVIDER_TIMEOUT`；新增 `ProviderTimeoutError`；新增 `providerId` 选项；**区分「逾时」与「上游报错」的 notice 文案** |
| `src/test/route-crossborder.test.ts` | 新增 4 个错误码分类测试 |
| `scripts/probe-route.test.ts` | 探针印出逐步指示与一行摘要 |

### 实测输出（`npm run probe:route`）

```text
中環 → 福田（tier: fixture）
• 經落馬洲支線口岸｜81 分｜口岸 lok-ma-chau｜排隊 12–28 分（low）
   摘要：步行 → 港鐵 → 港鐵 → 跨境通關 → 港鐵
     1. 步行前往 中環站（5 分鐘）
     2. 乘 港島線 至 金鐘站（3 分鐘）
     3. [轉乘] 乘 東鐵線 至 落馬洲站（52 分鐘）
     4. 經 落馬洲支線口岸 通關（預計排隊 12–28 分鐘，估算，置信度低）
     5. 乘 深圳地鐵 4 號線 至 福田（9 分鐘）
```

### 迁移时修正的两个问题（原实作的缺口）

1. **定位没有防御性逾时**：原版完全依赖浏览器自行回呼，若装置不回呼就永远卡住。
   新版加了 `timeoutMs + 500` 的第二层逾时（已用假时钟测试）。
2. **没有区分「逾时」与「上游报错」**：原版两者都归给 `TIMEOUT` 或直接外抛。
   新版新增 `ProviderTimeoutError`，让调用端知道是「来源没回应」还是「来源说算不出来」。

### 验收

```text
npm run verify → lint ✅ typecheck ✅ 20 檔案 / 267 測試 ✅ build ✅
（基線 224 → 267，新增 43 個測試）
```
