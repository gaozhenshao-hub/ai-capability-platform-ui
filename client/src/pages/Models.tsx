// Models — Model Router Management
import { useApi } from "@/hooks/useApi";
import { api, Model } from "@/lib/api";
import { Cpu, RefreshCw, CheckCircle, XCircle, Eye, Braces, Zap } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

const HEALTH_COLOR: Record<string, string> = {
  healthy:   "oklch(0.65 0.18 155)",
  degraded:  "oklch(0.75 0.18 80)",
  unhealthy: "oklch(0.62 0.22 25)",
  unknown:   "oklch(0.55 0.012 265)",
};

export default function Models() {
  const { data: models, loading, refetch } = useApi(() =>
    api.get<{ models: Model[] }>("/v1/platform/models").then(r => r.models)
  );

  const list = models ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>模型路由</h1>
          <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.012 265)" }}>管理 AI 模型路由配置与健康状态</p>
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map(model => {
            const radarData = [
              { subject: "速度", value: Math.max(10, 100 - (model.avgLatencyMs ?? 500) / 20) },
              { subject: "上下文", value: Math.min(100, (model.contextWindow ?? 4096) / 1000) },
              { subject: "视觉", value: model.supportsVision ? 100 : 0 },
              { subject: "JSON", value: model.supportsJsonMode ? 100 : 0 },
              { subject: "流式", value: model.supportsStreaming ? 100 : 0 },
            ];
            return (
              <div key={model.slug} className="rounded-xl border p-5"
                style={{
                  background: "oklch(0.14 0.014 265)",
                  borderColor: "oklch(0.22 0.016 265)",
                  borderTop: `2px solid ${HEALTH_COLOR[model.health] ?? "oklch(0.55 0.012 265)"}`,
                }}>
                <div className="flex items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Cpu size={14} style={{ color: "oklch(0.60 0.20 265)" }} />
                      <span className="text-sm font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {model.displayName}
                      </span>
                      {model.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{ background: "oklch(0.60 0.20 265)20", color: "oklch(0.60 0.20 265)", border: "1px solid oklch(0.60 0.20 265)40" }}>
                          默认
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono mb-3" style={{ color: "oklch(0.50 0.012 265)" }}>{model.slug}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "oklch(0.45 0.012 265)" }}>提供商</span>
                        <span style={{ color: "white" }}>{model.provider}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "oklch(0.45 0.012 265)" }}>上下文</span>
                        <span style={{ color: "white" }}>{(model.contextWindow / 1000).toFixed(0)}K</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "oklch(0.45 0.012 265)" }}>输入</span>
                        <span style={{ color: "white" }}>${model.inputCostPer1k}/1K</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "oklch(0.45 0.012 265)" }}>输出</span>
                        <span style={{ color: "white" }}>${model.outputCostPer1k}/1K</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1" style={{ color: model.supportsVision ? "oklch(0.65 0.18 155)" : "oklch(0.35 0.012 265)" }}>
                        {model.supportsVision ? <CheckCircle size={10} /> : <XCircle size={10} />} 视觉
                      </span>
                      <span className="flex items-center gap-1" style={{ color: model.supportsJsonMode ? "oklch(0.65 0.18 155)" : "oklch(0.35 0.012 265)" }}>
                        {model.supportsJsonMode ? <CheckCircle size={10} /> : <XCircle size={10} />} JSON
                      </span>
                      <span className="flex items-center gap-1" style={{ color: model.supportsStreaming ? "oklch(0.65 0.18 155)" : "oklch(0.35 0.012 265)" }}>
                        {model.supportsStreaming ? <CheckCircle size={10} /> : <XCircle size={10} />} 流式
                      </span>
                      <span className="ml-auto flex items-center gap-1" style={{ color: HEALTH_COLOR[model.health] ?? "oklch(0.55 0.012 265)" }}>
                        <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: HEALTH_COLOR[model.health] ?? "oklch(0.55 0.012 265)" }} />
                        {model.health}
                      </span>
                    </div>
                  </div>

                  {/* Radar */}
                  <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="oklch(0.22 0.016 265)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "oklch(0.45 0.012 265)" }} />
                        <Radar dataKey="value" stroke="oklch(0.60 0.20 265)" fill="oklch(0.60 0.20 265)" fillOpacity={0.2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs"
                  style={{ borderColor: "oklch(0.20 0.015 265)" }}>
                  <span style={{ color: "oklch(0.45 0.012 265)" }}>总调用</span>
                  <span style={{ color: "white" }}>{(model.totalCalls ?? 0).toLocaleString()}</span>
                  <span style={{ color: "oklch(0.45 0.012 265)" }}>平均延迟</span>
                  <span style={{ color: "white" }}>{model.avgLatencyMs ?? 0}ms</span>
                  <span className="ml-auto" style={{ color: model.isActive ? "oklch(0.65 0.18 155)" : "oklch(0.55 0.012 265)" }}>
                    {model.isActive ? "● 启用" : "○ 禁用"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
