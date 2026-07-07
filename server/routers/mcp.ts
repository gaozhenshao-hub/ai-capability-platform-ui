import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { aiAuditLogs, aiMcpTools } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

// ─── Audit Log Helper ─────────────────────────────────────────────────────────
async function writeAuditLog(params: {
  userId: number;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  projectId?: number;
  result?: "success" | "failure";
  errorMessage?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(aiAuditLogs).values({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      beforeData: params.beforeData,
      afterData: params.afterData,
      result: params.result ?? "success",
      errorMessage: params.errorMessage,
      projectId: params.projectId,
      userId: params.userId,
    });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

// ─── Capability Schema ────────────────────────────────────────────────────────
const capabilitySchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional().default(""),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().default("POST"),
  path: z.string().optional().default("/"),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  outputSchema: z.record(z.string(), z.unknown()).optional().default({}),
});

// ─── Auth Config Schema ───────────────────────────────────────────────────────
const authConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("api_key"),
    key: z.string().min(1),
    header: z.string().optional().default("X-API-Key"),
  }),
  z.object({
    type: z.literal("bearer"),
    token: z.string().min(1),
  }),
  z.object({
    type: z.literal("basic"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    type: z.literal("oauth2"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    tokenUrl: z.string().url(),
    scope: z.string().optional().default(""),
  }),
]);

// ─── Mask sensitive auth fields ───────────────────────────────────────────────
function maskAuthConfig(auth: Record<string, unknown>): Record<string, unknown> {
  if (!auth || typeof auth !== "object") return {};
  const masked = { ...auth };
  for (const key of ["key", "token", "password", "clientSecret"]) {
    if (typeof masked[key] === "string" && (masked[key] as string).length > 4) {
      const val = masked[key] as string;
      masked[key] = val.substring(0, 4) + "****";
    }
  }
  return masked;
}

