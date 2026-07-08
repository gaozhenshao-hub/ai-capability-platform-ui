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
- [x] 编写 vitest 测试：projects router CRUD（权限/API Key脲敏/Slug校验）
- [x] 编写 vitest 测试：models router CRUD + 健康检查（健康/异常/费用统计）
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

## Phase 4 — Agent 可视化编排（已完成）

- [x] React Flow 画布（@xyflow/react v12）
- [x] 10 种节点类型（输入/输出/Skill/LLM/条件/循环/人工审核/HTTP/代码/知识库）
- [x] 人工审核节点（暂停执行 + 等待人工确认）
- [x] 运行进度可视化（RunPanel 轮询 + 节点状态高亮）

## Phase 3 补充 — Monaco 编辑器 + 版本 Diff + Prompt 导入

- [x] 安装 @monaco-editor/react 并封装 PromptEditor 组件（变量高亮、自动补全 {{变量}}）
- [x] Skills.tsx 中替换 Textarea 为 Monaco PromptEditor（System Prompt + User Prompt）
- [x] 实时变量解析预览面板（显示检测到的变量列表 + 填写示例值 → 预览渲染结果）
- [x] 后端 skills.diffVersions 接口（对比两个版本的 systemPrompt/userPromptTemplate 差异）
- [x] 前端版本 diff 对比视图（左右双栏 diff，高亮增删行）
- [x] Prompt 批量导入功能（从 JSON 导入 Skill 列表，支持预览确认后批量写入）

## Phase 4 — Agent 可视化编排（开发中）

- [x] 安装 @xyflow/react（React Flow v12）依赖
- [x] 数据库：ai_agents 表（workflowJson）+ ai_agent_runs 表（运行日志）已存在
- [x] 后端：agentsRouter（CRUD + 运行 + 步骤查询 + resumeRun）
- [x] 前端：Agent 列表页（搜索/状态/新建/编辑/删除）
- [x] 前端：Agent 画布页（三栏布局：节点面板 + React Flow 画布 + 属性面板）
- [x] 前端：10 种节点类型（输入/输出/Skill/LLM/条件/循环/人工审核/HTTP/代码/知识库）
- [x] 前端：节点拖拽到画布 + 自动连线（smoothstep）
- [x] 前端：节点属性编辑面板（点击节点弹出配置）
- [x] 前端：人工审核节点（暂停执行 + 等待人工确认）
- [x] 前端：运行进度可视化（RunPanel 轮询 + 节点状态高亮）
- [x] Vitest 测试：17 项全部通过（总计 40 项）

## Phase 4 补充 — Agent 与 Skill/MCP/LLM 联调（已完成）

- [x] 后端：Skill 节点读取 Skill 配置的 modelId，支持自定义模型
- [x] 后端：MCP 节点真实调用 mcp.invoke（通过 mcpToolId + capabilityName + payload）
- [x] 后端：LLM 节点支持从数据库读取自定义模型（apiBaseUrl/apiKey）
- [x] 后端：agents.ts 新增 getAvailableMcpTools 接口
- [x] 前端：Skill 节点属性面板 — 下拉选择 Skill + 变量映射表
- [x] 前端：MCP 节点属性面板 — 选择 MCP 工具 + 能力 + 参数填写
- [x] 前端：LLM 节点属性面板 — 选择模型 + System/User Prompt 编辑
- [x] 联调测试：agents.test.ts 覆盖 Skill/MCP/LLM 节点执行逻辑

## Phase 5 — 知识库 + 监控 + 迁移对接（开发中）

### 5.1 知识库后端
- [x] knowledgeRouter：CRUD（list/get/create/update/delete）
- [x] knowledgeRouter：文档上传（S3 存储 + 文本提取）
- [x] knowledgeRouter：全文搜索（MySQL LIKE + 标签过滤）
- [x] knowledgeRouter：集合管理（getCollections/createCollection）
- [x] knowledgeRouter：审核流程（submit/approve/reject）
- [x] knowledgeRouter：批量导入（JSON/CSV）
- [x] 注册 knowledgeRouter 到 appRouter

### 5.2 知识库前端
- [x] Knowledge.tsx 页面（左侧集合树 + 右侧条目列表）
- [x] 条目详情面板（Markdown 渲染 + 标签 + 来源）
- [x] 新建/编辑条目对话框（标题/内容/标签/集合）
- [x] 文档上传（PDF/TXT/MD 拖拽上传 + 进度条）
- [x] 全文搜索（实时搜索 + 高亮匹配）
- [x] 审核状态标签（草稿/待审核/已发布）
- [x] AI 对话式检索面板（AIChatBox 集成）

### 5.3 监控仪表盘升级
- [x] statsRouter：Agent 运行统计（成功率/平均耗时/今日运行次数）
- [x] statsRouter：LLM 成本趋势（7天/30天 Token 消耗 + 费用）
- [x] statsRouter：错误率统计（按节点类型分组）
- [x] statsRouter：知识库使用统计（查询次数/热门集合）
- [x] Dashboard.tsx 升级（新增 Agent 运行卡片 + 知识库统计）

