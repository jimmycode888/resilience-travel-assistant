# UI Prototype 运行报告（独立 UI Review 副本）

- **日期**：2026-10-07
- **来源**：`Responsive AI Travel Assistant UI.zip`（从 Figma Make 导出的 UI Prototype，**不是**团队正式前端代码）
- **副本位置**：`/workspace/八校黑客松/ui-review-prototype/`
- **原始项目**：`/workspace/八校黑客松/resilience-travel-assistant/` —— **未改动任何文件**（只读取）
- **约束遵守**：未修改任何代码；未接入新 API；未改动数据结构；未改动产品逻辑；未执行 `git` 写操作

---

## 1. 项目如何运行

技术栈：**React 19 + Vite 8 + TypeScript 5.9 + Tailwind CSS v4**（Figma Make 导出的标准 Vite 应用）。

```bash
cd "/workspace/八校黑客松/ui-review-prototype"
pnpm install            # 首次；本机已执行，node_modules 已就绪
PORT=8443 pnpm run dev  # 开发服务器 → http://localhost:8443/
```

其它可用指令：

| 指令 | 用途 | 本次验证结果 |
|---|---|---|
| `pnpm run dev` | Vite 开发服务器（HMR） | ✅ 360ms 启动，运行中 |
| `pnpm run build` | 生产构建 → `dist/` | ✅ 成功（16 modules，build 177ms） |
| `pnpm run preview` | 预览生产构建 | 可用（未长期占用端口） |
| `pnpm run format` | oxfmt 格式化 | 可用 |

要点：

- **端口由 `PORT` 环境变量控制**（`vite.config.ts` 读取，默认 `8443`），监听 `0.0.0.0`，`strictPort: true`。
- 依赖已装好：react 19.2.4、vite 8.0.5、tailwindcss 4.2.2、typescript 5.9.3、pnpm 11.25.0（本机 node v24.18.0）。
- `.mise.toml` 里声明的是 node 22 / pnpm 10.34.3；本机用 node 24 / pnpm 11 运行，**功能不受影响**。
- 本副本**不含任何后端/API**，所有数据都硬编码在 `src/App.tsx` 的 `scenarios` 常量里，可离线运行。
- 当前状态：**已在 `http://localhost:8443/` 持续运行**。

---

## 2. 当前有哪些页面

这是一个**单页应用**，没有路由库；"页面"是 `App.tsx` 里的 `page` 状态在两个视图间切换。

| # | 视图 | 进入方式 | 主要内容 |
|---|---|---|---|
| 1 | **行程输入页** | 默认 / 点左上角品牌 或 "← 修改行程" | 左侧 Hero（「把复杂路况，变成一个清晰决定。」+ 可靠性优先/动态更新）；右侧「01 规划你的行程」表单：演示情景 3 标签、起点、终点、最迟到达时间、可接受的额外车费、可接受的转乘次数、主 CTA「获取出行建议」 |
| 2 | **出行建议结果页** | 点「获取出行建议」 | 顶栏「← 修改行程」+ 情景切换标签；一句话决策卡（建议出发时间 / 行动徽章 / 预计到达区间 / 到达信心）；路线概要 + 示意图 + 4 段时间轴；推荐理由（可展开）；当前风险；**独立切换条件**；备用路线；资料透明度；**界面状态预览** |

结果页内部的**子状态**：

- **3 个演示情景**（可随时切换）：`正常通勤` / `暴雨影响` / `交通中断`
- **4 个界面状态预览**（底部开发者控件）：`加载中` / `不确定` / `不可用` / `错误`

⚠️ 注意：
- **没有 URL 路由**，刷新会回到输入页，情景/状态选择**不做持久化**（重新整理即重置）。
- 结果页的「界面状态预览」是给开发/QA 用的状态切换器，属于 demo 控件，不是用户功能。

---

## 3. Desktop / Mobile 是否都正常

**结论：都正常。** 已用真实浏览器（Chromium，DPR 2）在两种视口下跑完完整流程，并逐屏截图。

| 视口 | 尺寸 | 结果 | 控制台错误 | 横向溢出 |
|---|---|---|---|---|
| 桌面 | 1440 × 900 | ✅ 正常 | 0 | 无 |
| 手机 | 390 × 844（isMobile + touch） | ✅ 正常 | 0 | 无 |

