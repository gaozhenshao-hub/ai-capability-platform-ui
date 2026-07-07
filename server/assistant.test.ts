/**
 * Assistant Router Tests
 * Covers: chat (with tool calls), getAgentOptimizationTips, recommendSkills
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockInsert, mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  const mockDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  return { mockInsert, mockSelect, mockUpdate, mockDelete };
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  }),
}));

// Mock invokeLLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "这是 AI 助手的回复内容，包含了对平台功能的详细解释。",
          tool_calls: null,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  }),
}));

import { appRouter } from "./routers";

// ─── Context factory ───────────────────────────────────────────────────────────
function createCtx(role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "google",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Mock helpers ──────────────────────────────────────────────────────────────
/** select().from().where().limit() → returns empty array */
function setupSelectEmpty() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

/** select().from().where().limit() → returns one agent */
function setupSelectAgent(agent = {
  id: 1,
  name: "测试 Agent",
  description: "用于测试的 Agent",
  workflowJson: { nodes: [{ type: "input" }, { type: "skill" }], edges: [] },
}) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([agent]),
      }),
    }),
  });
}

/** select().from().where().orderBy().limit() → returns runs */
function setupSelectRuns(runs: object[] = []) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(runs),
        }),
      }),
    }),
  });
}

/** select().from().where().limit() → returns skills */
function setupSelectSkills(skills: object[] = []) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(skills),
      }),
    }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe("assistantRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── chat ────────────────────────────────────────────────────────────────────
  describe("chat", () => {
    it("应返回 AI 助手的回复内容", async () => {
      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [{ role: "user", content: "平台有哪些功能？" }],
      });

      expect(result).toHaveProperty("content");
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("应返回 usage 统计信息", async () => {
      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [{ role: "user", content: "介绍一下 Skill 模块" }],
      });

      expect(result).toHaveProperty("usage");
      expect(result.usage).toHaveProperty("inputTokens");
      expect(result.usage).toHaveProperty("outputTokens");
      expect(typeof result.usage.inputTokens).toBe("number");
      expect(typeof result.usage.outputTokens).toBe("number");
    });

    it("应支持多轮对话历史", async () => {
      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [
          { role: "user", content: "什么是 Skill？" },
          { role: "assistant", content: "Skill 是封装 LLM Prompt 的可复用单元。" },
          { role: "user", content: "如何创建一个 Skill？" },
        ],
      });

      expect(result.content).toBeTruthy();
    });

    it("传入 agentId 时应加载 Agent 上下文", async () => {
      // 模拟 Agent 查询
      setupSelectAgent();

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [{ role: "user", content: "分析这个 Agent 的结构" }],
        agentId: 1,
      });

      expect(result.content).toBeTruthy();
    });

    it("传入 agentId 但 Agent 不存在时应正常返回", async () => {
      // 模拟 Agent 不存在
      setupSelectEmpty();

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [{ role: "user", content: "帮我分析 Agent" }],
        agentId: 999,
      });

      expect(result.content).toBeTruthy();
    });

    it("应支持工具调用（list_skills）", async () => {
      // 模拟 LLM 先返回工具调用，再返回最终回复
      const { invokeLLM } = await import("./_core/llm");
      const mockInvokeLLM = vi.mocked(invokeLLM);

      // 第一次调用：返回工具调用
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "list_skills",
                    arguments: JSON.stringify({ keyword: "listing", limit: 5 }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
      } as Awaited<ReturnType<typeof invokeLLM>>);

      // 模拟 list_skills 查询结果
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 1, name: "Listing 标题优化", description: "优化标题", category: "listing", status: "active" },
            ]),
          }),
        }),
      });

      // 第二次调用：返回最终回复
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "我找到了以下 Listing 相关的 Skill：1. Listing 标题优化",
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      } as Awaited<ReturnType<typeof invokeLLM>>);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chat({
        messages: [{ role: "user", content: "有哪些 Listing 相关的 Skill？" }],
      });

      expect(result.content).toContain("Listing");
    });

    it("未登录用户应被拒绝访问", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
      });

      await expect(
        caller.assistant.chat({
          messages: [{ role: "user", content: "你好" }],
        })
      ).rejects.toThrow();
    });
  });

  // ── getAgentOptimizationTips ────────────────────────────────────────────────
  describe("getAgentOptimizationTips", () => {
    it("应返回 Agent 优化建议", async () => {
      // 模拟 Agent 查询
      setupSelectAgent();
      // 模拟运行记录查询
      setupSelectRuns([
        { status: "completed", durationMs: 1200, errorMessage: null },
        { status: "failed", durationMs: null, errorMessage: "LLM 超时" },
        { status: "completed", durationMs: 800, errorMessage: null },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.getAgentOptimizationTips({ agentId: 1 });

      expect(result).toHaveProperty("tips");
      expect(result).toHaveProperty("runStats");
      expect(result.runStats).toHaveProperty("total");
      expect(result.runStats).toHaveProperty("failed");
      expect(result.runStats).toHaveProperty("avgDurationMs");
    });

    it("Agent 不存在时应抛出错误", async () => {
      setupSelectEmpty();

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.getAgentOptimizationTips({ agentId: 999 })
      ).rejects.toThrow("Agent 不存在");
    });

    it("应正确计算成功率", async () => {
      setupSelectAgent();
      setupSelectRuns([
        { status: "completed", durationMs: 1000, errorMessage: null },
        { status: "completed", durationMs: 1200, errorMessage: null },
        { status: "failed", durationMs: null, errorMessage: "错误" },
        { status: "completed", durationMs: 900, errorMessage: null },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.getAgentOptimizationTips({ agentId: 1 });

      expect(result.runStats.total).toBe(4);
      expect(result.runStats.failed).toBe(1);
    });
  });

  // ── recommendSkills ─────────────────────────────────────────────────────────
  describe("recommendSkills", () => {
    it("应返回 Skill 推荐结果", async () => {
      // 模拟 LLM 返回结构化 JSON
      const { invokeLLM } = await import("./_core/llm");
      const mockInvokeLLM = vi.mocked(invokeLLM);
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendations: [
                  { skillId: 1, skillName: "标题优化", reason: "适合优化标题", order: 1 },
                  { skillId: 2, skillName: "关键词分析", reason: "提取关键词", order: 2 },
                ],
                workflowSuggestion: "先运行关键词分析，再运行标题优化",
                summary: "推荐 2 个 Skill 完成任务",
              }),
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 150 },
      } as Awaited<ReturnType<typeof invokeLLM>>);

      // 模拟 Skill 列表查询
      setupSelectSkills([
        { id: 1, name: "标题优化", description: "优化亚马逊标题", category: "listing" },
        { id: 2, name: "关键词分析", description: "分析关键词", category: "seo" },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.recommendSkills({
        taskDescription: "我想优化亚马逊 Listing 的标题和关键词",
      });

      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("workflowSuggestion");
      expect(result).toHaveProperty("summary");
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("任务描述过短时应抛出验证错误", async () => {
      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.recommendSkills({ taskDescription: "优化" })
      ).rejects.toThrow();
    });

    it("LLM 返回非 JSON 时应优雅降级", async () => {
      const { invokeLLM } = await import("./_core/llm");
      const mockInvokeLLM = vi.mocked(invokeLLM);
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "这不是 JSON 格式的回复",
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      } as Awaited<ReturnType<typeof invokeLLM>>);

      setupSelectSkills([]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.recommendSkills({
        taskDescription: "帮我分析亚马逊运营数据",
      });

      // 应优雅降级，返回空推荐列表
      expect(result).toHaveProperty("recommendations");
      expect(result.recommendations).toEqual([]);
    });
  });
});
