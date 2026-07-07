/**
 * Skills Router Tests
 * Covers: list, create, update, delete, getVersions, rollback, getLogs, getStats, getAvailableModels
 *
 * DB call order for `create`:
 *   1. select → slug uniqueness check (must return [])
 *   2. insert → create skill record (returns [{ insertId }])
 *   3. insert → create version 1 record
 *   4. insert → write audit log
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

// Mock invokeLLM to avoid real API calls
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Mocked LLM response" } }],
    usage: { prompt_tokens: 50, completion_tokens: 100 },
  }),
}));

import { appRouter } from "./routers";

// ─── Context factory ───────────────────────────────────────────────────────────
function createCtx(role: "admin" | "user" = "admin"): TrpcContext {
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

// ─── Mock setup helpers ────────────────────────────────────────────────────────

/** select().from().where().limit() → empty (slug not taken) */
function setupSlugCheckEmpty() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

/** insert().values() → returns { insertId } for skill creation */
function setupInsertSkill(insertId = 1) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue({ insertId }),
  });
}

/** insert().values() → version record (no return needed) */
function setupInsertVersion() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

/** insert().values() → audit log (no return needed) */
function setupInsertAuditLog() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

/** Full setup for a successful create */
function setupCreateSuccess(insertId = 1) {
  setupSlugCheckEmpty();
  setupInsertSkill(insertId);
  setupInsertVersion();
  setupInsertAuditLog();
}

// ─── Sample data ───────────────────────────────────────────────────────────────
const sampleSkill = {
  id: 1,
  name: "Text Summarizer",
  slug: "text-summarizer",
  description: "Summarize long texts",
  category: "文本处理",
  scope: "project",
  promptTemplate: "Please summarize: {{input}}",
  systemPrompt: "You are a helpful assistant.",
  inputSchema: { input: "string" },
  outputSchema: { summary: "string" },
  modelId: null,
  modelParams: { temperature: 0.7, maxTokens: 2048 },
  knowledgeCollections: [],
  mcpDependencies: [],
  currentVersion: 1,
  status: "active",
  projectId: null,
  createdBy: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleVersion = {
  id: 1,
  skillId: 1,
  version: 1,
  promptTemplate: "Please summarize: {{input}}",
  systemPrompt: "You are a helpful assistant.",
  modelId: null,
  modelParams: {},
  changeNote: "初始版本",
  createdBy: 1,
  createdAt: new Date(),
};

const sampleCallLog = {
  id: 1,
  skillId: 1,
  skillVersion: 1,
  modelId: null,
  projectId: null,
  source: "manual",
  inputData: { input: "test" },
  outputData: { text: "summary" },
  inputTokens: 50,
  outputTokens: 100,
  durationMs: 1200,
  adopted: false,
  errorMessage: null,
  createdAt: new Date(),
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("skills.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an array of skills", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([sampleSkill]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.list({});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("text-summarizer");
  });

  it("filters by status on the client side", async () => {
    const draftSkill = { ...sampleSkill, id: 2, slug: "draft-skill", status: "draft" };
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([sampleSkill, draftSkill]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.list({ status: "active" });

    expect(result.length).toBe(1);
    expect(result[0].status).toBe("active");
  });

  it("filters by search term", async () => {
    const otherSkill = { ...sampleSkill, id: 3, name: "Code Generator", slug: "code-gen" };
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([sampleSkill, otherSkill]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.list({ search: "summarizer" });

    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("text-summarizer");
  });
});

describe("skills.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a skill and returns id + slug", async () => {
    setupCreateSuccess(42);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.create({
      name: "Text Summarizer",
      slug: "text-summarizer",
      promptTemplate: "Summarize: {{input}}",
      scope: "project",
    });

    expect(result.id).toBe(42);
    expect(result.slug).toBe("text-summarizer");
  });

  it("throws CONFLICT when slug is already taken", async () => {
    // Slug check returns existing record
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 99 }]),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.skills.create({
        name: "Duplicate",
        slug: "text-summarizer",
        promptTemplate: "Test",
        scope: "project",
      })
    ).rejects.toThrow("Slug 已被占用");
  });
});

describe("skills.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a skill by id", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([sampleSkill]),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.get({ id: 1 });

    expect(result.id).toBe(1);
    expect(result.name).toBe("Text Summarizer");
  });

  it("throws NOT_FOUND when skill does not exist", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    await expect(caller.skills.get({ id: 999 })).rejects.toThrow();
  });
});

