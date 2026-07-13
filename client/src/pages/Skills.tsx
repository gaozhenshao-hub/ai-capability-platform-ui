import { trpc } from "@/lib/trpc";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Code2, Plus, CheckCircle, Clock, Archive, Search, Play, History, FileText, Activity,
  Copy, RotateCcw, Cpu, Layers, Tag, Save, Trash2, ChevronDown, ChevronUp, ChevronRight, RefreshCw,
  GitCompare, Upload, Download, X, AlertCircle
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
import { PromptEditor } from "@/components/PromptEditor";
import { DiffViewer } from "@/components/DiffViewer";

type SkillStatus = "draft" | "active" | "deprecated";
type SkillScope = "global" | "project" | "private";

interface SkillFormData {
  name: string; slug: string; description: string; category: string;
  scope: SkillScope; promptTemplate: string; systemPrompt: string;
  inputSchema: string; outputSchema: string; modelId: string;
  temperature: string; maxTokens: string; changeNote: string;
}

const defaultForm: SkillFormData = {
  name: "", slug: "", description: "", category: "", scope: "project",
  promptTemplate: "你是一个专业的 AI 助手。\n\n用户输入：{{input}}\n\n请根据以上信息给出专业建议。",
  systemPrompt: "你是一个专业的 AI 助手，请用中文回答。",
  inputSchema: '{\n  "input": "string"\n}',
  outputSchema: '{\n  "result": "string"\n}',
  modelId: "", temperature: "0.7", maxTokens: "2048", changeNote: "",
};

// AMZ 全链路工具模块分组（与 Emperor 平台 category 字段对应）
const AMZ_MODULES = [
  { value: "all", label: "全部", short: "全部", color: "text-slate-300", bg: "bg-white/5" },
  { value: "M1-产品开发", label: "M1 产品开发", short: "产品开发", color: "text-blue-400", bg: "bg-blue-500/10" },
  { value: "M2-Listing工具", label: "M2 Listing工具", short: "Listing", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { value: "M3-运营AI", label: "M3 运营AI", short: "运营AI", color: "text-violet-400", bg: "bg-violet-500/10" },
  { value: "M4-售后服务", label: "M4 售后服务", short: "售后", color: "text-amber-400", bg: "bg-amber-500/10" },
  { value: "M5-内容营销", label: "M5 内容营销", short: "内容营销", color: "text-pink-400", bg: "bg-pink-500/10" },
  { value: "M0-通用分析", label: "M0 通用分析", short: "通用分析", color: "text-cyan-400", bg: "bg-cyan-500/10" },
];
const CATEGORIES = AMZ_MODULES.filter(m => m.value !== "all").map(m => m.value);
const SCOPE_LABELS: Record<SkillScope, string> = { global: "全局", project: "项目", private: "私有" };

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
      <CheckCircle className="h-3 w-3" /> 活跃
    </span>
  );
  if (status === "deprecated") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-400">
      <Archive className="h-3 w-3" /> 已废弃
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
      <Clock className="h-3 w-3" /> 草稿
    </span>
  );
}

