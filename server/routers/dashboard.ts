/**
 * Dashboard Router — 监控仪表盘数据聚合
 * 提供 Agent 运行统计、Skill 调用趋势、LLM 成本分析、知识库状态、系统健康等数据
 */
import { z } from "zod";
import { and, count, desc, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiAgentRuns,
  aiAuditLogs,
  aiAssistantMessages,
  aiAssistantSessions,
  aiKnowledgeItems,
  aiLlmModels,
  aiSkillCalls,
  aiSkills,
  users,
} from "../../drizzle/schema";

// ─── 辅助：获取时间范围 ────────────────────────────────────────────────────────
function getTimeRange(range: "24h" | "7d" | "30d") {
  const now = new Date();
  const from = new Date(now);
  if (range === "24h") from.setHours(from.getHours() - 24);
  else if (range === "7d") from.setDate(from.getDate() - 7);
  else from.setDate(from.getDate() - 30);
  return { from, to: now };
}

export const dashboardRouter = router({
  // ─── 总览卡片数据 ──────────────────────────────────────────────────────────
  getOverview: protectedProcedure
    .input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { from } = getTimeRange(input.range);

      // Skill 调用总量 + 成功率
      const [skillStats] = await db
        .select({
          total: count(),
          errors: sql<number>`SUM(CASE WHEN ${aiSkillCalls.errorMessage} IS NOT NULL THEN 1 ELSE 0 END)`,
          totalTokens: sql<number>`COALESCE(SUM(${aiSkillCalls.inputTokens} + ${aiSkillCalls.outputTokens}), 0)`,
          totalCostUsd: sql<string>`COALESCE(SUM(${aiSkillCalls.costUsd}), '0')`,
          avgDurationMs: sql<number>`COALESCE(AVG(${aiSkillCalls.durationMs}), 0)`,
        })
        .from(aiSkillCalls)
        .where(gte(aiSkillCalls.createdAt, from));

      // Agent 运行统计
      const [agentStats] = await db
        .select({
          total: count(),
          completed: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
          running: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} = 'running' THEN 1 ELSE 0 END)`,
        })
        .from(aiAgentRuns)
        .where(gte(aiAgentRuns.createdAt, from));

      // 知识库统计
      const [kbStats] = await db
        .select({
          total: count(),
          approved: sql<number>`SUM(CASE WHEN ${aiKnowledgeItems.status} = 'approved' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${aiKnowledgeItems.status} = 'pending_review' THEN 1 ELSE 0 END)`,
        })
        .from(aiKnowledgeItems);

      // 活跃 Skill 数量
      const [skillCount] = await db
        .select({ total: count() })
        .from(aiSkills)
        .where(eq(aiSkills.status, "active"));

      // 活跃用户数
      const [userCount] = await db
        .select({ total: count() })
        .from(users);

      const totalCalls = skillStats?.total ?? 0;
      const errorCalls = Number(skillStats?.errors ?? 0);
      const successRate = totalCalls > 0 ? ((totalCalls - errorCalls) / totalCalls) * 100 : 100;

      return {
        skillCalls: {
          total: totalCalls,
          successRate: Math.round(successRate * 10) / 10,
          totalTokens: Number(skillStats?.totalTokens ?? 0),
          totalCostUsd: parseFloat(skillStats?.totalCostUsd ?? "0"),
          avgDurationMs: Math.round(Number(skillStats?.avgDurationMs ?? 0)),
        },
        agentRuns: {
          total: agentStats?.total ?? 0,
          completed: Number(agentStats?.completed ?? 0),
          failed: Number(agentStats?.failed ?? 0),
          running: Number(agentStats?.running ?? 0),
        },
        knowledge: {
          total: kbStats?.total ?? 0,
          approved: Number(kbStats?.approved ?? 0),
          pending: Number(kbStats?.pending ?? 0),
        },
        skills: { active: skillCount?.total ?? 0 },
        users: { total: userCount?.total ?? 0 },
      };
    }),

  // ─── Skill 调用趋势（按小时/天分组）──────────────────────────────────────
  getCallTrend: protectedProcedure
    .input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { from } = getTimeRange(input.range);

      // 按天/小时分组（使用 sql.raw 内联格式字符串，避免被 Drizzle 参数化为 ?）
      const groupFormat = input.range === "24h" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";
      const fmtLiteral = `'${groupFormat}'`;
      const rows = await db
        .select({
          period: sql<string>`DATE_FORMAT(${aiSkillCalls.createdAt}, ${sql.raw(fmtLiteral)})`,
          calls: count(),
          errors: sql<number>`SUM(CASE WHEN ${aiSkillCalls.errorMessage} IS NOT NULL THEN 1 ELSE 0 END)`,
          tokens: sql<number>`COALESCE(SUM(${aiSkillCalls.inputTokens} + ${aiSkillCalls.outputTokens}), 0)`,
          costUsd: sql<string>`COALESCE(SUM(${aiSkillCalls.costUsd}), '0')`,
        })
        .from(aiSkillCalls)
        .where(gte(aiSkillCalls.createdAt, from))
        .groupBy(sql.raw(`DATE_FORMAT(\`ai_skill_calls\`.\`createdAt\`, ${fmtLiteral})`))
        .orderBy(sql.raw(`DATE_FORMAT(\`ai_skill_calls\`.\`createdAt\`, ${fmtLiteral})`));

      return rows.map(r => ({
        period: r.period,
        calls: r.calls,
        errors: Number(r.errors),
        tokens: Number(r.tokens),
        costUsd: parseFloat(r.costUsd),
      }));
    }),

  // ─── Skill 排行榜（调用量 Top 10）────────────────────────────────────────
  getTopSkills: protectedProcedure
    .input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("7d"), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { from } = getTimeRange(input.range);

      const rows = await db
        .select({
          skillId: aiSkillCalls.skillId,
          skillName: aiSkills.name,
          calls: count(),
          errors: sql<number>`SUM(CASE WHEN ${aiSkillCalls.errorMessage} IS NOT NULL THEN 1 ELSE 0 END)`,
          avgDurationMs: sql<number>`COALESCE(AVG(${aiSkillCalls.durationMs}), 0)`,
          totalCostUsd: sql<string>`COALESCE(SUM(${aiSkillCalls.costUsd}), '0')`,
          adoptionRate: sql<number>`COALESCE(AVG(CASE WHEN ${aiSkillCalls.adopted} = 1 THEN 100 WHEN ${aiSkillCalls.adopted} = 0 THEN 0 ELSE NULL END), 0)`,
        })
        .from(aiSkillCalls)
        .leftJoin(aiSkills, eq(aiSkillCalls.skillId, aiSkills.id))
        .where(gte(aiSkillCalls.createdAt, from))
        .groupBy(aiSkillCalls.skillId, aiSkills.name)
        .orderBy(desc(count()))
        .limit(input.limit);

      return rows.map(r => ({
        skillId: r.skillId,
        skillName: r.skillName ?? `Skill #${r.skillId}`,
        calls: r.calls,
        errors: Number(r.errors),
        avgDurationMs: Math.round(Number(r.avgDurationMs)),
        totalCostUsd: parseFloat(r.totalCostUsd),
        adoptionRate: Math.round(Number(r.adoptionRate)),
      }));
    }),

  // ─── 模型使用分布 ─────────────────────────────────────────────────────────
  getModelDistribution: protectedProcedure
    .input(z.object({ range: z.enum(["24h", "7d", "30d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { from } = getTimeRange(input.range);

      const rows = await db
        .select({
          modelId: aiSkillCalls.modelId,
          modelName: aiLlmModels.name,
          calls: count(),
          totalCostUsd: sql<string>`COALESCE(SUM(${aiSkillCalls.costUsd}), '0')`,
          totalTokens: sql<number>`COALESCE(SUM(${aiSkillCalls.inputTokens} + ${aiSkillCalls.outputTokens}), 0)`,
        })
        .from(aiSkillCalls)
        .leftJoin(aiLlmModels, eq(aiSkillCalls.modelId, aiLlmModels.id))
        .where(and(gte(aiSkillCalls.createdAt, from), sql`${aiSkillCalls.modelId} IS NOT NULL`))
        .groupBy(aiSkillCalls.modelId, aiLlmModels.name)
        .orderBy(desc(count()));

      return rows.map(r => ({
        modelId: r.modelId,
        modelName: (r.modelName as string | null) ?? `Model #${r.modelId}`,
        calls: r.calls,
        totalCostUsd: parseFloat(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
      }));
    }),

  // ─── Agent 运行历史（最近 20 条）─────────────────────────────────────────
  getRecentAgentRuns: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: aiAgentRuns.id,
          agentId: aiAgentRuns.agentId,
          status: aiAgentRuns.status,
          durationMs: aiAgentRuns.durationMs,
          errorMessage: aiAgentRuns.errorMessage,
          startedAt: aiAgentRuns.startedAt,
          completedAt: aiAgentRuns.completedAt,
          createdAt: aiAgentRuns.createdAt,
        })
        .from(aiAgentRuns)
        .orderBy(desc(aiAgentRuns.createdAt))
        .limit(input.limit);

      return rows;
    }),

  // ─── 审计日志趋势（按天）─────────────────────────────────────────────────
  getAuditTrend: protectedProcedure
    .input(z.object({ range: z.enum(["7d", "30d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { from } = getTimeRange(input.range);

      // 使用 sql.raw 内联格式字符串，避免被 Drizzle 参数化为 ?
      const rows = await db
        .select({
          day: sql<string>`DATE_FORMAT(${aiAuditLogs.createdAt}, '%Y-%m-%d')`,
          total: count(),
          failures: sql<number>`SUM(CASE WHEN ${aiAuditLogs.result} = 'failure' THEN 1 ELSE 0 END)`,
        })
        .from(aiAuditLogs)
        .where(gte(aiAuditLogs.createdAt, from))
        .groupBy(sql.raw("DATE_FORMAT(`ai_audit_logs`.`createdAt`, '%Y-%m-%d')"))
        .orderBy(sql.raw("DATE_FORMAT(`ai_audit_logs`.`createdAt`, '%Y-%m-%d')"));

      return rows.map(r => ({
        day: r.day,
        total: r.total,
        failures: Number(r.failures),
      }));
    }),

  // ─── 系统健康检查 ─────────────────────────────────────────────────────────
  getSystemHealth: protectedProcedure.query(async () => {
    const db = await getDb();
    const dbOk = db !== null;

    // 检查最近 5 分钟内是否有 Skill 调用错误
    let recentErrors = 0;
    if (db) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [res] = await db
        .select({ cnt: count() })
        .from(aiSkillCalls)
        .where(and(
          gte(aiSkillCalls.createdAt, fiveMinAgo),
          sql`${aiSkillCalls.errorMessage} IS NOT NULL`,
        ));
      recentErrors = res?.cnt ?? 0;
    }

    return {
      database: dbOk ? "healthy" : "error",
      api: "healthy",
      recentErrors,
      checkedAt: new Date(),
    };
  }),

  // ─── 成本分析（按天累计）─────────────────────────────────────────────────
  getCostAnalysis: protectedProcedure
    .input(z.object({ range: z.enum(["7d", "30d"]).default("30d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { from } = getTimeRange(input.range);

      // 使用 sql.raw 内联格式字符串，避免被 Drizzle 参数化为 ?
      const rows = await db
        .select({
          day: sql<string>`DATE_FORMAT(${aiSkillCalls.createdAt}, '%Y-%m-%d')`,
          costUsd: sql<string>`COALESCE(SUM(${aiSkillCalls.costUsd}), '0')`,
          inputTokens: sql<number>`COALESCE(SUM(${aiSkillCalls.inputTokens}), 0)`,
          outputTokens: sql<number>`COALESCE(SUM(${aiSkillCalls.outputTokens}), 0)`,
        })
        .from(aiSkillCalls)
        .where(gte(aiSkillCalls.createdAt, from))
        .groupBy(sql.raw("DATE_FORMAT(`ai_skill_calls`.`createdAt`, '%Y-%m-%d')"))
        .orderBy(sql.raw("DATE_FORMAT(`ai_skill_calls`.`createdAt`, '%Y-%m-%d')"));

      return rows.map(r => ({
        day: r.day,
        costUsd: parseFloat(r.costUsd),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
      }));
    }),

  // ─── AI 助手 Token 用量统计 ─────────────────────────────────────────────────────
  getAssistantStats: protectedProcedure
    .input(z.object({ range: z.enum(["7d", "30d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { overview: null, trend: [] };
      const { from } = getTimeRange(input.range);

      // 总览卡片：总对话数 / 总消息数 / 总 Token
      const [overview] = await db
        .select({
          totalSessions: count(aiAssistantSessions.id),
          totalMessages: sql<number>`COALESCE(SUM(${aiAssistantSessions.messageCount}), 0)`,
        })
        .from(aiAssistantSessions)
        .where(gte(aiAssistantSessions.createdAt, from));

      const [tokenStats] = await db
        .select({
          totalInputTokens: sql<number>`COALESCE(SUM(${aiAssistantMessages.inputTokens}), 0)`,
          totalOutputTokens: sql<number>`COALESCE(SUM(${aiAssistantMessages.outputTokens}), 0)`,
        })
        .from(aiAssistantMessages)
        .where(gte(aiAssistantMessages.createdAt, from));

      // 按天分组的 Token 趋势（使用 sql.raw 内联格式字符串，避免被 Drizzle 参数化为 ?）
      const trend = await db
        .select({
          day: sql<string>`DATE_FORMAT(${aiAssistantMessages.createdAt}, '%Y-%m-%d')`,
          inputTokens: sql<number>`COALESCE(SUM(${aiAssistantMessages.inputTokens}), 0)`,
          outputTokens: sql<number>`COALESCE(SUM(${aiAssistantMessages.outputTokens}), 0)`,
          messages: count(),
        })
        .from(aiAssistantMessages)
        .where(and(
          gte(aiAssistantMessages.createdAt, from),
          eq(aiAssistantMessages.role, "assistant"),
        ))
        .groupBy(sql.raw("DATE_FORMAT(`ai_assistant_messages`.`createdAt`, '%Y-%m-%d')"))
        .orderBy(sql.raw("DATE_FORMAT(`ai_assistant_messages`.`createdAt`, '%Y-%m-%d')"));

      return {
        overview: {
          totalSessions: overview?.totalSessions ?? 0,
          totalMessages: Number(overview?.totalMessages ?? 0),
          totalInputTokens: Number(tokenStats?.totalInputTokens ?? 0),
          totalOutputTokens: Number(tokenStats?.totalOutputTokens ?? 0),
        },
        trend: trend.map(r => ({
          day: r.day,
          inputTokens: Number(r.inputTokens),
          outputTokens: Number(r.outputTokens),
          messages: r.messages,
        })),
      };
    }),
});
