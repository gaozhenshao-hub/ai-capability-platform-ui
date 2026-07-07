/**
 * Migration Router — 跨系统数据迁移接口
 * 支持从 Listing 工具 / 产品开发工具导入 Skill、知识库条目、模型配置
 * 也支持导出本平台数据到对端系统（双向同步）
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiSkills,
  aiKnowledgeItems,
  InsertAiSkill,
  InsertAiKnowledgeItem,
} from "../../drizzle/schema";

// ─── 对端系统配置（从环境变量读取）──────────────────────────────────────────
function getPeerConfig(system: "listing" | "product") {
  const envPrefix = system === "listing" ? "LISTING_TOOL" : "PRODUCT_TOOL";
  return {
    apiUrl: process.env[`${envPrefix}_API_URL`] ?? "",
    apiKey: process.env[`${envPrefix}_API_KEY`] ?? "",
  };
}

// ─── 从对端系统拉取数据 ────────────────────────────────────────────────────────
async function fetchFromPeer<T>(
  system: "listing" | "product",
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T | null> {
  const { apiUrl, apiKey } = getPeerConfig(system);
  if (!apiUrl || !apiKey) return null;

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Skill 导入 Schema ────────────────────────────────────────────────────────
const importSkillSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  systemPrompt: z.string().optional(),
  promptTemplate: z.string(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  modelParams: z.record(z.string(), z.unknown()).optional(),
});
// ─── 知识库条目导入 Schema ────────────────────────────────────────────────────
const importKbItemSchema = z.object({
  title: z.string(),
  content: z.string(),
  collection: z.string().default("imported"),
  contentType: z.enum(["text", "example", "rule", "template"]).default("text"),
  tags: z.array(z.string()).optional(),
  source: z.enum(["manual", "auto"]).default("manual"),
});

export const migrationRouter = router({
  // ─── 检查对端系统连接状态 ────────────────────────────────────────────────
  checkPeerConnection: protectedProcedure
    .input(z.object({ system: z.enum(["listing", "product"]) }))
    .query(async ({ input }) => {
      const { apiUrl, apiKey } = getPeerConfig(input.system);
      if (!apiUrl || !apiKey) {
        return { connected: false, reason: "未配置环境变量" };
      }

      const result = await fetchFromPeer<{ status: string }>(input.system, "/health");
      if (!result) return { connected: false, reason: "连接失败或超时" };
      return { connected: true, apiUrl };
    }),

  // ─── 从对端系统拉取可导入的 Skill 列表 ──────────────────────────────────
  listPeerSkills: protectedProcedure
    .input(z.object({ system: z.enum(["listing", "product"]) }))
    .query(async ({ input }) => {
      const result = await fetchFromPeer<{ skills: Array<{
        id: string; name: string; description?: string; category?: string;
        systemPrompt?: string; promptTemplate: string;
      }> }>(input.system, "/api/trpc/skills.list");

      if (!result?.skills) return [];
      return result.skills;
    }),

  // ─── 从对端系统拉取可导入的知识库条目 ───────────────────────────────────
  listPeerKnowledge: protectedProcedure
    .input(z.object({
      system: z.enum(["listing", "product"]),
      collection: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const path = input.collection
        ? `/api/trpc/knowledge.list?collection=${encodeURIComponent(input.collection)}`
        : "/api/trpc/knowledge.list";

      const result = await fetchFromPeer<{ items: Array<{
        id: string; title: string; content: string; collection: string;
        tags?: string[]; source?: string;
      }> }>(input.system, path);

      if (!result?.items) return [];
      return result.items;
    }),

  // ─── 批量导入 Skill（从对端或手动粘贴 JSON）────────────────────────────
  importSkills: protectedProcedure
    .input(z.object({
      skills: z.array(importSkillSchema),
      projectId: z.number().optional(),
      overwriteExisting: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      const results: Array<{ name: string; status: "created" | "updated" | "skipped"; id?: number }> = [];

      for (const skill of input.skills) {
        // 生成 slug
        const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // 检查是否已存在同名 Skill
        const existing = await db
          .select({ id: aiSkills.id })
          .from(aiSkills)
          .where(eq(aiSkills.slug, slug))
          .limit(1);

        if (existing.length > 0 && !input.overwriteExisting) {
          results.push({ name: skill.name, status: "skipped" });
          continue;
        }

        const skillData: InsertAiSkill = {
          name: skill.name,
          slug: existing.length > 0 ? `${slug}-${Date.now()}` : slug,
          description: skill.description ?? "",
          category: skill.category ?? "imported",
          systemPrompt: skill.systemPrompt ?? "",
          promptTemplate: skill.promptTemplate,
          inputSchema: skill.inputSchema ?? {},
          outputSchema: skill.outputSchema ?? {},
          modelParams: skill.modelParams ?? {},
          status: "draft",
          scope: "project",
          projectId: input.projectId ?? null,
          createdBy: ctx.user.id,
        };

        if (existing.length > 0 && input.overwriteExisting) {
          const { slug: _s, createdBy: _c, createdAt: _ca, ...updateData } = skillData;
          await db.update(aiSkills).set(updateData).where(eq(aiSkills.id, existing[0].id));
          results.push({ name: skill.name, status: "updated", id: existing[0].id });
        } else {
          const [inserted] = await db.insert(aiSkills).values(skillData).$returningId();
          results.push({ name: skill.name, status: "created", id: inserted?.id });
        }
      }

      return {
        total: input.skills.length,
        created: results.filter(r => r.status === "created").length,
        updated: results.filter(r => r.status === "updated").length,
        skipped: results.filter(r => r.status === "skipped").length,
        results,
      };
    }),

  // ─── 批量导入知识库条目 ──────────────────────────────────────────────────
  importKnowledge: protectedProcedure
    .input(z.object({
      items: z.array(importKbItemSchema),
      overwriteExisting: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      const results: Array<{ title: string; status: "created" | "updated" | "skipped" }> = [];

      for (const item of input.items) {
        const existing = await db
          .select({ id: aiKnowledgeItems.id })
          .from(aiKnowledgeItems)
          .where(and(
            eq(aiKnowledgeItems.title, item.title),
            eq(aiKnowledgeItems.collection, item.collection),
          ))
          .limit(1);

        if (existing.length > 0 && !input.overwriteExisting) {
          results.push({ title: item.title, status: "skipped" });
          continue;
        }

        const kbData: InsertAiKnowledgeItem = {
          title: item.title,
          content: item.content,
          collection: item.collection,
          contentType: item.contentType,
          tags: item.tags ?? [],
          status: "pending_review",
          source: item.source,
          createdBy: ctx.user.id,
        };

        if (existing.length > 0 && input.overwriteExisting) {
          await db.update(aiKnowledgeItems).set(kbData).where(eq(aiKnowledgeItems.id, existing[0].id));
          results.push({ title: item.title, status: "updated" });
        } else {
          await db.insert(aiKnowledgeItems).values(kbData);
          results.push({ title: item.title, status: "created" });
        }
      }

      return {
        total: input.items.length,
        created: results.filter(r => r.status === "created").length,
        updated: results.filter(r => r.status === "updated").length,
        skipped: results.filter(r => r.status === "skipped").length,
        results,
      };
    }),

  // ─── 导出本平台 Skill 到对端系统 ────────────────────────────────────────
  exportSkillsToPeer: protectedProcedure
    .input(z.object({
      system: z.enum(["listing", "product"]),
      skillIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      const skills = await db
        .select()
        .from(aiSkills)
        .where(inArray(aiSkills.id, input.skillIds));

      if (!skills.length) return { success: false, reason: "未找到指定 Skill" };

      const result = await fetchFromPeer<{ imported: number }>(
        input.system,
        "/api/trpc/migration.importSkills",
        {
          method: "POST",
          body: {
            skills: skills.map(s => ({
              name: s.name,
              description: s.description,
              category: s.category,
              systemPrompt: s.systemPrompt,
              promptTemplate: s.promptTemplate,
              inputSchema: s.inputSchema,
              outputSchema: s.outputSchema,
              modelParams: s.modelParams,
            })),
          },
        }
      );

      if (!result) return { success: false, reason: "对端系统未响应或未配置" };
      return { success: true, exported: skills.length, peerImported: result.imported };
    }),

  // ─── 同步状态摘要 ────────────────────────────────────────────────────────
  getSyncStatus: protectedProcedure.query(async () => {
    const listingCfg = getPeerConfig("listing");
    const productCfg = getPeerConfig("product");

    return {
      listing: {
        configured: !!(listingCfg.apiUrl && listingCfg.apiKey),
        apiUrl: listingCfg.apiUrl ? listingCfg.apiUrl.replace(/\/\/.*@/, "//***@") : null,
      },
      product: {
        configured: !!(productCfg.apiUrl && productCfg.apiKey),
        apiUrl: productCfg.apiUrl ? productCfg.apiUrl.replace(/\/\/.*@/, "//***@") : null,
      },
    };
  }),
});
