/**
 * Assistant Router — 平台内置 AI 助手
 * 支持多轮对话 + 工具调用 + 会话历史持久化
 * 帮助用户了解平台功能、辅助配置 Agent、优化工作流
 */
import { z } from "zod";
import { desc, eq, gte, like, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  aiAgentRuns,
  aiAgents,
  aiSkillCalls,
  aiSkills,
  aiKnowledgeItems,
  aiAssistantSessions,
  aiAssistantMessages,
  aiAssistantSettings,
} from "../../drizzle/schema";
import { listLLMModels } from "../_core/llm";

// ─── 平台系统 Prompt ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是"AI 能力平台"的内置助手，专门帮助亚马逊运营人员使用本平台。

## 你的能力
1. **了解平台功能**：介绍 Skill 技能、Agent 智能体、MCP 连接器、知识库、监控仪表盘等模块
2. **辅助配置 Agent**：根据用户需求推荐节点组合、解释节点参数、生成工作流建议
3. **优化建议**：分析 Agent 运行日志，找出失败原因、性能瓶颈，给出具体优化方案
4. **Skill 推荐**：根据用户描述的任务，从已注册的 Skill 中推荐最合适的组合

## 平台模块说明
- **Skill 技能**：封装 LLM Prompt 的可复用单元，每个 Skill 有 System Prompt + User Prompt 模板 + 输入变量
- **Agent 智能体**：基于 React Flow 的可视化工作流，支持 10 种节点类型（输入/输出/Skill/LLM/条件/循环/人工审核/HTTP/代码/知识库）
- **MCP 连接器**：连接外部工具（API、数据库、爬虫等），Agent 可调用 MCP 工具
- **知识库**：存储运营 SOP、产品知识、案例库，供 Agent 的知识库节点检索
- **监控仪表盘**：实时查看 Skill 调用趋势、LLM 成本、Agent 运行状态

## 回答风格
- 简洁直接，优先给出可操作的步骤
- 涉及配置时，给出具体的参数值示例
- 分析问题时，先说结论，再说原因
- 使用中文回答

