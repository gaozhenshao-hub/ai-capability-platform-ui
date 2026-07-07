import {
  bigint,
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── 用户表（扩展平台角色）─────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** 系统角色：admin = 超级管理员，user = 普通用户 */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /**
   * 平台业务角色：
   * super_admin = 超级管理员（全部操作）
   * project_admin = 项目管理员（本项目全部操作）
   * ops_lead = 运营主管（编辑Prompt+测试+查看）
   * ops = 普通运营（查看+运行）
   * api_caller = API调用方（执行Skill/Agent）
   */
  platformRole: mysqlEnum("platformRole", [
    "super_admin",
    "project_admin",
    "ops_lead",
    "ops",
    "api_caller",
  ])
    .default("ops")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 项目表（多项目管理）──────────────────────────────────────────────────────
export const aiProjects = mysqlTable("ai_projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  /** 项目唯一标识符，用于 API 调用 */
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  /** API Key（加密存储） */
  apiKey: varchar("apiKey", { length: 128 }).notNull().unique(),
  /** API Key 前缀（明文展示用，如 ak_xxx） */
  apiKeyPrefix: varchar("apiKeyPrefix", { length: 16 }).notNull(),
  /** CORS 白名单（JSON 数组，如 ["https://app.example.com"]） */
  corsOrigins: json("corsOrigins").$type<string[]>().default([]),
  /** 月度 Token 预算（美元） */
  monthlyBudgetUsd: decimal("monthlyBudgetUsd", { precision: 10, scale: 2 }).default("0"),
  /** 预算告警阈值（百分比，如 80 表示 80%） */
  budgetAlertPercent: int("budgetAlertPercent").default(80),
  /** 项目状态 */
  status: mysqlEnum("status", ["active", "suspended"]).default("active").notNull(),
  /** 所属用户 */
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiProject = typeof aiProjects.$inferSelect;
export type InsertAiProject = typeof aiProjects.$inferInsert;

// ─── LLM 模型配置表 ──────────────────────────────────────────────────────────
export const aiLlmModels = mysqlTable("ai_llm_models", {
  id: int("id").autoincrement().primaryKey(),
  /** 模型显示名称，如 "GPT-4o" */
  name: varchar("name", { length: 128 }).notNull(),
  /** 模型唯一标识，如 "gpt-4o" */
  modelId: varchar("modelId", { length: 128 }).notNull(),
  /** 提供商，如 "openai", "anthropic", "deepseek" */
  provider: varchar("provider", { length: 64 }).notNull(),
  /** API 基础 URL */
  apiBaseUrl: varchar("apiBaseUrl", { length: 512 }).notNull(),
  /** API Key（加密存储） */
  apiKey: varchar("apiKey", { length: 512 }).notNull(),
  /** 能力标签（JSON 数组，如 ["text", "vision", "code"]） */
  capabilityTags: json("capabilityTags").$type<string[]>().default([]),
  /** 每千 Token 输入成本（美元） */
  costPer1kInputTokens: decimal("costPer1kInputTokens", { precision: 10, scale: 6 }).default("0"),
  /** 每千 Token 输出成本（美元） */
  costPer1kOutputTokens: decimal("costPer1kOutputTokens", { precision: 10, scale: 6 }).default("0"),
  /** 最大上下文长度（Token 数） */
  maxContextTokens: int("maxContextTokens").default(128000),
  /** 是否为默认模型 */
  isDefault: boolean("isDefault").default(false),
  /** 降级备用模型 ID */
  fallbackModelId: int("fallbackModelId"),
  /** 模型状态 */
  status: mysqlEnum("status", ["active", "inactive", "error"]).default("active").notNull(),
  /** 最后健康检查时间 */
  lastHealthCheck: timestamp("lastHealthCheck"),
  /** 最后健康检查延迟（毫秒） */
  lastLatencyMs: int("lastLatencyMs"),
  /** 所属项目（null = 全局可用） */
  projectId: int("projectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiLlmModel = typeof aiLlmModels.$inferSelect;
export type InsertAiLlmModel = typeof aiLlmModels.$inferInsert;

// ─── LLM 用量日统计表 ─────────────────────────────────────────────────────────
export const aiLlmUsageDaily = mysqlTable("ai_llm_usage_daily", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  projectId: int("projectId"),
  /** 统计日期（YYYY-MM-DD） */
  date: varchar("date", { length: 10 }).notNull(),
  totalCalls: int("totalCalls").default(0),
  totalInputTokens: bigint("totalInputTokens", { mode: "number" }).default(0),
  totalOutputTokens: bigint("totalOutputTokens", { mode: "number" }).default(0),
  totalCostUsd: decimal("totalCostUsd", { precision: 10, scale: 6 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiLlmUsageDaily = typeof aiLlmUsageDaily.$inferSelect;

// ─── MCP 工具配置表 ──────────────────────────────────────────────────────────
export const aiMcpTools = mysqlTable("ai_mcp_tools", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  /** 接入类型 */
  type: mysqlEnum("type", ["rest_api", "openapi", "database", "custom_script"]).notNull(),
  /** 连接配置（JSON，含 baseUrl、headers 等） */
  config: json("config").$type<Record<string, unknown>>().default({}),
  /** 认证配置（JSON，加密存储） */
  authConfig: json("authConfig").$type<Record<string, unknown>>().default({}),
  /** 能力定义（JSON 数组，每项含 name/description/inputSchema/outputSchema） */
  capabilities: json("capabilities").$type<unknown[]>().default([]),
  /** 重试次数 */
  retryCount: int("retryCount").default(2),
  /** 超时时间（毫秒） */
  timeoutMs: int("timeoutMs").default(30000),
  status: mysqlEnum("status", ["active", "inactive", "error"]).default("active").notNull(),
  lastHealthCheck: timestamp("lastHealthCheck"),
  lastLatencyMs: int("lastLatencyMs"),
  projectId: int("projectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiMcpTool = typeof aiMcpTools.$inferSelect;
export type InsertAiMcpTool = typeof aiMcpTools.$inferInsert;

// ─── Skill 定义表 ────────────────────────────────────────────────────────────
export const aiSkills = mysqlTable("ai_skills", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  /** 分类，如 "listing", "advertising", "product" */
  category: varchar("category", { length: 64 }),
  /** 作用域 */
  scope: mysqlEnum("scope", ["global", "project", "private"]).default("project").notNull(),
  /** Prompt 模板（支持 {{variable}} 语法） */
  promptTemplate: text("promptTemplate").notNull(),
  /** System Prompt */
  systemPrompt: text("systemPrompt"),
  /** 输入 JSON Schema */
  inputSchema: json("inputSchema").$type<Record<string, unknown>>().default({}),
  /** 输出 JSON Schema */
  outputSchema: json("outputSchema").$type<Record<string, unknown>>().default({}),
  /** 绑定的 LLM 模型 ID */
  modelId: int("modelId"),
  /** LLM 参数（temperature、maxTokens 等） */
  modelParams: json("modelParams").$type<Record<string, unknown>>().default({}),
  /** 关联的知识库集合（JSON 数组） */
  knowledgeCollections: json("knowledgeCollections").$type<string[]>().default([]),
  /** MCP 工具依赖（JSON 数组，含 tool slug） */
  mcpDependencies: json("mcpDependencies").$type<string[]>().default([]),
  /** 当前版本号 */
  currentVersion: int("currentVersion").default(1),
  /** 灰度发布版本号（null = 不在灰度中） */
  canaryVersion: int("canaryVersion"),
  /** 灰度流量比例（0-100） */
  canaryPercent: int("canaryPercent").default(0),
  status: mysqlEnum("status", ["draft", "active", "deprecated"]).default("draft").notNull(),
  projectId: int("projectId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiSkill = typeof aiSkills.$inferSelect;
export type InsertAiSkill = typeof aiSkills.$inferInsert;

// ─── Skill 版本历史表 ─────────────────────────────────────────────────────────
export const aiSkillVersions = mysqlTable("ai_skill_versions", {
  id: int("id").autoincrement().primaryKey(),
  skillId: int("skillId").notNull(),
  version: int("version").notNull(),
  promptTemplate: text("promptTemplate").notNull(),
  systemPrompt: text("systemPrompt"),
  modelId: int("modelId"),
  modelParams: json("modelParams").$type<Record<string, unknown>>().default({}),
  /** 版本备注 */
  changeNote: text("changeNote"),
  /** 该版本的采纳率（0-100） */
  adoptionRate: decimal("adoptionRate", { precision: 5, scale: 2 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSkillVersion = typeof aiSkillVersions.$inferSelect;

// ─── Agent 定义表 ────────────────────────────────────────────────────────────
export const aiAgents = mysqlTable("ai_agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  /** DAG 工作流定义（React Flow 节点+边 JSON） */
  workflowJson: json("workflowJson").$type<Record<string, unknown>>().default({}),
  /** 输入 JSON Schema */
  inputSchema: json("inputSchema").$type<Record<string, unknown>>().default({}),
  /** 触发方式 */
  triggerType: mysqlEnum("triggerType", ["manual", "event", "scheduled"]).default("manual").notNull(),
  /** 定时触发 cron 表达式 */
  cronExpression: varchar("cronExpression", { length: 64 }),
  /** 最大执行时间（秒） */
  maxExecutionSeconds: int("maxExecutionSeconds").default(300),
  scope: mysqlEnum("scope", ["global", "project", "private"]).default("project").notNull(),
  status: mysqlEnum("status", ["draft", "active", "deprecated"]).default("draft").notNull(),
  projectId: int("projectId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiAgent = typeof aiAgents.$inferSelect;
export type InsertAiAgent = typeof aiAgents.$inferInsert;

// ─── Agent 执行记录表 ─────────────────────────────────────────────────────────
export const aiAgentRuns = mysqlTable("ai_agent_runs", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  /** 执行状态 */
  status: mysqlEnum("status", [
    "queued",
    "running",
    "paused",
    "completed",
    "failed",
    "cancelled",
  ])
    .default("queued")
    .notNull(),
  /** 输入参数 */
  inputData: json("inputData").$type<Record<string, unknown>>().default({}),
  /** 最终输出 */
  outputData: json("outputData").$type<Record<string, unknown>>(),
  /** 节点执行日志（JSON 数组） */
  nodeExecutionLog: json("nodeExecutionLog").$type<unknown[]>().default([]),
  /** 错误信息 */
  errorMessage: text("errorMessage"),
  /** 当前暂停节点 ID（人工审核时） */
  pausedAtNodeId: varchar("pausedAtNodeId", { length: 64 }),
  /** 执行耗时（毫秒） */
  durationMs: int("durationMs"),
  projectId: int("projectId"),
  triggeredBy: int("triggeredBy"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiAgentRun = typeof aiAgentRuns.$inferSelect;

// ─── Skill 调用日志表 ─────────────────────────────────────────────────────────
export const aiSkillCalls = mysqlTable("ai_skill_calls", {
  id: int("id").autoincrement().primaryKey(),
  skillId: int("skillId").notNull(),
  skillVersion: int("skillVersion").notNull(),
  modelId: int("modelId"),
  projectId: int("projectId"),
  /** 调用来源：manual=手动测试，agent=Agent节点，api=API调用 */
  source: mysqlEnum("source", ["manual", "agent", "api"]).default("api").notNull(),
  /** 输入参数 */
  inputData: json("inputData").$type<Record<string, unknown>>().default({}),
  /** AI 输出内容 */
  outputData: json("outputData").$type<Record<string, unknown>>(),
  /** 用户是否采纳（null=未反馈，true=采纳，false=拒绝） */
  adopted: boolean("adopted"),
  /** 用户评分（1-5） */
  userRating: int("userRating"),
  /** 输入 Token 数 */
  inputTokens: int("inputTokens").default(0),
  /** 输出 Token 数 */
  outputTokens: int("outputTokens").default(0),
  /** 成本（美元） */
  costUsd: decimal("costUsd", { precision: 10, scale: 6 }).default("0"),
  /** 执行耗时（毫秒） */
  durationMs: int("durationMs"),
  /** 错误信息 */
  errorMessage: text("errorMessage"),
  /** 链路追踪 ID */
  traceId: varchar("traceId", { length: 64 }),
  triggeredBy: int("triggeredBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSkillCall = typeof aiSkillCalls.$inferSelect;

// ─── 知识库条目表 ────────────────────────────────────────────────────────────
export const aiKnowledgeItems = mysqlTable("ai_knowledge_items", {
  id: int("id").autoincrement().primaryKey(),
  /** 所属集合，如 "prompt_best_practices", "model_guide", "industry_rules" */
  collection: varchar("collection", { length: 64 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  /** 内容类型 */
  contentType: mysqlEnum("contentType", ["text", "example", "rule", "template"]).default("text").notNull(),
  /** 标签（JSON 数组） */
  tags: json("tags").$type<string[]>().default([]),
  /** 审核状态 */
  status: mysqlEnum("status", ["draft", "pending_review", "approved", "rejected"]).default("draft").notNull(),
  /** 来源：manual=人工录入，auto=自动学习 */
  source: mysqlEnum("source", ["manual", "auto"]).default("manual").notNull(),
  /** 关联的 Skill 调用 ID（自动学习时） */
  sourceCallId: int("sourceCallId"),
  projectId: int("projectId"),
  createdBy: int("createdBy"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiKnowledgeItem = typeof aiKnowledgeItems.$inferSelect;
export type InsertAiKnowledgeItem = typeof aiKnowledgeItems.$inferInsert;

// ─── 审计日志表 ──────────────────────────────────────────────────────────────
export const aiAuditLogs = mysqlTable("ai_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 操作类型，如 "model.create", "skill.update", "project.delete" */
  action: varchar("action", { length: 128 }).notNull(),
  /** 操作对象类型 */
  resourceType: varchar("resourceType", { length: 64 }).notNull(),
  /** 操作对象 ID */
  resourceId: varchar("resourceId", { length: 64 }),
  /** 操作前数据快照 */
  beforeData: json("beforeData").$type<Record<string, unknown>>(),
  /** 操作后数据快照 */
  afterData: json("afterData").$type<Record<string, unknown>>(),
  /** 操作结果 */
  result: mysqlEnum("result", ["success", "failure"]).default("success").notNull(),
  /** 错误信息 */
  errorMessage: text("errorMessage"),
  /** 操作者 IP */
  ipAddress: varchar("ipAddress", { length: 64 }),
  projectId: int("projectId"),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiAuditLog = typeof aiAuditLogs.$inferSelect;
