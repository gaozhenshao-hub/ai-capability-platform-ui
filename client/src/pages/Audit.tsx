import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { ClipboardList, RefreshCw, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const ACTION_COLOR: Record<string, string> = {
  create:  "text-emerald-400",
  update:  "text-cyan-400",
  delete:  "text-red-400",
  rollback: "text-amber-400",
  run:     "text-violet-400",
};

const ACTION_BG: Record<string, string> = {
  create:  "bg-emerald-500/15",
  update:  "bg-cyan-500/15",
  delete:  "bg-red-500/15",
  rollback: "bg-amber-500/15",
  run:     "bg-violet-500/15",
};

export default function Audit() {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: logs, isLoading, refetch } = trpc.audit.list.useQuery({ limit: 200 });
  const { data: actionTypes } = trpc.audit.getActionTypes.useQuery();

  const filtered = (logs ?? []).filter(e => {
    const matchSearch = !search || e.action.includes(search) || e.resourceType.includes(search) || (e.resourceId ?? "").includes(search);
    const matchAction = filterAction === "all" || e.action === filterAction;
    return matchSearch && matchAction;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-violet-400" />
            审计日志
          </h1>
          <p className="text-sm mt-0.5 text-slate-400">所有 API 调用与管理操作的完整记录</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索动作、资源类型、ID…"
            className="pl-8 bg-[#0d1117] border-white/10 text-white text-sm" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setFilterAction("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterAction === "all" ? "bg-violet-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
            全部
          </button>
          {(actionTypes ?? []).slice(0, 8).map(action => (
            <button key={action} onClick={() => setFilterAction(action)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterAction === action ? "bg-violet-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>共 <span className="text-white font-medium">{filtered.length}</span> 条记录</span>
        {search && <span>（已过滤）</span>}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/8 bg-[#0d1117] overflow-hidden">
        <div className="grid text-xs font-medium px-4 py-3 border-b border-white/8 text-slate-500"
          style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto" }}>
          <span>动作</span><span>资源类型</span><span>资源 ID</span><span>用户</span><span>时间</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-24">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-sm text-slate-500">
            <ClipboardList className="h-6 w-6 mb-2 text-slate-700" />
            暂无审计记录
          </div>
        )}

        {filtered.map(event => (
          <div key={event.id}>
            <div
              onClick={() => setExpanded(expanded === event.id ? null : event.id)}
              className="grid items-center px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/2 transition-colors text-xs"
              style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto" }}>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 font-medium ${ACTION_BG[event.action] ?? "bg-slate-500/15"} ${ACTION_COLOR[event.action] ?? "text-slate-400"}`}>
                  {event.action}
                </span>
                {event.result === "failure" && (
                  <span className="text-red-400 text-xs">✗</span>
                )}
              </span>
              <span className="text-slate-400">{event.resourceType}</span>
              <span className="font-mono text-slate-500 truncate">{event.resourceId ?? "-"}</span>
              <span className="text-slate-500">{event.userId ?? "-"}</span>
              <div className="flex items-center gap-2 text-slate-600">
                <span>{new Date(event.createdAt).toLocaleString()}</span>
                {expanded === event.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </div>

            {expanded === event.id && (
              <div className="px-4 py-3 border-b border-white/5 bg-black/20">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {event.beforeData && (
                    <div>
                      <p className="text-slate-500 mb-1.5 font-medium">变更前</p>
                      <pre className="rounded-lg bg-[#0a0d14] border border-white/8 p-3 text-slate-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {JSON.stringify(event.beforeData, null, 2)}
                      </pre>
                    </div>
                  )}
                  {event.afterData && (
                    <div>
                      <p className="text-slate-500 mb-1.5 font-medium">变更后</p>
                      <pre className="rounded-lg bg-[#0a0d14] border border-white/8 p-3 text-slate-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {JSON.stringify(event.afterData, null, 2)}
                      </pre>
                    </div>
                  )}
                  {event.errorMessage && (
                    <div className="col-span-2">
                      <p className="text-red-400 mb-1.5 font-medium">错误信息</p>
                      <pre className="rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-red-400 font-mono whitespace-pre-wrap">
                        {event.errorMessage}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
