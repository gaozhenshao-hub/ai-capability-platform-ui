import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Bot, Plus, Search, Play, GitBranch, Clock, CheckCircle, XCircle,
  Loader2, Settings, Trash2, Edit2, ChevronRight, Zap, Eye,
  MoreHorizontal, RefreshCw, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: "草稿",   color: "text-slate-400",   bg: "bg-slate-500/15 border-slate-500/20" },
  active:     { label: "启用",   color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/20" },
  deprecated: { label: "已弃用", color: "text-red-400",     bg: "bg-red-500/15 border-red-500/20" },
};

const TRIGGER_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  manual:    { label: "手动触发", icon: Play,      color: "text-violet-400" },
  event:     { label: "事件触发", icon: Zap,       color: "text-amber-400" },
  scheduled: { label: "定时触发", icon: Clock,     color: "text-blue-400" },
};

// ─── Create/Edit Dialog ───────────────────────────────────────────────────────
function AgentDialog({
  open,
  onClose,
  agent,
}: {
  open: boolean;
  onClose: () => void;
  agent?: {
    id: number; name: string; slug: string; description?: string | null;
    scope: string; triggerType: string; status: string;
    maxExecutionSeconds?: number | null; cronExpression?: string | null;
  } | null;
}) {
  const utils = trpc.useUtils();
  const isEdit = !!agent;

  const [form, setForm] = useState({
    name: agent?.name ?? "",
    slug: agent?.slug ?? "",
    description: agent?.description ?? "",
    scope: (agent?.scope ?? "project") as "global" | "project" | "private",
    triggerType: (agent?.triggerType ?? "manual") as "manual" | "event" | "scheduled",
    maxExecutionSeconds: agent?.maxExecutionSeconds ?? 300,
    cronExpression: agent?.cronExpression ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Auto-generate slug from name
  const handleNameChange = (v: string) => {
    setField("name", v);
    if (!isEdit) {
      setField("slug", v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64));
    }
  };

  const createMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast.success("Agent 已创建");
      utils.agents.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  });

  const updateMutation = trpc.agents.update.useMutation({
    onSuccess: () => {
      toast.success("Agent 已更新");
      utils.agents.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("请输入 Agent 名称");
    if (!form.slug.trim()) return toast.error("请输入 Slug");
    if (isEdit) {
      updateMutation.mutate({ id: agent!.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-[#0d1117] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-violet-400" />
            {isEdit ? "编辑 Agent" : "新建 Agent"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Agent 名称 *</Label>
              <Input value={form.name} onChange={e => handleNameChange(e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm"
                placeholder="Listing 质量审核 Agent" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Slug *</Label>
              <Input value={form.slug} onChange={e => setField("slug", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm font-mono"
                placeholder="listing-quality-review" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">描述</Label>
            <Textarea value={form.description} onChange={e => setField("description", e.target.value)}
              rows={2} className="bg-[#0a0d14] border-white/10 text-white text-sm resize-none"
              placeholder="Agent 的功能说明..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">触发方式</Label>
              <Select value={form.triggerType} onValueChange={v => setField("triggerType", v as typeof form.triggerType)}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  <SelectItem value="manual" className="text-slate-300 text-xs">手动触发</SelectItem>
                  <SelectItem value="event" className="text-slate-300 text-xs">事件触发</SelectItem>
                  <SelectItem value="scheduled" className="text-slate-300 text-xs">定时触发</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">可见范围</Label>
              <Select value={form.scope} onValueChange={v => setField("scope", v as typeof form.scope)}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  <SelectItem value="global" className="text-slate-300 text-xs">全局</SelectItem>
                  <SelectItem value="project" className="text-slate-300 text-xs">项目内</SelectItem>
                  <SelectItem value="private" className="text-slate-300 text-xs">私有</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.triggerType === "scheduled" && (
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Cron 表达式</Label>
              <Input value={form.cronExpression} onChange={e => setField("cronExpression", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm font-mono"
                placeholder="0 9 * * 1-5  (每工作日 9:00)" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">最大执行时间（秒）</Label>
            <Input type="number" value={form.maxExecutionSeconds}
              onChange={e => setField("maxExecutionSeconds", Number(e.target.value))}
              className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm"
              min={10} max={3600} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}
            className="border-white/10 text-slate-300 hover:bg-white/5">取消</Button>
          <Button onClick={handleSubmit} disabled={isPending}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "保存更改" : "创建 Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────
function AgentCard({
  agent,
  onEdit,
  onDelete,
  onOpen,
}: {
  agent: {
    id: number; name: string; slug: string; description?: string | null;
    scope: string; triggerType: string; status: string;
    maxExecutionSeconds?: number | null; workflowJson?: unknown;
    createdAt: Date; updatedAt: Date;
  };
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.draft;
  const triggerCfg = TRIGGER_CONFIG[agent.triggerType] ?? TRIGGER_CONFIG.manual;
  const TriggerIcon = triggerCfg.icon;

  const wf = agent.workflowJson as { nodes?: unknown[] } | null;
  const nodeCount = wf?.nodes?.length ?? 0;

  return (
    <div className="group rounded-xl border border-white/8 bg-[#0d1117] hover:border-violet-500/30 hover:bg-[#0f1420] transition-all duration-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl p-2.5 bg-violet-500/15 border border-violet-500/20 flex-shrink-0">
              <Bot className="h-5 w-5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
              <p className="text-xs text-slate-500 font-mono truncate">{agent.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded p-1 text-slate-600 hover:text-slate-300 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#0d1117] border-white/10" align="end">
                <DropdownMenuItem onClick={onEdit} className="text-slate-300 text-xs gap-2 cursor-pointer">
                  <Edit2 className="h-3.5 w-3.5" />编辑信息
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpen} className="text-slate-300 text-xs gap-2 cursor-pointer">
                  <GitBranch className="h-3.5 w-3.5" />打开画布
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-red-400 text-xs gap-2 cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {agent.description && (
          <p className="text-xs text-slate-500 mb-3 line-clamp-2">{agent.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <TriggerIcon className={`h-3.5 w-3.5 ${triggerCfg.color}`} />
            <span>{triggerCfg.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <GitBranch className="h-3.5 w-3.5" />
            <span>{nodeCount} 节点</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>{agent.maxExecutionSeconds ?? 300}s</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/6 px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          更新于 {new Date(agent.updatedAt).toLocaleDateString()}
        </span>
        <Button onClick={onOpen} size="sm"
          className="h-7 text-xs bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/20 gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          打开画布
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Agents Page ─────────────────────────────────────────────────────────
export default function Agents() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "active" | "deprecated">("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Parameters<typeof AgentDialog>[0]["agent"]>(null);

  const { data: agents, isLoading } = trpc.agents.list.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const deleteMutation = trpc.agents.delete.useMutation({
    onSuccess: () => { toast.success("Agent 已删除"); utils.agents.list.invalidate(); },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  });

  const handleDelete = (agent: { id: number; name: string }) => {
    if (!confirm(`确认删除 Agent "${agent.name}"？此操作不可恢复。`)) return;
    deleteMutation.mutate({ id: agent.id });
  };

  const statusCounts = {
    all: agents?.length ?? 0,
    draft: agents?.filter(a => a.status === "draft").length ?? 0,
    active: agents?.filter(a => a.status === "active").length ?? 0,
    deprecated: agents?.filter(a => a.status === "deprecated").length ?? 0,
  };

  return (
    <div className="flex flex-col h-full bg-[#080b11]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-400" />
            Agent 编排
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">可视化工作流编排，连接 Skill、LLM 和人工审核节点</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2 h-8 text-sm">
          <Plus className="h-4 w-4" />新建 Agent
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/6 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索 Agent 名称或 Slug..."
            className="pl-9 h-8 text-xs bg-[#0d1117] border-white/10 text-slate-300 placeholder:text-slate-600" />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "draft", "active", "deprecated"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}>
              {s === "all" ? "全部" : STATUS_CONFIG[s]?.label ?? s}
              <span className="ml-1.5 text-[10px] opacity-60">{statusCounts[s]}</span>
            </button>
          ))}
        </div>
        <button onClick={() => utils.agents.list.invalidate()}
          className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
          </div>
        ) : !agents?.length ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-10 text-center max-w-sm">
              <Bot className="h-10 w-10 text-violet-500/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-400 mb-1">
                {search || statusFilter !== "all" ? "未找到匹配的 Agent" : "还没有 Agent"}
              </p>
              <p className="text-xs text-slate-600 mb-4">
                {search || statusFilter !== "all"
                  ? "尝试调整搜索条件"
                  : "创建第一个 Agent，开始可视化编排 AI 工作流"}
              </p>
              {!search && statusFilter === "all" && (
                <Button onClick={() => setShowCreateDialog(true)} size="sm"
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                  <Plus className="h-4 w-4" />新建 Agent
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => setEditingAgent(agent)}
                onDelete={() => handleDelete(agent)}
                onOpen={() => navigate(`/agents/${agent.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AgentDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
      {editingAgent && (
        <AgentDialog
          open={!!editingAgent}
          onClose={() => setEditingAgent(null)}
          agent={editingAgent}
        />
      )}
    </div>
  );
}
