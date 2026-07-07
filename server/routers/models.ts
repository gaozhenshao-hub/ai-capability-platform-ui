import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { aiAuditLogs, aiLlmModels, aiLlmUsageDaily } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

// Helper: write audit log
async function writeAuditLog(params: {
  userId: number;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  projectId?: number;
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
      result: "success",
      projectId: params.projectId,
      userId: params.userId,
    });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

// Helper: mask API key
function maskKey(key: string) {
  if (key.length <= 8) return "****";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}

export const modelsRouter = router({
  // List all models
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const models = await db
        .select()
        .from(aiLlmModels)
        .orderBy(desc(aiLlmModels.isDefault), aiLlmModels.name);

      return models.map((m) => ({
        ...m,
        apiKey: maskKey(m.apiKey),
      }));
    }),

  // Get single model
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [model] = await db
      .select()
      .from(aiLlmModels)
      .where(eq(aiLlmModels.id, input.id))
      .limit(1);

    if (!model) throw new TRPCError({ code: "NOT_FOUND" });

    return { ...model, apiKey: maskKey(model.apiKey) };
  }),

  // Create model
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        modelId: z.string().min(1).max(128),
        provider: z.string().min(1).max(64),
        apiBaseUrl: z.string().url(),
        apiKey: z.string().min(1),
        capabilityTags: z.array(z.string()).optional().default([]),
        costPer1kInputTokens: z.number().min(0).optional().default(0),
        costPer1kOutputTokens: z.number().min(0).optional().default(0),
        maxContextTokens: z.number().min(1).optional().default(128000),
        isDefault: z.boolean().optional().default(false),
        fallbackModelId: z.number().optional(),
        projectId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // If setting as default, unset others first
      if (input.isDefault) {
        await db.update(aiLlmModels).set({ isDefault: false });
      }

      const [result] = await db.insert(aiLlmModels).values({
        name: input.name,
        modelId: input.modelId,
        provider: input.provider,
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
        capabilityTags: input.capabilityTags,
        costPer1kInputTokens: String(input.costPer1kInputTokens),
        costPer1kOutputTokens: String(input.costPer1kOutputTokens),
        maxContextTokens: input.maxContextTokens,
        isDefault: input.isDefault,
        fallbackModelId: input.fallbackModelId,
        projectId: input.projectId,
      });

      const newId = (result as { insertId: number }).insertId;

      await writeAuditLog({
        userId: ctx.user.id,
        action: "model.create",
        resourceType: "llm_model",
        resourceId: String(newId),
        afterData: { name: input.name, provider: input.provider, modelId: input.modelId },
      });

      return { id: newId, success: true };
    }),

  // Update model
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        apiBaseUrl: z.string().url().optional(),
        apiKey: z.string().min(1).optional(),
        capabilityTags: z.array(z.string()).optional(),
        costPer1kInputTokens: z.number().min(0).optional(),
        costPer1kOutputTokens: z.number().min(0).optional(),
        maxContextTokens: z.number().min(1).optional(),
        isDefault: z.boolean().optional(),
        fallbackModelId: z.number().nullable().optional(),
        status: z.enum(["active", "inactive", "error"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [model] = await db
        .select()
        .from(aiLlmModels)
        .where(eq(aiLlmModels.id, input.id))
        .limit(1);
      if (!model) throw new TRPCError({ code: "NOT_FOUND" });

      // If setting as default, unset others first
      if (input.isDefault) {
        await db.update(aiLlmModels).set({ isDefault: false });
      }

      const updateData: Partial<typeof aiLlmModels.$inferInsert> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.apiBaseUrl !== undefined) updateData.apiBaseUrl = input.apiBaseUrl;
      if (input.apiKey !== undefined) updateData.apiKey = input.apiKey;
      if (input.capabilityTags !== undefined) updateData.capabilityTags = input.capabilityTags;
      if (input.costPer1kInputTokens !== undefined)
        updateData.costPer1kInputTokens = String(input.costPer1kInputTokens);
      if (input.costPer1kOutputTokens !== undefined)
        updateData.costPer1kOutputTokens = String(input.costPer1kOutputTokens);
      if (input.maxContextTokens !== undefined) updateData.maxContextTokens = input.maxContextTokens;
      if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;
      if (input.fallbackModelId !== undefined) updateData.fallbackModelId = input.fallbackModelId ?? undefined;
      if (input.status !== undefined) updateData.status = input.status;

      await db.update(aiLlmModels).set(updateData).where(eq(aiLlmModels.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "model.update",
        resourceType: "llm_model",
        resourceId: String(input.id),
        beforeData: { name: model.name, status: model.status },
        afterData: updateData as Record<string, unknown>,
      });

      return { success: true };
    }),

  // Delete model
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [model] = await db
        .select()
        .from(aiLlmModels)
        .where(eq(aiLlmModels.id, input.id))
        .limit(1);
      if (!model) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(aiLlmModels).where(eq(aiLlmModels.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "model.delete",
        resourceType: "llm_model",
        resourceId: String(input.id),
        beforeData: { name: model.name },
      });

      return { success: true };
    }),

  // Health check - ping the model API
  healthCheck: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [model] = await db
        .select()
        .from(aiLlmModels)
        .where(eq(aiLlmModels.id, input.id))
        .limit(1);
      if (!model) throw new TRPCError({ code: "NOT_FOUND" });

      const startTime = Date.now();
      let status: "active" | "error" = "active";
      let latencyMs = 0;
      let errorMsg = "";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${model.apiBaseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
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
        .update(aiLlmModels)
        .set({
          status,
          lastHealthCheck: new Date(),
          lastLatencyMs: latencyMs,
        })
        .where(eq(aiLlmModels.id, input.id));

      return { status, latencyMs, error: errorMsg || undefined };
    }),

  // Get cost statistics
  getCostStats: protectedProcedure
    .input(
      z.object({
        projectId: z.number().optional(),
        days: z.number().min(1).max(90).optional().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const since = new Date();
      since.setDate(since.getDate() - input.days);
      const sinceStr = since.toISOString().split("T")[0];

      const usage = await db
        .select()
        .from(aiLlmUsageDaily)
        .where(gte(aiLlmUsageDaily.date, sinceStr))
        .orderBy(aiLlmUsageDaily.date);

      // Aggregate by date
      const byDate: Record<
        string,
        { date: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }
      > = {};
      let totalCalls = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCostUsd = 0;

      for (const row of usage) {
        const d = row.date;
        if (!byDate[d]) {
          byDate[d] = { date: d, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
        }
        byDate[d].calls += row.totalCalls ?? 0;
        byDate[d].inputTokens += Number(row.totalInputTokens ?? 0);
        byDate[d].outputTokens += Number(row.totalOutputTokens ?? 0);
        byDate[d].costUsd += Number(row.totalCostUsd ?? 0);
        totalCalls += row.totalCalls ?? 0;
        totalInputTokens += Number(row.totalInputTokens ?? 0);
        totalOutputTokens += Number(row.totalOutputTokens ?? 0);
        totalCostUsd += Number(row.totalCostUsd ?? 0);
      }

      return {
        daily: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
        totals: { totalCalls, totalInputTokens, totalOutputTokens, totalCostUsd },
      };
    }),

  // Get audit logs for models
  getAuditLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const logs = await db
        .select()
        .from(aiAuditLogs)
        .orderBy(desc(aiAuditLogs.createdAt))
        .limit(input.limit);

      return logs;
    }),
});