## 工具调用说明
你可以调用以下工具获取实时数据：
- list_skills：列出平台中的 Skill
- list_agents：列出已创建的 Agent
- get_agent_runs：获取 Agent 运行历史
- search_knowledge：搜索知识库
- get_skill_stats：获取 Skill 调用统计
`;

// ─── 工具定义 ────────────────────────────────────────────────────────────────
const ASSISTANT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_skills",
      description: "列出平台中已注册的 Skill 技能，可按分类或关键词筛选",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "分类筛选，如 listing、ops、analysis" },
          keyword: { type: "string", description: "关键词搜索 Skill 名称或描述" },
          limit: { type: "number", description: "返回数量，默认 10" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_agents",
      description: "列出用户创建的 Agent 智能体",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量，默认 5" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_agent_runs",
      description: "获取指定 Agent 的运行历史，用于分析失败原因和性能",
      parameters: {
        type: "object",
        properties: {
          agentId: { type: "number", description: "Agent ID" },
          limit: { type: "number", description: "返回数量，默认 10" },
        },
        required: ["agentId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_knowledge",
      description: "在知识库中搜索相关内容",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          collection: { type: "string", description: "知识库集合名称" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_skill_stats",
      description: "获取 Skill 的调用统计数据，了解使用频率和成功率",
      parameters: {
        type: "object",
        properties: {
          skillId: { type: "number", description: "Skill ID，不传则返回全局统计" },
          days: { type: "number", description: "统计天数，默认 7" },
        },
      },
    },
  },
];

// ─── 工具执行函数 ────────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>, userId: number) {
  const db = await getDb();
  if (!db) return { error: "数据库连接失败" };

  switch (name) {
    case "list_skills": {
      const { category, keyword, limit = 10 } = args as {
        category?: string;
        keyword?: string;
        limit?: number;
      };
      const conditions = [];
      if (category) conditions.push(like(aiSkills.category, `%${category}%`));
      if (keyword) {
        conditions.push(
          or(
            like(aiSkills.name, `%${keyword}%`),
            like(aiSkills.description, `%${keyword}%`)
          )!
        );
      }
      const rows = await db
        .select({
          id: aiSkills.id,
          name: aiSkills.name,
          description: aiSkills.description,
          category: aiSkills.category,
          status: aiSkills.status,
        })
        .from(aiSkills)
        .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : or(...conditions)) : undefined)
        .limit(limit);
      return { skills: rows, total: rows.length };
    }

    case "list_agents": {
      const { limit = 5 } = args as { limit?: number };
      const rows = await db
        .select({
          id: aiAgents.id,
          name: aiAgents.name,
          description: aiAgents.description,
          status: aiAgents.status,
          createdAt: aiAgents.createdAt,
        })
        .from(aiAgents)
        .where(eq(aiAgents.createdBy, userId))
        .orderBy(desc(aiAgents.createdAt))
        .limit(limit);
      return { agents: rows };
    }

    case "get_agent_runs": {
      const { agentId, limit = 10 } = args as { agentId: number; limit?: number };
      const rows = await db
        .select({
          id: aiAgentRuns.id,
          status: aiAgentRuns.status,
          durationMs: aiAgentRuns.durationMs,
          errorMessage: aiAgentRuns.errorMessage,
          startedAt: aiAgentRuns.startedAt,
          completedAt: aiAgentRuns.completedAt,
        })
        .from(aiAgentRuns)
        .where(eq(aiAgentRuns.agentId, agentId))
        .orderBy(desc(aiAgentRuns.createdAt))
        .limit(limit);

      const total = rows.length;
      const failed = rows.filter((r) => r.status === "failed").length;
      const avgDuration =
        rows.filter((r) => r.durationMs).reduce((s, r) => s + (r.durationMs ?? 0), 0) /
        (rows.filter((r) => r.durationMs).length || 1);

      return {
        runs: rows,
        summary: {
          total,
          failed,
          successRate: total > 0 ? Math.round(((total - failed) / total) * 100) : 100,
          avgDurationMs: Math.round(avgDuration),
        },
      };
    }

    case "search_knowledge": {
      const { query, collection } = args as { query: string; collection?: string };
      const conditions = [like(aiKnowledgeItems.content, `%${query}%`)];
      if (collection) conditions.push(eq(aiKnowledgeItems.collection, collection) as unknown as ReturnType<typeof like>);
      const rows = await db
        .select({
          id: aiKnowledgeItems.id,
          title: aiKnowledgeItems.title,
          collection: aiKnowledgeItems.collection,
          tags: aiKnowledgeItems.tags,
          status: aiKnowledgeItems.status,
        })
        .from(aiKnowledgeItems)
        .where(or(...conditions))
        .limit(5);
      return { items: rows };
    }

    case "get_skill_stats": {
      const { skillId, days = 7 } = args as { skillId?: number; days?: number };
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const conditions: ReturnType<typeof gte>[] = [gte(aiSkillCalls.createdAt, from)];
      if (skillId) conditions.push(eq(aiSkillCalls.skillId, skillId) as unknown as ReturnType<typeof gte>);

      const rows = await db
        .select({
          skillId: aiSkillCalls.skillId,
          skillName: aiSkills.name,
        })
        .from(aiSkillCalls)
        .leftJoin(aiSkills, eq(aiSkillCalls.skillId, aiSkills.id))
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
        .limit(100);

      const grouped: Record<number, { name: string; count: number }> = {};
      for (const r of rows) {
        const id = r.skillId ?? 0;
        if (!grouped[id]) grouped[id] = { name: r.skillName ?? `Skill #${id}`, count: 0 };
        grouped[id].count++;
      }
      return { stats: Object.entries(grouped).map(([id, v]) => ({ skillId: Number(id), ...v })) };
    }

    default:
      return { error: `未知工具: ${name}` };
  }
}

// ─── 核心 LLM 对话逻辑（可复用）────────────────────────────────────────────
type AssistantSettingsLike = {
  modelId?: string | null;
  temperature?: string | null;
  maxTokens?: number | null;
  enableTools?: boolean;
  customSystemPrompt?: string | null;
};