describe("skills.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a skill and returns success", async () => {
    // get skill first
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([sampleSkill]),
        }),
      }),
    });
    // audit log insert
    setupInsertAuditLog();

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.delete({ id: 1 });

    expect(result.success).toBe(true);
  });
});

describe("skills.getVersions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns version list for a skill", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([sampleVersion]),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.getVersions({ skillId: 1 });

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].version).toBe(1);
  });
});

describe("skills.getLogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns call logs for a skill", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([sampleCallLog]),
          }),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.getLogs({ skillId: 1, limit: 50 });

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].source).toBe("manual");
  });
});

describe("skills.getStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stats with totalCalls, avgDurationMs, adoptionRate, totalTokens", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([sampleCallLog, { ...sampleCallLog, id: 2, adopted: true }]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.getStats({ skillId: 1 });

    expect(result.totalCalls).toBe(2);
    expect(result.adoptionRate).toBe(50);
    expect(result.totalTokens).toBe(300); // (50+100) * 2 / 2 = 150 each, total 300
    expect(typeof result.avgDurationMs).toBe("number");
  });

  it("returns zero stats when no logs exist", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.getStats({ skillId: 99 });

    expect(result.totalCalls).toBe(0);
    expect(result.adoptionRate).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.avgDurationMs).toBe(0);
  });
});

describe("skills.getAvailableModels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active models", async () => {
    const sampleModel = { id: 1, name: "GPT-4", modelId: "gpt-4", provider: "OpenAI", status: "active", isDefault: true };
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([sampleModel]),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.skills.getAvailableModels();

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("GPT-4");
  });
});

// ─── runByApiKey Tests ──────────────────────────────────────────────────────────
describe("skills.runByApiKey", () => {
  const MOCK_API_KEY = "test-skill-api-key-32chars-xxxxxxxx";

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.SKILL_API_KEY = MOCK_API_KEY;

    // Default: insert succeeds
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 99 }]),
    });

    // Re-apply invokeLLM mock after resetAllMocks
    const { invokeLLM } = await import("./_core/llm");
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: "Mocked LLM response" } }],
      usage: { prompt_tokens: 50, completion_tokens: 100 },
    } as any);
  });

  it("rejects request with missing Authorization header", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { headers: {} } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.skills.runByApiKey({ slug: "listing.title.generate", inputs: {} })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects request with wrong API key", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { headers: { authorization: "Bearer wrong-key" } } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.skills.runByApiKey({ slug: "listing.title.generate", inputs: {} })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns NOT_FOUND when skill slug does not exist", async () => {
    // Mock getDb to return db with select returning empty array
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValueOnce({
      insert: mockInsert,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn(),
      delete: vi.fn(),
    } as any);

    const ctx: TrpcContext = {
      user: null,
      req: { headers: { authorization: `Bearer ${MOCK_API_KEY}` } } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.skills.runByApiKey({ slug: "nonexistent.skill", inputs: {} })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("successfully runs skill with valid API key and returns output", async () => {
    const mockSkill = {
      id: 1,
      slug: "listing.title.generate",
      name: "Listing标题生成",
      promptTemplate: "请为{{product}}生成标题",
      systemPrompt: "你是一个亚马逊标题优化专家",
      modelId: null,
      modelParams: { maxTokens: 2000 },
      currentVersion: 1,
      projectId: null,
      status: "active",
    };

    // Both getDb calls share the same mock db instance
    const mockInsertWithValues = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 99 }]),
    });
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue({
      insert: mockInsertWithValues,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSkill]),
          }),
        }),
      }),
      update: vi.fn(),
      delete: vi.fn(),
    } as any);

    const ctx: TrpcContext = {
      user: null,
      req: { headers: { authorization: `Bearer ${MOCK_API_KEY}` } } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.skills.runByApiKey({
      slug: "listing.title.generate",
      inputs: { product: "蓝牙耳机" },
    });

    expect(result).toMatchObject({
      slug: "listing.title.generate",
      output: "Mocked LLM response",
      version: 1,
    });
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(100);
  });

  it("SKILL_API_KEY not configured returns INTERNAL_SERVER_ERROR", async () => {
    delete process.env.SKILL_API_KEY;

    const ctx: TrpcContext = {
      user: null,
      req: { headers: { authorization: `Bearer ${MOCK_API_KEY}` } } as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.skills.runByApiKey({ slug: "listing.title.generate", inputs: {} })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
