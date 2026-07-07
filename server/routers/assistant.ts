/**
 * Assistant Router — 平台内置 AI 助手
 * 支持流式对话 + 工具调用（查询 Skill/Agent/日志/知识库）
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
  aiLlmModels,
} from "../../drizzle/schema";

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
      if (collection) conditions.push(eq(aiKnowledgeItems.collection, collection));
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

// ─── 消息类型 ────────────────────────────────────────────────────────────────
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const assistantRouter = router({
  // ─── 非流式对话（用于简单问答）────────────────────────────────────────────
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(messageSchema),
        agentId: z.number().optional(), // 当前正在编辑的 Agent ID（上下文感知）
        context: z.string().optional(), // 额外上下文（如当前页面、选中节点）
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // 构建系统 Prompt（注入上下文）
      let systemPrompt = SYSTEM_PROMPT;
      if (input.agentId && db) {
        const [agent] = await db
          .select({ name: aiAgents.name, description: aiAgents.description, workflowJson: aiAgents.workflowJson })
          .from(aiAgents)
          .where(eq(aiAgents.id, input.agentId))
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
      if (input.context) {
        systemPrompt += `\n\n## 用户当前操作上下文\n${input.context}`;
      }

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...input.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      // 第一轮 LLM 调用（带工具）
      let response = await invokeLLM({
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: "auto",
      });

      // 处理工具调用（最多 3 轮）
      let rounds = 0;
      while (rounds < 3) {
        const choice = response.choices?.[0];
        if (!choice?.message?.tool_calls?.length) break;

        // 执行所有工具调用
        const toolResults: { role: "tool"; tool_call_id: string; content: string }[] = [];
        for (const tc of choice.message.tool_calls) {
          const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          const result = await executeTool(tc.function.name, args, ctx.user.id);
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result) as string,
          });
        }

        // 将工具结果追加到消息列表，继续对话
        messages.push({
          role: "assistant",
          content: (choice.message.content ?? "") as string,
        } as { role: "assistant"; content: string });
        for (const tr of toolResults) {
          (messages as unknown[]).push(tr);
        }

        response = await invokeLLM({
          messages: messages as Parameters<typeof invokeLLM>[0]["messages"],
          tools: ASSISTANT_TOOLS,
          tool_choice: "auto",
        });
        rounds++;
      }

      const content = response.choices?.[0]?.message?.content ?? "抱歉，我暂时无法回答这个问题。";
      const usage = response.usage;

      return {
        content,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
        },
      };
    }),

  // ─── 获取 Agent 优化建议 ────────────────────────────────────────────────
  getAgentOptimizationTips: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接失败");

      // 获取 Agent 信息
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(eq(aiAgents.id, input.agentId))
        .limit(1);
      if (!agent) throw new Error("Agent 不存在");

      // 获取最近 20 条运行记录
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

      // 获取所有活跃 Skill 列表
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
});
