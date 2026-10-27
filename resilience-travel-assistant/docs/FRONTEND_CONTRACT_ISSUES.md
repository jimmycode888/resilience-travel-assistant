# 待 A 核对的前端接口问题

状态：未发送、未确认，仅整理供团队审阅。

1. 最小回应兼容：API_CONTRACT允许附加字段缺失，但当前DecisionCard依赖primaryPlan、planBPlan、generatedFor、candidates、notices、dataSources。D可修展示默认值和锁定字段回退；A请确认继续保留可选语义。
2. C新增action、switchDeadline、basis、uncertainty未登记在附加字段表。请A确认当前类型与语义，再更新文档；D不自行改共享类型。
3. maxExtraCost=0应解释为不接受额外车费，契约中“只接受免费方案”容易误导，请A核对。
4. 离线范围：请确认是本地服务使用fixture演示，还是浏览器完全断网仍可首次打开/查询。现有NETWORK_ERROR没有浏览器端回退；QA的live未配置来源是上游回退，不能证明设备断网可用。

确认记录：日期____；确认人____；决定____；影响文件____；处理人____。


## 2026-10-07 本次核对与待集成事项（未向组员发送）

1. **A：可选语义与类型不一致。** API_CONTRACT §2 允许附加字段缺失，api-client 也只检查锁定字段，但 DecisionResponse 的附加属性仍为必填；isActionable 还以 primaryPlan 为条件。本次合法最小回应已运行复现，D 结果卡独立按 status/departAt 展示锁定建议，容忍 null/缺失摘要和附加数组。请 A 统一类型和 helper 可选语义；D 未改共享契约。
2. **A/C：新增字段登记。** 当前共享类型有 action、switchDeadline、basis、uncertainty，API_CONTRACT additive 表仍未列出。请 A/C 核对 C_CONTRACT_CHANGE_REQUEST 与当前类型并完成登记；D 不自行修改规则或类型。
3. **A：费用文案。** API_CONTRACT 第49行把 maxExtraCost=0 写作“只接受免费方案”，与“额外车费”语义不一致。D 沿用前端排除额外车费方案的说明。请 A 确认基准含义并修订共享文档。
4. **A/B：离线说明已明确本机服务范围，但 live 描述过时。** DEMO_RUNBOOK §0/§3 与 ARCHITECTURE 的离线方案都是本地 Node 服务仍可经 localhost 访问。浏览器断网后本次实际显示 NETWORK_ERROR，恢复后重试成功；未新增 Service Worker 或浏览器离线查询。当前 health.liveDataConfigured=true，live 实际得到实时来源和 uncertain，README/演示手册中“没有实时来源”的旧描述需由 A/B 更新。现场主流程应继续使用明确标 fixture 的三个情景。
5. **A/B/C：live 当前与未来行程的解释。** 测试日10月7日获得的班次用于10月13日行程，UI 真实显示“不确定”及“预测只适用现在，不能推算未来接驳”的来源说明；请 B/C 确认来源混合品质与日期限制文案符合产品口径。D 保留返回内容和品质标记，不改变决策。
6. **A：预览与缓存。** 5173 原有房间预览仍是历史构建，本次不停止其未知进程；新构建在同一目录的5180 QA服务验证。队长集成时需按自己的运行环境重新 build/restart 原预览。首次 build 的旧缓存权限问题已绕过：保留 .next-d-before-20261007，生成新 .next；缓存不进入 D 文件包。
7. **A：回应检查深度（静态发现，未当作复现）。** api-client 对锁定数组只检查 Array.isArray，不验证 RouteStep 等内部成员。当前 BAD_RESPONSE/CONTRACT_MISMATCH 已验证外层格式异常；更深结构应由 A 补运行期检查。D 保留错误边界并去掉用户可见内部异常文本。

离线待确认仅限：现场实际设备如何连接本机服务、是否需要手机访问笔记本局域网地址以及备份录屏。若团队另要求首次打开浏览器在完全无法访问 API 时可用，需要 A 明确新增范围；本次不扩架构。
