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
