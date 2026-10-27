# B 数据契约变更请求（待 A/C 审核）

本次没有更改共享 types/context.ts。现行数据模块与既有契约兼容。

1. 建议在天气结构中增加可选 signalCode、signalLevel、issuedAt、preAnnounceAt（可空）；warnsum 可提供信号码与发出时间，无法提供稳定预告时间，不应以 updatedAt 冒充 issuedAt。只有确有预告来源后才填 preAnnounceAt。
2. 若 C 要把实时抵站时间纳入计算，建议按 segmentId 关联 StopArrival，含 at、destination、sourceUrl、updatedAt、expiresAt、quality、state。现有 B 内部 TransportTimeBoard 可供审阅，不能直接把 arrival.at 或 dummy ttnt 填进 delayMinutes。
3. delayMinutes 现为 number。unknown 使用0为占位；建议以后允许 null 或增加 delayKnown，避免展示层误读。
4. 每路线增加 serviceDays／serviceWindows／sharedSegmentIds，解决公交指定时段、统一窗口和 R1/R3 共因失效。具体真实起站和官方来源见 B_COLLABORATION_REVIEW.md。
5. 正式登记混合质量规则：live 天气 + unknown 交通 + fixture 旅时，必须逐来源展示。当前使用 notices/source.note 说明；若需要所有字段可机器判断，请增加逐字段 provenance，避免把顶层 live 误解为全程实时。

审核前仅提供独立数据能力、文档与兼容补充说明，不改 A 的共享线路、C 的算法或 D/E 页面。
