import { desc, eq, and, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { aiKnowledgeItems, aiAuditLogs } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";

// ─── 审计日志辅助函数 ──────────────────────────────────────────────────────────
async function logAudit(params: {
  userId: number;
  action: string;
  resourceType: string;
  resourceId?: string;
  afterData?: Record<string, unknown>;
  projectId?: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await logAudit({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      afterData: params.afterData,
      projectId: params.projectId,
      userId: params.userId,
    });
  } catch (e) {
    console.warn("[AuditLog] Failed to write:", e);
  }
}

// ─── 知识库路由 ────────────────────────────────────────────────────────────────
export const knowledgeRouter = router({

  // ─── 获取所有集合列表 ────────────────────────────────────────────────────────
  getCollections: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const query = db
        .selectDistinct({ collection: aiKnowledgeItems.collection })
        .from(aiKnowledgeItems);
      if (input?.projectId) {
        query.where(eq(aiKnowledgeItems.projectId, input.projectId));
      }
      const rows = await query;
      // Also get counts per collection
      const countRows = await db
        .select({
          collection: aiKnowledgeItems.collection,
          total: sql<number>`COUNT(*)`,
          approved: sql<number>`SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)`,
          draft: sql<number>`SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END)`,
        })
        .from(aiKnowledgeItems)
        .groupBy(aiKnowledgeItems.collection);

      const countMap = new Map(countRows.map(r => [r.collection, r]));
      return rows.map(r => ({
        name: r.collection,
        total: countMap.get(r.collection)?.total ?? 0,
        approved: countMap.get(r.collection)?.approved ?? 0,
        draft: countMap.get(r.collection)?.draft ?? 0,
        pending: countMap.get(r.collection)?.pending ?? 0,
      }));
    }),

  // ─── 列表查询（分页 + 搜索 + 过滤）────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      collection: z.string().optional(),
      query: z.string().optional(),
      status: z.enum(["draft", "pending_review", "approved", "rejected", "all"]).optional(),
      contentType: z.enum(["text", "example", "rule", "template", "all"]).optional(),
      tags: z.array(z.string()).optional(),
      projectId: z.number().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.collection) conditions.push(eq(aiKnowledgeItems.collection, input.collection));
      if (input.status && input.status !== "all") conditions.push(eq(aiKnowledgeItems.status, input.status));
      if (input.contentType && input.contentType !== "all") conditions.push(eq(aiKnowledgeItems.contentType, input.contentType));
      if (input.projectId) conditions.push(eq(aiKnowledgeItems.projectId, input.projectId));
      if (input.query) {
        conditions.push(
          or(
            like(aiKnowledgeItems.title, `%${input.query}%`),
            like(aiKnowledgeItems.content, `%${input.query}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select().from(aiKnowledgeItems)
          .where(whereClause)
          .orderBy(desc(aiKnowledgeItems.updatedAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(aiKnowledgeItems)
          .where(whereClause),
      ]);

      return {
        items,
        total: countResult[0]?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / input.pageSize),
      };
    }),

  // ─── 获取单条 ───────────────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const rows = await db.select().from(aiKnowledgeItems).where(eq(aiKnowledgeItems.id, input.id)).limit(1);
      if (!rows.length) throw new Error("知识库条目不存在");
      return rows[0];
    }),

  // ─── 创建条目 ───────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      collection: z.string().min(1).max(64),
      title: z.string().min(1).max(256),
      content: z.string().min(1),
      contentType: z.enum(["text", "example", "rule", "template"]).default("text"),
      tags: z.array(z.string()).default([]),
      projectId: z.number().optional(),
      status: z.enum(["draft", "pending_review"]).default("draft"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const [result] = await db.insert(aiKnowledgeItems).values({
        collection: input.collection,
        title: input.title,
        content: input.content,
        contentType: input.contentType,
        tags: input.tags,
        projectId: input.projectId ?? null,
        status: input.status,
        source: "manual",
        createdBy: ctx.user.id,
      });
      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.create",
        resourceType: "knowledge_item",
        resourceId: String(result.insertId),
        afterData: { title: input.title, collection: input.collection },
      });
      return { id: result.insertId };
    }),

  // ─── 更新条目 ───────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(256).optional(),
      content: z.string().min(1).optional(),
      contentType: z.enum(["text", "example", "rule", "template"]).optional(),
      tags: z.array(z.string()).optional(),
      collection: z.string().min(1).max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.contentType !== undefined) updateData.contentType = updates.contentType;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.collection !== undefined) updateData.collection = updates.collection;
      // Reset to draft when content changes
      if (updates.content !== undefined || updates.title !== undefined) {
        updateData.status = "draft";
      }
      await db.update(aiKnowledgeItems).set(updateData).where(eq(aiKnowledgeItems.id, id));
      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.update",
        resourceType: "knowledge_item",
        resourceId: String(id),
        afterData: { fields: Object.keys(updateData) },
      });
      return { success: true };
    }),

  // ─── 删除条目 ───────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      await db.delete(aiKnowledgeItems).where(eq(aiKnowledgeItems.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.delete",
        resourceType: "knowledge_item",
        resourceId: String(input.id),
        afterData: {},
      });
      return { success: true };
    }),

  // ─── 提交审核 ───────────────────────────────────────────────────────────────
  submitReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      await db.update(aiKnowledgeItems)
        .set({ status: "pending_review" })
        .where(eq(aiKnowledgeItems.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.submitReview",
        resourceType: "knowledge_item",
        resourceId: String(input.id),
        afterData: {},
      });
      return { success: true };
    }),

  // ─── 审核操作（通过/拒绝）────────────────────────────────────────────────────
  review: protectedProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["approve", "reject"]),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const newStatus = input.action === "approve" ? "approved" : "rejected";
      await db.update(aiKnowledgeItems)
        .set({
          status: newStatus,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(aiKnowledgeItems.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        action: `knowledge.${input.action}`,
        resourceType: "knowledge_item",
        resourceId: String(input.id),
        afterData: { comment: input.comment },
      });
      return { success: true };
    }),

  // ─── 文档上传（S3 + 文本提取 + AI 摘要）────────────────────────────────────
  uploadDocument: protectedProcedure
    .input(z.object({
      collection: z.string().min(1).max(64),
      fileName: z.string(),
      fileContent: z.string(), // base64 encoded
      mimeType: z.string(),
      projectId: z.number().optional(),
      autoExtract: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");

      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileContent, "base64");
      const fileKey = `knowledge/${ctx.user.id}/${Date.now()}-${input.fileName}`;
      const { key, url } = await storagePut(fileKey, buffer, input.mimeType);

      // Extract text content (basic text extraction)
      let extractedText = "";
      if (input.mimeType === "text/plain" || input.mimeType === "text/markdown") {
        extractedText = buffer.toString("utf-8");
      } else if (input.mimeType === "text/csv") {
        extractedText = buffer.toString("utf-8");
      } else {
        // For PDF and other formats, use file URL as placeholder
        extractedText = `[文件已上传: ${input.fileName}]\n文件地址: ${url}\n\n请手动补充文本内容。`;
      }

      // AI auto-summarize if text is available and autoExtract is true
      let title = input.fileName.replace(/\.[^.]+$/, "");
      let content = extractedText;

      if (input.autoExtract && extractedText.length > 50 && !extractedText.startsWith("[文件已上传")) {
        try {
          const aiResp = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "你是一个专业的知识库整理助手。请从给定文本中提取核心内容，生成结构化的知识库条目。输出 JSON 格式：{\"title\": \"条目标题\", \"content\": \"整理后的内容（Markdown格式）\", \"tags\": [\"标签1\", \"标签2\"]}",
              },
              {
                role: "user",
                content: `文件名：${input.fileName}\n\n文本内容（前3000字）：\n${extractedText.slice(0, 3000)}`,
              },
            ],
          });
          const rawContent = aiResp.choices?.[0]?.message?.content;
          const raw = typeof rawContent === "string" ? rawContent : "";
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.title) title = parsed.title;
            if (parsed.content) content = parsed.content;
          }
        } catch {
          // AI extraction failed, use raw text
        }
      }

      // Create knowledge item
      const [result] = await db.insert(aiKnowledgeItems).values({
        collection: input.collection,
        title,
        content: `${content}\n\n---\n**原始文件**: [${input.fileName}](${url})`,
        contentType: "text",
        tags: [],
        projectId: input.projectId ?? null,
        status: "draft",
        source: "manual",
        createdBy: ctx.user.id,
      });

      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.uploadDocument",
        resourceType: "knowledge_item",
        resourceId: String(result.insertId),
        afterData: { fileName: input.fileName, fileKey: key, collection: input.collection },
      });

      return { id: result.insertId, title, fileUrl: url };
    }),

  // ─── 全文搜索 ───────────────────────────────────────────────────────────────
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      collection: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
      statusFilter: z.enum(["approved", "all"]).default("approved"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      const conditions = [
        or(
          like(aiKnowledgeItems.title, `%${input.query}%`),
          like(aiKnowledgeItems.content, `%${input.query}%`)
        ),
      ];
      if (input.collection) conditions.push(eq(aiKnowledgeItems.collection, input.collection));
      if (input.statusFilter === "approved") conditions.push(eq(aiKnowledgeItems.status, "approved"));

      const results = await db.select({
        id: aiKnowledgeItems.id,
        collection: aiKnowledgeItems.collection,
        title: aiKnowledgeItems.title,
        content: aiKnowledgeItems.content,
        tags: aiKnowledgeItems.tags,
        status: aiKnowledgeItems.status,
        contentType: aiKnowledgeItems.contentType,
        createdAt: aiKnowledgeItems.createdAt,
      })
        .from(aiKnowledgeItems)
        .where(and(...conditions))
        .orderBy(desc(aiKnowledgeItems.updatedAt))
        .limit(input.limit);

      // Add simple relevance: title match scores higher
      return results.map(r => ({
        ...r,
        relevance: r.title.toLowerCase().includes(input.query.toLowerCase()) ? 2 : 1,
        snippet: extractSnippet(r.content, input.query),
      })).sort((a, b) => b.relevance - a.relevance);
    }),

  // ─── AI 对话式检索 ──────────────────────────────────────────────────────────
  aiSearch: protectedProcedure
    .input(z.object({
      question: z.string().min(1),
      collection: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      // First do keyword search to get candidate docs
      const conditions = [
        eq(aiKnowledgeItems.status, "approved"),
        or(
          like(aiKnowledgeItems.title, `%${input.question.slice(0, 20)}%`),
          like(aiKnowledgeItems.content, `%${input.question.slice(0, 20)}%`)
        ),
      ];
      if (input.collection) conditions.push(eq(aiKnowledgeItems.collection, input.collection));

      const candidates = await db.select().from(aiKnowledgeItems)
        .where(and(...conditions))
        .limit(input.limit * 2);

      if (!candidates.length) {
        return {
          answer: "未找到相关知识库内容，请尝试其他关键词或扩大搜索范围。",
          sources: [],
        };
      }

      // Build context for LLM
      const context = candidates
        .slice(0, input.limit)
        .map((c, i) => `[${i + 1}] ${c.title}\n${c.content.slice(0, 500)}`)
        .join("\n\n---\n\n");

      const aiResp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是一个专业的知识库助手。根据提供的知识库内容，回答用户问题。回答要准确、简洁，并标注引用来源编号。",
          },
          {
            role: "user",
            content: `知识库内容：\n\n${context}\n\n用户问题：${input.question}`,
          },
        ],
      });

      return {
        answer: aiResp.choices?.[0]?.message?.content ?? "无法生成回答",
        sources: candidates.slice(0, input.limit).map((c, i) => ({
          index: i + 1,
          id: c.id,
          title: c.title,
          collection: c.collection,
          snippet: c.content.slice(0, 200),
        })),
      };
    }),

  // ─── 批量导入 ───────────────────────────────────────────────────────────────
  bulkImport: protectedProcedure
    .input(z.object({
      collection: z.string().min(1).max(64),
      items: z.array(z.object({
        title: z.string().min(1).max(256),
        content: z.string().min(1),
        contentType: z.enum(["text", "example", "rule", "template"]).default("text"),
        tags: z.array(z.string()).default([]),
      })),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库连接不可用");
      if (!input.items.length) return { imported: 0, failed: 0 };

      let imported = 0;
      let failed = 0;
      for (const item of input.items) {
        try {
          await db.insert(aiKnowledgeItems).values({
            collection: input.collection,
            title: item.title,
            content: item.content,
            contentType: item.contentType,
            tags: item.tags,
            projectId: input.projectId ?? null,
            status: "draft",
            source: "manual",
            createdBy: ctx.user.id,
          });
          imported++;
        } catch {
          failed++;
        }
      }

      await logAudit({
        userId: ctx.user.id,
        action: "knowledge.bulkImport",
        resourceType: "knowledge_item",
        resourceId: "bulk",
        afterData: { collection: input.collection, imported, failed },
      });

      return { imported, failed };
    }),

  // ─── 统计数据 ───────────────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, byStatus: {}, topCollections: [] };
    const [total, byStatus, byCollection] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(aiKnowledgeItems),
      db.select({
        status: aiKnowledgeItems.status,
        count: sql<number>`COUNT(*)`,
      }).from(aiKnowledgeItems).groupBy(aiKnowledgeItems.status),
      db.select({
        collection: aiKnowledgeItems.collection,
        count: sql<number>`COUNT(*)`,
      }).from(aiKnowledgeItems).groupBy(aiKnowledgeItems.collection).orderBy(desc(sql`COUNT(*)`)).limit(10),
    ]);

    return {
      total: total[0]?.count ?? 0,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      topCollections: byCollection,
    };
  }),

  // ─── AMZ 知识库代理查询（从 Emperor 层面调用 AMZ 工具 KB API）───────────────
  getAmzKbStats: protectedProcedure.query(async () => {
    const amzKbUrl = process.env.AMZ_KB_API_URL || "https://amzlisting-a79tkwus.manus.space";
    const amzKbKey = process.env.AMZ_KB_API_KEY || "emperor-kb-2024";
    try {
      const resp = await fetch(`${amzKbUrl}/api/external/kb/stats`, {
        headers: { Authorization: `Bearer ${amzKbKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { success: false, stats: {}, error: `HTTP ${resp.status}` };
      const data = await resp.json() as { success: boolean; stats: Record<string, unknown> };
      return { success: true, stats: data.stats ?? {} };
    } catch (e: any) {
      return { success: false, stats: {}, error: e.message };
    }
  }),

  searchAmzKb: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      type: z.enum(["product", "listing", "image", "skill", "video"]).optional(),
      limit: z.number().min(1).max(20).default(5),
      level: z.enum(["L1", "L2", "L3"]).default("L2"),
    }))
    .query(async ({ input }) => {
      const amzKbUrl = process.env.AMZ_KB_API_URL || "https://amzlisting-a79tkwus.manus.space";
      const amzKbKey = process.env.AMZ_KB_API_KEY || "emperor-kb-2024";
      try {
        const resp = await fetch(`${amzKbUrl}/api/external/kb/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${amzKbKey}` },
          body: JSON.stringify({ query: input.query, types: input.type ? [input.type] : undefined, limit: input.limit, level: input.level }),
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) return { success: false, items: [], totalScanned: 0, error: `HTTP ${resp.status}` };
        return await resp.json();
      } catch (e: any) {
        return { success: false, items: [], totalScanned: 0, error: e.message };
      }
    }),

  // ─── Emperor 知识总结 Agent（方案三）────────────────────────────────────────────────
  summarizeAmzKb: protectedProcedure
    .input(z.object({
      kbType: z.enum(["product", "listing", "image", "skill", "video"]).default("listing"),
      category: z.string().optional(),
      limit: z.number().min(3).max(20).default(8),
      summaryFocus: z.string().default("优秀文案的共性规律和写作技巧"),
    }))
    .mutation(async ({ input }) => {
      const emperorUrl = process.env.EMPEROR_API_URL || "http://104.196.50.157:4800";
      const emperorKey = process.env.EMPEROR_API_KEY || "dev-service-token";
      try {
        const resp = await fetch(`${emperorUrl}/v1/knowledge/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${emperorKey}` },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(90000),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          return { success: false, error: `Emperor API error: HTTP ${resp.status} ${errText.slice(0, 200)}` };
        }
        return await resp.json();
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }),

  getEmperorSummaries: protectedProcedure
    .input(z.object({
      kbType: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const emperorUrl = process.env.EMPEROR_API_URL || "http://104.196.50.157:4800";
      const emperorKey = process.env.EMPEROR_API_KEY || "dev-service-token";
      try {
        const url = new URL(`${emperorUrl}/v1/knowledge/summaries`);
        if (input.kbType) url.searchParams.set("kbType", input.kbType);
        url.searchParams.set("limit", String(input.limit));
        const resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${emperorKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return { success: false, summaries: [], total: 0 };
        return await resp.json();
      } catch {
        return { success: false, summaries: [], total: 0 };
      }
    }),
});

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function extractSnippet(content: string, query: string, maxLen = 200): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, maxLen) + (content.length > maxLen ? "..." : "");
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + query.length + 140);
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
}
