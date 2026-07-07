import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { aiAgents, aiAgentRuns, aiAuditLogs, aiSkills, aiLlmModels, aiMcpTools } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Helper: write audit log ──────────────────────────────────────────────────
async function writeAuditLog(params: {
  userId: number;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  projectId?: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(aiAuditLogs).values({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      beforeData: params.beforeData,
      afterData: params.afterData,
      result: "success",
      projectId: params.projectId,
      userId: params.userId,
    });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

// ─── Node type definitions ────────────────────────────────────────────────────
const nodeDataSchema = z.object({
  id: z.string(),
  type: z.enum([
    "skill",       // 调用 Skill
    "llm",         // 直接调用 LLM
    "mcp",         // 调用 MCP 工具
    "condition",   // 条件分支
    "loop",        // 循环
    "human_review",// 人工审核
    "http",        // HTTP 请求
    "code",        // 代码执行
    "knowledge",   // 知识库查询
    "output",      // 输出节点
    "input",       // 输入节点（起始）
  ]),
  label: z.string(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  position: z.object({ x: z.number(), y: z.number() }),
});

const edgeDataSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  type: z.string().optional().default("smoothstep"),
});

const workflowSchema = z.object({
  nodes: z.array(nodeDataSchema),
  edges: z.array(edgeDataSchema),
});

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const agentCreateInput = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, "slug 只能包含小写字母、数字和连字符"),
  description: z.string().optional(),
  scope: z.enum(["global", "project", "private"]).default("project"),
  triggerType: z.enum(["manual", "event", "scheduled"]).default("manual"),
  cronExpression: z.string().optional(),
  maxExecutionSeconds: z.number().int().min(10).max(3600).default(300),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  workflowJson: workflowSchema.optional(),
  projectId: z.number().int().optional(),
});

const agentUpdateInput = agentCreateInput.partial().extend({ id: z.number().int() });

// ─── Execution engine ─────────────────────────────────────────────────────────
type NodeLog = {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "waiting_review";
  startedAt?: string;
  completedAt?: string;
  inputData?: unknown;
  outputData?: unknown;
  error?: string;
  durationMs?: number;
};

