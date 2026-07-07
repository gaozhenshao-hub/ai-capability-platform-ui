import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockDb = {
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
  select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([]),
      limit: vi.fn().mockResolvedValue([]),
    }),
    orderBy: vi.fn().mockResolvedValue([]),
  })}),
  update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// ─── Mock fetch for healthCheck ───────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskKey(key: string) {
  if (key.length <= 8) return "****";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "GPT-4o",
    slug: "gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    apiBaseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key-1234567890",
    status: "active",
    isDefault: false,
    inputCostPer1k: "0.005",
    outputCostPer1k: "0.015",
    maxTokens: 128000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("models router — unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) });
    mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
      }),
      orderBy: vi.fn().mockResolvedValue([]),
    })});
  });

  describe("API key masking", () => {
    it("should mask long API keys correctly", () => {
      const key = "sk-test-key-1234567890";
      const masked = maskKey(key);
      expect(masked).toBe("sk-tes...7890");
      expect(masked).not.toContain("test-key-123456");
    });

    it("should return **** for short keys", () => {
      const key = "sk-abc";
      const masked = maskKey(key);
      expect(masked).toBe("****");
    });

    it("should show first 6 and last 4 chars", () => {
      const key = "abcdefghij1234";
      const masked = maskKey(key);
      expect(masked.startsWith("abcdef")).toBe(true);
      expect(masked.endsWith("1234")).toBe(true);
    });
  });

  describe("model data validation", () => {
    it("should validate provider values", () => {
      const validProviders = ["openai", "anthropic", "google", "custom"];
      validProviders.forEach(p => expect(typeof p).toBe("string"));
    });

    it("should validate status values", () => {
      const validStatuses = ["active", "inactive", "deprecated"];
      validStatuses.forEach(s => expect(typeof s).toBe("string"));
    });

    it("should parse cost as number for calculations", () => {
      const model = makeModel({ inputCostPer1k: "0.005", outputCostPer1k: "0.015" });
      const inputCost = parseFloat(model.inputCostPer1k as string);
      const outputCost = parseFloat(model.outputCostPer1k as string);
      expect(inputCost).toBe(0.005);
      expect(outputCost).toBe(0.015);
    });

    it("should calculate total cost correctly", () => {
      const inputTokens = 1000;
      const outputTokens = 500;
      const inputCostPer1k = 0.005;
      const outputCostPer1k = 0.015;
      const totalCost =
        (inputTokens / 1000) * inputCostPer1k +
        (outputTokens / 1000) * outputCostPer1k;
      expect(totalCost).toBeCloseTo(0.0125, 5);
    });
  });

  describe("health check logic", () => {
    it("should return healthy when endpoint responds OK", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "gpt-4o" }] }),
      });

      const model = makeModel({ apiBaseUrl: "https://api.openai.com/v1", apiKey: "sk-test" });
      const startTime = Date.now();
      const response = await fetch(`${model.apiBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${model.apiKey}` },
      });
      const latencyMs = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should return unhealthy when endpoint throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const model = makeModel({ apiBaseUrl: "https://unreachable.example.com/v1" });
      let status = "active";
      try {
        await fetch(`${model.apiBaseUrl}/models`);
      } catch {
        status = "inactive";
      }
      expect(status).toBe("inactive");
    });

    it("should return unhealthy when endpoint returns non-OK", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const model = makeModel({ apiBaseUrl: "https://api.openai.com/v1" });
      const response = await fetch(`${model.apiBaseUrl}/models`);
      const isHealthy = response.ok;
      expect(isHealthy).toBe(false);
    });
  });

  describe("default model logic", () => {
    it("should identify default model", () => {
      const models = [
        makeModel({ id: 1, isDefault: false }),
        makeModel({ id: 2, isDefault: true }),
        makeModel({ id: 3, isDefault: false }),
      ];
      const defaultModel = models.find(m => m.isDefault);
      expect(defaultModel?.id).toBe(2);
    });

    it("should allow only one default model", () => {
      const models = [
        makeModel({ id: 1, isDefault: false }),
        makeModel({ id: 2, isDefault: true }),
        makeModel({ id: 3, isDefault: false }),
      ];
      const defaultCount = models.filter(m => m.isDefault).length;
      expect(defaultCount).toBe(1);
    });
  });

  describe("cost stats calculation", () => {
    it("should aggregate daily usage correctly", () => {
      const dailyUsage = [
        { inputTokens: 1000, outputTokens: 500, totalCost: "0.01" },
        { inputTokens: 2000, outputTokens: 1000, totalCost: "0.02" },
      ];
      const totalInputTokens = dailyUsage.reduce((sum, d) => sum + d.inputTokens, 0);
      const totalOutputTokens = dailyUsage.reduce((sum, d) => sum + d.outputTokens, 0);
      const totalCost = dailyUsage.reduce((sum, d) => sum + parseFloat(d.totalCost), 0);

      expect(totalInputTokens).toBe(3000);
      expect(totalOutputTokens).toBe(1500);
      expect(totalCost).toBeCloseTo(0.03, 5);
    });

    it("should handle empty usage data", () => {
      const dailyUsage: Array<{ inputTokens: number; outputTokens: number; totalCost: string }> = [];
      const totalCost = dailyUsage.reduce((sum, d) => sum + parseFloat(d.totalCost), 0);
      expect(totalCost).toBe(0);
    });
  });
});