export const mcpRouter = router({
  // ── List all MCP tools ────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.number().optional(),
        status: z.enum(["active", "inactive", "error"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const tools = await db
        .select()
        .from(aiMcpTools)
        .orderBy(aiMcpTools.name);

      return tools.map((t) => ({
        ...t,
        authConfig: maskAuthConfig((t.authConfig ?? {}) as Record<string, unknown>),
        capabilities: (t.capabilities ?? []) as unknown[],
      }));
    }),

  // ── Get single MCP tool ───────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tool] = await db
        .select()
        .from(aiMcpTools)
        .where(eq(aiMcpTools.id, input.id))
        .limit(1);

      if (!tool) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ...tool,
        authConfig: maskAuthConfig((tool.authConfig ?? {}) as Record<string, unknown>),
        capabilities: (tool.capabilities ?? []) as unknown[],
      };
    }),

  // ── Create MCP tool ───────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        slug: z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/),
        description: z.string().optional().default(""),
        type: z.enum(["rest_api", "openapi", "database", "custom_script"]),
        config: z
          .object({
            baseUrl: z.string().url().optional(),
            openApiSpec: z.string().optional(),
            headers: z.record(z.string(), z.string()).optional().default({}),
          })
          .optional()
          .default({ headers: {} }),
        authConfig: authConfigSchema.optional(),
        capabilities: z.array(capabilitySchema).optional().default([]),
        retryCount: z.number().min(0).max(5).optional().default(2),
        timeoutMs: z.number().min(1000).max(120000).optional().default(30000),
        projectId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check slug uniqueness
      const [existing] = await db
        .select({ id: aiMcpTools.id })
        .from(aiMcpTools)
        .where(eq(aiMcpTools.slug, input.slug))
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Slug "${input.slug}" 已被使用`,
        });
      }

      const [result] = await db.insert(aiMcpTools).values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        type: input.type,
        config: input.config as Record<string, unknown>,
        authConfig: input.authConfig as Record<string, unknown>,
        capabilities: input.capabilities,
        retryCount: input.retryCount,
        timeoutMs: input.timeoutMs,
        projectId: input.projectId,
        status: "active",
      });

      const newId = (result as { insertId: number }).insertId;

      await writeAuditLog({
        userId: ctx.user.id,
        action: "mcp.create",
        resourceType: "mcp_tool",
        resourceId: String(newId),
        afterData: { name: input.name, slug: input.slug, type: input.type },
      });

      return { id: newId, success: true };
    }),

  // ── Update MCP tool ───────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().optional(),
        config: z
          .object({
            baseUrl: z.string().url().optional(),
            openApiSpec: z.string().optional(),
            headers: z.record(z.string(), z.string()).optional().default({}),
          })
          .optional(),
        authConfig: authConfigSchema.optional(),
        capabilities: z.array(capabilitySchema).optional(),
        retryCount: z.number().min(0).max(5).optional(),
        timeoutMs: z.number().min(1000).max(120000).optional(),
        status: z.enum(["active", "inactive", "error"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tool] = await db
        .select()
        .from(aiMcpTools)
        .where(eq(aiMcpTools.id, input.id))
        .limit(1);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Partial<typeof aiMcpTools.$inferInsert> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.config !== undefined) updateData.config = input.config as Record<string, unknown>;
      if (input.authConfig !== undefined) updateData.authConfig = input.authConfig as Record<string, unknown>;
      if (input.capabilities !== undefined) updateData.capabilities = input.capabilities;
      if (input.retryCount !== undefined) updateData.retryCount = input.retryCount;
      if (input.timeoutMs !== undefined) updateData.timeoutMs = input.timeoutMs;
      if (input.status !== undefined) updateData.status = input.status;

      await db.update(aiMcpTools).set(updateData).where(eq(aiMcpTools.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "mcp.update",
        resourceType: "mcp_tool",
        resourceId: String(input.id),
        beforeData: { name: tool.name, status: tool.status },
        afterData: updateData as Record<string, unknown>,
      });

      return { success: true };
    }),

  // ── Delete MCP tool ───────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tool] = await db
        .select()
        .from(aiMcpTools)
        .where(eq(aiMcpTools.id, input.id))
        .limit(1);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(aiMcpTools).where(eq(aiMcpTools.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "mcp.delete",
        resourceType: "mcp_tool",
        resourceId: String(input.id),
        beforeData: { name: tool.name, slug: tool.slug },
      });

      return { success: true };
    }),

  // ── Health check ──────────────────────────────────────────────────────────
  healthCheck: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tool] = await db
        .select()
        .from(aiMcpTools)
        .where(eq(aiMcpTools.id, input.id))
        .limit(1);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND" });

      const config = (tool.config ?? {}) as Record<string, unknown>;
      const authConfig = (tool.authConfig ?? { type: "none" }) as Record<string, unknown>;
      const baseUrl = (config.baseUrl as string) ?? "";

      if (!baseUrl) {
        return { status: "error" as const, latencyMs: 0, error: "未配置 baseUrl" };
      }

      const startTime = Date.now();
      let status: "active" | "error" = "active";
      let latencyMs = 0;
      let errorMsg = "";

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(((config.headers ?? {}) as Record<string, string>)),
        };

        // Apply auth
        if (authConfig.type === "bearer" && authConfig.token) {
          headers["Authorization"] = `Bearer ${authConfig.token}`;
        } else if (authConfig.type === "api_key" && authConfig.key) {
          const headerName = (authConfig.header as string) ?? "X-API-Key";
          headers[headerName] = authConfig.key as string;
        } else if (authConfig.type === "basic" && authConfig.username) {
          const creds = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString("base64");
          headers["Authorization"] = `Basic ${creds}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), tool.timeoutMs ?? 10000);

        const response = await fetch(baseUrl, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        latencyMs = Date.now() - startTime;
        if (!response.ok) {
          status = "error";
          errorMsg = `HTTP ${response.status}`;
        }
      } catch (e: unknown) {
        status = "error";
        latencyMs = Date.now() - startTime;
        errorMsg = e instanceof Error ? e.message : "Unknown error";
      }

      await db
        .update(aiMcpTools)
        .set({ status, lastHealthCheck: new Date(), lastLatencyMs: latencyMs })
        .where(eq(aiMcpTools.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "mcp.health_check",
        resourceType: "mcp_tool",
        resourceId: String(input.id),
        afterData: { status, latencyMs },
        result: status === "active" ? "success" : "failure",
        errorMessage: errorMsg || undefined,
      });

      return { status, latencyMs, error: errorMsg || undefined };
    }),

  // ── Invoke a capability (sandbox test) ───────────────────────────────────
  invoke: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        capabilityName: z.string(),
        payload: z.record(z.string(), z.unknown()).optional().default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tool] = await db
        .select()
        .from(aiMcpTools)
        .where(eq(aiMcpTools.id, input.id))
        .limit(1);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND" });

      const config = (tool.config ?? {}) as Record<string, unknown>;
      const authConfig = (tool.authConfig ?? { type: "none" }) as Record<string, unknown>;
      const capabilities = (tool.capabilities ?? []) as Array<{
        name: string;
        method?: string;
        path?: string;
      }>;

      const cap = capabilities.find((c) => c.name === input.capabilityName);
      if (!cap) {
        throw new TRPCError({ code: "NOT_FOUND", message: `能力 "${input.capabilityName}" 不存在` });
      }

      const baseUrl = ((config.baseUrl as string) ?? "").replace(/\/$/, "");
      const path = (cap.path ?? "/").replace(/^([^/])/, "/$1");
      const method = cap.method ?? "POST";
      const url = `${baseUrl}${path}`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((config.headers ?? {}) as Record<string, string>),
      };

      if (authConfig.type === "bearer" && authConfig.token) {
        headers["Authorization"] = `Bearer ${authConfig.token}`;
      } else if (authConfig.type === "api_key" && authConfig.key) {
        const headerName = (authConfig.header as string) ?? "X-API-Key";
        headers[headerName] = authConfig.key as string;
      } else if (authConfig.type === "basic" && authConfig.username) {
        const creds = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString("base64");
        headers["Authorization"] = `Basic ${creds}`;
      }

      const startTime = Date.now();
      let responseBody: unknown = null;
      let responseStatus = 0;
      let errorMsg = "";
      let success = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), tool.timeoutMs ?? 30000);

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (method !== "GET" && method !== "HEAD") {
          fetchOptions.body = JSON.stringify(input.payload);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        responseStatus = response.status;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        success = response.ok;
        if (!response.ok) {
          errorMsg = `HTTP ${response.status}`;
        }
      } catch (e: unknown) {
        errorMsg = e instanceof Error ? e.message : "Unknown error";
      }

      const latencyMs = Date.now() - startTime;

      await writeAuditLog({
        userId: ctx.user.id,
        action: "mcp.invoke",
        resourceType: "mcp_tool",
        resourceId: String(input.id),
        afterData: {
          capability: input.capabilityName,
          payload: input.payload,
          status: responseStatus,
          latencyMs,
        },
        result: success ? "success" : "failure",
        errorMessage: errorMsg || undefined,
      });

      return {
        success,
        status: responseStatus,
        latencyMs,
        data: responseBody,
        error: errorMsg || undefined,
      };
    }),

  // ── Get recent invocation logs ────────────────────────────────────────────
  getLogs: protectedProcedure
    .input(
      z.object({
        toolId: z.number().optional(),
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const logs = await db
        .select()
        .from(aiAuditLogs)
        .where(
          and(
            eq(aiAuditLogs.resourceType, "mcp_tool"),
            input.toolId
              ? eq(aiAuditLogs.resourceId, String(input.toolId))
              : undefined
          )
        )
        .orderBy(desc(aiAuditLogs.createdAt))
        .limit(input.limit);

      return logs;
    }),

  // ── Get stats summary ─────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [totals] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
        error: sql<number>`SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)`,
        inactive: sql<number>`SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END)`,
      })
      .from(aiMcpTools);

    return {
      total: Number(totals?.total ?? 0),
      active: Number(totals?.active ?? 0),
      error: Number(totals?.error ?? 0),
      inactive: Number(totals?.inactive ?? 0),
    };
  }),
});