### 5.4 跨系统迁移接口
- [x] migrationRouter：从 Listing 工具导入 Skill（通过 API URL + Key）
- [x] migrationRouter：从产品开发工具导入知识库条目
- [x] migrationRouter：导出当前 Skill/Agent/Knowledge 为 JSON
- [x] 前端迁移向导页面（Migration.tsx 独立页面）

### 5.5 测试
- [x] knowledge.test.ts：CRUD + 搜索 + 审核流程（87项全部通过）
- [x] 保存 checkpoint（e266d8c2）

## Phase 6 — 平台内置 AI 助手（已完成）

### 6.1 后端 assistantRouter
- [x] assistantRouter：chat 接口（多轮对话 + 工具调用 + 最多 3 轮工具循环）
- [x] assistantRouter：getAgentOptimizationTips（分析运行日志 + 给出优化建议）
- [x] assistantRouter：recommendSkills（根据任务描述推荐 Skill 组合，JSON 结构化输出）
- [x] 工具调用：list_skills / list_agents / get_agent_runs / search_knowledge / get_skill_stats
- [x] 系统 Prompt：注入平台功能说明 + Agent 上下文（agentId 传入时）
- [x] 修复 TypeScript 错误（workflowJson as any，content 类型处理）
- [x] 注册 assistantRouter 到 routers.ts

### 6.2 前端 AIPlatformAssistant 组件
- [x] 右下角浮动按钮（Bot 图标，点击展开/收起）
- [x] 聊天窗口：消息列表 + 打字指示器 + 输入框（Enter 发送，Shift+Enter 换行）
- [x] 消息气泡：用户（蓝色右对齐）+ AI（深色左对齐）+ 时间戳
- [x] Markdown 渲染（代码块/行内代码/粗体/标题/列表）
- [x] 快捷操作按钮（推荐 Skill / 优化 Agent / 创建 Agent）
- [x] 加载状态（三点跳动打字指示器）
- [x] 清空对话按钮
- [x] 未读消息计数角标

### 6.3 集成
- [x] App.tsx 全局挂载 AIPlatformAssistant（所有页面可用）
- [x] AgentCanvas.tsx 上下文感知集成（传入 agentId + 节点数/连线数上下文）

### 6.4 测试
- [x] assistant.test.ts：13 项测试全部通过
- [x] 全量测试 105 项全部通过（7 test files）
- [x] TypeScript 0 错误

## Phase 6.2 — AI 助手对话历史持久化（已完成）

- [x] 数据库新增 ai_assistant_sessions 表（会话元数据：标题/userId/agentId/messageCount/lastMessagePreview）
- [x] 数据库新增 ai_assistant_messages 表（消息内容：role/content/inputTokens/outputTokens）
- [x] 执行 pnpm db:push 迁移成功
- [x] 后端 chatWithSession 接口（自动创建/续接会话 + 持久化消息 + 更新元数据）
- [x] 后端 createSession 接口（手动创建新会话）
- [x] 后端 listSessions 接口（列出当前用户所有会话，按更新时间降序）
- [x] 后端 getSessionMessages 接口（加载指定会话的历史消息，验证归属）
- [x] 后端 deleteSession 接口（删除会话及其所有消息，验证归属）
- [x] 后端 updateSessionTitle 接口（内联编辑会话标题）
- [x] 前端 AIPlatformAssistant 改造：历史会话侧边栏（SessionListPanel）
- [x] 前端：点击历史会话自动加载消息，恢复对话上下文
- [x] 前端：发送消息后自动保存（sessionId 显示在底部状态栏）
- [x] 前端：会话标题内联编辑（点击标题 → 输入框 → Enter 保存）
- [x] 前端：新对话按钮（重置 sessionId + 清空消息）
- [x] 前端：历史记录按钮（切换到会话列表面板）
- [x] 全量 Vitest 测试 115 项全部通过（7 test files，新增 10 项持久化测试）
- [x] TypeScript 0 错误

## Phase 6.3 — AI 助手 Token 统计面板 + LLM 模型设置（已完成）

- [x] 后端：dashboard.getAssistantTokenStats 接口（按天汇总 ai_assistant_messages 的 Token 消耗）
- [x] 后端：assistant.getSettings / assistant.updateSettings 接口（读取/保存 AI 助手模型配置）
- [x] 后端：assistant.listAvailableModels 接口（列出可用 LLM 模型）
- [x] 数据库：ai_assistant_settings 表（存储每用户的 AI 助手模型配置）
- [x] 后端：chatWithSession 使用用户配置的模型（而非硬编码默认模型）
- [x] 仪表盘：新增 AI 助手 Token 趋势图（AreaChart，输入/输出 Token 双线）
- [x] 仪表盘：新增 AI 助手统计卡片（总对话数 / 总消息数 / 总 Token）
- [x] AI 助手组件：新增设置面板（齿轮图标 → 模型选择 + temperature + maxTokens）
- [x] Vitest 测试覆盖新接口（124 项全部通过）
