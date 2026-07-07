// MCP Connectors Page
import { useApi } from "@/hooks/useApi";
import { api, McpConnector } from "@/lib/api";
import { Plug, RefreshCw, ExternalLink, Play } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  connected:    "oklch(0.65 0.18 155)",
  disconnected: "oklch(0.62 0.22 25)",
  error:        "oklch(0.62 0.22 25)",
  unknown:      "oklch(0.55 0.012 265)",
};

const TYPE_COLOR: Record<string, string> = {
  http:    "oklch(0.60 0.20 265)",
  stdio:   "oklch(0.65 0.20 300)",
  builtin: "oklch(0.75 0.18 80)",
};

export default function McpPage() {
  const { data, loading, refetch } = useApi(() =>
    api.get<{ connectors: McpConnector[] }>("/v1/mcp/connectors").then(r => r.connectors)
  );

  async function testConnector(slug: string) {
    try {
      await api.post(`/v1/mcp/connectors/${slug}/test`);
      toast.success("连接测试成功");
    } catch (e: unknown) {
      toast.error(`测试失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const connectors = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>MCP 连接器</h1>
          <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.012 265)" }}>管理外部工具连接器与能力扩展</p>
        </div>
        <button onClick={refetch} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)", border: "1px solid oklch(0.25 0.016 265)" }}>
          <RefreshCw size={13} />刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw size={16} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} />
        </div>
      ) : connectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border"
          style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
          <Plug size={32} className="mb-3" style={{ color: "oklch(0.30 0.016 265)" }} />
          <p className="text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>暂无 MCP 连接器</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {connectors.map(conn => (
            <div key={conn.slug} className="rounded-xl border p-5"
              style={{
                background: "oklch(0.14 0.014 265)",
                borderColor: "oklch(0.22 0.016 265)",
                borderTop: `2px solid ${STATUS_COLOR[conn.status] ?? "oklch(0.55 0.012 265)"}`,
              }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg" style={{ background: "oklch(0.18 0.016 265)" }}>
                    <Plug size={14} style={{ color: TYPE_COLOR[conn.type] ?? "oklch(0.60 0.20 265)" }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{conn.name}</div>
                    <div className="text-xs font-mono" style={{ color: "oklch(0.50 0.012 265)" }}>{conn.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: STATUS_COLOR[conn.status] ?? "oklch(0.55 0.012 265)" }} />
                  <span className="text-xs" style={{ color: STATUS_COLOR[conn.status] ?? "oklch(0.55 0.012 265)" }}>{conn.status}</span>
                </div>
              </div>

              {conn.description && (
                <p className="text-xs mb-3" style={{ color: "oklch(0.55 0.012 265)" }}>{conn.description}</p>
              )}

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ background: "oklch(0.18 0.016 265)", color: TYPE_COLOR[conn.type] ?? "oklch(0.60 0.20 265)" }}>
                  {conn.type}
                </span>
                {conn.totalCalls !== undefined && (
                  <span className="text-xs" style={{ color: "oklch(0.45 0.012 265)" }}>
                    {conn.totalCalls.toLocaleString()} 次调用
                  </span>
                )}
              </div>

              {conn.endpoint && (
                <div className="flex items-center gap-1.5 text-xs mb-3 font-mono truncate"
                  style={{ color: "oklch(0.50 0.012 265)" }}>
                  <ExternalLink size={10} />
                  <span className="truncate">{conn.endpoint}</span>
                </div>
              )}

              <button onClick={() => testConnector(conn.slug)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.65 0.18 155)", border: "1px solid oklch(0.25 0.016 265)" }}>
                <Play size={11} />测试连接
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
