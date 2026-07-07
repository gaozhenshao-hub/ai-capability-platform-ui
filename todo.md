# AI 能力管理平台 — 开发 TODO

## Phase 1.1 — 数据库表设计

- [x] 在 drizzle/schema.ts 中添加 ai_projects 表（多项目管理）
- [x] 在 drizzle/schema.ts 中添加 ai_llm_models 表（LLM 模型配置）
- [x] 在 drizzle/schema.ts 中添加 ai_mcp_tools 表（MCP 工具配置）
- [x] 在 drizzle/schema.ts 中添加 ai_skills 表（Skill 定义）
- [x] 在 drizzle/schema.ts 中添加 ai_skill_versions 表（Skill 版本历史）
- [x] 在 drizzle/schema.ts 中添加 ai_agents 表（Agent 定义）
- [x] 在 drizzle/schema.ts 中添加 ai_agent_runs 表（Agent 执行记录）
- [x] 在 drizzle/schema.ts 中添加 ai_skill_calls 表（Skill 调用日志）
- [x] 在 drizzle/schema.ts 中添加 ai_knowledge_items 表（知识库条目）
- [x] 扩展 users 表增加 platform_role 字段（五角色体系）
- [x] 执行 SQL 直接建表（TiDB 兼容方式）

## Phase 1.2 — 多项目管理 + API 认证

- [x] 后端：projects tRPC router（CRUD + API Key 生成）
- [x] 后端：API Key 验证中间件
- [x] 后端：审计日志写入（操作记录到 ai_audit_logs）
- [x] 前端：Projects 管理页面（列表 + 新建表单 + 编辑 + 删除）
- [x] 前端：API Key 管理面板（生成 + 轮换 + 复制）
- [x] 前端：CORS 白名单配置
- [x] 前端：月度预算设置

## Phase 1.3 — LLM 路由引擎

- [x] 后端：models tRPC router（CRUD + 健康检查）
- [x] 后端：LLM 路由引擎（按规则选择模型）
- [x] 后端：降级策略（主模型不可用时切换备用）
- [x] 后端：成本记录（Token 消耗写入 ai_llm_usage_daily）

## Phase 1.4 — LLM 管理前端页面

- [x] 前端：Models 页面重构（接入真实 tRPC API 数据）
- [x] 前端：模型注册表单（API 地址 + Key + 模型名 + 能力标签）
- [x] 前端：模型健康状态实时检测（轮询 + 状态指示器）
- [x] 前端：成本统计卡片（今日/本月 Token 消耗 + 费用）
- [x] 前端：成本趋势图（AreaChart）+ 提供商分布饼图
- [x] 前端：操作审计日志 Tab
- [x] 前端：Projects 管理页面（列表 + 新建 + API Key 管理）

## Phase 1.5 — 集成测试

- [x] vitest 测试：auth.logout 通过（1 passed）
- [ ] 编写 vitest 测试：projects router CRUD
- [ ] 编写 vitest 测试：models router CRUD + 健康检查
- [x] 保存 checkpoint 并发布

## Phase 2 — MCP 工具管理（已完成）

- [x] MCP 自助接入向导（4 步向导：基本信息 → 连接配置 → 认证方式 → 能力定义）
- [x] 能力定义（可调用函数注册，支持 GET/POST/PUT/DELETE/PATCH）
- [x] 健康监控 + 响应时间（实时健康检查 + 延迟显示）
- [x] 调用日志（调用日志 Tab，显示最近 50 条记录）
- [x] 认证管理（API Key / Bearer Token / Basic Auth / 无认证）
- [x] 调用沙箱（选择能力 + JSON Payload + 实时响应展示）
- [x] 统计卡片（工具总数 / 正常运行 / 异常工具 / 已停用）

## Phase 3 — Skill 技能管理（已完成）

- [x] Skill 列表页（搜索/状态/分类筛选）
- [x] 创建/编辑 Skill 对话框（基本信息/Prompt/Schema 三标签页）
- [x] Prompt 模板编辑器（System Prompt + 用户 Prompt + 变量占位符）
- [x] 版本历史面板（查看/回滚）
- [x] 实时测试运行器（输入 JSON → AI 输出 + Token 统计）
- [x] 调用日志面板（来源/版本/耗时/Token）
- [x] 采纳率统计（getStats 接口）
- [x] 审计日志页面（tRPC 版，支持搜索/过滤/展开详情）
- [x] skillsRouter 注册到 appRouter
- [x] auditRouter 注册到 appRouter
- [x] Vitest 测试 13 项全部通过

## Phase 4 — Agent 可视化编排（待开发）

- [ ] React Flow 画布
- [ ] 9 种节点类型
- [ ] 人工审核节点
- [ ] 运行进度可视化

## Phase 3 补充 — Monaco 编辑器 + 版本 Diff + Prompt 导入

- [x] 安装 @monaco-editor/react 并封装 PromptEditor 组件（变量高亮、自动补全 {{变量}}）
- [x] Skills.tsx 中替换 Textarea 为 Monaco PromptEditor（System Prompt + User Prompt）
- [x] 实时变量解析预览面板（显示检测到的变量列表 + 填写示例值 → 预览渲染结果）
- [x] 后端 skills.diffVersions 接口（对比两个版本的 systemPrompt/userPromptTemplate 差异）
- [x] 前端版本 diff 对比视图（左右双栏 diff，高亮增删行）
- [x] Prompt 批量导入功能（从 JSON 导入 Skill 列表，支持预览确认后批量写入）
