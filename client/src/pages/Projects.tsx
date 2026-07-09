import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Key, Copy, RefreshCw, Trash2, Edit2, Check, X,
  FolderKanban, Globe, DollarSign, AlertTriangle, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

type Project = {
  id: number;
  name: string;
  description?: string | null;
  slug: string;
  apiKey: string;
  apiKeyPrefix: string;
  corsOrigins?: string[] | null;
  monthlyBudgetUsd?: string | null;
  budgetAlertPercent?: number | null;
  status: "active" | "suspended";
  ownerId: number;
  createdAt: Date;
};

export default function Projects() {
  const { data: projects, isLoading, refetch } = trpc.projects.list.useQuery();
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      toast.success("项目创建成功！");
      setNewApiKey(data.apiKey);
      setShowCreateDialog(false);
      setShowApiKeyDialog(true);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const rotateMutation = trpc.projects.rotateApiKey.useMutation({
    onSuccess: (data) => {
      toast.success("API Key 已更新");
      setNewApiKey(data.apiKey);
      setShowApiKeyDialog(true);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => { toast.success("已保存"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { toast.success("项目已删除"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Project>>({});

  // Create form
  const [form, setForm] = useState({
    name: "", slug: "", description: "",
    monthlyBudgetUsd: 0, budgetAlertPercent: 80,
  });

  const handleCreate = () => {
    if (!form.name || !form.slug) return toast.error("请填写项目名称和标识符");
    createMutation.mutate({
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      monthlyBudgetUsd: form.monthlyBudgetUsd,
      budgetAlertPercent: form.budgetAlertPercent,
    });
  };

  const handleSaveEdit = (project: Project) => {
    updateMutation.mutate({
      id: project.id,
      name: editForm.name,
      description: editForm.description ?? undefined,
      monthlyBudgetUsd: editForm.monthlyBudgetUsd !== undefined
        ? Number(editForm.monthlyBudgetUsd) : undefined,
      budgetAlertPercent: editForm.budgetAlertPercent ?? undefined,
    });
    setEditingId(null);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-violet-400" />
            项目管理
          </h1>
          <p className="mt-1 text-sm text-slate-400">管理 Emperor 皇帝平台的多个业务项目，每个项目独立的 API Key 和预算</p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
      </div>

      {/* Project list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : !projects?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-20 text-center">
          <FolderKanban className="h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">暂无项目，点击右上角新建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-white/8 bg-[#0d1117] overflow-hidden"
            >
              {/* Project header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  {editingId === project.id ? (
                    <Input
                      value={editForm.name ?? project.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-7 text-sm bg-white/5 border-white/10 text-white w-48"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{project.name}</span>
                      <Badge
                        variant="outline"
                        className={project.status === "active"
                          ? "border-emerald-500/30 text-emerald-400 text-xs"
                          : "border-red-500/30 text-red-400 text-xs"}
                      >
                        {project.status === "active" ? "运行中" : "已暂停"}
                      </Badge>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">/{project.slug}</span>
                    {project.description && <span className="ml-2">· {project.description}</span>}
                  </p>
                </div>

                {/* API Key display */}
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-300">
                  <Key className="h-3 w-3 text-slate-500" />
                  <span>{project.apiKey}</span>
                  <button
                    onClick={() => rotateMutation.mutate({ id: project.id })}
                    className="ml-1 text-slate-500 hover:text-slate-300 transition-colors"
                    title="轮换 API Key"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {editingId === project.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(project as Project)}
                        className="rounded p-1.5 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded p-1.5 text-slate-500 hover:bg-white/5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(project.id);
                          setEditForm({ name: project.name, description: project.description ?? "" });
                        }}
                        className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
                        className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      >
                        {expandedId === project.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确定删除项目「${project.name}」？此操作不可撤销。`)) {
                            deleteMutation.mutate({ id: project.id });
                          }
                        }}
                        className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded config */}
              {expandedId === project.id && (
                <div className="border-t border-white/5 px-5 py-4 grid grid-cols-3 gap-6 bg-white/2">
                  {/* CORS */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Globe className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-medium text-slate-400">CORS 白名单</span>
                    </div>
                    <div className="space-y-1">
                      {(project.corsOrigins as string[] | null)?.length
                        ? (project.corsOrigins as string[]).map((o, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs text-slate-300 font-mono bg-white/5 rounded px-2 py-1">
                              {o}
                            </div>
                          ))
                        : <p className="text-xs text-slate-600">未配置（允许所有来源）</p>
                      }
                    </div>
                  </div>

                  {/* Budget */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-medium text-slate-400">月度预算</span>
                    </div>
                    <p className="text-lg font-semibold text-white">
                      ${Number(project.monthlyBudgetUsd || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">/ 月</p>
                  </div>

                  {/* Alert */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-xs font-medium text-slate-400">告警阈值</span>
                    </div>
                    <p className="text-lg font-semibold text-amber-400">
                      {project.budgetAlertPercent ?? 80}%
                    </p>
                    <p className="text-xs text-slate-500">超出时发送通知</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#0d1117] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-slate-300 text-sm">项目名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：亚马逊运营工具"
                className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">标识符 (slug) *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                placeholder="如：amazon-ops-tool"
                className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600 font-mono"
              />
              <p className="mt-1 text-xs text-slate-500">只允许小写字母、数字和连字符</p>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="项目用途说明..."
                rows={2}
                className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">月度预算上限（美元）</Label>
              <Input
                type="number"
                min={0}
                value={form.monthlyBudgetUsd}
                onChange={(e) => setForm({ ...form, monthlyBudgetUsd: Number(e.target.value) })}
                className="mt-1.5 bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">
                告警阈值：{form.budgetAlertPercent}%
              </Label>
              <Slider
                value={[form.budgetAlertPercent]}
                onValueChange={([v]) => setForm({ ...form, budgetAlertPercent: v })}
                min={50} max={100} step={5}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}
              className="border-white/10 text-slate-300 hover:bg-white/5">
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {createMutation.isPending ? "创建中..." : "创建项目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key reveal Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent className="bg-[#0d1117] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-400" />
              API Key（请立即保存）
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-slate-400 mb-3">
              此 API Key 仅显示一次，关闭后将无法再次查看完整内容。
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-amber-500/20 px-4 py-3">
              <code className="flex-1 text-sm font-mono text-amber-300 break-all">{newApiKey}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(newApiKey); toast.success("已复制"); }}
                className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowApiKeyDialog(false)}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              我已保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
