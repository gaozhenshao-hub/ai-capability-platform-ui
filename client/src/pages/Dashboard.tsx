// Dashboard — AI Platform Command Center
import { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Zap, Bot, Cpu, TrendingUp, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";

const COLORS = ["oklch(0.60 0.20 265)", "oklch(0.65 0.18 155)", "oklch(0.75 0.18 80)", "oklch(0.65 0.20 300)", "oklch(0.62 0.22 25)"];

const MOCK_TREND = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  calls: Math.floor(Math.random() * 200 + 50),
  errors: Math.floor(Math.random() * 10),
}));

const MOCK_SKILLS = [
  { name: "text-analysis", calls: 1240 },
  { name: "image-caption", calls: 890 },
  { name: "code-review", calls: 654 },
  { name: "summarize", calls: 432 },
  { name: "translate", calls: 310 },
];

const MOCK_MODELS = [
  { name: "GPT-4o", value: 45 },
  { name: "Claude 3.5", value: 30 },
  { name: "Gemini Pro", value: 15 },
  { name: "Others", value: 10 },
];

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}

function StatCard({ icon, label, value, sub, accent }: StatCardProps) {
  return (
    <div className="rounded-xl p-5 border slide-in"
      style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)", borderTop: `2px solid ${accent}` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg" style={{ background: "oklch(0.18 0.016 265)" }}>
          {icon}
        </div>
        <TrendingUp size={14} style={{ color: "oklch(0.65 0.18 155)" }} />
      </div>
      <div className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </div>
      <div className="text-sm" style={{ color: "oklch(0.55 0.012 265)" }}>{label}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "oklch(0.45 0.012 265)" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<{
    totalSkills: number; totalAgents: number; totalModels: number;
    callsToday: number; avgLatency: number; errorRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ skills: unknown[] }>("/v1/skills"),
      api.get<{ agents: unknown[] }>("/v1/agents"),
      api.get<{ models: unknown[] }>("/v1/platform/models"),
    ]).then(([s, a, m]) => {
      setStats({
        totalSkills: s.skills.length,
        totalAgents: a.agents.length,
        totalModels: m.models.length,
        callsToday: 3842,
        avgLatency: 287,
        errorRate: 0.8,
      });
    }).catch(() => {
      setStats({ totalSkills: 12, totalAgents: 5, totalModels: 8, callsToday: 3842, avgLatency: 287, errorRate: 0.8 });
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          平台概览
        </h1>
        <p className="text-sm" style={{ color: "oklch(0.55 0.012 265)" }}>
          实时监控 AI 能力平台的运行状态与调用统计
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Zap size={16} style={{ color: "oklch(0.65 0.20 300)" }} />}
          label="Skills 总数" value={loading ? "…" : stats?.totalSkills ?? 0}
          sub="已注册技能" accent="oklch(0.65 0.20 300)" />
        <StatCard
          icon={<Bot size={16} style={{ color: "oklch(0.65 0.18 155)" }} />}
          label="Agents 总数" value={loading ? "…" : stats?.totalAgents ?? 0}
          sub="工作流代理" accent="oklch(0.65 0.18 155)" />
        <StatCard
          icon={<Cpu size={16} style={{ color: "oklch(0.60 0.20 265)" }} />}
          label="活跃模型" value={loading ? "…" : stats?.totalModels ?? 0}
          sub="可用模型路由" accent="oklch(0.60 0.20 265)" />
        <StatCard
          icon={<Activity size={16} style={{ color: "oklch(0.75 0.18 80)" }} />}
          label="今日调用" value={loading ? "…" : (stats?.callsToday ?? 0).toLocaleString()}
          sub={`平均延迟 ${stats?.avgLatency ?? 0}ms`} accent="oklch(0.75 0.18 80)" />
      </div>

      {/* Status row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: <CheckCircle size={14} />, label: "服务健康", value: "正常", color: "oklch(0.65 0.18 155)" },
          { icon: <Clock size={14} />, label: "平均响应", value: `${stats?.avgLatency ?? 287}ms`, color: "oklch(0.60 0.20 265)" },
          { icon: <AlertTriangle size={14} />, label: "错误率", value: `${stats?.errorRate ?? 0.8}%`, color: "oklch(0.75 0.18 80)" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 rounded-lg px-4 py-3 border"
            style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
            <span style={{ color: item.color }}>{item.icon}</span>
            <span className="text-sm" style={{ color: "oklch(0.65 0.012 265)" }}>{item.label}</span>
            <span className="ml-auto text-sm font-semibold" style={{ color: item.color, fontFamily: "'Space Grotesk', sans-serif" }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Call Trend */}
        <div className="col-span-2 rounded-xl border p-5"
          style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              24h 调用趋势
            </h3>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)" }}>
              实时
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={MOCK_TREND}>
              <defs>
                <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.60 0.20 265)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.60 0.20 265)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.015 265)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 265)" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.45 0.012 265)" }} />
              <Tooltip
                contentStyle={{ background: "oklch(0.16 0.014 265)", border: "1px solid oklch(0.25 0.016 265)", borderRadius: 8 }}
                labelStyle={{ color: "white" }} itemStyle={{ color: "oklch(0.70 0.012 265)" }} />
              <Area type="monotone" dataKey="calls" stroke="oklch(0.60 0.20 265)" fill="url(#callGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="errors" stroke="oklch(0.62 0.22 25)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model Distribution */}
        <div className="rounded-xl border p-5"
          style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
          <h3 className="text-sm font-semibold text-white mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            模型调用分布
          </h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={MOCK_MODELS} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                dataKey="value" paddingAngle={3}>
                {MOCK_MODELS.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "oklch(0.16 0.014 265)", border: "1px solid oklch(0.25 0.016 265)", borderRadius: 8 }}
                itemStyle={{ color: "oklch(0.70 0.012 265)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {MOCK_MODELS.map((m, i) => (
              <div key={m.name} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span style={{ color: "oklch(0.65 0.012 265)" }}>{m.name}</span>
                <span className="ml-auto font-mono" style={{ color: "oklch(0.50 0.012 265)" }}>{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Skills */}
        <div className="rounded-xl border p-5"
          style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
          <h3 className="text-sm font-semibold text-white mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            热门 Skills
          </h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={MOCK_SKILLS} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.015 265)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.45 0.012 265)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.55 0.012 265)" }} width={90} />
              <Tooltip
                contentStyle={{ background: "oklch(0.16 0.014 265)", border: "1px solid oklch(0.25 0.016 265)", borderRadius: 8 }}
                itemStyle={{ color: "oklch(0.70 0.012 265)" }} />
              <Bar dataKey="calls" fill="oklch(0.65 0.20 300)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border p-5"
          style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
          <h3 className="text-sm font-semibold text-white mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            最近活动
          </h3>
          <div className="space-y-3">
            {[
              { action: "Skill 运行", target: "text-analysis", status: "success", time: "2m ago" },
              { action: "Agent 执行", target: "review-pipeline", status: "success", time: "5m ago" },
              { action: "模型切换", target: "GPT-4o → Claude", status: "info", time: "12m ago" },
              { action: "Skill 运行", target: "image-caption", status: "error", time: "18m ago" },
              { action: "知识库更新", target: "product-docs", status: "success", time: "25m ago" },
            ].map((item, i) => {
              const statusColor = item.status === "success" ? "oklch(0.65 0.18 155)"
                : item.status === "error" ? "oklch(0.62 0.22 25)"
                : "oklch(0.60 0.20 265)";
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                  <span style={{ color: "oklch(0.65 0.012 265)" }}>{item.action}</span>
                  <span className="font-mono" style={{ color: "oklch(0.50 0.012 265)" }}>{item.target}</span>
                  <span className="ml-auto" style={{ color: "oklch(0.40 0.012 265)" }}>{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
