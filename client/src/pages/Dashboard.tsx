/**
 * Dashboard — Emperor 皇帝 控制中心
 * 真实数据驱动：Agent 运行统计 + Skill 调用趋势 + LLM 成本分析 + 知识库状态 + 系统健康
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, Zap, Bot, BookOpen,
  AlertTriangle, Clock, CheckCircle, XCircle, Loader2, RefreshCw,
  DollarSign, MessageSquare, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CHART_COLORS = {
  primary: "oklch(0.60 0.20 265)",
  success: "oklch(0.65 0.18 155)",
  warning: "oklch(0.75 0.18 80)",
  danger:  "oklch(0.65 0.20 25)",
  purple:  "oklch(0.65 0.20 300)",
  cyan:    "oklch(0.70 0.18 200)",
};
const PIE_COLORS = Object.values(CHART_COLORS);

function StatCard({ icon: Icon, label, value, sub, color, loading }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5 flex items-start gap-4">
      <div className={`rounded-xl p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        {loading ? <div className="h-7 w-20 rounded bg-white/5 animate-pulse" /> : <p className="text-2xl font-bold text-white">{value}</p>}
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] p-3 shadow-xl text-xs">
      <p className="text-slate-400 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle className="h-3 w-3" />正常</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1"><XCircle className="h-3 w-3" />异常</Badge>;
}

export default function Dashboard() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [costRange, setCostRange] = useState<"7d" | "30d">("30d");
  const [assistantRange, setAssistantRange] = useState<"7d" | "30d">("7d");

  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = trpc.dashboard.getOverview.useQuery({ range });
  const { data: callTrend = [], isLoading: trendLoading } = trpc.dashboard.getCallTrend.useQuery({ range });
  const { data: topSkills = [], isLoading: skillsLoading } = trpc.dashboard.getTopSkills.useQuery({ range, limit: 8 });
  const { data: modelDist = [] } = trpc.dashboard.getModelDistribution.useQuery({ range });
  const { data: recentRuns = [] } = trpc.dashboard.getRecentAgentRuns.useQuery({ limit: 10 });
  const { data: health, refetch: refetchHealth } = trpc.dashboard.getSystemHealth.useQuery();
  const { data: costData = [] } = trpc.dashboard.getCostAnalysis.useQuery({ range: costRange });
  const { data: assistantStats } = trpc.dashboard.getAssistantStats.useQuery({ range: assistantRange });

  const handleRefresh = () => { refetchOverview(); refetchHealth(); };
  const totalModelCalls = modelDist.reduce((s, m) => s + m.calls, 0);
  const assistantTotalTokens = (assistantStats?.overview?.totalInputTokens ?? 0) + (assistantStats?.overview?.totalOutputTokens ?? 0);

  return (
    <div className="min-h-screen bg-[#080b12] text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">运营监控中心</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI 平台实时数据概览</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>数据库</span><HealthBadge status={health.database} />
              <span className="ml-2">API</span><HealthBadge status={health.api} />
              {health.recentErrors > 0 && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 ml-2">
                  <AlertTriangle className="h-3 w-3" />近 5 分钟 {health.recentErrors} 个错误
                </Badge>
              )}
            </div>
          )}
          <Tabs value={range} onValueChange={v => setRange(v as typeof range)}>
            <TabsList className="bg-[#0d1117] border border-white/10 h-8">
              {(["24h", "7d", "30d"] as const).map(r => (
                <TabsTrigger key={r} value={r} className="text-xs h-6 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">{r}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="border-white/10 text-slate-400 hover:text-white h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />刷新
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Zap} label="Skill 调用总量" loading={overviewLoading}
          value={overview?.skillCalls.total.toLocaleString() ?? "—"}
          sub={`成功率 ${overview?.skillCalls.successRate ?? 0}%`}
          color="bg-violet-500/20 text-violet-400" />
        <StatCard icon={Bot} label="Agent 运行次数" loading={overviewLoading}
          value={overview?.agentRuns.total.toLocaleString() ?? "—"}
          sub={`完成 ${overview?.agentRuns.completed ?? 0} / 失败 ${overview?.agentRuns.failed ?? 0}`}
          color="bg-blue-500/20 text-blue-400" />
        <StatCard icon={DollarSign} label="LLM 消耗成本" loading={overviewLoading}
          value={`$${overview?.skillCalls.totalCostUsd.toFixed(4) ?? "0.0000"}`}
          sub={`${((overview?.skillCalls.totalTokens ?? 0) / 1000).toFixed(1)}K tokens`}
          color="bg-amber-500/20 text-amber-400" />
        <StatCard icon={BookOpen} label="知识库条目" loading={overviewLoading}
          value={overview?.knowledge.total.toLocaleString() ?? "—"}
          sub={`已发布 ${overview?.knowledge.approved ?? 0} / 待审 ${overview?.knowledge.pending ?? 0}`}
          color="bg-emerald-500/20 text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-white/8 bg-[#0d1117] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Skill 调用趋势</h3>
            {trendLoading && <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />}
          </div>
          {callTrend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-600 text-sm">{trendLoading ? "加载中..." : "暂无数据"}</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={callTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.danger} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.danger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Area type="monotone" dataKey="calls" name="调用量" stroke={CHART_COLORS.primary} fill="url(#callGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="errors" name="错误量" stroke={CHART_COLORS.danger} fill="url(#errGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">模型使用分布</h3>
          {modelDist.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-600 text-sm">暂无数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={modelDist} dataKey="calls" nameKey="modelName" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                    {modelDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} 次`, "调用量"]} contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {modelDist.map((m, i) => (
                  <div key={m.modelId} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-slate-400 flex-1 truncate">{m.modelName}</span>
                    <span className="text-slate-300 font-medium">{totalModelCalls > 0 ? Math.round(m.calls / totalModelCalls * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Skill 调用排行</h3>
            {skillsLoading && <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />}
          </div>
          {topSkills.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-600 text-sm">{skillsLoading ? "加载中..." : "暂无数据"}</div>
          ) : (
            <div className="space-y-2">
              {topSkills.map((skill, i) => {
                const maxCalls = topSkills[0]?.calls ?? 1;
                const pct = Math.round(skill.calls / maxCalls * 100);
                const errorRate = skill.calls > 0 ? Math.round(skill.errors / skill.calls * 100) : 0;
                return (
                  <div key={skill.skillId} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300 truncate">{skill.skillName}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-slate-400">{skill.calls}</span>
                          {errorRate > 0 && <span className="text-[10px] text-red-400">{errorRate}% err</span>}
                          <span className="text-[10px] text-emerald-400">{skill.adoptionRate}% ✓</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Agent 运行记录</h3>
          {recentRuns.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-600 text-sm">暂无运行记录</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentRuns.map(run => {
                const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
                  completed: { color: "text-emerald-400", icon: CheckCircle },
                  failed:    { color: "text-red-400",     icon: XCircle },
                  running:   { color: "text-blue-400",    icon: Activity },
                  pending:   { color: "text-slate-400",   icon: Clock },
                  paused:    { color: "text-amber-400",   icon: AlertTriangle },
                };
                const cfg = statusConfig[run.status] ?? statusConfig.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div key={run.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-[#0a0d14] border border-white/5">
                    <StatusIcon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300">Agent #{run.agentId}</span>
                        <span className={`text-[10px] ${cfg.color}`}>{run.status}</span>
                      </div>
                      {run.errorMessage && <p className="text-[10px] text-red-400 truncate">{run.errorMessage}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {run.durationMs && <p className="text-[10px] text-slate-500">{(run.durationMs / 1000).toFixed(1)}s</p>}
                      <p className="text-[10px] text-slate-600">{new Date(run.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AI 助手 Token 用量统计面板 */}
      <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-purple-500/20">
              <MessageSquare className="h-4 w-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">AI 助手 Token 用量统计</h3>
          </div>
          <Tabs value={assistantRange} onValueChange={v => setAssistantRange(v as typeof assistantRange)}>
            <TabsList className="bg-[#0a0d14] border border-white/10 h-7">
              {(["7d", "30d"] as const).map(r => (
                <TabsTrigger key={r} value={r} className="text-xs h-5 px-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">{r}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* 总览卡片行 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="rounded-xl bg-[#0a0d14] border border-white/5 p-3">
            <p className="text-xs text-slate-500 mb-1">对话总数</p>
            <p className="text-xl font-bold text-white">{assistantStats?.overview?.totalSessions?.toLocaleString() ?? "0"}</p>
          </div>
          <div className="rounded-xl bg-[#0a0d14] border border-white/5 p-3">
            <p className="text-xs text-slate-500 mb-1">消息总数</p>
            <p className="text-xl font-bold text-white">{assistantStats?.overview?.totalMessages?.toLocaleString() ?? "0"}</p>
          </div>
          <div className="rounded-xl bg-[#0a0d14] border border-white/5 p-3">
            <p className="text-xs text-slate-500 mb-1">输入 Token</p>
            <p className="text-xl font-bold text-purple-400">{((assistantStats?.overview?.totalInputTokens ?? 0) / 1000).toFixed(1)}K</p>
          </div>
          <div className="rounded-xl bg-[#0a0d14] border border-white/5 p-3">
            <p className="text-xs text-slate-500 mb-1">输出 Token</p>
            <p className="text-xl font-bold text-cyan-400">{((assistantStats?.overview?.totalOutputTokens ?? 0) / 1000).toFixed(1)}K</p>
          </div>
        </div>

        {/* Token 趋势图 */}
        {!assistantStats?.trend?.length ? (
          <div className="h-36 flex items-center justify-center text-slate-600 text-sm">暂无对话数据，开始使用 AI 助手后将在此显示统计</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={assistantStats.trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Area type="monotone" dataKey="inputTokens" name="输入 Token" stroke={CHART_COLORS.purple} fill="url(#inputGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="outputTokens" name="输出 Token" stroke={CHART_COLORS.cyan} fill="url(#outputGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
              <span>总 Token：<span className="text-purple-400 font-medium">{(assistantTotalTokens / 1000).toFixed(1)}K</span></span>
              <span>输入：<span className="text-slate-300">{((assistantStats?.overview?.totalInputTokens ?? 0) / 1000).toFixed(1)}K</span></span>
              <span>输出：<span className="text-slate-300">{((assistantStats?.overview?.totalOutputTokens ?? 0) / 1000).toFixed(1)}K</span></span>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">LLM 成本趋势</h3>
          <Tabs value={costRange} onValueChange={v => setCostRange(v as typeof costRange)}>
            <TabsList className="bg-[#0a0d14] border border-white/10 h-7">
              {(["7d", "30d"] as const).map(r => (
                <TabsTrigger key={r} value={r} className="text-xs h-5 px-2.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white">{r}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        {costData.length === 0 ? (
          <div className="h-36 flex items-center justify-center text-slate-600 text-sm">暂无成本数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={costData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v: number) => `$${v.toFixed(4)}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(6)}`, "成本"]} contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="costUsd" name="成本 (USD)" fill={CHART_COLORS.warning} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {costData.length > 0 && (
          <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
            <span>累计成本：<span className="text-amber-400 font-medium">${costData.reduce((s, d) => s + d.costUsd, 0).toFixed(6)}</span></span>
            <span>输入 Token：<span className="text-slate-300">{(costData.reduce((s, d) => s + d.inputTokens, 0) / 1000).toFixed(1)}K</span></span>
            <span>输出 Token：<span className="text-slate-300">{(costData.reduce((s, d) => s + d.outputTokens, 0) / 1000).toFixed(1)}K</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
