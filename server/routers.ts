import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { projectsRouter } from "./routers/projects";
import { modelsRouter } from "./routers/models";
import { mcpRouter } from "./routers/mcp";
import { skillsRouter } from "./routers/skills";
import { auditRouter } from "./routers/audit";
import { agentsRouter } from "./routers/agents";
import { knowledgeRouter } from "./routers/knowledge";
import { dashboardRouter } from "./routers/dashboard";
import { migrationRouter } from "./routers/migration";
import { assistantRouter } from "./routers/assistant";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Phase 1.2 — 多项目管理
  projects: projectsRouter,

  // Phase 1.3 — LLM 模型管理
  models: modelsRouter,

  // Phase 2 — MCP 工具管理
  mcp: mcpRouter,

  // Phase 3 — Skill 技能管理
  skills: skillsRouter,

  // 审计日志
  audit: auditRouter,

  // Phase 4 — Agent 可视化编排
  agents: agentsRouter,

  // Phase 5 — 知识库管理
  knowledge: knowledgeRouter,

  // Phase 5 — 监控仪表盘
  dashboard: dashboardRouter,

  // Phase 5 — 跨系统迁移
  migration: migrationRouter,

  // Phase 6 — 平台内置 AI 助手
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;