function SkillDialog({
  open, onClose, editId, initialData, models,
}: {
  open: boolean; onClose: () => void; editId?: number;
  initialData?: Partial<SkillFormData>;
  models: Array<{ id: number; name: string; modelId: string; provider: string; isDefault?: boolean | null; status?: string }>;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<SkillFormData>({ ...defaultForm, ...initialData });
  const [activeTab, setActiveTab] = useState<"basic" | "prompt" | "schema">("basic");
  const isEdit = !!editId;

  const createMutation = trpc.skills.create.useMutation({
    onSuccess: () => { toast.success("Skill 已创建"); utils.skills.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.skills.update.useMutation({
    onSuccess: () => {
      toast.success("Skill 已更新");
      utils.skills.list.invalidate();
      if (editId) utils.skills.get.invalidate({ id: editId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof SkillFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("请填写 Skill 名称");
    if (!form.slug.trim()) return toast.error("请填写 Slug");
    if (!form.promptTemplate.trim()) return toast.error("请填写 Prompt 模板");
    let inputSchema: Record<string, unknown> = {};
    let outputSchema: Record<string, unknown> = {};
    try { inputSchema = JSON.parse(form.inputSchema); } catch { return toast.error("输入 Schema 不是有效 JSON"); }
    try { outputSchema = JSON.parse(form.outputSchema); } catch { return toast.error("输出 Schema 不是有效 JSON"); }
    const payload = {
      name: form.name, slug: form.slug, description: form.description || undefined,
      category: form.category || undefined, scope: form.scope,
      promptTemplate: form.promptTemplate, systemPrompt: form.systemPrompt || undefined,
      inputSchema, outputSchema,
      modelId: form.modelId && form.modelId !== "default" ? Number(form.modelId) : undefined,
      modelParams: {
        temperature: form.temperature ? Number(form.temperature) : undefined,
        maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined,
      },
      changeNote: form.changeNote || undefined,
    };
    if (isEdit) { updateMutation.mutate({ id: editId!, ...payload }); }
    else { createMutation.mutate(payload); }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const tabs = [{ id: "basic", label: "基本信息" }, { id: "prompt", label: "Prompt 模板" }, { id: "schema", label: "Schema 定义" }] as const;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0d1117] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Code2 className="h-5 w-5 text-violet-400" />
            {isEdit ? "编辑 Skill" : "创建新 Skill"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b border-white/8 -mx-6 px-6">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-violet-500 text-violet-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="space-y-4 pt-2">
          {activeTab === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">名称 *</Label>
                  <Input value={form.name} onChange={e => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    setForm(f => ({ ...f, name, slug: f.slug || slug }));
                  }} placeholder="文本摘要 Skill" className="bg-[#0a0d14] border-white/10 text-white text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Slug *</Label>
                  <Input value={form.slug} onChange={e => set("slug")(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="text-summarizer" className="bg-[#0a0d14] border-white/10 text-white text-sm font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">描述</Label>
                <Textarea value={form.description} onChange={e => set("description")(e.target.value)}
                  placeholder="简要描述此 Skill 的功能和适用场景" rows={2}
                  className="bg-[#0a0d14] border-white/10 text-white text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">分类</Label>
                  <Select value={form.category || ""} onValueChange={set("category")}>
                    <SelectTrigger className="bg-[#0a0d14] border-white/10 text-white text-sm"><SelectValue placeholder="选择模块" /></SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                      {AMZ_MODULES.filter(m => m.value !== "all").map(m => (
                        <SelectItem key={m.value} value={m.value} className="text-slate-300">
                          <span className={`flex items-center gap-2 ${m.color}`}>{m.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">作用域</Label>
                  <Select value={form.scope} onValueChange={v => set("scope")(v as SkillScope)}>
                    <SelectTrigger className="bg-[#0a0d14] border-white/10 text-white text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                      {(Object.keys(SCOPE_LABELS) as SkillScope[]).map(s => <SelectItem key={s} value={s} className="text-slate-300">{SCOPE_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">绑定模型</Label>
                  <Select value={form.modelId || "default"} onValueChange={v => set("modelId")(v === "default" ? "" : v)}>
                    <SelectTrigger className="bg-[#0a0d14] border-white/10 text-white text-sm">
                      <SelectValue placeholder="默认模型" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                      <SelectItem value="default" className="text-slate-300">默认模型（系统自动选择）</SelectItem>
                      {models.map(m => (
                        <SelectItem key={m.id} value={String(m.id)} className="text-slate-300">
                          <span className="flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{
                              background: m.provider === 'openai' ? '#10b981' : m.provider === 'deepseek' ? '#6366f1' : m.provider === 'anthropic' ? '#f59e0b' : '#6b7280'
                            }} />
                            {m.name}
                            {m.isDefault && <span className="text-xs text-emerald-400 ml-1">(默认)</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Temperature</Label>
                  <Input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={e => set("temperature")(e.target.value)} className="bg-[#0a0d14] border-white/10 text-white text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Max Tokens</Label>
                  <Input type="number" min={1} max={128000} value={form.maxTokens} onChange={e => set("maxTokens")(e.target.value)} className="bg-[#0a0d14] border-white/10 text-white text-sm" />
                </div>
              </div>
              {isEdit && (
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">变更说明（将创建新版本）</Label>
                  <Input value={form.changeNote} onChange={e => set("changeNote")(e.target.value)} placeholder="描述本次修改的内容" className="bg-[#0a0d14] border-white/10 text-white text-sm" />
                </div>
              )}
            </div>
          )}
          {activeTab === "prompt" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">System Prompt <span className="text-slate-600 font-normal">（可选）</span></Label>
                <PromptEditor
                  value={form.systemPrompt}
                  onChange={set("systemPrompt")}
                  placeholder="你是一个专业的 AI 助手，请用中文回答..."
                  height={120}
                  showPreview={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">
                  Prompt 模板 * <span className="text-slate-600 font-normal">(使用 {"{{variable}}"} 引用输入变量，输入 {"{{"} 触发自动补全)</span>
                </Label>
                <PromptEditor
                  value={form.promptTemplate}
                  onChange={set("promptTemplate")}
                  placeholder="请分析以下内容：{{input}}"
                  height={220}
                  showPreview={true}
                />
              </div>
            </div>
          )}
          {activeTab === "schema" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-400">Schema 使用 JSON 格式定义输入/输出字段，key 为字段名，value 为类型描述。Prompt 模板中的 {"{{variable}}"} 变量需要在输入 Schema 中声明。</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">输入 Schema</Label>
                <Textarea value={form.inputSchema} onChange={e => set("inputSchema")(e.target.value)} rows={6} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">输出 Schema</Label>
                <Textarea value={form.outputSchema} onChange={e => set("outputSchema")(e.target.value)} rows={6} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">取消</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
            {isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
            {isEdit ? "保存更改" : "创建 Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunTestPanel({ skillId }: { skillId: number }) {
  const [inputJson, setInputJson] = useState('{\n  "input": "请输入测试内容"\n}');
  const [result, setResult] = useState<{ output: string; inputTokens: number; outputTokens: number; durationMs: number; renderedPrompt: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const runMutation = trpc.skills.run.useMutation({
    onSuccess: (data) => { setResult(data); toast.success(`运行完成，耗时 ${data.durationMs}ms`); },
    onError: (e) => toast.error(`运行失败：${e.message}`),
  });

  const handleRun = () => {
    let inputData: Record<string, unknown> = {};
    try { inputData = JSON.parse(inputJson); } catch { return toast.error("输入数据不是有效 JSON"); }
    runMutation.mutate({ skillId, inputData });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-slate-300 text-xs">输入数据（JSON）</Label>
        <Textarea value={inputJson} onChange={e => setInputJson(e.target.value)} rows={6} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y" />
      </div>
      <Button onClick={handleRun} disabled={runMutation.isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
        {runMutation.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Play className="h-4 w-4" />}
        {runMutation.isPending ? "运行中..." : "运行测试"}
      </Button>
      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "耗时", value: `${result.durationMs}ms`, color: "text-cyan-400" }, { label: "输入 Token", value: result.inputTokens.toLocaleString(), color: "text-violet-400" }, { label: "输出 Token", value: result.outputTokens.toLocaleString(), color: "text-emerald-400" }].map(s => (
              <div key={s.label} className="rounded-lg border border-white/8 bg-[#0a0d14] p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-xs">AI 输出</Label>
              <button onClick={() => { navigator.clipboard.writeText(result.output); toast.success("已复制"); }} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <Copy className="h-3 w-3" /> 复制
              </button>
            </div>
            <div className="rounded-lg border border-white/8 bg-[#0a0d14] p-4 text-sm text-slate-200 whitespace-pre-wrap max-h-64 overflow-y-auto">{result.output}</div>
          </div>
          <div>
            <button onClick={() => setShowPrompt(!showPrompt)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
              {showPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} 查看渲染后的 Prompt
            </button>
            {showPrompt && <pre className="mt-2 rounded-lg border border-white/8 bg-[#0a0d14] p-4 text-xs text-slate-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{result.renderedPrompt}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionHistoryPanel({ skillId, currentVersion }: { skillId: number; currentVersion: number }) {
  const utils = trpc.useUtils();
  const { data: versions, isLoading } = trpc.skills.getVersions.useQuery({ skillId });
  const [expandedVer, setExpandedVer] = useState<number | null>(null);
  const [diffPair, setDiffPair] = useState<[number, number] | null>(null);
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");

  const rollbackMutation = trpc.skills.rollback.useMutation({
    onSuccess: (data) => {
      toast.success(`已回滚，新版本号 v${data.newVersion}`);
      utils.skills.list.invalidate();
      utils.skills.get.invalidate({ id: skillId });
      utils.skills.getVersions.invalidate({ skillId });
    },
    onError: (e) => toast.error(`回滚失败：${e.message}`),
  });

  const { data: diffData, isLoading: diffLoading } = trpc.skills.diffVersions.useQuery(
    { skillId, versionA: diffPair?.[0] ?? 0, versionB: diffPair?.[1] ?? 0 },
    { enabled: !!diffPair }
  );

  if (isLoading) return <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>;
  if (!versions?.length) return <div className="flex flex-col items-center justify-center py-12 text-slate-500"><History className="h-8 w-8 mb-2 text-slate-700" /><p className="text-sm">暂无版本记录</p></div>;

  return (
    <div className="space-y-3">
      {/* Diff panel */}
      {diffPair && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-300">v{diffPair[0]} → v{diffPair[1]} 差异对比</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {(["split", "unified"] as const).map(m => (
                  <button key={m} onClick={() => setDiffMode(m)}
                    className={`px-2.5 py-1 text-xs transition-colors ${
                      diffMode === m ? "bg-violet-600 text-white" : "bg-transparent text-slate-400 hover:text-slate-200"
                    }`}>
                    {m === "split" ? "左右对比" : "统一视图"}
                  </button>
                ))}
              </div>
              <button onClick={() => setDiffPair(null)} className="rounded p-1 text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {diffLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : diffData ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1.5 font-medium">Prompt 模板差异</p>
                <DiffViewer
                  oldText={diffData.versionA.promptTemplate}
                  newText={diffData.versionB.promptTemplate}
                  oldLabel={`v${diffPair[0]}${diffData.versionA.changeNote ? ` (${diffData.versionA.changeNote})` : ""}`}
                  newLabel={`v${diffPair[1]}${diffData.versionB.changeNote ? ` (${diffData.versionB.changeNote})` : ""}`}
                  mode={diffMode}
                />
              </div>
              {(diffData.versionA.systemPrompt || diffData.versionB.systemPrompt) && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 font-medium">System Prompt 差异</p>
                  <DiffViewer
                    oldText={diffData.versionA.systemPrompt}
                    newText={diffData.versionB.systemPrompt}
                    oldLabel={`v${diffPair[0]}`}
                    newLabel={`v${diffPair[1]}`}
                    mode={diffMode}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Version list */}
      {versions.map(ver => (
        <div key={ver.version} className="rounded-lg border border-white/8 bg-[#0a0d14] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              ver.version === currentVersion ? "bg-violet-600 text-white" : "bg-white/5 text-slate-400"
            }`}>{ver.version}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 truncate">
                {ver.changeNote ?? `版本 ${ver.version}`}
                {ver.version === currentVersion && <span className="ml-2 text-xs text-violet-400">（当前）</span>}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{new Date(ver.createdAt!).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-1">
              {ver.version !== currentVersion && (
                <button
                  onClick={() => setDiffPair(diffPair?.[0] === ver.version ? null : [ver.version, currentVersion])}
                  className={`rounded p-1.5 transition-colors ${
                    diffPair?.[0] === ver.version
                      ? "bg-violet-500/20 text-violet-400"
                      : "text-slate-500 hover:bg-violet-500/10 hover:text-violet-400"
                  }`}
                  title={`与当前版本 v${currentVersion} 对比`}
                >
                  <GitCompare className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setExpandedVer(expandedVer === ver.version ? null : ver.version)}
                className="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300">
                {expandedVer === ver.version ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {ver.version !== currentVersion && (
                <button
                  onClick={() => { if (confirm(`确定回滚到版本 ${ver.version}？`)) rollbackMutation.mutate({ skillId, version: ver.version }); }}
                  disabled={rollbackMutation.isPending}
                  className="rounded p-1.5 text-slate-500 hover:bg-amber-500/10 hover:text-amber-400"
                  title="回滚"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {expandedVer === ver.version && (
            <div className="border-t border-white/5 px-4 py-3 space-y-2">
              <p className="text-xs text-slate-500 font-medium">Prompt 模板</p>
              <pre className="text-xs text-slate-300 font-mono bg-black/20 p-3 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">{ver.promptTemplate}</pre>
              {ver.systemPrompt && (
                <><p className="text-xs text-slate-500 font-medium">System Prompt</p>
                <pre className="text-xs text-slate-300 font-mono bg-black/20 p-3 rounded whitespace-pre-wrap max-h-24 overflow-y-auto">{ver.systemPrompt}</pre></>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CallLogsPanel({ skillId }: { skillId: number }) {
  const { data: logs, isLoading, refetch } = trpc.skills.getLogs.useQuery({ skillId, limit: 50 });

  if (isLoading) return <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">最近 50 条调用记录</p>
        <button onClick={() => refetch()} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"><RefreshCw className="h-3 w-3" /> 刷新</button>
      </div>
      {!logs?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500"><Activity className="h-8 w-8 mb-2 text-slate-700" /><p className="text-sm">暂无调用记录</p></div>
      ) : (
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <div className="grid text-xs font-medium px-4 py-2.5 border-b border-white/8 text-slate-500" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
            <span>来源</span><span>版本</span><span>耗时</span><span>Token</span><span>时间</span>
          </div>
          {logs.map(log => (
            <div key={log.id} className="grid items-center px-4 py-3 border-b border-white/5 text-xs hover:bg-white/2 transition-colors" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
              <span className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 ${log.source === "manual" ? "bg-violet-500/15 text-violet-400" : log.source === "agent" ? "bg-cyan-500/15 text-cyan-400" : "bg-slate-500/15 text-slate-400"}`}>{log.source}</span>
                {log.errorMessage && <span className="text-red-400 text-xs">✗ 错误</span>}
              </span>
              <span className="text-slate-400">v{log.skillVersion}</span>
              <span className="text-slate-300">{log.durationMs ? `${log.durationMs}ms` : "-"}</span>
              <span className="text-slate-400">{((log.inputTokens ?? 0) + (log.outputTokens ?? 0)).toLocaleString()}</span>
              <span className="text-slate-500">{new Date(log.createdAt!).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bulk Import Dialog ───────────────────────────────────────────────────────
function BulkImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  // Step: 'edit' = JSON 输入阶段, 'preview' = 预览确认阶段
  const [step, setStep] = useState<"edit" | "preview">("edit");

  type ParsedSkill = { name: string; slug?: string; description?: string; category?: string; promptTemplate: string; systemPrompt?: string; _valid: boolean; _error?: string; };
  const [previewList, setPreviewList] = useState<ParsedSkill[]>([]);

  const importMutation = trpc.skills.bulkImport.useMutation({
    onSuccess: (data) => {
      const created = data.results.filter(r => r.status === "created").length;
      const updated = data.results.filter(r => r.status === "updated").length;
      const skipped = data.results.filter(r => r.status === "skipped").length;
      toast.success(`导入完成：新建 ${created}，更新 ${updated}，跳过 ${skipped}`);
      utils.skills.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`导入失败：${e.message}`),
  });

  const tryParse = (text: string) => {
    try {
      const data = JSON.parse(text);
      const arr: unknown[] = Array.isArray(data) ? data : (data as Record<string, unknown>).skills ? (data as Record<string, unknown[]>).skills : [data];
      setParsed(arr);
      setParseError("");
    } catch (e: unknown) {
      setParsed(null);
      setParseError(e instanceof Error ? e.message : "JSON 解析失败");
    }
  };

  const buildPreview = () => {
    if (!parsed?.length) return;
    const list = (parsed as Record<string, unknown>[]).map((item) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const promptTemplate = typeof item.promptTemplate === "string" ? item.promptTemplate.trim() : "";
      const valid = !!name && !!promptTemplate;
      return {
        name,
        slug: typeof item.slug === "string" ? item.slug : undefined,
        description: typeof item.description === "string" ? item.description : undefined,
        category: typeof item.category === "string" ? item.category : undefined,
        promptTemplate,
        systemPrompt: typeof item.systemPrompt === "string" ? item.systemPrompt : undefined,
        _valid: valid,
        _error: !name ? "缺少 name 字段" : !promptTemplate ? "缺少 promptTemplate 字段" : undefined,
      };
    });
    setPreviewList(list);
    setStep("preview");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonText(text);
      tryParse(text);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (text: string) => {
    setJsonText(text);
    if (text.trim()) tryParse(text);
    else { setParsed(null); setParseError(""); }
  };

  const handleImport = () => {
    if (!parsed?.length) return;
    importMutation.mutate({
      skills: parsed as Parameters<typeof importMutation.mutate>[0]["skills"],
      overwriteExisting: overwrite,
    });
  };

  const EXAMPLE = JSON.stringify([
    { name: "标题生成", slug: "listing-title", description: "生成亚马逊产品标题", category: "Listing生成",
      promptTemplate: "类目：{{category}}\n关键词：{{keywords}}\n\n请生成3个优化标题。",
      systemPrompt: "你是亚马逊Listing优化专家。" },
    { name: "五点描述", slug: "listing-bullets", description: "生成五点描述", category: "Listing生成",
      promptTemplate: "产品特征：{{features}}\n\n请生成5条Bullet Points。" },
  ], null, 2);

  const validCount = previewList.filter(p => p._valid).length;
  const invalidCount = previewList.filter(p => !p._valid).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0d1117] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-400" />
            {step === "edit" ? "批量导入 Skills" : `确认导入 — ${validCount} 条有效记录`}
          </DialogTitle>
        </DialogHeader>

        {step === "edit" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400 space-y-1">
              <p className="font-medium">支持 JSON 格式导入，每条记录需包含 name 和 promptTemplate 字段。</p>
              <p>可选字段：slug、description、category、scope、systemPrompt、inputSchema、outputSchema、modelParams</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}
                className="border-white/10 text-slate-300 hover:bg-white/5 gap-2">
                <Upload className="h-4 w-4" /> 上传 JSON 文件
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setJsonText(EXAMPLE); tryParse(EXAMPLE); }}
                className="text-slate-500 hover:text-slate-300 text-xs gap-1.5">
                <Download className="h-3.5 w-3.5" /> 加载示例
              </Button>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">JSON 内容</Label>
              <Textarea value={jsonText} onChange={e => handleTextChange(e.target.value)}
                placeholder='[{"name": "...", "promptTemplate": "..."}]'
                rows={10} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y" />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{parseError}</p>
              </div>
            )}
            {parsed && !parseError && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <p className="text-xs text-emerald-400">解析成功，共 {parsed.length} 条 Skill 记录，点击“预览确认”查看详情</p>
              </div>
            )}
          </div>
        ) : (
          /* Preview step */
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400">✓ {validCount} 条有效</span>
              {invalidCount > 0 && <span className="text-red-400">✗ {invalidCount} 条无效（将被跳过）</span>}
            </div>
            <div className="rounded-xl border border-white/8 overflow-hidden max-h-72 overflow-y-auto">
              <div className="grid text-xs font-medium px-4 py-2 border-b border-white/8 bg-[#0a0d14] text-slate-500"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                <span>名称</span><span>Slug</span><span>分类</span><span>状态</span>
              </div>
              {previewList.map((item, i) => (
                <div key={i} className={`grid items-center px-4 py-2.5 border-b border-white/5 text-xs ${
                  item._valid ? "hover:bg-white/2" : "bg-red-950/20"
                }`} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                  <span className="truncate text-slate-200 font-medium">{item.name || <span className="text-red-400 italic">缺少名称</span>}</span>
                  <span className="text-slate-500 font-mono truncate">{item.slug ?? "自动生成"}</span>
                  <span className="text-slate-500 truncate">{item.category ?? "未分类"}</span>
                  <span className={item._valid ? "text-emerald-400" : "text-red-400"}>
                    {item._valid ? "就绪导入" : item._error}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="overwrite2" checked={overwrite} onChange={e => setOverwrite(e.target.checked)}
                className="rounded border-white/20 bg-[#0a0d14]" />
              <label htmlFor="overwrite2" className="text-xs text-slate-400 cursor-pointer">
                覆盖已存在的 Skill（相同 slug 时更新而非跳过）
              </label>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "edit" ? (
            <>
              <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">取消</Button>
              <Button onClick={buildPreview} disabled={!parsed?.length || !!parseError}
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                <ChevronRight className="h-4 w-4" />预览确认
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("edit")} className="text-slate-400 hover:text-white">返回修改</Button>
              <Button onClick={handleImport} disabled={validCount === 0 || importMutation.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                {importMutation.isPending
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <Upload className="h-4 w-4" />}
                确认导入 {validCount} 条
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkillDetailPanel({ skillId, onEdit, onDelete }: { skillId: number; onEdit: () => void; onDelete: () => void }) {
  const { data: skill, isLoading } = trpc.skills.get.useQuery({ id: skillId });
  const { data: stats } = trpc.skills.getStats.useQuery({ skillId });
  const [activeTab, setActiveTab] = useState<"editor" | "versions" | "run" | "logs">("editor");
  const utils = trpc.useUtils();

  const updateMutation = trpc.skills.update.useMutation({
    onSuccess: () => { toast.success("状态已更新"); utils.skills.list.invalidate(); utils.skills.get.invalidate({ id: skillId }); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>;
  if (!skill) return null;

  const tabs = [{ id: "editor", label: "编辑器", icon: FileText }, { id: "versions", label: "版本历史", icon: History }, { id: "run", label: "运行测试", icon: Play }, { id: "logs", label: "调用日志", icon: Activity }] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between px-5 py-4 border-b border-white/8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-white truncate">{skill.name}</h2>
            <StatusBadge status={skill.status as SkillStatus} />
          </div>
          <p className="text-xs text-slate-500 font-mono">{skill.slug}</p>
          {skill.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{skill.description}</p>}
        </div>
        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          <button onClick={onEdit} className="rounded px-2.5 py-1.5 text-xs bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">编辑</button>
          <button onClick={onDelete} className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/8">
          {[{ label: "总调用", value: stats.totalCalls, color: "text-violet-400" }, { label: "平均耗时", value: `${stats.avgDurationMs}ms`, color: "text-cyan-400" }, { label: "采纳率", value: `${stats.adoptionRate}%`, color: "text-emerald-400" }, { label: "总 Token", value: stats.totalTokens.toLocaleString(), color: "text-amber-400" }].map(s => (
            <div key={s.label} className="text-center"><p className={`text-sm font-semibold ${s.color}`}>{s.value}</p><p className="text-xs text-slate-600">{s.label}</p></div>
          ))}
        </div>
      )}
      <div className="flex gap-0.5 border-b border-white/8 px-5">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-violet-500 text-violet-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
            <tab.icon className="h-3.5 w-3.5" />{tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "editor" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">快速操作：</span>
              {skill.status !== "active" && <button onClick={() => updateMutation.mutate({ id: skill.id, status: "active" })} className="text-xs rounded px-2.5 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors">发布激活</button>}
              {skill.status === "active" && <button onClick={() => updateMutation.mutate({ id: skill.id, status: "draft" })} className="text-xs rounded px-2.5 py-1 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 transition-colors">退回草稿</button>}
              {skill.status !== "deprecated" && <button onClick={() => { if (confirm("确定废弃此 Skill？")) updateMutation.mutate({ id: skill.id, status: "deprecated" }); }} className="text-xs rounded px-2.5 py-1 bg-slate-600/20 text-slate-400 hover:bg-slate-600/30 transition-colors">废弃</button>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label className="text-slate-400 text-xs">System Prompt</Label><span className="text-xs text-slate-600">v{skill.currentVersion}</span></div>
              <pre className="text-xs text-slate-300 font-mono bg-[#0a0d14] border border-white/8 rounded-lg p-3 whitespace-pre-wrap max-h-24 overflow-y-auto">{skill.systemPrompt || <span className="text-slate-600 italic">（未设置）</span>}</pre>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Prompt 模板</Label>
              <pre className="text-xs text-slate-300 font-mono bg-[#0a0d14] border border-white/8 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{skill.promptTemplate}</pre>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-white/8 bg-[#0a0d14] p-3 space-y-1.5">
                <p className="text-slate-500 font-medium">基本信息</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">分类</span><span className="text-slate-300">{skill.category ?? "未分类"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">作用域</span><span className="text-slate-300">{SCOPE_LABELS[skill.scope as SkillScope] ?? skill.scope}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">当前版本</span><span className="text-violet-400">v{skill.currentVersion}</span></div>
                </div>
              </div>
              <div className="rounded-lg border border-white/8 bg-[#0a0d14] p-3 space-y-1.5">
                <p className="text-slate-500 font-medium">模型参数</p>
                {(() => { const p = (skill.modelParams ?? {}) as Record<string, unknown>; const temp = p.temperature !== undefined ? String(p.temperature) : "默认"; const maxT = p.maxTokens !== undefined ? String(p.maxTokens) : "默认"; return (
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-slate-600">Temperature</span><span className="text-slate-300">{temp}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Max Tokens</span><span className="text-slate-300">{maxT}</span></div>
                  </div>
                ); })()}
              </div>
            </div>
          </div>
        )}
        {activeTab === "versions" && <VersionHistoryPanel skillId={skill.id} currentVersion={skill.currentVersion ?? 1} />}
        {activeTab === "run" && <RunTestPanel skillId={skill.id} />}
        {activeTab === "logs" && <CallLogsPanel skillId={skill.id} />}
      </div>
    </div>
  );
}

export default function Skills() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<SkillStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSkill, setEditingSkill] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { data: skills, isLoading } = trpc.skills.list.useQuery({
    search: search || undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    category: filterCategory !== "all" ? filterCategory : undefined,
  });

  const { data: models } = trpc.skills.getAvailableModels.useQuery();

  const deleteMutation = trpc.skills.delete.useMutation({
    onSuccess: () => { toast.success("Skill 已删除"); utils.skills.list.invalidate(); setSelectedId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleDelete = useCallback((id: number, name: string) => {
    if (confirm(`确定删除 Skill「${name}」？此操作不可撤销。`)) deleteMutation.mutate({ id });
  }, [deleteMutation]);

  const allSkills = skills ?? [];
  const activeCount = allSkills.filter(s => s.status === "active").length;
  const draftCount = allSkills.filter(s => s.status === "draft").length;
  const deprecatedCount = allSkills.filter(s => s.status === "deprecated").length;
  const categories = Array.from(new Set(allSkills.map(s => s.category).filter(Boolean)));
  const selectedSkill = allSkills.find(s => s.id === selectedId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Code2 className="h-5 w-5 text-violet-400" />Skill 技能管理</h1>
          <p className="mt-0.5 text-sm text-slate-400">管理 AI Prompt 技能模板，支持版本控制、运行测试和调用日志</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)} size="sm"
            className="border-white/10 text-slate-300 hover:bg-white/5 gap-2">
            <Upload className="h-4 w-4" />批量导入
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-violet-600 hover:bg-violet-500 text-white gap-2" size="sm">
            <Plus className="h-4 w-4" />创建 Skill
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-white/8 flex-shrink-0">
        {[{ label: "全部 Skill", value: allSkills.length, icon: Layers, color: "text-slate-300" }, { label: "活跃", value: activeCount, icon: CheckCircle, color: "text-emerald-400" }, { label: "草稿", value: draftCount, icon: Clock, color: "text-amber-400" }, { label: "已废弃", value: deprecatedCount, icon: Archive, color: "text-slate-500" }].map(stat => (
          <div key={stat.label} className="rounded-xl border border-white/8 bg-[#0d1117] p-4">
            <div className="flex items-center justify-between mb-1.5"><span className="text-xs text-slate-500">{stat.label}</span><stat.icon className={`h-4 w-4 ${stat.color}`} /></div>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-80 flex-shrink-0 border-r border-white/8 flex flex-col">
          <div className="p-3 space-y-2 border-b border-white/8">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 Skill..." className="pl-8 bg-[#0a0d14] border-white/10 text-white text-xs h-8" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "active", "draft", "deprecated"] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterStatus === s ? "bg-violet-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                  {s === "all" ? "全部" : s === "active" ? "活跃" : s === "draft" ? "草稿" : "废弃"}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {AMZ_MODULES.map(mod => {
                const count = mod.value === "all" ? allSkills.length : allSkills.filter(s => s.category === mod.value).length;
                const isActive = filterCategory === mod.value;
                return (
                  <button key={mod.value} onClick={() => setFilterCategory(mod.value)}
                    className={`px-2 py-0.5 rounded-full text-xs transition-colors flex items-center gap-1 ${
                      isActive ? `${mod.bg} ${mod.color} ring-1 ring-current` : "bg-white/5 text-slate-500 hover:bg-white/10"
                    }`}>
                    {mod.short}
                    <span className={`text-[10px] ${isActive ? mod.color : "text-slate-600"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>
            ) : !allSkills.length ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Code2 className="h-10 w-10 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">暂无 Skill</p>
                <p className="text-xs text-slate-600 mt-1">点击右上角创建第一个</p>
              </div>
            ) : (
              allSkills.map(skill => (
                <button key={skill.id} onClick={() => setSelectedId(skill.id)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${selectedId === skill.id ? "bg-violet-600/10 border-l-2 border-l-violet-500" : "hover:bg-white/3"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{skill.name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">{skill.slug}</p>
                    </div>
                    <StatusBadge status={skill.status as SkillStatus} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {skill.category && (() => {
                      const mod = AMZ_MODULES.find(m => m.value === skill.category);
                      return mod ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${mod.bg} ${mod.color} flex items-center gap-0.5`}>
                          {mod.short}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 flex items-center gap-0.5"><Tag className="h-2.5 w-2.5" /> {skill.category}</span>
                      );
                    })()}
                    <span className="text-xs text-slate-600 flex items-center gap-0.5"><Cpu className="h-2.5 w-2.5" /> v{skill.currentVersion}</span>
                    <ChevronRight className="h-3 w-3 text-slate-700 ml-auto" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-[#0b0e16]">
          {selectedId ? (
            <SkillDetailPanel skillId={selectedId} onEdit={() => setEditingSkill(selectedId)} onDelete={() => { const s = allSkills.find(x => x.id === selectedId); if (s) handleDelete(s.id, s.name); }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="rounded-2xl border border-white/8 bg-[#0d1117] p-8 max-w-sm">
                <Code2 className="h-12 w-12 text-violet-500/50 mx-auto mb-4" />
                <h3 className="text-base font-medium text-slate-300 mb-2">选择一个 Skill</h3>
                <p className="text-sm text-slate-500 mb-4">从左侧列表选择一个 Skill 查看详情，或创建新的 Skill</p>
                <Button onClick={() => setShowCreateDialog(true)} variant="outline" size="sm" className="border-violet-500/30 text-violet-400 hover:bg-violet-600/10">
                  <Plus className="h-4 w-4 mr-1.5" />创建 Skill
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showCreateDialog && <SkillDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} models={models ?? []} />}
      {showImportDialog && <BulkImportDialog open={showImportDialog} onClose={() => setShowImportDialog(false)} />}
      {editingSkill !== null && selectedSkill && (
        <SkillDialog open={true} onClose={() => setEditingSkill(null)} editId={editingSkill}
          initialData={{
            name: selectedSkill.name, slug: selectedSkill.slug, description: selectedSkill.description ?? "",
            category: selectedSkill.category ?? "", scope: (selectedSkill.scope as SkillScope) ?? "project",
            promptTemplate: selectedSkill.promptTemplate, systemPrompt: selectedSkill.systemPrompt ?? "",
            inputSchema: JSON.stringify(selectedSkill.inputSchema ?? {}, null, 2),
            outputSchema: JSON.stringify(selectedSkill.outputSchema ?? {}, null, 2),
            modelId: selectedSkill.modelId ? String(selectedSkill.modelId) : "",
            temperature: String((selectedSkill.modelParams as Record<string, unknown>)?.temperature ?? "0.7"),
            maxTokens: String((selectedSkill.modelParams as Record<string, unknown>)?.maxTokens ?? "2048"),
          }}
          models={models ?? []} />
      )}
    </div>
  );
}
