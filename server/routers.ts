import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { projectsRouter } from "./routers/projects";
import { modelsRouter } from "./routers/models";
import { mcpRouter } from "./routers/mcp";

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
});

export type AppRouter = typeof appRouter;
