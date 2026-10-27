# A 部分交付包：解压与校验报告

- 源压缩包：`/workspace/八校黑客松/A部分_云电脑交付_2026-10-10.zip`（16,267,915 字节）
- 解压位置：`/workspace/八校黑客松/A部分/`
- 执行时间：2026-10-09（UTC）/ 2026-10-10（交付包标注日期）

## 1 压缩包完整性

| 项目 | 结果 |
|---|---|
| ZIP 文件 SHA-256 | `585bd7df0cf5dadd1a766b8b507aedb6aef668a98df73e94eaacfba5d3555e1e` |
| 与随包 `.sha256` 比对 | ✅ 一致 |
| 解压后文件总数 | 235（`A部分/app` 229 + 顶层 6） |
| `SHA256SUMS.json` 逐文件校验 | ✅ 234/234 全部匹配，无缺失、无多余、无改动 |

## 2 目录结构

```
A部分/
├── README_先读我.md          交付包入口说明
├── 上传云电脑运行.md         上传、安装、构建、访问步骤
├── 其他成员接口.md           B/C/D/E 接入接口与边界
├── 交付范围.md               A 核心、扩展模块、团队未完成项
├── 验证结果.md               交付方自测结果
├── SHA256SUMS.json           逐文件校验清单（234 项）
└── app/                      完整 Next.js 应用（含第一阶段基线）
    ├── src/app/{,api/{decision,health,journey},journey,result}
    ├── src/lib/{api,corridor,decision,fixtures,geo,integration,journey,reliability,risk,route,types}
    ├── src/test/            24 个测试文件
    ├── docs/                契约、架构、QA、交接文档
    ├── examples/team-integration.ts
    └── scripts/             探针与辅助脚本
```

## 3 本机复现（本工作区内）

Node `v24.18.0` / npm `11.16.0`（要求 ≥ 20.11）。

| 步骤 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `npm ci` | ✅ 411 个包，16s，无 node_modules 复用 |
| 校验链路 | `npm run verify` | ✅ lint 0 错误 0 警告 → TS 通过 → 24 文件 / 314 测试通过 → 生产构建成功 |
| 预览服务 | `npm run start -- --hostname 0.0.0.0 --port 3000` | ✅ 运行中（生产模式） |
| 健康检查 | `GET /api/health` | ✅ `status: ok`，场景 normal / heavy_rain / disruption |
| 页面 | `GET /journey` | ✅ HTTP 200 |
| 首页 | `GET /` | ✅ HTTP 200 |
| 行程 API | `POST /api/journey` | ✅ 正常返回校验错误结构（入参需为字符串字段），接口可用 |

结论：交付包完整、未被篡改，可在本工作区直接安装、构建与运行；`liveDataConfigured: false`，即当前仍为 fixture 演示数据，与《验证结果.md》描述一致（正式 B/C 实时接入入口在 `app/src/lib/integration/index.ts`）。

## 4 待办（若要在本工作区继续）

- `npm run dev` 与 `npm run start` 不要同时跑（共用 `.next`）。
- 正式整合 B/C/D/E 时，从 `app/src/lib/integration/index.ts` 与 `app/examples/team-integration.ts` 入手；接口边界见 `A部分/其他成员接口.md`。
- 工作区另有 `第二阶段信息/`（旧基线副本）与 `resilience-travel-assistant/`（第一阶段目录），本次解压未改动它们。
