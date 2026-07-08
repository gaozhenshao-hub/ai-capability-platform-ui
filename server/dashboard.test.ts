/**
 * Dashboard Router Tests — Phase 6.3
 * Covers: getAssistantStats (Token 用量统计)
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
    choices: [{ message: { content: "Mocked LLM response" } }],
    usage: { prompt_tokens: 50, completion_tokens: 100 },
  }),
  listLLMModels: vi.fn().mockResolvedValue({ object: "list", data: [] }),
}));

import { appRouter } from "./routers";

// ─── Context factory ───────────────────────────────────────────────────────────
function createCtx(role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      avatar: null,
      role,
      platformRole: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Helper: mock select chain for overview (no orderBy/groupBy) ────────────────
function setupOverviewSelect(data: Record<string, unknown>[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(data),
    }),
  });
}

// ─── Helper: mock select chain for trend (with groupBy/orderBy) ─────────────────
function setupTrendSelect(data: Record<string, unknown>[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(data),
        }),
      }),
    }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────
describe("dashboardRouter > getAssistantStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("7d 范围：应返回总览卡片和 Token 趋势数据", async () => {
    // 1. 会话总览查询（totalSessions + totalMessages）
    setupOverviewSelect([{ totalSessions: 5, totalMessages: 42 }]);
    // 2. Token 汇总查询（totalInputTokens + totalOutputTokens）
    setupOverviewSelect([{ totalInputTokens: 12000, totalOutputTokens: 8000 }]);
    // 3. 按天趋势查询
    setupTrendSelect([
      { day: "2026-07-01", inputTokens: 3000, outputTokens: 2000, messages: 10 },
      { day: "2026-07-02", inputTokens: 4500, outputTokens: 3000, messages: 15 },
    ]);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.dashboard.getAssistantStats({ range: "7d" });

    expect(result.overview).not.toBeNull();
    expect(result.overview?.totalSessions).toBe(5);
    expect(result.overview?.totalMessages).toBe(42);
    expect(result.overview?.totalInputTokens).toBe(12000);
    expect(result.overview?.totalOutputTokens).toBe(8000);
    expect(Array.isArray(result.trend)).toBe(true);
    expect(result.trend.length).toBe(2);
    expect(result.trend[0]).toHaveProperty("day");
    expect(result.trend[0]).toHaveProperty("inputTokens");
    expect(result.trend[0]).toHaveProperty("outputTokens");
    expect(result.trend[0]).toHaveProperty("messages");
  });

  it("30d 范围：应正常返回数据", async () => {
    setupOverviewSelect([{ totalSessions: 20, totalMessages: 180 }]);
    setupOverviewSelect([{ totalInputTokens: 50000, totalOutputTokens: 35000 }]);
    setupTrendSelect([]);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.dashboard.getAssistantStats({ range: "30d" });

    expect(result.overview?.totalSessions).toBe(20);
    expect(result.trend).toEqual([]);
  });

  it("无数据时应返回零值 overview 和空 trend", async () => {
    // 会话总览返回空（无记录）
    setupOverviewSelect([]);
    // Token 汇总返回空
    setupOverviewSelect([]);
    // 趋势返回空
    setupTrendSelect([]);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.dashboard.getAssistantStats({ range: "7d" });

    expect(result.overview?.totalSessions).toBe(0);
    expect(result.overview?.totalMessages).toBe(0);
    expect(result.overview?.totalInputTokens).toBe(0);
    expect(result.overview?.totalOutputTokens).toBe(0);
    expect(result.trend).toEqual([]);
  });

  it("未登录用户应被拒绝访问", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(
      caller.dashboard.getAssistantStats({ range: "7d" })
    ).rejects.toThrow();
  });

  it("trend 数据应包含正确的数值类型", async () => {
    setupOverviewSelect([{ totalSessions: 3, totalMessages: 25 }]);
    setupOverviewSelect([{ totalInputTokens: "7500", totalOutputTokens: "5000" }]); // 字符串 → 应被 Number() 转换
    setupTrendSelect([
      { day: "2026-07-05", inputTokens: "2500", outputTokens: "1800", messages: 8 },
    ]);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.dashboard.getAssistantStats({ range: "7d" });

    // Token 值应被 Number() 转换为数字
    expect(typeof result.overview?.totalInputTokens).toBe("number");
    expect(typeof result.overview?.totalOutputTokens).toBe("number");
    expect(typeof result.trend[0]?.inputTokens).toBe("number");
    expect(typeof result.trend[0]?.outputTokens).toBe("number");
  });
});