async function executeWorkflow(params: {
  agentId: number;
  runId: number;
  workflow: z.infer<typeof workflowSchema>;
  inputData: Record<string, unknown>;
  userId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { workflow, inputData, runId } = params;
  const nodeLogs: NodeLog[] = workflow.nodes.map(n => ({
    nodeId: n.id,
    nodeType: n.type,
    label: n.label,
    status: "pending",
  }));

  // Build adjacency map
  const adjacency = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  // Find start nodes (no incoming edges)
  const hasIncoming = new Set(workflow.edges.map(e => e.target));
  const startNodes = workflow.nodes.filter(n => !hasIncoming.has(n.id));

  const context: Record<string, unknown> = { ...inputData };
  const visited = new Set<string>();

  const updateLog = async (nodeId: string, update: Partial<NodeLog>) => {
    const idx = nodeLogs.findIndex(l => l.nodeId === nodeId);
    if (idx >= 0) Object.assign(nodeLogs[idx], update);
    await db.update(aiAgentRuns)
      .set({ nodeExecutionLog: nodeLogs, status: "running" })
      .where(eq(aiAgentRuns.id, runId));
  };

  const executeNode = async (nodeId: string): Promise<void> => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const startedAt = new Date().toISOString();
    await updateLog(nodeId, { status: "running", startedAt });

    try {
      let output: unknown = null;

      switch (node.type) {
        case "input": {
          output = inputData;
          break;
        }

        case "skill": {
          const cfg = node.config as Record<string, unknown>;
          const skillId = cfg.skillId as number | undefined;
          if (!skillId) throw new Error("skill 节点未配置 skillId");
          const skill = await db.select().from(aiSkills).where(eq(aiSkills.id, skillId)).limit(1);
          if (!skill.length) throw new Error(`Skill #${skillId} 不存在`);
          const s = skill[0];
          // Apply input mapping: resolve {{variable}} from context
          let inputMapping: Record<string, unknown> = {};
          try {
            const rawMapping = cfg.inputMapping;
            if (typeof rawMapping === "string") inputMapping = JSON.parse(rawMapping);
            else if (rawMapping && typeof rawMapping === "object") inputMapping = rawMapping as Record<string, unknown>;
          } catch { /* ignore parse errors */ }
          const resolvedInput = { ...context };
          for (const [k, v] of Object.entries(inputMapping)) {
            if (typeof v === "string") {
              resolvedInput[k] = v.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] ?? `{{${key}}}`) );
            } else {
              resolvedInput[k] = v;
            }
          }
          // Render prompt template
          let prompt = s.promptTemplate;
          for (const [k, v] of Object.entries(resolvedInput)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
          }
          // Use skill's modelParams for invocation
          const modelParams = (s.modelParams ?? {}) as Record<string, unknown>;
          const llmResult = await invokeLLM({
            messages: [
              ...(s.systemPrompt ? [{ role: "system" as const, content: s.systemPrompt }] : []),
              { role: "user" as const, content: prompt },
            ],
            max_tokens: typeof modelParams.maxTokens === "number" ? modelParams.maxTokens : 2048,
          });
          const rawContent = llmResult.choices?.[0]?.message?.content;
          const llmText = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "");
          output = { text: llmText, tokens: llmResult.usage, skillId, skillName: s.name };
          context[`${node.id}_output`] = llmText;
          break;
        }

        case "llm": {
          const cfg = node.config as Record<string, unknown>;
          const systemPrompt = cfg.systemPrompt as string | undefined;
          let userPrompt = (cfg.userPrompt as string) ?? "";
          for (const [k, v] of Object.entries(context)) {
            userPrompt = userPrompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
          }
          const llmResult = await invokeLLM({
            model: (cfg.model as string) ?? "gpt-4o-mini",
            messages: [
              ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
              { role: "user" as const, content: userPrompt },
            ],
          });
          const llmText2 = typeof llmResult.choices[0]?.message?.content === "string"
            ? llmResult.choices[0].message.content : "";
          output = { text: llmText2, tokens: llmResult.usage };
          context[`${node.id}_output`] = llmText2;
          break;
        }

        case "condition": {
          const cfg = node.config as Record<string, unknown>;
          const expr = (cfg.expression as string) ?? "true";
          // Simple expression eval: {{var}} comparisons
          let resolvedExpr = expr;
          for (const [k, v] of Object.entries(context)) {
            resolvedExpr = resolvedExpr.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), JSON.stringify(v));
          }
          let result = false;
          try { result = Boolean(eval(resolvedExpr)); } catch { result = false; }
          output = { result, expression: resolvedExpr };
          context[`${node.id}_result`] = result;
          break;
        }

        case "human_review": {
          // Pause execution — mark run as paused
          await db.update(aiAgentRuns)
            .set({ status: "paused", pausedAtNodeId: nodeId })
            .where(eq(aiAgentRuns.id, runId));
          await updateLog(nodeId, { status: "waiting_review", startedAt });
          return; // Stop execution here
        }

        case "http": {
          const cfg = node.config as Record<string, unknown>;
          const url = (cfg.url as string) ?? "";
          const method = ((cfg.method as string) ?? "GET").toUpperCase();
          let body = cfg.body as string | undefined;
          if (body) {
            for (const [k, v] of Object.entries(context)) {
              body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
            }
          }
          const resp = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", ...(cfg.headers as Record<string, string> ?? {}) },
            ...(body ? { body } : {}),
          });
          const text = await resp.text();
          let json: unknown;
          try { json = JSON.parse(text); } catch { json = text; }
          output = { status: resp.status, body: json };
          context[`${node.id}_output`] = json;
          break;
        }

        case "mcp": {
          const mcpCfg = node.config as Record<string, unknown>;
          const mcpToolId = mcpCfg.mcpToolId as number | undefined;
          const capabilityName = mcpCfg.capabilityName as string | undefined;
          if (!mcpToolId) throw new Error("MCP 节点未配置 mcpToolId");
          if (!capabilityName) throw new Error("MCP 节点未配置 capabilityName");
          // Load MCP tool
          const mcpTools = await db.select().from(aiMcpTools).where(eq(aiMcpTools.id, mcpToolId)).limit(1);
          if (!mcpTools.length) throw new Error(`MCP 工具 #${mcpToolId} 不存在`);
          const mcpTool = mcpTools[0];
          const toolConfig = (mcpTool.config ?? {}) as Record<string, unknown>;
          const authConfig = (mcpTool.authConfig ?? { type: "none" }) as Record<string, unknown>;
          const capabilities = (mcpTool.capabilities ?? []) as Array<{ name: string; method?: string; path?: string }>;
          const cap = capabilities.find(c => c.name === capabilityName);
          if (!cap) throw new Error(`MCP 能力 "${capabilityName}" 不存在`);
          // Build payload: resolve {{variable}} from context
          let rawPayload = (mcpCfg.payload ?? {}) as Record<string, unknown>;
          if (typeof rawPayload === "string") {
            try { rawPayload = JSON.parse(rawPayload); } catch { rawPayload = {}; }
          }
          const resolvedPayload: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rawPayload)) {
            if (typeof v === "string") {
              resolvedPayload[k] = v.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] ?? `{{${key}}}`) );
            } else {
              resolvedPayload[k] = v;
            }
          }
          // Build request
          const baseUrl = ((toolConfig.baseUrl as string) ?? "").replace(/\/$/, "");
          const path = (cap.path ?? "/").replace(/^([^/])/, "/$1");
          const method = (cap.method ?? "POST").toUpperCase();
          const url = `${baseUrl}${path}`;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (authConfig.type === "bearer" && authConfig.token) {
            headers["Authorization"] = `Bearer ${authConfig.token}`;
          } else if (authConfig.type === "api_key" && authConfig.key) {
            headers[(authConfig.header as string) ?? "X-API-Key"] = authConfig.key as string;
          } else if (authConfig.type === "basic" && authConfig.username) {
            const creds = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString("base64");
            headers["Authorization"] = `Basic ${creds}`;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), mcpTool.timeoutMs ?? 30000);
          const fetchOptions: RequestInit = { method, headers, signal: controller.signal };
          if (method !== "GET" && method !== "HEAD") {
            fetchOptions.body = JSON.stringify(resolvedPayload);
          }
          const mcpResp = await fetch(url, fetchOptions);
          clearTimeout(timeout);
          const contentType = mcpResp.headers.get("content-type") ?? "";
          let mcpBody: unknown;
          if (contentType.includes("application/json")) {
            mcpBody = await mcpResp.json();
          } else {
            mcpBody = await mcpResp.text();
          }
          if (!mcpResp.ok) throw new Error(`MCP HTTP ${mcpResp.status}: ${JSON.stringify(mcpBody)}`);
          output = { success: true, status: mcpResp.status, data: mcpBody, toolName: mcpTool.name, capabilityName };
          context[`${node.id}_output`] = mcpBody;
          break;
        }

        case "knowledge": {
          const cfg = node.config as Record<string, unknown>;
          output = { collection: cfg.collection ?? "default", query: cfg.query ?? "" };
          break;
        }

        case "output": {
          output = context;
          break;
        }

        default:
          output = { skipped: true };
      }

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      await updateLog(nodeId, { status: "completed", completedAt, outputData: output, durationMs });

      // Execute downstream nodes
      const downstream = adjacency.get(nodeId) ?? [];
      for (const nextId of downstream) {
        await executeNode(nextId);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      await updateLog(nodeId, { status: "failed", error });
      throw err;
    }
  };

  try {
    for (const startNode of startNodes) {
      await executeNode(startNode.id);
    }

    // Check if paused
    const run = await db.select({ status: aiAgentRuns.status }).from(aiAgentRuns).where(eq(aiAgentRuns.id, runId)).limit(1);
    if (run[0]?.status !== "paused") {
      const finalOutput = context;
      await db.update(aiAgentRuns)
        .set({
          status: "completed",
          outputData: finalOutput,
          nodeExecutionLog: nodeLogs,
          completedAt: new Date(),
        })
        .where(eq(aiAgentRuns.id, runId));
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    await db.update(aiAgentRuns)
      .set({ status: "failed", errorMessage: error, nodeExecutionLog: nodeLogs, completedAt: new Date() })
      .where(eq(aiAgentRuns.id, runId));
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const agentsRouter = router({
  // List agents
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["draft", "active", "deprecated"]).optional(),
      projectId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(aiAgents)
        .orderBy(desc(aiAgents.updatedAt))
        .limit(100);
      return rows.filter(r => {
        if (input.search && !r.name.toLowerCase().includes(input.search.toLowerCase()) &&
          !(r.slug.toLowerCase().includes(input.search.toLowerCase()))) return false;
        if (input.status && r.status !== input.status) return false;
        if (input.projectId && r.projectId !== input.projectId) return false;
        return true;
      });
    }),

  // Get single agent
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(aiAgents).where(eq(aiAgents.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  // Create agent
  create: protectedProcedure
    .input(agentCreateInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(aiAgents).values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        scope: input.scope,
        triggerType: input.triggerType,
        cronExpression: input.cronExpression,
        maxExecutionSeconds: input.maxExecutionSeconds,
        inputSchema: input.inputSchema,
        workflowJson: (input.workflowJson as Record<string, unknown>) ?? {},
        projectId: input.projectId,
        createdBy: ctx.user.id,
        status: "draft",
      });
      const id = (result as { insertId: number }).insertId;
      await writeAuditLog({ userId: ctx.user.id, action: "agent.create", resourceType: "agent", resourceId: String(id) });
      return { id };
    }),

  // Update agent
  update: protectedProcedure
    .input(agentUpdateInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...rest } = input;
      await db.update(aiAgents).set({
        ...rest,
        workflowJson: rest.workflowJson as Record<string, unknown> | undefined,
      }).where(eq(aiAgents.id, id));
      await writeAuditLog({ userId: ctx.user.id, action: "agent.update", resourceType: "agent", resourceId: String(id) });
      return { success: true };
    }),

  // Save workflow (nodes + edges only)
  saveWorkflow: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      workflow: workflowSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(aiAgents)
        .set({ workflowJson: input.workflow as unknown as Record<string, unknown> })
        .where(eq(aiAgents.id, input.id));
      await writeAuditLog({
        userId: ctx.user.id,
        action: "agent.workflow.save",
        resourceType: "agent",
        resourceId: String(input.id),
        afterData: { nodeCount: input.workflow.nodes.length, edgeCount: input.workflow.edges.length },
      });
      return { success: true };
    }),

  // Delete agent
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(aiAgents).where(eq(aiAgents.id, input.id));
      await writeAuditLog({ userId: ctx.user.id, action: "agent.delete", resourceType: "agent", resourceId: String(input.id) });
      return { success: true };
    }),

  // Run agent
  run: protectedProcedure
    .input(z.object({
      agentId: z.number().int(),
      inputData: z.record(z.string(), z.unknown()).optional().default({}),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const agents = await db.select().from(aiAgents).where(eq(aiAgents.id, input.agentId)).limit(1);
      if (!agents.length) throw new Error("Agent 不存在");
      const agent = agents[0];

      // Create run record
      const [result] = await db.insert(aiAgentRuns).values({
        agentId: input.agentId,
        status: "running",
        inputData: input.inputData,
        triggeredBy: ctx.user.id,
        projectId: agent.projectId ?? undefined,
        startedAt: new Date(),
      });
      const runId = (result as { insertId: number }).insertId;

      const workflow = agent.workflowJson as unknown as z.infer<typeof workflowSchema> | undefined;
      if (!workflow?.nodes?.length) {
        await db.update(aiAgentRuns).set({ status: "failed", errorMessage: "工作流为空，请先配置节点" }).where(eq(aiAgentRuns.id, runId));
        return { runId, status: "failed", error: "工作流为空" };
      }

      // Execute async (fire and forget for long runs)
      executeWorkflow({ agentId: input.agentId, runId, workflow, inputData: input.inputData, userId: ctx.user.id })
        .catch(e => console.error("[AgentRun] Error:", e));

      return { runId, status: "running" };
    }),

  // Get run status + logs
  getRun: protectedProcedure
    .input(z.object({ runId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, input.runId)).limit(1);
      return rows[0] ?? null;
    }),

  // List runs for an agent
  listRuns: protectedProcedure
    .input(z.object({
      agentId: z.number().int(),
      limit: z.number().int().max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aiAgentRuns)
        .where(eq(aiAgentRuns.agentId, input.agentId))
        .orderBy(desc(aiAgentRuns.createdAt))
        .limit(input.limit);
    }),

  // Resume paused run (human review approved)
  resumeRun: protectedProcedure
    .input(z.object({
      runId: z.number().int(),
      approved: z.boolean(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const runs = await db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, input.runId)).limit(1);
      if (!runs.length) throw new Error("Run 不存在");
      const run = runs[0];
      if (run.status !== "paused") throw new Error("Run 未处于暂停状态");

      if (!input.approved) {
        await db.update(aiAgentRuns)
          .set({ status: "cancelled", errorMessage: `人工审核拒绝：${input.reviewNote ?? ""}`, completedAt: new Date() })
          .where(eq(aiAgentRuns.id, input.runId));
        return { success: true, status: "cancelled" };
      }

      // Resume: update paused node log to completed and continue
      const agent = await db.select().from(aiAgents).where(eq(aiAgents.id, run.agentId)).limit(1);
      if (!agent.length) throw new Error("Agent 不存在");

      const workflow = agent[0].workflowJson as unknown as z.infer<typeof workflowSchema>;
      const nodeLogs = (run.nodeExecutionLog ?? []) as NodeLog[];
      const pausedNodeId = run.pausedAtNodeId;

      if (pausedNodeId) {
        const idx = nodeLogs.findIndex(l => l.nodeId === pausedNodeId);
        if (idx >= 0) {
          nodeLogs[idx].status = "completed";
          nodeLogs[idx].outputData = { approved: true, reviewNote: input.reviewNote };
          nodeLogs[idx].completedAt = new Date().toISOString();
        }
      }

      await db.update(aiAgentRuns)
        .set({ status: "running", pausedAtNodeId: null, nodeExecutionLog: nodeLogs })
        .where(eq(aiAgentRuns.id, input.runId));

      // Continue execution from the node after the paused one
      const inputData = (run.inputData ?? {}) as Record<string, unknown>;
      executeWorkflow({ agentId: run.agentId, runId: input.runId, workflow, inputData, userId: ctx.user.id })
        .catch(e => console.error("[AgentResume] Error:", e));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "agent.run.resume",
        resourceType: "agent_run",
        resourceId: String(input.runId),
        afterData: { approved: input.approved, reviewNote: input.reviewNote },
      });

      return { success: true, status: "running" };
    }),

  // Get available skills for node config
  getAvailableSkills: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: aiSkills.id,
      name: aiSkills.name,
      slug: aiSkills.slug,
      description: aiSkills.description,
      category: aiSkills.category,
    }).from(aiSkills)
      .where(eq(aiSkills.status, "active"))
      .orderBy(aiSkills.name)
      .limit(200);
  }),

  // Get available LLM models for node config
  getAvailableModels: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: aiLlmModels.id,
      name: aiLlmModels.name,
      provider: aiLlmModels.provider,
      modelId: aiLlmModels.modelId,
    }).from(aiLlmModels)
      .where(eq(aiLlmModels.status, "active"))
      .orderBy(aiLlmModels.name)
      .limit(50);
  }),

  // Get available MCP tools for node config
  getAvailableMcpTools: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const tools = await db.select({
      id: aiMcpTools.id,
      name: aiMcpTools.name,
      slug: aiMcpTools.slug,
      description: aiMcpTools.description,
      capabilities: aiMcpTools.capabilities,
    }).from(aiMcpTools)
      .where(eq(aiMcpTools.status, "active"))
      .orderBy(aiMcpTools.name)
      .limit(100);
    return tools.map(t => ({
      ...t,
      capabilities: (t.capabilities ?? []) as Array<{ name: string; description?: string; method?: string; path?: string }>,
    }));
  }),
});