async function runChatCompletion(
  inputMessages: { role: "user" | "assistant" | "system"; content: string }[],
  agentId: number | undefined,
  context: string | undefined,
  userId: number,
  settings?: AssistantSettingsLike | null
) {
  const db = await getDb();

  // 构建系统 Prompt（注入上下文）
  let systemPrompt = SYSTEM_PROMPT;
  // 附加用户自定义 Prompt
  if (settings?.customSystemPrompt) {
    systemPrompt += `\n\n## 用户自定义补充说明\n${settings.customSystemPrompt}`;
  }
  if (agentId && db) {
    const [agent] = await db
      .select({ name: aiAgents.name, description: aiAgents.description, workflowJson: aiAgents.workflowJson })
      .from(aiAgents)
      .where(eq(aiAgents.id, agentId))
      .limit(1);
    if (agent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workflow = (agent.workflowJson ?? null) as any;
      const nodeCount = workflow?.nodes?.length ?? 0;
      systemPrompt += `\n\n## 当前编辑的 Agent 上下文
- **Agent 名称**: ${agent.name}
- **描述**: ${agent.description ?? "无"}
- **节点数量**: ${nodeCount}
- **工作流结构**: ${nodeCount > 0 ? JSON.stringify(workflow?.nodes?.map((n: { type: string; data?: { label?: string } }) => ({ type: n.type, label: n.data?.label }))) : "空画布"}`;
    }
  }
  if (context) {
    systemPrompt += `\n\n## 用户当前操作上下文\n${context}`;
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...inputMessages,
  ];

  // 解析用户设置的模型参数
  const useModel = settings?.modelId || undefined;
  const useMaxTokens = settings?.maxTokens || undefined;
  const useTools = settings?.enableTools !== false;

  // 第一轮 LLM 调用（带工具）
  let response = await invokeLLM({
    messages,
    ...(useModel ? { model: useModel } : {}),
    ...(useMaxTokens ? { maxTokens: useMaxTokens } : {}),
    tools: useTools ? ASSISTANT_TOOLS : undefined,
    tool_choice: useTools ? "auto" : undefined,
  });

  // 处理工具调用（最多 3 轮）
  let rounds = 0;
  while (rounds < 3) {
    const choice = response.choices?.[0];
    if (!choice?.message?.tool_calls?.length) break;

    const toolResults: { role: "tool"; tool_call_id: string; content: string }[] = [];
    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      const result = await executeTool(tc.function.name, args, userId);
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({
      role: "assistant",
      content: (choice.message.content ?? "") as string,
    } as { role: "assistant"; content: string });
    for (const tr of toolResults) {
      (messages as unknown[]).push(tr);
    }

    response = await invokeLLM({
      messages: messages as Parameters<typeof invokeLLM>[0]["messages"],
      ...(useModel ? { model: useModel } : {}),
      ...(useMaxTokens ? { maxTokens: useMaxTokens } : {}),
      tools: useTools ? ASSISTANT_TOOLS : undefined,
      tool_choice: useTools ? "auto" : undefined,
    });
    rounds++;
  }

  const content = response.choices?.[0]?.message?.content ?? "抱歉，我暂时无法回答这个问题。";
  const usage = response.usage;

  return {
    content: typeof content === "string" ? content : JSON.stringify(content),
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

// ─── 消息类型 ────────────────────────────────────────────────────────────────
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const assistantRouter = router({
  // ─── 创建新会话 ────────────────────────────────────────────────────────────
  createSession: protectedProcedure
    .input(
      z.object({
        title: z.string().max(256).default("新对话"),
        agentId: z.number().optional(),
        context: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      const [result] = await db.insert(aiAssistantSessions).values({
        title: input.title,
        agentId: input.agentId ?? null,
        context: input.context ?? null,
        userId: ctx.user.id,
        messageCount: 0,
      });

      const sessionId = (result as { insertId: number }).insertId;
      const [session] = await db
        .select()
        .from(aiAssistantSessions)
        .where(eq(aiAssistantSessions.id, sessionId))
        .limit(1);

      return session;
    }),

  // ─── 列出当前用户的所有会话 ─────────────────────────────────────────────
  listSessions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { sessions: [], total: 0 };

      const sessions = await db
        .select()
        .from(aiAssistantSessions)
        .where(eq(aiAssistantSessions.userId, ctx.user.id))
        .orderBy(desc(aiAssistantSessions.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      return { sessions, total: sessions.length };
    }),

  // ─── 获取指定会话的消息列表 ─────────────────────────────────────────────
  getSessionMessages: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { session: null, messages: [] };

      // 验证会话归属
      const [session] = await db
        .select()
        .from(aiAssistantSessions)
        .where(eq(aiAssistantSessions.id, input.sessionId))
        .limit(1);

      if (!session || session.userId !== ctx.user.id) {
        throw new Error("会话不存在或无权访问");
      }

      const messages = await db
        .select()
        .from(aiAssistantMessages)
        .where(eq(aiAssistantMessages.sessionId, input.sessionId))
        .orderBy(aiAssistantMessages.createdAt);

      return { session, messages };
    }),

  // ─── 删除会话（及其所有消息）──────────────────────────────────────────────
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      // 验证会话归属
      const [session] = await db
        .select({ id: aiAssistantSessions.id, userId: aiAssistantSessions.userId })
        .from(aiAssistantSessions)
        .where(eq(aiAssistantSessions.id, input.sessionId))
        .limit(1);

      if (!session || session.userId !== ctx.user.id) {
        throw new Error("会话不存在或无权访问");
      }

      // 删除所有消息
      await db
        .delete(aiAssistantMessages)
        .where(eq(aiAssistantMessages.sessionId, input.sessionId));

      // 删除会话
      await db
        .delete(aiAssistantSessions)
        .where(eq(aiAssistantSessions.id, input.sessionId));

      return { success: true };
    }),

  // ─── 更新会话标题 ─────────────────────────────────────────────────────────
  updateSessionTitle: protectedProcedure
    .input(z.object({ sessionId: z.number(), title: z.string().min(1).max(256) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      const [session] = await db
        .select({ id: aiAssistantSessions.id, userId: aiAssistantSessions.userId })
        .from(aiAssistantSessions)
        .where(eq(aiAssistantSessions.id, input.sessionId))
        .limit(1);

      if (!session || session.userId !== ctx.user.id) {
        throw new Error("会话不存在或无权访问");
      }

      await db
        .update(aiAssistantSessions)
        .set({ title: input.title })
        .where(eq(aiAssistantSessions.id, input.sessionId));

      return { success: true };
    }),

  // ─── 持久化对话（发送消息 + 保存历史）─────────────────────────────────────
  chatWithSession: protectedProcedure
    .input(
      z.object({
        /** 会话 ID，不传则自动创建新会话 */
        sessionId: z.number().optional(),
        /** 用户发送的新消息 */
        userMessage: z.string().min(1),
        /** 当前正在编辑的 Agent ID（上下文感知） */
        agentId: z.number().optional(),
        /** 额外上下文 */
        context: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      let sessionId = input.sessionId;

      // 如果没有传入 sessionId，自动创建新会话
      if (!sessionId) {
        const title = input.userMessage.slice(0, 50) + (input.userMessage.length > 50 ? "…" : "");
        const [result] = await db.insert(aiAssistantSessions).values({
          title,
          agentId: input.agentId ?? null,
          context: input.context ?? null,
          userId: ctx.user.id,
          messageCount: 0,
        });
        sessionId = (result as { insertId: number }).insertId;
      } else {
        // 验证会话归属
        const [session] = await db
          .select({ id: aiAssistantSessions.id, userId: aiAssistantSessions.userId })
          .from(aiAssistantSessions)
          .where(eq(aiAssistantSessions.id, sessionId))
          .limit(1);

        if (!session || session.userId !== ctx.user.id) {
          throw new Error("会话不存在或无权访问");
        }
      }

      // 保存用户消息
      await db.insert(aiAssistantMessages).values({
        sessionId,
        role: "user",
        content: input.userMessage,
      });

      // 加载该会话的历史消息（最近 20 条，用于上下文）
      const historyMessages = await db
        .select({ role: aiAssistantMessages.role, content: aiAssistantMessages.content })
        .from(aiAssistantMessages)
        .where(eq(aiAssistantMessages.sessionId, sessionId))
        .orderBy(aiAssistantMessages.createdAt)
        .limit(20);

      // 构建 LLM 输入消息（仅 user/assistant 角色）
      const llmMessages = historyMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // 加载用户的 AI 助手设置
      let userSettings: AssistantSettingsLike | null = null;
      if (db) {
        const [s] = await db
          .select()
          .from(aiAssistantSettings)
          .where(eq(aiAssistantSettings.userId, ctx.user.id))
          .limit(1);
        userSettings = s ?? null;
      }

      // 调用 LLM
      const { content, usage } = await runChatCompletion(
        llmMessages,
        input.agentId,
        input.context,
        ctx.user.id,
        userSettings
      );

      // 保存 AI 回复消息
      await db.insert(aiAssistantMessages).values({
        sessionId,
        role: "assistant",
        content,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      // 更新会话元数据（消息数 + 最后预览 + 更新时间）
      const totalMessages = historyMessages.length + 1; // +1 for assistant reply
      const preview = content.slice(0, 100) + (content.length > 100 ? "…" : "");
      await db
        .update(aiAssistantSessions)
        .set({
          messageCount: totalMessages,
          lastMessagePreview: preview,
        })
        .where(eq(aiAssistantSessions.id, sessionId));

      return {
        sessionId,
        content,
        usage,
      };
    }),

  // ─── 无状态对话（兼容旧接口，不保存历史）──────────────────────────────────
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(messageSchema),
        agentId: z.number().optional(),
        context: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const llmMessages = input.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      return runChatCompletion(llmMessages, input.agentId, input.context, ctx.user.id);
    }),

  // ─── 获取 Agent 优化建议 ────────────────────────────────────────────────
  getAgentOptimizationTips: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(eq(aiAgents.id, input.agentId))
        .limit(1);
      if (!agent) throw new Error("Agent 不存在");

      const runs = await db
        .select({
          status: aiAgentRuns.status,
          durationMs: aiAgentRuns.durationMs,
          errorMessage: aiAgentRuns.errorMessage,
        })
        .from(aiAgentRuns)
        .where(eq(aiAgentRuns.agentId, input.agentId))
        .orderBy(desc(aiAgentRuns.createdAt))
        .limit(20);

      const failed = runs.filter((r) => r.status === "failed");
      const avgDuration =
        runs.filter((r) => r.durationMs).reduce((s, r) => s + (r.durationMs ?? 0), 0) /
        (runs.filter((r) => r.durationMs).length || 1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workflow = (agent.workflowJson ?? null) as any;

      const prompt = `分析以下 Agent 的运行数据，给出 3-5 条具体的优化建议：

## Agent 信息
- 名称：${agent.name}
- 描述：${agent.description ?? "无"}
- 节点数：${workflow?.nodes?.length ?? 0}
- 节点类型：${JSON.stringify(workflow?.nodes?.map((n: { type: string }) => n.type) ?? [])}

## 运行统计（最近 ${runs.length} 次）
- 成功率：${runs.length > 0 ? Math.round(((runs.length - failed.length) / runs.length) * 100) : 100}%
- 平均耗时：${Math.round(avgDuration)}ms
- 失败次数：${failed.length}
- 主要错误：${failed.slice(0, 3).map((r) => r.errorMessage).filter(Boolean).join("; ") || "无"}

请给出：
1. 性能优化建议（如节点顺序、并行化）
2. 稳定性改进（如错误处理、重试机制）
3. Prompt 质量建议（如果有 LLM/Skill 节点）
4. 工作流结构建议

用中文回答，每条建议要具体可操作。`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "你是一个 AI 工作流优化专家，专注于提升 Agent 的性能和稳定性。" },
          { role: "user", content: prompt },
        ],
      });

      return {
        tips: response.choices?.[0]?.message?.content ?? "暂时无法生成优化建议",
        runStats: {
          total: runs.length,
          failed: failed.length,
          avgDurationMs: Math.round(avgDuration),
        },
      };
    }),

  // ─── 推荐 Skill 组合 ────────────────────────────────────────────────────
  recommendSkills: protectedProcedure
    .input(z.object({ taskDescription: z.string().min(5) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      const skills = await db
        .select({
          id: aiSkills.id,
          name: aiSkills.name,
          description: aiSkills.description,
          category: aiSkills.category,
        })
        .from(aiSkills)
        .where(eq(aiSkills.status, "active"))
        .limit(50);

      const skillList = skills
        .map((s) => `- ID:${s.id} [${s.category ?? "通用"}] ${s.name}: ${s.description ?? ""}`)
        .join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "你是一个亚马逊运营 AI 工具专家，帮助用户从已有的 Skill 库中选择最合适的 Skill 组合来完成任务。",
          },
          {
            role: "user",
            content: `用户任务描述：${input.taskDescription}

可用的 Skill 列表：
${skillList}

请推荐 3-5 个最适合完成此任务的 Skill，并说明：
1. 为什么推荐这个 Skill
2. 建议的执行顺序
3. 如何将这些 Skill 组合成一个 Agent 工作流

用中文回答，格式清晰。`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "skill_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skillId: { type: "number" },
                      skillName: { type: "string" },
                      reason: { type: "string" },
                      order: { type: "number" },
                    },
                    required: ["skillId", "skillName", "reason", "order"],
                    additionalProperties: false,
                  },
                },
                workflowSuggestion: { type: "string" },
                summary: { type: "string" },
              },
              required: ["recommendations", "workflowSuggestion", "summary"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : "{}";
      try {
        return JSON.parse(content) as {
          recommendations: { skillId: number; skillName: string; reason: string; order: number }[];
          workflowSuggestion: string;
          summary: string;
        };
      } catch {
        return {
          recommendations: [],
          workflowSuggestion: content,
          summary: "推荐生成完成",
        };
      }
    }),

  // ─── 获取当前用户的 AI 助手设置 ───────────────────────────────────────────────────────────────────
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const [settings] = await db
      .select()
      .from(aiAssistantSettings)
      .where(eq(aiAssistantSettings.userId, ctx.user.id))
      .limit(1);

    // 返回设置，如果没有则返回默认展示值
    return settings ?? {
      id: 0,
      userId: ctx.user.id,
      modelId: null,
      temperature: "0.70",
      maxTokens: 2048,
      enableTools: true,
      customSystemPrompt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }),

  // ─── 保存 AI 助手设置 ───────────────────────────────────────────────────────────────────
  updateSettings: protectedProcedure
    .input(
      z.object({
        modelId: z.string().max(128).nullable().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(256).max(8192).optional(),
        enableTools: z.boolean().optional(),
        customSystemPrompt: z.string().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      // 检查是否已有设置
      const [existing] = await db
        .select({ id: aiAssistantSettings.id })
        .from(aiAssistantSettings)
        .where(eq(aiAssistantSettings.userId, ctx.user.id))
        .limit(1);

      const updateData: Record<string, unknown> = {};
      if (input.modelId !== undefined) updateData.modelId = input.modelId;
      if (input.temperature !== undefined) updateData.temperature = input.temperature.toFixed(2);
      if (input.maxTokens !== undefined) updateData.maxTokens = input.maxTokens;
      if (input.enableTools !== undefined) updateData.enableTools = input.enableTools;
      if (input.customSystemPrompt !== undefined) updateData.customSystemPrompt = input.customSystemPrompt;

      if (existing) {
        await db
          .update(aiAssistantSettings)
          .set(updateData)
          .where(eq(aiAssistantSettings.userId, ctx.user.id));
      } else {
        await db.insert(aiAssistantSettings).values({
          userId: ctx.user.id,
          modelId: (input.modelId as string | null) ?? null,
          temperature: input.temperature !== undefined ? input.temperature.toFixed(2) : "0.70",
          maxTokens: input.maxTokens ?? 2048,
          enableTools: input.enableTools ?? true,
          customSystemPrompt: (input.customSystemPrompt as string | null) ?? null,
        });
      }

      return { success: true };
    }),

  // ─── 列出可用的 LLM 模型 ───────────────────────────────────────────────────────────────────
  listAvailableModels: protectedProcedure.query(async () => {
    try {
      const { data } = await listLLMModels();
      return data.map(m => ({
        id: m.id,
        name: m.id,
        ownedBy: m.owned_by,
      }));
    } catch {
      return [];
    }
  }),
});
