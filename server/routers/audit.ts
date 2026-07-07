import { desc } from "drizzle-orm";
import { z } from "zod";
import { aiAuditLogs } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const auditRouter = router({
  // List audit logs with optional filters
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(100),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        search: z.string().optional(),
        projectId: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(aiAuditLogs)
        .orderBy(desc(aiAuditLogs.createdAt))
        .limit(input?.limit ?? 100);

      // Client-side filtering
      let filtered = rows;
      if (input?.action) {
        filtered = filtered.filter(r => r.action === input.action);
      }
      if (input?.resourceType) {
        filtered = filtered.filter(r => r.resourceType === input.resourceType);
      }
      if (input?.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(r =>
          r.action.toLowerCase().includes(q) ||
          r.resourceType.toLowerCase().includes(q) ||
          (r.resourceId ?? "").toLowerCase().includes(q)
        );
      }
      if (input?.projectId) {
        filtered = filtered.filter(r => r.projectId === input.projectId);
      }

      return filtered;
    }),

  // Get distinct action types for filter UI
  getActionTypes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({ action: aiAuditLogs.action })
      .from(aiAuditLogs)
      .orderBy(aiAuditLogs.action);

    const unique = Array.from(new Set(rows.map(r => r.action)));
    return unique;
  }),
});
