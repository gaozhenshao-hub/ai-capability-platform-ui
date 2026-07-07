// Audit Log Page
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { api, AuditEvent } from "@/lib/api";
import { ClipboardList, RefreshCw, ChevronDown, ChevronRight, Search } from "lucide-react";

const ACTION_COLOR: Record<string, string> = {
  skill_run:     "oklch(0.65 0.20 300)",
  agent_run:     "oklch(0.65 0.18 155)",
  model_switch:  "oklch(0.60 0.20 265)",
  knowledge_update: "oklch(0.75 0.18 80)",
  connector_test: "oklch(0.60 0.20 265)",
  error:         "oklch(0.62 0.22 25)",
};

export default function Audit() {
  const { data, loading, refetch } = useApi(() =>
    api.get<{ events: AuditEvent[] }>("/v1/audit/events").then(r => r.events)
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  const events = (data ?? []).filter(e => {
    const matchSearch = !search || e.actor.includes(search) || e.action.includes(search) || e.target.includes(search);
    const matchAction = filterAction === "all" || e.action === filterAction;
    return matchSearch && matchAction;
  });

  const actionTypes = Array.from(new Set((data ?? []).map(e => e.action)));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>审计日志</h1>
          <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.012 265)" }}>所有 API 调用与管理操作的完整记录</p>
        </div>
        <button onClick={refetch} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)", border: "1px solid oklch(0.25 0.016 265)" }}>
          <RefreshCw size={13} />刷新
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "oklch(0.45 0.012 265)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索操作者、动作、目标…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "oklch(0.14 0.014 265)", border: "1px solid oklch(0.22 0.016 265)", color: "white" }} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilterAction("all")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: filterAction === "all" ? "oklch(0.60 0.20 265)" : "oklch(0.14 0.014 265)", color: "white", border: "1px solid oklch(0.22 0.016 265)" }}>
            全部
          </button>
          {actionTypes.slice(0, 4).map(action => (
            <button key={action} onClick={() => setFilterAction(action)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: filterAction === action ? ACTION_COLOR[action] ?? "oklch(0.60 0.20 265)" : "oklch(0.14 0.014 265)",
                color: "white", border: "1px solid oklch(0.22 0.016 265)"
              }}>
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        <div className="grid text-xs font-medium px-4 py-3 border-b"
          style={{ gridTemplateColumns: "1fr 1fr 1fr auto", borderColor: "oklch(0.22 0.016 265)", color: "oklch(0.45 0.012 265)" }}>
          <span>操作者</span><span>动作</span><span>目标</span><span>时间</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-24">
            <RefreshCw size={14} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} />
          </div>
        )}

        {events.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-24 text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>
            <ClipboardList size={24} className="mb-2" style={{ color: "oklch(0.30 0.016 265)" }} />
            暂无审计记录
          </div>
        )}

        {events.map(event => (
          <div key={event.id}>
            <div
              onClick={() => setExpanded(expanded === event.id ? null : event.id)}
              className="grid items-center px-4 py-3 border-b cursor-pointer transition-colors text-xs"
              style={{ gridTemplateColumns: "1fr 1fr 1fr auto", borderColor: "oklch(0.20 0.015 265)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
              <span className="font-mono" style={{ color: "oklch(0.70 0.012 265)" }}>{event.actor}</span>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACTION_COLOR[event.action] ?? "oklch(0.55 0.012 265)" }} />
                <span style={{ color: ACTION_COLOR[event.action] ?? "oklch(0.65 0.012 265)" }}>{event.action}</span>
              </span>
              <span className="font-mono truncate" style={{ color: "oklch(0.60 0.012 265)" }}>{event.target}</span>
              <div className="flex items-center gap-2" style={{ color: "oklch(0.40 0.012 265)" }}>
                <span>{new Date(event.createdAt).toLocaleString()}</span>
                {expanded === event.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </div>
            </div>

            {expanded === event.id && (
              <div className="px-4 py-3 border-b" style={{ background: "oklch(0.12 0.012 265)", borderColor: "oklch(0.20 0.015 265)" }}>
                <div className="text-xs mb-1" style={{ color: "oklch(0.45 0.012 265)" }}>事件详情</div>
                <pre className="code-block p-3 text-xs overflow-auto" style={{ maxHeight: 200 }}>
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
