/**
 * MCP Router Tests
 * Covers: list, create (4 auth modes), healthCheck, callLogs, capability HTTP methods
 *
 * DB call order for `create`:
 *   1. select  → slug uniqueness check (must return [])
 *   2. insert  → create tool record (returns [{ insertId }])
 *   3. insert  → write audit log (via writeAuditLog helper)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Hoisted mocks (avoids TDZ with vi.mock factory) ─────────────────────────
const { mockInsert, mockSelect, mockUpdate } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  return { mockInsert, mockSelect, mockUpdate };
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { appRouter } from "./routers";

// ─── Context factory ──────────────────────────────────────────────────────────
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

// ─── Mock setup helpers ───────────────────────────────────────────────────────

/** select().from().where().limit() → returns empty (slug not taken) */
function setupSlugCheckEmpty() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
}

/** insert().values() → returns [{ insertId }] for tool creation */
function setupInsertTool(insertId = 1) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue([{ insertId }]),
  });
}

/** insert().values() → audit log insert (no return value needed) */
function setupInsertAuditLog() {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

/** Full setup for a successful create: slug check + tool insert + audit log */
function setupCreateSuccess(insertId = 1) {
  setupSlugCheckEmpty();
  setupInsertTool(insertId);
  setupInsertAuditLog();
}

// ─── Sample data ──────────────────────────────────────────────────────────────
const sampleTool = {
  id: 1,
  slug: "test-mcp",
  name: "Test MCP Tool",
  description: "A test MCP tool",
  type: "rest_api",
  config: { baseUrl: "https://api.example.com", headers: {} },
  status: "active",
  authConfig: { type: "none" },
  capabilities: [],
  retryCount: 3,
  timeoutMs: 5000,
  projectId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  totalCalls: 100,
  successCalls: 95,
  avgLatencyMs: 120,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mcp.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an array of MCP tools", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([sampleTool]),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.list({});

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("mcp.create — auth modes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a tool with no-auth config", async () => {
    setupCreateSuccess(1);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.create({
      slug: "no-auth-mcp",
      name: "No Auth MCP",
      type: "rest_api",
      config: { baseUrl: "https://api.example.com" },
      authConfig: { type: "none" },
      capabilities: [],
    });

    expect(result.id).toBe(1);
    expect(result.success).toBe(true);
  });

  it("creates a tool with api_key auth", async () => {
    setupCreateSuccess(2);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.create({
      slug: "api-key-mcp",
      name: "API Key MCP",
      type: "rest_api",
      config: { baseUrl: "https://api.example.com" },
      authConfig: { type: "api_key", key: "secret-key-12345", header: "X-API-Key" },
      capabilities: [],
    });

    expect(result.id).toBe(2);
    expect(result.success).toBe(true);
  });

  it("creates a tool with bearer token auth", async () => {
    setupCreateSuccess(3);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.create({
      slug: "bearer-mcp",
      name: "Bearer MCP",
      type: "rest_api",
      config: { baseUrl: "https://api.example.com" },
      authConfig: { type: "bearer", token: "my-bearer-token" },
      capabilities: [],
    });

    expect(result.id).toBe(3);
    expect(result.success).toBe(true);
  });

  it("creates a tool with basic auth", async () => {
    setupCreateSuccess(4);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.create({
      slug: "basic-mcp",
      name: "Basic Auth MCP",
      type: "rest_api",
      config: { baseUrl: "https://api.example.com" },
      authConfig: { type: "basic", username: "admin", password: "pass123" },
      capabilities: [],
    });

    expect(result.id).toBe(4);
    expect(result.success).toBe(true);
  });
});

describe("mcp.healthCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns healthy when endpoint responds 200", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([sampleTool]),
        }),
      }),
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.healthCheck({ id: 1 });

    expect(result.status).toBe("active");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy when endpoint throws", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([sampleTool]),
        }),
      }),
    });
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.healthCheck({ id: 1 });

    expect(result.status).toBe("error");
    expect(result).toHaveProperty("error");
  });
});

describe("mcp.callLogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns call logs array with limit respected", async () => {
    const mockLogs = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      toolId: 1,
      capabilityName: "search",
      inputPayload: { query: "test" },
      outputPayload: { results: [] },
      statusCode: 200,
      latencyMs: 100 + i,
      success: true,
      errorMessage: null,
      createdAt: new Date(),
    }));

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockLogs),
          }),
        }),
        // also handle no-where case
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(mockLogs),
        }),
      }),
    });

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.mcp.getLogs({ toolId: 1, limit: 30 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("mcp capability — HTTP method validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts all 5 HTTP methods in capability definitions", async () => {
    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

    for (const method of methods) {
      setupCreateSuccess(10);

      const caller = appRouter.createCaller(createCtx());
      const result = await caller.mcp.create({
        slug: `mcp-${method.toLowerCase()}`,
        name: `MCP ${method}`,
        type: "rest_api",
        config: { baseUrl: "https://api.example.com" },
        authConfig: { type: "none" },
        capabilities: [
          {
            name: `do-${method.toLowerCase()}`,
            description: `Test ${method} capability`,
            method,
            path: `/${method.toLowerCase()}`,
            inputSchema: {},
            outputSchema: {},
          },
        ],
      });

      expect(result).toHaveProperty("id");
      expect(result.success).toBe(true);
    }
  });
});
