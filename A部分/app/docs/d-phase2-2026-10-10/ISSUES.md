# D 第二阶段问题与依赖

未向组员发送消息；没有修改 A/B/C 算法或数据掩盖问题。

| ID | 状态/影响 | 实际复现与建议负责人 |
|---|---|---|
| D2-01 | 待正式联调，阻塞正式五人端到端验收 | /api/team-journey 当前 404；/api/journey 是 JourneyAnalysis。A 提供正式 HTTP，B/C 模块服务端组合，no-store、异常处理和请求校验 |
| D2-02 | 上游日期缺口；D 已防护 | parseArriveBy('2026-02-30T08:00:00+08:00') 返回 2026-03-02，见 iso-reproduction.json。A 在共享时间工具做完整 ISO 日历验证；D 新输入/API/响应 decoder 已拒绝。第一阶段 datetime-local 输入已校验，但直接旧 API ISO 仍需 A 修复 |
| D2-03 | 第一阶段历史数据/决策矛盾仍在 | phase1-disruption-max10-http.json：坑口→中环、10/13 09:00、费用10/换乘2，R2 主路/R3 备选；reasons 称坑口至北角停运而 R3 仍乘将军澳线。maxExtraCost=0 时 R3 主路，见 phase1-disruption-http.json。B 校正受影响路段和状态；C 过滤共享故障，A 集成回归。D 不把数据改成通过 |
| D2-04 | 第二阶段演示修复，正式组合仍需保护 | demo-disruption-http.json：xb-1/xb-2 东铁均 excluded，仅深圳湾可行、planB=null。D fixture 同样正确。诊断 shared-disruption-reproduction.json 注入 service=ok + 东铁 incident，再由 C mock 选 xb-1/xb-2，A 仍接受 go。B 需完整服务作用域，C 需独立备选检查；这是 mock 组合诊断，不是已接入 C 模型的故障 |
| D2-05 | A 基础排序允许所有候选到达超时 | deadline fixture 实际 result 推荐非空但 meetsDeadline=false。D 保留实际排序，标明超时/无法满足期限，C mock 返回 unavailable。A/C 明确正式推荐和 go 到达期限策略；不把排名当可执行推荐 |
| D2-06 | 真实数据待 B，阻塞实际出行承诺 | 坐标和折线仍参考示意，口岸开放不代表接驳有班次。B 提供逐候选来源、时间、过期、品质、口岸/班次和官方坐标证据。当前 health.liveDataConfigured=false，旧 live 请求实际回退 fixture，不沿用10/7已有 live 的结论 |
| D2-07 | C 模型待接入 | normal decision=null。go/hold/unavailable/窗口/解释均 mock，仅 UI 验证。C 提供正式 decide、出发预测证据、备选故障独立性、notices；不生成第一阶段切换截止字段 |
| D2-08 | E pending 视觉及真人确认 | 已按 E 三档路线色、几何符号、独立 critical 人流、跨境/不可行不同线型落实。E/A 确认 pending critical 语义及视觉 token；E 做实际移动阅读、方案理解走查 |
| D2-09 | 待真人/设备 | 五人、真人键盘、读屏、实际手机/平板、原生缩放、现场局域网/物理断外网未执行。用户组织；自动键盘/axe/视口不能替代 |

D 已修复：正式 decoder/fixture 标记、香港输入验证、重复提交锁、Abort+generation、改输入清旧结果、15秒逾时/重试、地图卡片与键盘联动、风险/数据证据、A 演示页输入竞争和旧结果残留、独立原型 lint 范围。
