import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { aiAuditLogs, aiProjects } from "../../drizzle/schema";
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
  ipAddress?: string;
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
      ipAddress: params.ipAddress,
    });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

export const projectsRouter = router({
  // List all projects for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const isAdmin = ctx.user.role === "admin";
    const projects = isAdmin
      ? await db.select().from(aiProjects).orderBy(desc(aiProjects.createdAt))
      : await db
          .select()
          .from(aiProjects)
          .where(eq(aiProjects.ownerId, ctx.user.id))
          .orderBy(desc(aiProjects.createdAt));

    // Mask API keys
    return projects.map((p) => ({
      ...p,
      apiKey: `${p.apiKeyPrefix}...`,
    }));
  }),

  // Get single project
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [project] = await db
      .select()
      .from(aiProjects)
      .where(eq(aiProjects.id, input.id))
      .limit(1);

    if (!project) throw new TRPCError({ code: "NOT_FOUND" });
    if (project.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return { ...project, apiKey: `${project.apiKeyPrefix}...` };
  }),

  // Create project
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().optional(),
        slug: z
          .string()
          .min(2)
          .max(64)
          .regex(/^[a-z0-9-]+$/),
        corsOrigins: z.array(z.string()).optional().default([]),
        monthlyBudgetUsd: z.number().min(0).optional().default(0),
        budgetAlertPercent: z.number().min(0).max(100).optional().default(80),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check slug uniqueness
      const [existing] = await db
        .select()
        .from(aiProjects)
        .where(eq(aiProjects.slug, input.slug))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug already exists" });
      }

      // Generate API key
      const rawKey = `ak_${nanoid(32)}`;
      const prefix = rawKey.substring(0, 8);

      const [result] = await db.insert(aiProjects).values({
        name: input.name,
        description: input.description,
        slug: input.slug,
        apiKey: rawKey,
        apiKeyPrefix: prefix,
        corsOrigins: input.corsOrigins,
        monthlyBudgetUsd: String(input.monthlyBudgetUsd),
        budgetAlertPercent: input.budgetAlertPercent,
        ownerId: ctx.user.id,
      });

      const newId = (result as { insertId: number }).insertId;

      await writeAuditLog({
        userId: ctx.user.id,
        action: "project.create",
        resourceType: "project",
        resourceId: String(newId),
        afterData: { name: input.name, slug: input.slug },
        projectId: newId,
      });

      // Return full key only on creation
      return { id: newId, apiKey: rawKey, apiKeyPrefix: prefix };
    }),

  // Update project
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().optional(),
        corsOrigins: z.array(z.string()).optional(),
        monthlyBudgetUsd: z.number().min(0).optional(),
        budgetAlertPercent: z.number().min(0).max(100).optional(),
        status: z.enum(["active", "suspended"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [project] = await db
        .select()
        .from(aiProjects)
        .where(eq(aiProjects.id, input.id))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updateData: Partial<typeof aiProjects.$inferInsert> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.corsOrigins !== undefined) updateData.corsOrigins = input.corsOrigins;
      if (input.monthlyBudgetUsd !== undefined)
        updateData.monthlyBudgetUsd = String(input.monthlyBudgetUsd);
      if (input.budgetAlertPercent !== undefined)
        updateData.budgetAlertPercent = input.budgetAlertPercent;
      if (input.status !== undefined) updateData.status = input.status;

      await db.update(aiProjects).set(updateData).where(eq(aiProjects.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "project.update",
        resourceType: "project",
        resourceId: String(input.id),
        beforeData: { name: project.name },
        afterData: updateData as Record<string, unknown>,
        projectId: input.id,
      });

      return { success: true };
    }),

  // Rotate API key
  rotateApiKey: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [project] = await db
        .select()
        .from(aiProjects)
        .where(eq(aiProjects.id, input.id))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const newKey = `ak_${nanoid(32)}`;
      const newPrefix = newKey.substring(0, 8);

      await db
        .update(aiProjects)
        .set({ apiKey: newKey, apiKeyPrefix: newPrefix })
        .where(eq(aiProjects.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "project.rotateApiKey",
        resourceType: "project",
        resourceId: String(input.id),
        projectId: input.id,
      });

      return { apiKey: newKey, apiKeyPrefix: newPrefix };
    }),

  // Delete project
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [project] = await db
        .select()
        .from(aiProjects)
        .where(eq(aiProjects.id, input.id))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.delete(aiProjects).where(eq(aiProjects.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "project.delete",
        resourceType: "project",
        resourceId: String(input.id),
        afterData: { name: project.name },
      });

      return { success: true };
    }),
});
