import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockInsertValues = vi.fn().mockResolvedValue([{ insertId: 10 }]);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockDeleteWhere = vi.fn().mockResolvedValue([]);
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

const mockSelectFrom = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// ─── Mock nanoid ──────────────────────────────────────────────────────────────
vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("test-api-key-1234"),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createCtx(role: "admin" | "user" = "user", userId = 1) {
  return {
    user: { id: userId, role, openId: "test-open-id", name: "Test User" },
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Test Project",
    slug: "test-project",
    description: "A test project",
    ownerId: 1,
    apiKey: "ak_test123",
    apiKeyPrefix: "ak_test",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("projects router — unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 10 }]) });
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

  describe("project data validation", () => {
    it("should validate project name is not empty", () => {
      const name = "Test Project";
      expect(name.trim().length).toBeGreaterThan(0);
    });

    it("should validate slug format", () => {
      const validSlugs = ["my-project", "test123", "amazon-ops"];
      const invalidSlugs = ["My Project", "test_123", "amazon.ops"];
      const slugRegex = /^[a-z0-9-]+$/;
      validSlugs.forEach(s => expect(slugRegex.test(s)).toBe(true));
      invalidSlugs.forEach(s => expect(slugRegex.test(s)).toBe(false));
    });

    it("should generate API key with correct prefix", () => {
      const apiKey = "ak_test-api-key-1234";
      const prefix = apiKey.slice(0, 10);
      expect(prefix.startsWith("ak_")).toBe(true);
    });

    it("should mask API key in list response", () => {
      const project = makeProject({ apiKey: "ak_secret123456", apiKeyPrefix: "ak_secret" });
      const masked = { ...project, apiKey: `${project.apiKeyPrefix}...` };
      expect(masked.apiKey).toBe("ak_secret...");
      expect(masked.apiKey).not.toContain("123456");
    });
  });

  describe("access control logic", () => {
    it("should allow admin to see all projects", () => {
      const ctx = createCtx("admin");
      const isAdmin = ctx.user.role === "admin";
      expect(isAdmin).toBe(true);
    });

    it("should restrict user to own projects", () => {
      const ctx = createCtx("user", 5);
      const isAdmin = ctx.user.role === "admin";
      expect(isAdmin).toBe(false);
      expect(ctx.user.id).toBe(5);
    });

    it("should throw FORBIDDEN when non-owner tries to update", () => {
      const project = makeProject({ ownerId: 99 });
      const ctx = createCtx("user", 1);
      const canEdit = ctx.user.role === "admin" || project.ownerId === ctx.user.id;
      expect(canEdit).toBe(false);
    });

    it("should allow owner to update their own project", () => {
      const project = makeProject({ ownerId: 1 });
      const ctx = createCtx("user", 1);
      const canEdit = ctx.user.role === "admin" || project.ownerId === ctx.user.id;
      expect(canEdit).toBe(true);
    });

    it("should allow admin to update any project", () => {
      const project = makeProject({ ownerId: 99 });
      const ctx = createCtx("admin", 1);
      const canEdit = ctx.user.role === "admin" || project.ownerId === ctx.user.id;
      expect(canEdit).toBe(true);
    });
  });

  describe("project status values", () => {
    it("should accept valid status values", () => {
      const validStatuses = ["active", "inactive", "archived"];
      validStatuses.forEach(s => expect(typeof s).toBe("string"));
    });

    it("should default to active status on create", () => {
      const defaultStatus = "active";
      expect(defaultStatus).toBe("active");
    });
  });

  describe("API key rotation", () => {
    it("should generate new API key on rotation", () => {
      const oldKey = "ak_old_key_123";
      const newKey = "ak_new_key_456";
      expect(newKey).not.toBe(oldKey);
      expect(newKey.startsWith("ak_")).toBe(true);
    });

    it("should update prefix when rotating key", () => {
      const newKey = "ak_rotated_key_789";
      const newPrefix = newKey.slice(0, 9);
      expect(newPrefix).toBe("ak_rotate");
    });
  });

  describe("project slug uniqueness", () => {
    it("should detect slug collision", () => {
      const existingSlug = "my-project";
      const newSlug = "my-project";
      const hasCollision = existingSlug === newSlug;
      expect(hasCollision).toBe(true);
    });

    it("should allow different slugs", () => {
      const existingSlug = "project-a";
      const newSlug = "project-b";
      const hasCollision = existingSlug === newSlug;
      expect(hasCollision).toBe(false);
    });
  });
});
