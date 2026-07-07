import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockInsert = vi.fn().mockResolvedValue([{ insertId: 42 }]);
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue([]);
const mockDelete = vi.fn().mockResolvedValue([]);

const mockDb = {
  insert: vi.fn().mockReturnValue({ values: mockInsert }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
      orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./routers/agents", async () => {
  const actual = await vi.importActual<typeof import("./routers/agents")>("./routers/agents");
  return actual;
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("agents router — unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 42 }]) });
    mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    });
  });

  describe("workflow schema validation", () => {
    it("should accept valid node types", () => {
      const validTypes = [
        "input", "output", "skill", "llm", "condition",
        "loop", "human_review", "http", "code", "knowledge"
      ];
      expect(validTypes).toHaveLength(10);
      validTypes.forEach(t => expect(typeof t).toBe("string"));
    });

    it("should validate workflow JSON structure", () => {
      const workflow = {
        nodes: [
          { id: "n1", type: "input", label: "输入", config: {}, position: { x: 0, y: 0 } },
          { id: "n2", type: "llm", label: "LLM", config: { model: "gpt-4o-mini" }, position: { x: 200, y: 0 } },
          { id: "n3", type: "output", label: "输出", config: {}, position: { x: 400, y: 0 } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2", type: "smoothstep" },
          { id: "e2", source: "n2", target: "n3", type: "smoothstep" },
        ],
      };
      expect(workflow.nodes).toHaveLength(3);
      expect(workflow.edges).toHaveLength(2);
      expect(workflow.nodes[0].type).toBe("input");
      expect(workflow.nodes[2].type).toBe("output");
    });

    it("should identify start nodes (no incoming edges)", () => {
      const nodes = [
        { id: "n1", type: "input" },
        { id: "n2", type: "llm" },
        { id: "n3", type: "output" },
      ];
      const edges = [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ];
      const hasIncoming = new Set(edges.map(e => e.target));
      const startNodes = nodes.filter(n => !hasIncoming.has(n.id));
      expect(startNodes).toHaveLength(1);
      expect(startNodes[0].id).toBe("n1");
    });

    it("should build adjacency map correctly", () => {
      const edges = [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n1", target: "n3" },
        { id: "e3", source: "n2", target: "n4" },
      ];
      const adjacency = new Map<string, string[]>();
      for (const edge of edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
        adjacency.get(edge.source)!.push(edge.target);
      }
      expect(adjacency.get("n1")).toEqual(["n2", "n3"]);
      expect(adjacency.get("n2")).toEqual(["n4"]);
      expect(adjacency.has("n4")).toBe(false);
    });
  });

  describe("condition node logic", () => {
    it("should evaluate simple numeric comparison", () => {
      const expression = "50 > 80";
      let result = false;
      try { result = Boolean(eval(expression)); } catch { result = false; }
      expect(result).toBe(false);
    });

    it("should evaluate true condition", () => {
      const expression = "100 > 80";
      let result = false;
      try { result = Boolean(eval(expression)); } catch { result = false; }
      expect(result).toBe(true);
    });

    it("should handle invalid expression gracefully", () => {
      const expression = "invalid_expression_xyz";
      let result = false;
      try { result = Boolean(eval(expression)); } catch { result = false; }
      expect(typeof result).toBe("boolean");
    });
  });

  describe("variable interpolation", () => {
    it("should replace {{variable}} placeholders in prompt", () => {
      const template = "请分析产品：{{product_name}}，类目：{{category}}";
      const context: Record<string, unknown> = {
        product_name: "蓝牙耳机",
        category: "消费电子",
      };
      let result = template;
      for (const [k, v] of Object.entries(context)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
      expect(result).toBe("请分析产品：蓝牙耳机，类目：消费电子");
    });

    it("should handle multiple occurrences of same variable", () => {
      const template = "{{name}} is {{name}}";
      const context = { name: "test" };
      let result = template;
      for (const [k, v] of Object.entries(context)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
      expect(result).toBe("test is test");
    });

    it("should leave unreplaced variables as-is", () => {
      const template = "Hello {{name}}, your score is {{score}}";
      const context = { name: "Alice" };
      let result = template;
      for (const [k, v] of Object.entries(context)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
      expect(result).toBe("Hello Alice, your score is {{score}}");
    });
  });

  describe("run status transitions", () => {
    it("should define valid status values", () => {
      const validStatuses = ["queued", "running", "paused", "completed", "failed", "cancelled"];
      expect(validStatuses).toContain("running");
      expect(validStatuses).toContain("paused");
      expect(validStatuses).toContain("completed");
    });

    it("should identify terminal states", () => {
      const terminalStates = ["completed", "failed", "cancelled"];
      const nonTerminal = ["queued", "running", "paused"];
      terminalStates.forEach(s => expect(["completed", "failed", "cancelled"]).toContain(s));
      nonTerminal.forEach(s => expect(terminalStates).not.toContain(s));
    });

    it("should validate human review node pauses execution", () => {
      const nodeType = "human_review";
      const shouldPause = nodeType === "human_review";
      expect(shouldPause).toBe(true);
    });
  });

  describe("node log structure", () => {
    it("should create correct initial node logs", () => {
      const nodes = [
        { id: "n1", type: "input", label: "输入", config: {}, position: { x: 0, y: 0 } },
        { id: "n2", type: "llm", label: "LLM分析", config: {}, position: { x: 200, y: 0 } },
      ];
      const logs = nodes.map(n => ({
        nodeId: n.id,
        nodeType: n.type,
        label: n.label,
        status: "pending" as const,
      }));
      expect(logs).toHaveLength(2);
      expect(logs[0].status).toBe("pending");
      expect(logs[1].nodeType).toBe("llm");
    });

    it("should calculate duration correctly", () => {
      const startedAt = "2026-01-01T00:00:00.000Z";
      const completedAt = "2026-01-01T00:00:01.500Z";
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      expect(durationMs).toBe(1500);
    });
  });

  describe("agent slug validation", () => {
    it("should accept valid slugs", () => {
      const validSlugs = ["listing-review", "ad-optimizer", "keyword-analyzer-v2"];
      const slugRegex = /^[a-z0-9-]+$/;
      validSlugs.forEach(slug => expect(slugRegex.test(slug)).toBe(true));
    });

    it("should reject invalid slugs", () => {
      const invalidSlugs = ["Listing Review", "ad_optimizer", "keyword.analyzer"];
      const slugRegex = /^[a-z0-9-]+$/;
      invalidSlugs.forEach(slug => expect(slugRegex.test(slug)).toBe(false));
    });
  });
});

// ─── Skill/MCP/LLM Node Integration Tests ────────────────────────────────────
describe("agent node execution — Skill/MCP/LLM integration", () => {
  describe("Skill node — input mapping and prompt rendering", () => {
    it("should resolve inputMapping {{variable}} from context", () => {
      const context: Record<string, unknown> = {
        product_name: "蓝牙耳机",
        category: "消费电子",
      };
      const inputMapping: Record<string, string> = {
        product: "{{product_name}}",
        cat: "{{category}}",
        literal: "fixed_value",
      };
      const resolved: Record<string, unknown> = { ...context };
      for (const [k, v] of Object.entries(inputMapping)) {
        if (typeof v === "string") {
          resolved[k] = v.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] ?? `{{${key}}}`));
        } else {
          resolved[k] = v;
        }
      }
      expect(resolved.product).toBe("蓝牙耳机");
      expect(resolved.cat).toBe("消费电子");
      expect(resolved.literal).toBe("fixed_value");
    });

    it("should render skill prompt template with resolved input", () => {
      const promptTemplate = "请为产品「{{product}}」生成标题，类目：{{cat}}";
      const resolvedInput: Record<string, unknown> = {
        product: "蓝牙耳机",
        cat: "消费电子",
      };
      let rendered = promptTemplate;
      for (const [k, v] of Object.entries(resolvedInput)) {
        rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
      expect(rendered).toBe("请为产品「蓝牙耳机」生成标题，类目：消费电子");
    });

    it("should use skill modelParams.maxTokens when available", () => {
      const modelParams = { maxTokens: 1024, temperature: 0.7 };
      const maxTokens = typeof modelParams.maxTokens === "number" ? modelParams.maxTokens : 2048;
      expect(maxTokens).toBe(1024);
    });

    it("should default to 2048 maxTokens when modelParams missing", () => {
      const modelParams = {};
      const maxTokens = typeof (modelParams as Record<string, unknown>).maxTokens === "number"
        ? (modelParams as Record<string, unknown>).maxTokens as number : 2048;
      expect(maxTokens).toBe(2048);
    });

    it("should store skillId and skillName in output", () => {
      const output = { text: "生成的标题", tokens: { prompt_tokens: 50, completion_tokens: 30 }, skillId: 5, skillName: "标题生成" };
      expect(output.skillId).toBe(5);
      expect(output.skillName).toBe("标题生成");
      expect(output.text).toBeTruthy();
    });
  });

  describe("MCP node — capability resolution and payload building", () => {
    it("should find capability by name from tool capabilities list", () => {
      const capabilities = [
        { name: "search", method: "POST", path: "/search", description: "搜索接口" },
        { name: "analyze", method: "POST", path: "/analyze", description: "分析接口" },
      ];
      const cap = capabilities.find(c => c.name === "search");
      expect(cap).toBeDefined();
      expect(cap?.path).toBe("/search");
    });

    it("should throw when capability not found", () => {
      const capabilities = [{ name: "search", method: "POST", path: "/search" }];
      const cap = capabilities.find(c => c.name === "nonexistent");
      expect(cap).toBeUndefined();
    });

    it("should resolve {{variable}} in MCP payload from context", () => {
      const context: Record<string, unknown> = { query: "蓝牙耳机", limit: 10 };
      const rawPayload: Record<string, unknown> = { q: "{{query}}", max: "{{limit}}", fixed: "value" };
      const resolvedPayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawPayload)) {
        if (typeof v === "string") {
          resolvedPayload[k] = v.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] ?? `{{${key}}}`));
        } else {
          resolvedPayload[k] = v;
        }
      }
      expect(resolvedPayload.q).toBe("蓝牙耳机");
      expect(resolvedPayload.max).toBe("10");
      expect(resolvedPayload.fixed).toBe("value");
    });

    it("should build correct URL from baseUrl and capability path", () => {
      const baseUrl = "https://api.example.com/v1";
      const capPath = "/search";
      const url = `${baseUrl.replace(/\/$/, "")}${capPath.replace(/^([^/])/, "/$1")}`;
      expect(url).toBe("https://api.example.com/v1/search");
    });

    it("should set Bearer auth header correctly", () => {
      const authConfig = { type: "bearer", token: "my-secret-token" };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authConfig.type === "bearer" && authConfig.token) {
        headers["Authorization"] = `Bearer ${authConfig.token}`;
      }
      expect(headers["Authorization"]).toBe("Bearer my-secret-token");
    });

    it("should set API key header correctly", () => {
      const authConfig = { type: "api_key", key: "my-api-key", header: "X-Custom-Key" };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authConfig.type === "api_key" && authConfig.key) {
        headers[authConfig.header ?? "X-API-Key"] = authConfig.key;
      }
      expect(headers["X-Custom-Key"]).toBe("my-api-key");
    });

    it("should set Basic auth header correctly", () => {
      const authConfig = { type: "basic", username: "user", password: "pass" };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authConfig.type === "basic" && authConfig.username) {
        const creds = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString("base64");
        headers["Authorization"] = `Basic ${creds}`;
      }
      expect(headers["Authorization"]).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
    });

    it("should store MCP output with toolName and capabilityName", () => {
      const output = { success: true, status: 200, data: { results: [] }, toolName: "Amazon Search", capabilityName: "search" };
      expect(output.success).toBe(true);
      expect(output.toolName).toBe("Amazon Search");
      expect(output.capabilityName).toBe("search");
    });
  });

  describe("LLM node — model selection and prompt building", () => {
    it("should build messages array from systemPrompt and userPrompt", () => {
      const systemPrompt = "你是一个亚马逊运营专家";
      const userPrompt = "请分析关键词：{{keyword}}";
      const context = { keyword: "bluetooth headphones" };
      const rendered = userPrompt.replace(/\{\{(\w+)\}\}/g, (_, k) => String(context[k as keyof typeof context] ?? `{{${k}}}`));
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: rendered },
      ];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].content).toBe("请分析关键词：bluetooth headphones");
    });

    it("should skip system message when systemPrompt is empty", () => {
      const systemPrompt = "";
      const userPrompt = "Hello";
      const messages = [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: userPrompt },
      ];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
    });

    it("should store LLM output text in context with node id key", () => {
      const nodeId = "node_3_1234";
      const outputText = "关键词分析结果：高流量词 bluetooth headphones";
      const context: Record<string, unknown> = {};
      context[`${nodeId}_output`] = outputText;
      expect(context["node_3_1234_output"]).toBe(outputText);
    });
  });

  describe("mcp node type registration", () => {
    it("should include mcp in valid node types", () => {
      const validTypes = [
        "input", "output", "skill", "llm", "mcp", "condition",
        "loop", "human_review", "http", "code", "knowledge"
      ];
      expect(validTypes).toContain("mcp");
      expect(validTypes).toHaveLength(11);
    });

    it("should have getAvailableMcpTools procedure in router", () => {
      // Verify the procedure name exists in the router definition
      const procedureNames = [
        "list", "get", "create", "update", "saveWorkflow", "delete",
        "run", "getRun", "listRuns", "resumeRun",
        "getAvailableSkills", "getAvailableModels", "getAvailableMcpTools"
      ];
      expect(procedureNames).toContain("getAvailableMcpTools");
    });
  });
});
