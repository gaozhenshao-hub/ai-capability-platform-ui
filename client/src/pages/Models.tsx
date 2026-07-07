import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Brain, Plus, Activity, DollarSign, Zap, RefreshCw,
  Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Clock, Eye, EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const PROVIDERS = ["OpenAI", "Anthropic", "Google", "Mistral", "DeepSeek", "Qwen", "Custom"];
const CAPABILITY_TAGS = ["chat", "vision", "code", "reasoning", "embedding", "function-call", "long-context"];
const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];

const defaultForm = {
  name: "", modelId: "", provider: "OpenAI",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  capabilityTags: [] as string[],
  costPer1kInputTokens: 0, costPer1kOutputTokens: 0,
  maxContextTokens: 128000,
  isDefault: false,
};

export default function Models() {
  const { data: models, isLoading, refetch } = trpc.models.list.useQuery();
  const { data: costStats } = trpc.models.getCostStats.useQuery({ days: 30 });
  const { data: auditLogs } = trpc.models.getAuditLogs.useQuery({ limit: 20 });

  const createMutation = trpc.models.create.useMutation({
    onSuccess: () => {
      toast.success("模型已添加");
      setShowCreateDialog(false);
      setForm(defaultForm);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.models.update.useMutation({
    onSuccess: () => { toast.success("已保存"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.models.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const healthCheckMutation = trpc.models.healthCheck.useMutation({
    onSuccess: (data) => {
      if (data.status === "active") {
        toast.success(`健康检查通过，延迟 ${data.latencyMs}ms`);
      } else {
        toast.error(`健康检查失败：${data.error}`);
      }
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"models" | "cost" | "logs">("models");

  const handleCreate = () => {
    if (!form.name || !form.modelId || !form.apiKey) {
      return toast.error("请填写模型名称、Model ID 和 API Key");
    }
    createMutation.mutate(form);
  };

  const toggleTag = (tag: string) => {
    const tags = form.capabilityTags;
    setForm({
      ...form,
      capabilityTags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    });
  };

  const statusIcon = (status?: string | null) => {
    if (status === "active") return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
    if (status === "error") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    return <Clock className="h-3.5 w-3.5 text-slate-500" />;
  };

  const chartData = costStats?.daily ?? [];
  const totalCost = costStats?.totals?.totalCostUsd ?? 0;
  const totalCalls = costStats?.totals?.totalCalls ?? 0;

  const providerDist = (models ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.provider] = (acc[m.provider] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(providerDist).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            LLM 模型管理
          </h1>
          <p className="mt-1 text-sm text-slate-400">注册和管理大语言模型，配置路由策略、成本监控和降级方案</p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          添加模型
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "已注册模型", value: models?.length ?? 0, icon: Brain, color: "text-violet-400" },
          { label: "正常运行", value: models?.filter(m => m.status === "active").length ?? 0, icon: CheckCircle, color: "text-emerald-400" },
          { label: "本月调用", value: totalCalls.toLocaleString(), icon: Zap, color: "text-cyan-400" },
          { label: "本月成本", value: `$${totalCost.toFixed(2)}`, icon: DollarSign, color: "text-amber-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/8 bg-[#0d1117] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {[
          { id: "models", label: "模型列表" },
          { id: "cost", label: "成本统计" },
          { id: "logs", label: "操作日志" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-violet-500 text-violet-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Models Tab */}
      {activeTab === "models" && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : !models?.length ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-20 text-center">
              <Brain className="h-10 w-10 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">暂无模型，点击右上角添加</p>
            </div>
          ) : (
            models.map((model) => (
              <div key={model.id} className="rounded-xl border border-white/8 bg-[#0d1117] overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(model.status)}
                    <span className="text-xs text-slate-500">
                      {model.status === "active" ? "正常" : model.status === "error" ? "异常" : "未检测"}
                    </span>
                    {model.lastLatencyMs && (
                      <span className="text-xs text-slate-600">{model.lastLatencyMs}ms</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{model.name}</span>
                      {model.isDefault && (
                        <Badge className="bg-violet-600/20 text-violet-300 border-violet-500/30 text-xs">默认</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-mono">{model.modelId}</span>
                      <span className="mx-1.5">·</span>
                      <span>{model.provider}</span>
                      {model.maxContextTokens && (
                        <span className="ml-1.5">{(model.maxContextTokens / 1000).toFixed(0)}K ctx</span>
                      )}
                    </p>
                  </div>

                  <div className="hidden lg:flex items-center gap-1 flex-wrap max-w-xs">
                    {(model.capabilityTags as string[] | null)?.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="text-right hidden md:block">
                    <p className="text-xs text-slate-500">输入 / 输出</p>
                    <p className="text-xs font-mono text-slate-300">
                      ${Number(model.costPer1kInputTokens || 0).toFixed(4)} /
                      ${Number(model.costPer1kOutputTokens || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-slate-600">per 1K tokens</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => healthCheckMutation.mutate({ id: model.id })}
                      disabled={healthCheckMutation.isPending}
                      className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-cyan-400 transition-colors"
                      title="健康检查"
                    >
                      <Activity className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === model.id ? null : model.id)}
                      className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    >
                      {expandedId === model.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`确定删除模型「${model.name}」？`)) {
                          deleteMutation.mutate({ id: model.id });
                        }
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expandedId === model.id && (
                  <div className="border-t border-white/5 px-5 py-4 bg-white/2 grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">API 端点</p>
                      <code className="text-xs text-slate-300 font-mono">{model.apiBaseUrl}</code>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">上次健康检查</p>
                      <span className="text-xs text-slate-300">
                        {model.lastHealthCheck
                          ? new Date(model.lastHealthCheck).toLocaleString()
                          : "从未检查"}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">快速操作</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateMutation.mutate({ id: model.id, isDefault: true })}
                          disabled={!!model.isDefault}
                          className="text-xs rounded px-2 py-1 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 disabled:opacity-40"
                        >
                          设为默认
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({
                            id: model.id,
                            status: model.status === "active" ? "inactive" : "active"
                          })}
                          className="text-xs rounded px-2 py-1 bg-white/5 text-slate-300 hover:bg-white/10"
                        >
                          {model.status === "active" ? "停用" : "启用"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Cost Tab */}
      {activeTab === "cost" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/8 bg-[#0d1117] p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">近 30 天调用量</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      itemStyle={{ color: "#a78bfa" }}
                    />
                    <Area type="monotone" dataKey="calls" stroke="#8b5cf6" fill="url(#callGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-600 text-sm">暂无数据</div>
              )}
            </div>

            <div className="rounded-xl border border-white/8 bg-[#0d1117] p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">近 30 天成本（USD）</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      itemStyle={{ color: "#fbbf24" }}
                      formatter={(v: number) => [`$${v.toFixed(4)}`, "成本"]}
                    />
                    <Area type="monotone" dataKey="costUsd" stroke="#f59e0b" fill="url(#costGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-600 text-sm">暂无数据</div>
              )}
            </div>
          </div>

          {pieData.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-[#0d1117] p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">模型提供商分布</h3>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="rounded-xl border border-white/8 bg-[#0d1117] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">资源</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">结果</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs?.map((log) => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/2">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-300">{log.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {log.resourceType}
                    {log.resourceId && <span className="ml-1 text-slate-600">#{log.resourceId}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={log.result === "success"
                        ? "border-emerald-500/30 text-emerald-400 text-xs"
                        : "border-red-500/30 text-red-400 text-xs"}
                    >
                      {log.result}
                    </Badge>
                  </td>
                </tr>
              ))}
              {!auditLogs?.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-600 text-sm">暂无日志</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Model Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#0d1117] border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" />
              添加 LLM 模型
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 text-sm">模型名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：GPT-4o"
                  className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Model ID *</Label>
                <Input
                  value={form.modelId}
                  onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                  placeholder="如：gpt-4o"
                  className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600 font-mono"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300 text-sm">提供商</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger className="mt-1.5 bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {PROVIDERS.map(p => (
                    <SelectItem key={p} value={p} className="text-slate-300 focus:bg-white/10">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300 text-sm">API Base URL *</Label>
              <Input
                value={form.apiBaseUrl}
                onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                className="mt-1.5 bg-white/5 border-white/10 text-white font-mono text-sm"
              />
            </div>

            <div>
              <Label className="text-slate-300 text-sm">API Key *</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300 text-sm">输入成本 ($/1K)</Label>
                <Input
                  type="number" min={0} step={0.0001}
                  value={form.costPer1kInputTokens}
                  onChange={(e) => setForm({ ...form, costPer1kInputTokens: Number(e.target.value) })}
                  className="mt-1.5 bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">输出成本 ($/1K)</Label>
                <Input
                  type="number" min={0} step={0.0001}
                  value={form.costPer1kOutputTokens}
                  onChange={(e) => setForm({ ...form, costPer1kOutputTokens: Number(e.target.value) })}
                  className="mt-1.5 bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300 text-sm">上下文长度</Label>
                <Input
                  type="number" min={1000}
                  value={form.maxContextTokens}
                  onChange={(e) => setForm({ ...form, maxContextTokens: Number(e.target.value) })}
                  className="mt-1.5 bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300 text-sm">能力标签</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CAPABILITY_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      form.capabilityTags.includes(tag)
                        ? "bg-violet-600/30 text-violet-300 ring-1 ring-violet-500/40"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded border-white/20"
              />
              <Label htmlFor="isDefault" className="text-slate-300 text-sm cursor-pointer">
                设为默认模型（Skill 未指定模型时使用此模型）
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="border-white/10 text-slate-300 hover:bg-white/5"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {createMutation.isPending ? "添加中..." : "添加模型"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
