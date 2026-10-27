# 韧性出行助手 · 本地测试包

打包日期：2026-10-09　｜　用途：下载到自己电脑上运行、测试、评审

> 「韧性出行助手」把天气与交通信息，转成「几点走、走哪条、什么时候切换」的可执行出行决定。
> 这是一个**黑客松演示原型**：所有路线时间、车费与服务状态都是**标记为 `fixture` 的固定演示数据**，不是实时路况。

---

## 0. 包内结构

| 目录 | 内容 | 是否需要 |
|---|---|---|
| `01-app/` | **主应用**：Next.js 15 + React 19 + TypeScript，含决策引擎、数据适配层、API、测试 | 主要测试对象 |
| `02-ui-reference/` | **UI Reference / UI Baseline v1.0**（Vite + React），已冻结的 UI 参考，**不是生产代码** | 看界面/对照设计 |
| `03-docs/` | 项目文档：立项说明、选题、团队开发工作流、给 Pi Agent 的成员指令、参考论文 PDF、问卷二维码、idea.pages | 背景资料 |
| `04-reviews/` | 评审与证据：现有方案调研报告、UI 设计稿评审、进度页、演示截图 | 参考 |
| `START-HERE_本地运行指南.md` | 本文件 | — |
| `MANIFEST.txt` | 文件清单 | — |

已排除：`node_modules/`、`.next/`、构建缓存、`*.tsbuildinfo`、本地 `.env.local` 及内部交接用 zip（体积大/与本机相关，下载后重新生成即可）。

---

## 1. 环境要求

- **Node.js ≥ 20.11**（建议 22 或 24）、**npm 10+**（`02-ui-reference` 也可用 pnpm）
- **不需要数据库**，**不需要任何 API 密钥**：不填任何环境变量也能完整运行（全部走 fixture 演示数据）

检查版本：

```bash
node -v
npm -v
```

---

## 2. 主应用（`01-app/`）—— 建议先跑这个

```bash
cd 01-app
npm install
npm run dev
```

浏览器打开 **http://localhost:3000**

常用命令：

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本机开发服务器（http://localhost:3000） |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器（需先 build） |
| `npm run test` | 运行全部单元/集成测试（Vitest） |
| `npm run smoke` | **功能冻结验收**：三个演示情景各连跑 5 次并输出结果表 |
| `npm run lint` / `npm run typecheck` | 代码检查 / 类型检查 |
| `npm run verify` | `lint → typecheck → test → build` 一次跑完（推荐用来验证环境） |

> **本机已验证**：2026-10-09 在本环境执行 `npm run test` → **15 个测试文件、172 个测试全部通过**；`npm run build` → **构建成功**。
> 你只需 `npm install` 后 `npm run verify`，即可确认本地环境一致。

### 三种演示情景

进入首页后选择情景（`正常通勤` / `暴雨影响` / `交通中断`），提交即可看到建议出发时间、到达范围、到达信心、主路线、Plan B、切换条件、理由、数据时间与质量。

### 可选：接入实时数据

默认全部走 fixture。若要尝试实时来源，复制模板后填写：

```bash
cp .env.example .env.local     # Windows PowerShell: Copy-Item .env.example .env.local
```

`.env.example` 内已注明各变量含义；**不填任何值也能完整运行**。切勿把自己的真实密钥提交或分享。

---

## 3. UI Reference（`02-ui-reference/`）

```bash
cd 02-ui-reference
npm install        # 或 pnpm install
npm run dev -- --port 8443
```

浏览器打开 **http://localhost:8443/** ；Demo 机制：**http://localhost:8443/?demo=1**

也可以用已构建好的静态版本：`02-ui-reference/dist/`（`index.html` + `assets/`），用任意静态服务器打开即可：

```bash
cd 02-ui-reference/dist
npx --yes serve -l 8080 .     # 然后访问 http://localhost:8080/
```

> 该目录是 **UI 参考基线**，事实来源仍是 `01-app/` 的 API Contract / production API / fixture。

---

## 4. 文档与评审（`03-docs/`、`04-reviews/`）

- `03-docs/`：`韧性出行项目立项说明.docx`、`选题.docx`、`团队开发工作流.md`、`给Pi_Agent_成员A~D指令.txt`、参考论文 PDF（`1-s2.0-*.pdf`、`JPR-2024-11-25-C.pdf`、`tp_rsc*.pdf`）、`韧性出行助手-问卷二维码.png`、`idea.pages`
- `04-reviews/analysis/existing-solutions-landscape/report.html`：现有方案调研报告（浏览器直接打开）
- `04-reviews/analysis/ui-design-review/`：UI 设计稿评审（`figma-2026-10-07/index.html`、`prototype-2026-10-07/` 报告与截图）
- `04-reviews/progress-2026-10-08/index.html`：进度页
- `04-reviews/generated/shots-2026-10-08/`：App 与原型演示截图（桌面/移动/多情景）

`.docx` / `.pages` 需要 Office / Pages 打开；`idea.pages` 为 Apple Pages 格式。

---

## 5. 常见问题（FAQ）

**Q：`npm install` 很慢或超时？**
使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
```

**Q：端口被占用？**
```bash
npm run dev -- --port 3000     # 换一个端口
```

**Q：Windows 解压后文件名乱码？**
用支持 UTF-8 的解压工具（如 7-Zip、Bandizip）解压；本包文件名包含中文。

**Q：一定要联网吗？**
`npm install` 需要联网下载依赖；安装完成后运行本身**不需要**任何外部服务或密钥。

**Q：这与真实数据的关系？**
本原型的所有数值均为 `fixture` 固定演示数据，界面的「到达信心 高/中/低」是**定性判断**，非经校准的准点概率。
