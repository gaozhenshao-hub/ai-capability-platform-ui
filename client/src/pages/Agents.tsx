// Agents Management Page — DAG visualization + run monitoring
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { api, Agent, AgentDetail, AgentRunDetail } from "@/lib/api";
import { Bot, Play, RefreshCw, GitBranch, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import { toast } from "sonner";

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle size={12} style={{ color: "oklch(0.65 0.18 155)" }} />,
  failed:    <XCircle size={12} style={{ color: "oklch(0.62 0.22 25)" }} />,
  running:   <Loader size={12} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} />,
  pending:   <Clock size={12} style={{ color: "oklch(0.55 0.012 265)" }} />,
  skipped:   <Clock size={12} style={{ color: "oklch(0.45 0.012 265)" }} />,
};

const STATUS_COLOR: Record<string, string> = {
  active:   "oklch(0.65 0.18 155)",
  inactive: "oklch(0.55 0.012 265)",
  draft:    "oklch(0.75 0.18 80)",
};

export default function Agents() {
  const { data: agents, loading, refetch } = useApi(() =>
    api.get<{ agents: Agent[] }>("/v1/agents").then(r => r.agents)
  );
  const [selected, setSelected] = useState<AgentDetail | null>(null);
  const [runs, setRuns] = useState<AgentRunDetail[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [runInput, setRunInput] = useState('{"query": "test"}');
  const [running, setRunning] = useState(false);

  async function selectAgent(slug: string) {
    setLoadingDetail(true);
    try {
      const [detail, runList] = await Promise.all([
        api.get<AgentDetail>(`/v1/agents/${slug}`),
        api.get<{ runs: AgentRunDetail[] }>(`/v1/agents/${slug}/runs`).then(r => r.runs),
      ]);
      setSelected(detail);
      setRuns(runList);
    } catch (e: unknown) {
      toast.error("加载 Agent 详情失败");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function runAgent() {
    if (!selected) return;
    setRunning(true);
    try {
      let input: unknown;
      try { input = JSON.parse(runInput); } catch { input = runInput; }
      await api.post(`/v1/agents/${selected.slug}/run`, { input });
      toast.success("Agent 已启动");
      const runList = await api.get<{ runs: AgentRunDetail[] }>(`/v1/agents/${selected.slug}/runs`).then(r => r.runs);
      setRuns(runList);
    } catch (e: unknown) {
      toast.error(`运行失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 0 }}>
      {/* Agent List */}
      <div className="flex flex-col rounded-xl border overflow-hidden"
        style={{ width: 280, flexShrink: 0, background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "oklch(0.22 0.016 265)" }}>
          <h2 className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Agents <span className="ml-1 text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.65 0.18 155)" }}>
              {agents?.length ?? 0}
            </span>
          </h2>
          <button onClick={refetch} className="p-1.5 rounded-lg" style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)" }}>
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex items-center justify-center h-24"><RefreshCw size={14} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} /></div>}
          {(agents ?? []).map(agent => (
            <div key={agent.slug}
              onClick={() => selectAgent(agent.slug)}
              className="px-4 py-3 border-b cursor-pointer transition-colors"
              style={{
                borderColor: "oklch(0.20 0.015 265)",
                background: selected?.slug === agent.slug ? "oklch(0.18 0.016 265)" : "transparent",
              }}
              onMouseEnter={e => { if (selected?.slug !== agent.slug) (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)"; }}
              onMouseLeave={e => { if (selected?.slug !== agent.slug) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div className="flex items-center gap-2 mb-1">
                <Bot size={13} style={{ color: "oklch(0.65 0.18 155)", flexShrink: 0 }} />
                <span className="text-sm font-medium text-white truncate font-mono">{agent.slug}</span>
                <div className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0" style={{ background: STATUS_COLOR[agent.status] ?? "oklch(0.55 0.012 265)" }} />
              </div>
              <p className="text-xs line-clamp-1 mb-1.5" style={{ color: "oklch(0.55 0.012 265)" }}>{agent.description}</p>
              <div className="flex items-center gap-3 text-xs" style={{ color: "oklch(0.45 0.012 265)" }}>
                <span className="flex items-center gap-1"><GitBranch size={10} />{agent.nodeCount} 节点</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border"
            style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
            {loadingDetail ? (
              <RefreshCw size={20} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} />
            ) : (
              <div className="text-center">
                <Bot size={32} className="mx-auto mb-3" style={{ color: "oklch(0.30 0.016 265)" }} />
                <p className="text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>选择一个 Agent 查看详情</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Agent Info */}
            <div className="rounded-xl border p-5"
              style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)", borderTop: "2px solid oklch(0.65 0.18 155)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{selected.name}</h2>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "oklch(0.55 0.012 265)" }}>{selected.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input value={runInput} onChange={e => setRunInput(e.target.value)}
                    placeholder='{"query": "..."}'
                    className="text-xs px-3 py-1.5 rounded-lg outline-none font-mono"
                    style={{ background: "oklch(0.18 0.016 265)", border: "1px solid oklch(0.25 0.016 265)", color: "white", width: 200 }} />
                  <button onClick={runAgent} disabled={running}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: running ? "oklch(0.25 0.016 265)" : "oklch(0.65 0.18 155)", color: "white" }}>
                    <Play size={11} />{running ? "运行中…" : "运行"}
                  </button>
                </div>
              </div>
              <p className="text-sm mb-4" style={{ color: "oklch(0.65 0.012 265)" }}>{selected.description}</p>

              {/* DAG Nodes */}
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: "oklch(0.45 0.012 265)" }}>工作流节点</div>
                <div className="flex flex-wrap gap-2">
                  {selected.nodes?.map((node, i) => (
                    <div key={node.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: "oklch(0.18 0.016 265)", border: "1px solid oklch(0.25 0.016 265)" }}>
                      <div className="w-1.5 h-1.5 rounded-full"
                        style={{ background: node.type === "start" ? "oklch(0.65 0.18 155)" : node.type === "end" ? "oklch(0.62 0.22 25)" : "oklch(0.60 0.20 265)" }} />
                      <span className="font-mono" style={{ color: "white" }}>{node.name}</span>
                      <span style={{ color: "oklch(0.45 0.012 265)" }}>{node.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Run History */}
            <div className="flex-1 rounded-xl border p-5 overflow-hidden flex flex-col"
              style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
              <h3 className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                运行记录
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {runs.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>暂无运行记录</div>
                ) : runs.map(run => (
                  <div key={run.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border text-xs"
                    style={{ background: "oklch(0.18 0.016 265)", borderColor: "oklch(0.25 0.016 265)" }}>
                    {STATUS_ICON[run.status] ?? STATUS_ICON.pending}
                    <span className="font-mono" style={{ color: "oklch(0.55 0.012 265)" }}>{run.id.slice(0, 12)}…</span>
                    <span style={{ color: "white" }}>{run.status}</span>
                    {run.durationMs && (
                      <span className="flex items-center gap-1 ml-auto" style={{ color: "oklch(0.50 0.012 265)" }}>
                        <Clock size={10} />{run.durationMs}ms
                      </span>
                    )}
                    <span style={{ color: "oklch(0.40 0.012 265)" }}>
                      {new Date(run.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
