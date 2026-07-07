import { TRPCError } from "@trpc/server";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  aiSkills,
  aiSkillVersions,
  aiSkillCalls,
  aiAuditLogs,
  aiLlmModels,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Helper: write audit log ──────────────────────────────────────────────────
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

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const skillCreateInput = z.object({
  name: z.string().min(1).max(128),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug 只能包含小写字母、数字和连字符"),
  description: z.string().optional(),
  category: z.string().max(64).optional(),
  scope: z.enum(["global", "project", "private"]).default("project"),
  promptTemplate: z.string().min(1),
  systemPrompt: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  outputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  modelId: z.number().optional(),
  modelParams: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(128000).optional(),
      topP: z.number().min(0).max(1).optional(),
    })
    .optional()
    .default({}),
  knowledgeCollections: z.array(z.string()).optional().default([]),
  mcpDependencies: z.array(z.string()).optional().default([]),
  projectId: z.number().optional(),
  changeNote: z.string().optional(),
});

const skillUpdateInput = skillCreateInput.partial().extend({
  id: z.number(),
  status: z.enum(["draft", "active", "deprecated"]).optional(),
  changeNote: z.string().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────
export const skillsRouter = router({
  // List all skills
  list: protectedProcedure
    .input(
      z
        .object({
          projectId: z.number().optional(),
          status: z.enum(["draft", "active", "deprecated"]).optional(),
          category: z.string().optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(aiSkills)
        .orderBy(desc(aiSkills.updatedAt));

      // Client-side filtering (TiDB compatible)
      let filtered = rows;
      if (input?.status) filtered = filtered.filter((s) => s.status === input.status);
      if (input?.category) filtered = filtered.filter((s) => s.category === input.category);
      if (input?.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.slug.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q)
        );
      }

      return filtered;
    }),

  // Get single skill with latest version info
  get: protectedProcedure
    .input(z.object({ id: z.number().optional(), slug: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.id && !input.slug)
        throw new TRPCError({ code: "BAD_REQUEST", message: "id 或 slug 必须提供其一" });

      const rows = await db
        .select()
        .from(aiSkills)
        .where(
          input.id ? eq(aiSkills.id, input.id) : eq(aiSkills.slug, input.slug!)
        )
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  // Create skill (also creates version 1)
  create: protectedProcedure.input(skillCreateInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Check slug uniqueness
    const existing = await db
      .select({ id: aiSkills.id })
      .from(aiSkills)
      .where(eq(aiSkills.slug, input.slug))
      .limit(1);
    if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Slug 已被占用" });

    // Insert skill
    const result = await db.insert(aiSkills).values({
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      scope: input.scope,
      promptTemplate: input.promptTemplate,
      systemPrompt: input.systemPrompt,
      inputSchema: input.inputSchema as Record<string, unknown>,
      outputSchema: input.outputSchema as Record<string, unknown>,
      modelId: input.modelId,
      modelParams: input.modelParams as Record<string, unknown>,
      knowledgeCollections: input.knowledgeCollections,
      mcpDependencies: input.mcpDependencies,
      currentVersion: 1,
      status: "draft",
      projectId: input.projectId,
      createdBy: ctx.user.id,
    });

    const insertId = (result as unknown as { insertId: number }).insertId;

    // Create version 1
    await db.insert(aiSkillVersions).values({
      skillId: insertId,
      version: 1,
      promptTemplate: input.promptTemplate,
      systemPrompt: input.systemPrompt,
      modelId: input.modelId,
      modelParams: input.modelParams as Record<string, unknown>,
      changeNote: input.changeNote ?? "初始版本",
      createdBy: ctx.user.id,
    });

    await writeAuditLog({
      userId: ctx.user.id,
      action: "create",
      resourceType: "skill",
      resourceId: input.slug,
      afterData: { name: input.name, slug: input.slug },
      projectId: input.projectId,
    });

    return { id: insertId, slug: input.slug };
  }),

  // Update skill (creates new version if prompt changed)
  update: protectedProcedure.input(skillUpdateInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [skill] = await db
      .select()
      .from(aiSkills)
      .where(eq(aiSkills.id, input.id))
      .limit(1);
    if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

    const promptChanged =
      (input.promptTemplate !== undefined && input.promptTemplate !== skill.promptTemplate) ||
      (input.systemPrompt !== undefined && input.systemPrompt !== skill.systemPrompt);

    const newVersion = promptChanged ? (skill.currentVersion ?? 1) + 1 : (skill.currentVersion ?? 1);

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.description !== undefined) updatePayload.description = input.description;
    if (input.category !== undefined) updatePayload.category = input.category;
    if (input.scope !== undefined) updatePayload.scope = input.scope;
    if (input.promptTemplate !== undefined) updatePayload.promptTemplate = input.promptTemplate;
    if (input.systemPrompt !== undefined) updatePayload.systemPrompt = input.systemPrompt;
    if (input.inputSchema !== undefined) updatePayload.inputSchema = input.inputSchema;
    if (input.outputSchema !== undefined) updatePayload.outputSchema = input.outputSchema;
    if (input.modelId !== undefined) updatePayload.modelId = input.modelId;
    if (input.modelParams !== undefined) updatePayload.modelParams = input.modelParams;
    if (input.knowledgeCollections !== undefined)
      updatePayload.knowledgeCollections = input.knowledgeCollections;
    if (input.mcpDependencies !== undefined) updatePayload.mcpDependencies = input.mcpDependencies;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (promptChanged) updatePayload.currentVersion = newVersion;

    await db
      .update(aiSkills)
      .set(updatePayload as Partial<typeof aiSkills.$inferInsert>)
      .where(eq(aiSkills.id, input.id));

    // Create new version record if prompt changed
    if (promptChanged) {
      await db.insert(aiSkillVersions).values({
        skillId: input.id,
        version: newVersion,
        promptTemplate: input.promptTemplate ?? skill.promptTemplate,
        systemPrompt: input.systemPrompt ?? skill.systemPrompt ?? undefined,
        modelId: input.modelId ?? skill.modelId ?? undefined,
        modelParams: (input.modelParams ?? skill.modelParams ?? {}) as Record<string, unknown>,
        changeNote: input.changeNote ?? `版本 ${newVersion}`,
        createdBy: ctx.user.id,
      });
    }

    await writeAuditLog({
      userId: ctx.user.id,
      action: "update",
      resourceType: "skill",
      resourceId: skill.slug,
      beforeData: { version: skill.currentVersion, status: skill.status },
      afterData: { version: newVersion, status: input.status ?? skill.status },
      projectId: skill.projectId ?? undefined,
    });

    return { id: input.id, newVersion, promptChanged };
  }),

  // Delete skill
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [skill] = await db
        .select()
        .from(aiSkills)
        .where(eq(aiSkills.id, input.id))
        .limit(1);
      if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(aiSkills).where(eq(aiSkills.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        action: "delete",
        resourceType: "skill",
        resourceId: skill.slug,
        beforeData: { name: skill.name, slug: skill.slug },
        projectId: skill.projectId ?? undefined,
      });

      return { success: true };
    }),

  // Get version history
  getVersions: protectedProcedure
    .input(z.object({ skillId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const versions = await db
        .select()
        .from(aiSkillVersions)
        .where(eq(aiSkillVersions.skillId, input.skillId))
        .orderBy(desc(aiSkillVersions.version));

      return versions;
    }),

  // Get specific version content
  getVersion: protectedProcedure
    .input(z.object({ skillId: z.number(), version: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [ver] = await db
        .select()
        .from(aiSkillVersions)
        .where(
          and(
            eq(aiSkillVersions.skillId, input.skillId),
            eq(aiSkillVersions.version, input.version)
          )
        )
        .limit(1);

      if (!ver) throw new TRPCError({ code: "NOT_FOUND" });
      return ver;
    }),

  // Rollback to a specific version
  rollback: protectedProcedure
    .input(
      z.object({
        skillId: z.number(),
        version: z.number(),
        changeNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [skill] = await db
        .select()
        .from(aiSkills)
        .where(eq(aiSkills.id, input.skillId))
        .limit(1);
      if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select()
        .from(aiSkillVersions)
        .where(
          and(
            eq(aiSkillVersions.skillId, input.skillId),
            eq(aiSkillVersions.version, input.version)
          )
        )
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "版本不存在" });

      const newVersion = (skill.currentVersion ?? 1) + 1;

      // Apply rollback as new version
      await db
        .update(aiSkills)
        .set({
          promptTemplate: ver.promptTemplate,
          systemPrompt: ver.systemPrompt,
          modelId: ver.modelId,
          modelParams: ver.modelParams as Record<string, unknown>,
          currentVersion: newVersion,
        })
        .where(eq(aiSkills.id, input.skillId));

      await db.insert(aiSkillVersions).values({
        skillId: input.skillId,
        version: newVersion,
        promptTemplate: ver.promptTemplate,
        systemPrompt: ver.systemPrompt,
        modelId: ver.modelId,
        modelParams: ver.modelParams as Record<string, unknown>,
        changeNote: input.changeNote ?? `回滚至版本 ${input.version}`,
        createdBy: ctx.user.id,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        action: "rollback",
        resourceType: "skill",
        resourceId: skill.slug,
        beforeData: { version: skill.currentVersion },
        afterData: { version: newVersion, rolledBackTo: input.version },
        projectId: skill.projectId ?? undefined,
      });

      return { newVersion };
    }),

  // Run skill test (invoke LLM with prompt template)
  run: protectedProcedure
    .input(
      z.object({
        skillId: z.number(),
        inputData: z.record(z.string(), z.unknown()).optional().default({}),
        overridePrompt: z.string().optional(),
        overrideSystemPrompt: z.string().optional(),
        modelOverride: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [skill] = await db
        .select()
        .from(aiSkills)
        .where(eq(aiSkills.id, input.skillId))
        .limit(1);
      if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

      // Render prompt template: replace {{variable}} with inputData values
      const renderTemplate = (template: string, data: Record<string, unknown>) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
          return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
        });
      };

      const promptTemplate = input.overridePrompt ?? skill.promptTemplate;
      const systemPrompt = input.overrideSystemPrompt ?? skill.systemPrompt;
      const renderedPrompt = renderTemplate(promptTemplate, input.inputData);

      const messages: Array<{ role: "system" | "user"; content: string }> = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: renderedPrompt });

      const startTime = Date.now();
      let outputText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let errorMsg: string | undefined;

      try {
        const modelParams = (skill.modelParams ?? {}) as Record<string, unknown>;
        const response = await invokeLLM({
          model: input.modelOverride,
          messages,
          max_tokens: typeof modelParams.maxTokens === "number" ? modelParams.maxTokens : 2048,
        });

        const rawContent = response.choices?.[0]?.message?.content;
        outputText = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? response);
        inputTokens = response.usage?.prompt_tokens ?? 0;
        outputTokens = response.usage?.completion_tokens ?? 0;
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
      }

      const durationMs = Date.now() - startTime;

      // Record call log
      try {
        await db.insert(aiSkillCalls).values({
          skillId: skill.id,
          skillVersion: skill.currentVersion ?? 1,
          modelId: skill.modelId ?? undefined,
          projectId: skill.projectId ?? undefined,
          source: "manual",
          inputData: input.inputData,
          outputData: errorMsg ? undefined : ({ text: outputText } as Record<string, unknown>),
          inputTokens,
          outputTokens,
          durationMs,
        });
      } catch (e) {
        console.warn("[SkillRun] Failed to record call log:", e);
      }

      if (errorMsg) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errorMsg,
        });
      }

      return {
        output: outputText,
        inputTokens,
        outputTokens,
        durationMs,
        renderedPrompt,
        version: skill.currentVersion,
      };
    }),

  // Get call logs for a skill
  getLogs: protectedProcedure
    .input(
      z.object({
        skillId: z.number(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const logs = await db
        .select()
        .from(aiSkillCalls)
        .where(eq(aiSkillCalls.skillId, input.skillId))
        .orderBy(desc(aiSkillCalls.createdAt))
        .limit(input.limit);

      return logs;
    }),

  // Get skill stats (call count, avg duration, adoption rate)
  getStats: protectedProcedure
    .input(z.object({ skillId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const logs = await db
        .select()
        .from(aiSkillCalls)
        .where(eq(aiSkillCalls.skillId, input.skillId));

      const totalCalls = logs.length;
      const avgDurationMs =
        totalCalls > 0
          ? Math.round(logs.reduce((s, l) => s + (l.durationMs ?? 0), 0) / totalCalls)
          : 0;
      const adoptedCount = logs.filter((l) => l.adopted === true).length;
      const adoptionRate =
        totalCalls > 0 ? Math.round((adoptedCount / totalCalls) * 100) : 0;
      const totalTokens = logs.reduce(
        (s, l) => s + (l.inputTokens ?? 0) + (l.outputTokens ?? 0),
        0
      );

      return { totalCalls, avgDurationMs, adoptionRate, totalTokens };
    }),

  // Get available LLM models for selector
  getAvailableModels: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const models = await db
      .select({
        id: aiLlmModels.id,
        name: aiLlmModels.name,
        modelId: aiLlmModels.modelId,
        provider: aiLlmModels.provider,
        status: aiLlmModels.status,
        isDefault: aiLlmModels.isDefault,
      })
      .from(aiLlmModels)
      .where(eq(aiLlmModels.status, "active"))
      .orderBy(desc(aiLlmModels.isDefault), aiLlmModels.name);

    return models;
  }),
});