覆盖范围（共 **8 个状态 × 2 视口 = 16 屏**，全部渲染成功）：

- 输入页
- 结果页 · 正常通勤 / 暴雨影响 / 交通中断
- 结果页 · 加载中 / 不确定 / 不可用 / 错误

响应式断点（`src/index.css`）：

| 断点 | 行为 |
|---|---|
| `> 900px` | 输入页两栏（Hero + 表单）；结果页 `1.45fr / 0.75fr` 双栏 |
| `601–900px` | 输入页变单栏；决策卡变单栏；资料卡变单栏 |
| `≤ 600px` | 手机优化：单列表单、主 CTA 变为 `sticky` 吸底、字号/内距收紧、隐藏部分次要信息 |

小提醒：在"整页长截图"里，手机端吸底 CTA 会视觉上盖住表单字段——这是 `position: sticky` 在全页截图下的**截图伪影**，真实视口下 CTA 停在表单底部，**不存在遮挡**。

---

## 4. UI 相关文件位于哪些位置

全部 UI 只集中在 2 个文件，没有组件拆分：

| 文件 | 行数 | 内容 |
|---|---|---|
| `ui-review-prototype/src/App.tsx` | 594 | **全部 UI**：图标 `Icon`、`Header`、`GlobalFooter`、`TripInput`、`MapCard`、`ConfidenceScale`、`SpecialNotice`、`StatusOverlay`、`ResultPage`、根组件 `App`；**以及全部演示数据**（`scenarios` 常量）与状态管理 |
| `ui-review-prototype/src/index.css` | 311 | **全部样式**：`@import 'tailwindcss'` + 手写 CSS（设计令牌、布局、响应式断点、reduced-motion） |
| `ui-review-prototype/src/main.tsx` | 8 | React 入口，挂载 `App` 到 `#root` |
| `ui-review-prototype/index.html` | — | Vite HTML 外壳（含 `<!-- figma:* -->` 插槽） |
| `ui-review-prototype/vite.config.ts` | — | Vite 配置：React、Tailwind v4、Figma Make 插件、`@` 别名、端口 |
| `ui-review-prototype/.figma/make/site.json` | — | 站点元数据（标题「韧性出行助手」、描述、`robots: noindex`） |
| `ui-review-prototype/.figma/make/*` | — | Figma Make 脚本（install / dev / format / deploy …），非应用代码 |
| `ui-review-prototype/AGENTS.md` | — | Figma Make 生成的项目说明（目录、依赖、代码规范） |

> 换句话说：**改 UI 只需要动 `src/App.tsx` + `src/index.css`。**

---

## 5. 运行期观察（仅记录，未修改）

1. **`tsc --noEmit` 有 1 个类型错误**（不影响运行）：
   `src/App.tsx:565` —— 状态预览按钮的标签映射缺 `'ready'` 键，但数组被标注为 `ViewState[]`（含 `"ready"`）。
   这是导出文件的既有问题；`vite build` 与浏览器运行**均正常**。
2. **`pnpm run build` 成功**：产物 `dist/`（JS 211 kB / gzip 66.8 kB，CSS 26.9 kB）。
3. **无任何 console / page 运行时错误**。
4. 原型**完全离线自足**：不发起任何网络请求（无 API、无外部字体）。

---

## 6. 证据与截图

`analysis/ui-design-review/prototype-2026-10-07/screens/`：

| 文件 | 内容 |
|---|---|
| `desktop-1-input.png` | 桌面 · 输入页 |
| `desktop-2-result-normal.png` | 桌面 · 结果页（正常通勤） |
| `desktop-3-result-heavy-rain.png` / `desktop-3-result-disruption.png` | 桌面 · 暴雨影响 / 交通中断 |
| `desktop-4-state-{loading,uncertain,unavailable,error}.png` | 桌面 · 四个界面状态 |
| `mobile-1-input.png` / `mobile-2-result-normal.png` | 手机 · 输入页 / 结果页 |
| `mobile-3-*.png` / `mobile-4-state-*.png` | 手机 · 情景与状态 |
| `mobile-viewport-top.png` / `mobile-viewport-bottom.png` | 手机 · 真实视口（非整页）渲染 |
| 同名 `.txt` | 每屏 `innerText` 逐字导出，便于比对文案 |

---

*本报告只描述运行与观察结果，未对原型或原项目做任何代码修改。*
