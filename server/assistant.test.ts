/**
 * Assistant Router Tests
 * Covers: chat, chatWithSession, createSession, listSessions,
 *         getSessionMessages, deleteSession, updateSessionTitle,
 *         getAgentOptimizationTips, recommendSkills
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
function setupInsertReturnsId(insertId = 1) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue([{ insertId }]),
  });
}

function setupSelectEmpty() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

function setupSelectSession(session = {
  id: 1,
  title: "测试会话",
  userId: 1,
  agentId: null,
  context: null,
  messageCount: 2,
  lastMessagePreview: "上一条消息预览",
  createdAt: new Date(),
  updatedAt: new Date(),
}) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([session]),
      }),
    }),
  });
}

function setupSelectSessionForQuery(sessions: object[] = []) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(sessions),
          }),
        }),
      }),
    }),
  });
}

function setupSelectMessages(messages: object[] = []) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(messages),
      }),
    }),
  });
}

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

  // ── createSession ───────────────────────────────────────────────────────────
  describe("createSession", () => {
    it("应创建新会话并返回会话数据", async () => {
      setupInsertReturnsId(1);
      setupSelectSession({ id: 1, title: "新对话", userId: 1, agentId: null, context: null, messageCount: 0, lastMessagePreview: null, createdAt: new Date(), updatedAt: new Date() });

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.createSession({ title: "新对话" });

      expect(result).toHaveProperty("id");
      expect(result.title).toBe("新对话");
    });

    it("应支持传入 agentId 和 context", async () => {
      setupInsertReturnsId(2);
      setupSelectSession({ id: 2, title: "Agent 配置对话", userId: 1, agentId: 5, context: "当前编辑 Agent：测试", messageCount: 0, lastMessagePreview: null, createdAt: new Date(), updatedAt: new Date() });

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.createSession({
        title: "Agent 配置对话",
        agentId: 5,
        context: "当前编辑 Agent：测试",
      });

      expect(result.id).toBe(2);
    });

    it("未登录用户应被拒绝", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
      });
      await expect(caller.assistant.createSession({ title: "测试" })).rejects.toThrow();
    });
  });

  // ── listSessions ────────────────────────────────────────────────────────────
  describe("listSessions", () => {
    it("应返回当前用户的会话列表", async () => {
      setupSelectSessionForQuery([
        { id: 1, title: "对话1", userId: 1, messageCount: 3, lastMessagePreview: "预览1", updatedAt: new Date() },
        { id: 2, title: "对话2", userId: 1, messageCount: 5, lastMessagePreview: "预览2", updatedAt: new Date() },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.listSessions({ limit: 20, offset: 0 });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].title).toBe("对话1");
    });

    it("无会话时应返回空列表", async () => {
      setupSelectSessionForQuery([]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.listSessions({ limit: 20, offset: 0 });

      expect(result.sessions).toHaveLength(0);
    });
  });

  // ── getSessionMessages ──────────────────────────────────────────────────────
  describe("getSessionMessages", () => {
    it("应返回会话及其消息列表", async () => {
      setupSelectSession();
      setupSelectMessages([
        { id: 1, sessionId: 1, role: "user", content: "你好", createdAt: new Date() },
        { id: 2, sessionId: 1, role: "assistant", content: "你好！有什么可以帮你？", createdAt: new Date() },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.getSessionMessages({ sessionId: 1 });

      expect(result.session).toBeTruthy();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[1].role).toBe("assistant");
    });

    it("会话不存在时应抛出错误", async () => {
      setupSelectEmpty();

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.getSessionMessages({ sessionId: 999 })
      ).rejects.toThrow("会话不存在或无权访问");
    });

    it("访问他人会话应抛出错误", async () => {
      // 返回 userId=2 的会话（当前用户是 userId=1）
      setupSelectSession({ id: 1, title: "他人会话", userId: 2, agentId: null, context: null, messageCount: 0, lastMessagePreview: null, createdAt: new Date(), updatedAt: new Date() });

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.getSessionMessages({ sessionId: 1 })
      ).rejects.toThrow("会话不存在或无权访问");
    });
  });

  // ── deleteSession ───────────────────────────────────────────────────────────
  describe("deleteSession", () => {
    it("应成功删除会话", async () => {
      setupSelectSession();

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.deleteSession({ sessionId: 1 });

      expect(result.success).toBe(true);
      // 验证 delete 被调用了两次（消息 + 会话）
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    it("删除他人会话应抛出错误", async () => {
      setupSelectSession({ id: 1, title: "他人会话", userId: 2, agentId: null, context: null, messageCount: 0, lastMessagePreview: null, createdAt: new Date(), updatedAt: new Date() });

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.deleteSession({ sessionId: 1 })
      ).rejects.toThrow("会话不存在或无权访问");
    });
  });

  // ── updateSessionTitle ──────────────────────────────────────────────────────
  describe("updateSessionTitle", () => {
    it("应成功更新会话标题", async () => {
      setupSelectSession();

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.updateSessionTitle({
        sessionId: 1,
        title: "新标题",
      });

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("标题为空时应抛出验证错误", async () => {
      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.updateSessionTitle({ sessionId: 1, title: "" })
      ).rejects.toThrow();
    });
  });

  // ── chatWithSession ─────────────────────────────────────────────────────────
  describe("chatWithSession", () => {
    it("不传 sessionId 时应自动创建新会话", async () => {
      // 创建会话
      setupInsertReturnsId(10);
      // 保存用户消息
      mockInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) });
      // 加载历史消息（带 limit）
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 1, sessionId: 10, role: "user", content: "你好", createdAt: new Date() },
              ]),
            }),
          }),
        }),
      });
      // 保存 AI 回复
      mockInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) });
      // 更新会话元数据
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chatWithSession({
        userMessage: "你好",
      });

      expect(result.sessionId).toBe(10);
      expect(result.content).toBeTruthy();
      expect(result.usage).toHaveProperty("inputTokens");
    });

    it("传入 sessionId 时应验证会话归属并继续对话", async () => {
      // 验证会话
      setupSelectSession();
      // 保存用户消息
      mockInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) });
      // 加载历史消息（含之前的对话，带 limit）
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 1, sessionId: 1, role: "user", content: "之前的问题", createdAt: new Date() },
                { id: 2, sessionId: 1, role: "assistant", content: "之前的回答", createdAt: new Date() },
                { id: 3, sessionId: 1, role: "user", content: "继续问", createdAt: new Date() },
              ]),
            }),
          }),
        }),
      });
      // 保存 AI 回复
      mockInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) });
      // 更新会话元数据
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.chatWithSession({
        sessionId: 1,
        userMessage: "继续问",
      });

      expect(result.sessionId).toBe(1);
      expect(result.content).toBeTruthy();
    });

    it("访问他人会话应抛出错误", async () => {
      setupSelectSession({ id: 1, title: "他人会话", userId: 2, agentId: null, context: null, messageCount: 0, lastMessagePreview: null, createdAt: new Date(), updatedAt: new Date() });

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.chatWithSession({ sessionId: 1, userMessage: "测试" })
      ).rejects.toThrow("会话不存在或无权访问");
    });

    it("消息内容为空时应抛出验证错误", async () => {
      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.chatWithSession({ userMessage: "" })
      ).rejects.toThrow();
    });
  });

  // ── chat（无状态兼容接口）──────────────────────────────────────────────────
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

      expect(result.usage).toHaveProperty("inputTokens");
      expect(result.usage).toHaveProperty("outputTokens");
    });

    it("未登录用户应被拒绝访问", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
      });
      await expect(
        caller.assistant.chat({ messages: [{ role: "user", content: "你好" }] })
      ).rejects.toThrow();
    });
  });

  // ── getAgentOptimizationTips ────────────────────────────────────────────────
  describe("getAgentOptimizationTips", () => {
    it("应返回 Agent 优化建议", async () => {
      setupSelectAgent();
      setupSelectRuns([
        { status: "completed", durationMs: 1200, errorMessage: null },
        { status: "failed", durationMs: null, errorMessage: "LLM 超时" },
        { status: "completed", durationMs: 800, errorMessage: null },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.getAgentOptimizationTips({ agentId: 1 });

      expect(result).toHaveProperty("tips");
      expect(result).toHaveProperty("runStats");
      expect(result.runStats.total).toBe(3);
      expect(result.runStats.failed).toBe(1);
    });

    it("Agent 不存在时应抛出错误", async () => {
      setupSelectEmpty();

      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.getAgentOptimizationTips({ agentId: 999 })
      ).rejects.toThrow("Agent 不存在");
    });
  });

  // ── recommendSkills ─────────────────────────────────────────────────────────
  describe("recommendSkills", () => {
    it("应返回 Skill 推荐结果", async () => {
      const { invokeLLM } = await import("./_core/llm");
      const mockInvokeLLM = vi.mocked(invokeLLM);
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendations: [
                  { skillId: 1, skillName: "标题优化", reason: "适合优化标题", order: 1 },
                ],
                workflowSuggestion: "先运行关键词分析，再运行标题优化",
                summary: "推荐 1 个 Skill",
              }),
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 150 },
      } as Awaited<ReturnType<typeof invokeLLM>>);

      setupSelectSkills([
        { id: 1, name: "标题优化", description: "优化亚马逊标题", category: "listing" },
      ]);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.assistant.recommendSkills({
        taskDescription: "我想优化亚马逊 Listing 的标题和关键词",
      });

      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("workflowSuggestion");
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("任务描述过短时应抛出验证错误", async () => {
      const caller = appRouter.createCaller(createCtx());
      await expect(
        caller.assistant.recommendSkills({ taskDescription: "优化" })
      ).rejects.toThrow();
    });
  });
});
