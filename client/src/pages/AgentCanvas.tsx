import { trpc } from "@/lib/trpc";
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type Edge,
  type Node,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Play, Bot, GitBranch, Cpu, Globe, Code2, BookOpen,
  CheckSquare, ChevronRight, Loader2, AlertCircle, RotateCcw, X,
  Settings, Layers, Zap, RefreshCw, Eye, Plug
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { AIPlatformAssistant } from "@/components/AIPlatformAssistant";

// ─── Node type definitions ────────────────────────────────────────────────────
export type AgentNodeType =
  | "input" | "output" | "skill" | "llm" | "mcp" | "condition"
  | "loop" | "human_review" | "http" | "code" | "knowledge";

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  nodeType: AgentNodeType;
  config: Record<string, unknown>;
  status?: "pending" | "running" | "completed" | "failed" | "skipped" | "waiting_review";
}

// ─── Node palette config ──────────────────────────────────────────────────────
const NODE_PALETTE: Array<{
  type: AgentNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}> = [
  { type: "input",        label: "输入节点",   icon: Zap,          color: "text-violet-400",  bgColor: "bg-violet-500/20 border-violet-500/40",  description: "工作流起始，接收外部输入" },
  { type: "skill",        label: "Skill 节点", icon: Layers,       color: "text-blue-400",    bgColor: "bg-blue-500/20 border-blue-500/40",      description: "调用已注册的 AI Skill" },
  { type: "llm",          label: "LLM 节点",   icon: Cpu,          color: "text-cyan-400",    bgColor: "bg-cyan-500/20 border-cyan-500/40",      description: "直接调用大语言模型" },
  { type: "condition",    label: "条件分支",   icon: GitBranch,    color: "text-amber-400",   bgColor: "bg-amber-500/20 border-amber-500/40",    description: "根据条件走不同分支" },
  { type: "loop",         label: "循环节点",   icon: RotateCcw,    color: "text-orange-400",  bgColor: "bg-orange-500/20 border-orange-500/40",  description: "对列表数据循环处理" },
  { type: "human_review", label: "人工审核",   icon: CheckSquare,  color: "text-rose-400",    bgColor: "bg-rose-500/20 border-rose-500/40",      description: "暂停等待人工确认" },
  { type: "http",         label: "HTTP 请求",  icon: Globe,        color: "text-emerald-400", bgColor: "bg-emerald-500/20 border-emerald-500/40",description: "调用外部 API" },
  { type: "code",         label: "代码节点",   icon: Code2,        color: "text-purple-400",  bgColor: "bg-purple-500/20 border-purple-500/40",  description: "执行自定义代码逻辑" },
  { type: "mcp",          label: "MCP 工具",   icon: Plug,         color: "text-pink-400",    bgColor: "bg-pink-500/20 border-pink-500/40",      description: "调用外部 MCP 工具服务" },
  { type: "knowledge",    label: "知识库",     icon: BookOpen,     color: "text-teal-400",    bgColor: "bg-teal-500/20 border-teal-500/40",      description: "查询知识库内容" },
  { type: "output",       label: "输出节点",   icon: ChevronRight, color: "text-slate-400",   bgColor: "bg-slate-500/20 border-slate-500/40",    description: "工作流终止，收集输出" },
];

const NODE_COLOR_MAP: Record<AgentNodeType, string> = {
  input:        "#7c3aed",
  output:       "#475569",
  skill:        "#2563eb",
  llm:          "#0891b2",
  mcp:          "#db2777",
  condition:    "#d97706",
  loop:         "#ea580c",
  human_review: "#e11d48",
  http:         "#16a34a",
  code:         "#9333ea",
  knowledge:    "#0d9488",
};

const STATUS_NODE_STYLE: Record<string, { border: string; background: string }> = {
  running:        { border: "2px solid #7c3aed", background: "rgba(124,58,237,0.15)" },
  completed:      { border: "2px solid #16a34a", background: "rgba(22,163,74,0.12)" },
  failed:         { border: "2px solid #dc2626", background: "rgba(220,38,38,0.12)" },
  waiting_review: { border: "2px solid #f59e0b", background: "rgba(245,158,11,0.15)" },
  skipped:        { border: "1px solid #475569", background: "rgba(71,85,105,0.1)" },
  pending:        { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(13,17,23,0.8)" },
};

// ─── Custom Node Component ────────────────────────────────────────────────────
import { Handle, Position } from "@xyflow/react";

function AgentNode({ data, selected }: { data: AgentNodeData; selected: boolean }) {
  const palette = NODE_PALETTE.find(p => p.type === data.nodeType);
  const Icon = palette?.icon ?? Bot;
  const color = palette?.color ?? "text-slate-400";
  const statusStyle = STATUS_NODE_STYLE[data.status ?? "pending"] ?? STATUS_NODE_STYLE.pending;

  return (
    <div
      className={`rounded-xl px-4 py-3 min-w-[160px] max-w-[220px] cursor-pointer transition-all duration-150 ${
        selected ? "ring-2 ring-violet-400 ring-offset-1 ring-offset-[#0b0e16]" : ""
      }`}
      style={{
        background: statusStyle.background,
        border: selected ? "2px solid #a78bfa" : statusStyle.border,
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Top handle (target) — not for input nodes */}
      {data.nodeType !== "input" && (
        <Handle type="target" position={Position.Top}
          style={{ background: "#7c3aed", border: "2px solid #1e1b4b", width: 10, height: 10 }} />
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className={`rounded-lg p-1.5 ${palette?.bgColor ?? "bg-slate-500/20"}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <span className="text-xs font-semibold text-white truncate">{data.label}</span>
      </div>
      <p className="text-[10px] text-slate-500 truncate">{palette?.description}</p>

      {/* Status indicator */}
      {data.status && data.status !== "pending" && (
        <div className="mt-2 flex items-center gap-1">
          {data.status === "running" && <Loader2 className="h-3 w-3 text-violet-400 animate-spin" />}
          {data.status === "completed" && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
          {data.status === "failed" && <div className="h-2 w-2 rounded-full bg-red-400" />}
          {data.status === "waiting_review" && <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
          <span className="text-[10px] text-slate-400">
            {data.status === "running" ? "执行中" : data.status === "completed" ? "完成" :
             data.status === "failed" ? "失败" : data.status === "waiting_review" ? "等待审核" : data.status}
          </span>
        </div>
      )}

      {/* Bottom handle (source) — not for output nodes */}
      {data.nodeType !== "output" && (
        <Handle type="source" position={Position.Bottom}
          style={{ background: "#7c3aed", border: "2px solid #1e1b4b", width: 10, height: 10 }} />
      )}
      {/* Condition node has two source handles */}
      {data.nodeType === "condition" && (
        <>
          <Handle id="true" type="source" position={Position.Right}
            style={{ background: "#16a34a", border: "2px solid #052e16", width: 10, height: 10, top: "60%" }} />
          <Handle id="false" type="source" position={Position.Left}
            style={{ background: "#dc2626", border: "2px solid #450a0a", width: 10, height: 10, top: "60%" }} />
        </>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { agentNode: AgentNode };

// ─── Node Property Panel ──────────────────────────────────────────────────────
function NodePropertyPanel({
  node,
  onUpdate,
  onClose,
  availableSkills,
  availableModels,
  availableMcpTools,
}: {
  node: Node<AgentNodeData>;
  onUpdate: (id: string, data: Partial<AgentNodeData>) => void;
  onClose: () => void;
  availableSkills: Array<{ id: number; name: string; slug: string; description?: string | null }>;
  availableModels: Array<{ id: number; name: string; provider: string; modelId: string }>;
  availableMcpTools: Array<{ id: number; name: string; slug: string; description?: string | null; capabilities: Array<{ name: string; description?: string; method?: string; path?: string }> }>;
}) {
  const [label, setLabel] = useState(node.data.label);
  const [config, setConfig] = useState<Record<string, unknown>>(node.data.config ?? {});
  const palette = NODE_PALETTE.find(p => p.type === node.data.nodeType);
  const Icon = palette?.icon ?? Bot;

  const setConfigField = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(node.id, { label, config });
    toast.success("节点配置已保存");
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${palette?.bgColor ?? "bg-slate-500/20"}`}>
            <Icon className={`h-4 w-4 ${palette?.color ?? "text-slate-400"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{palette?.label ?? "节点配置"}</p>
            <p className="text-xs text-slate-500">{node.id}</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Common: label */}
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">节点名称</Label>
          <Input value={label} onChange={e => setLabel(e.target.value)}
            className="bg-[#0a0d14] border-white/10 text-white text-sm h-8" />
        </div>

        {/* Skill node config */}
        {node.data.nodeType === "skill" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">选择 Skill</Label>
              <Select value={String(config.skillId ?? "")} onValueChange={v => setConfigField("skillId", Number(v))}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue placeholder="选择 Skill..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {availableSkills.map(s => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-slate-300 text-xs">
                      {s.name} <span className="text-slate-600 ml-1">{s.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">输入映射 (JSON)</Label>
              <Textarea
                value={typeof config.inputMapping === "string" ? config.inputMapping : JSON.stringify(config.inputMapping ?? {}, null, 2)}
                onChange={e => setConfigField("inputMapping", e.target.value)}
                rows={4} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder='{"input": "{{previous_output}}"}'
              />
            </div>
          </div>
        )}

        {/* LLM node config */}
        {node.data.nodeType === "llm" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">选择模型</Label>
              <Select value={String(config.model ?? "gpt-4o-mini")} onValueChange={v => setConfigField("model", v)}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  <SelectItem value="gpt-4o-mini" className="text-slate-300 text-xs">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o" className="text-slate-300 text-xs">GPT-4o</SelectItem>
                  {availableModels.map(m => (
                    <SelectItem key={m.id} value={m.modelId} className="text-slate-300 text-xs">
                      {m.name} ({m.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">System Prompt</Label>
              <Textarea value={String(config.systemPrompt ?? "")} onChange={e => setConfigField("systemPrompt", e.target.value)}
                rows={3} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder="你是一个专业助手..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">User Prompt 模板</Label>
              <Textarea value={String(config.userPrompt ?? "")} onChange={e => setConfigField("userPrompt", e.target.value)}
                rows={5} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder="请分析：{{input}}" />
            </div>
          </div>
        )}

        {/* Condition node config */}
        {node.data.nodeType === "condition" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
              使用 {"{{variable}}"} 引用上下文变量。右侧连线 = true，左侧连线 = false。
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">条件表达式</Label>
              <Input value={String(config.expression ?? "")} onChange={e => setConfigField("expression", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white text-sm h-8 font-mono"
                placeholder='{{score}} > 80' />
            </div>
          </div>
        )}

        {/* Human review config */}
        {node.data.nodeType === "human_review" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">
              工作流执行到此节点时将暂停，等待人工在运行面板中确认或拒绝后继续。
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">审核说明</Label>
              <Textarea value={String(config.reviewMessage ?? "")} onChange={e => setConfigField("reviewMessage", e.target.value)}
                rows={3} className="text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder="请审核以上 AI 输出内容，确认是否继续执行..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">超时时间（小时）</Label>
              <Input type="number" value={String(config.timeoutHours ?? 24)} onChange={e => setConfigField("timeoutHours", Number(e.target.value))}
                className="bg-[#0a0d14] border-white/10 text-white text-sm h-8" min={1} max={168} />
            </div>
          </div>
        )}

        {/* HTTP node config */}
        {node.data.nodeType === "http" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">HTTP 方法</Label>
              <Select value={String(config.method ?? "GET")} onValueChange={v => setConfigField("method", v)}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => (
                    <SelectItem key={m} value={m} className="text-slate-300 text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">URL</Label>
              <Input value={String(config.url ?? "")} onChange={e => setConfigField("url", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white text-sm h-8 font-mono"
                placeholder="https://api.example.com/{{path}}" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">请求体 (JSON)</Label>
              <Textarea value={String(config.body ?? "")} onChange={e => setConfigField("body", e.target.value)}
                rows={4} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder='{"key": "{{value}}"}' />
            </div>
          </div>
        )}

        {/* Knowledge node config */}
        {node.data.nodeType === "knowledge" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">知识库集合</Label>
              <Input value={String(config.collection ?? "")} onChange={e => setConfigField("collection", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white text-sm h-8"
                placeholder="prompt_best_practices" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">查询语句</Label>
              <Input value={String(config.query ?? "")} onChange={e => setConfigField("query", e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white text-sm h-8"
                placeholder="{{input}}" />
            </div>
          </div>
        )}

        {/* Code node config */}
        {node.data.nodeType === "code" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-400">
              代码节点支持 JavaScript，通过 <code>context</code> 对象访问上下文变量，返回值将写入上下文。
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">代码</Label>
              <Textarea value={String(config.code ?? "")} onChange={e => setConfigField("code", e.target.value)}
                rows={8} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                placeholder={"// context 包含所有上下文变量\nreturn { result: context.input.toUpperCase() };"} />
            </div>
          </div>
        )}

        {/* MCP node config */}
        {node.data.nodeType === "mcp" && (() => {
          const selectedTool = availableMcpTools.find(t => t.id === Number(config.mcpToolId));
          return (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">MCP 工具</Label>
                <Select
                  value={String(config.mcpToolId ?? "")}
                  onValueChange={v => {
                    setConfigField("mcpToolId", Number(v));
                    setConfigField("capabilityName", "");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                    <SelectValue placeholder="选择 MCP 工具..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-white/10">
                    {availableMcpTools.map(t => (
                      <SelectItem key={t.id} value={String(t.id)} className="text-slate-300 text-xs">
                        {t.name} <span className="text-slate-600 ml-1">{t.slug}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTool && (
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">能力 (Capability)</Label>
                  <Select
                    value={String(config.capabilityName ?? "")}
                    onValueChange={v => setConfigField("capabilityName", v)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                      <SelectValue placeholder="选择能力..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                      {selectedTool.capabilities.map(cap => (
                        <SelectItem key={cap.name} value={cap.name} className="text-slate-300 text-xs">
                          <span className="font-mono">{cap.name}</span>
                          {cap.description && <span className="text-slate-600 ml-1 text-[10px]">{cap.description}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">请求参数 (JSON)</Label>
                <Textarea
                  value={typeof config.payload === "string" ? config.payload : JSON.stringify(config.payload ?? {}, null, 2)}
                  onChange={e => setConfigField("payload", e.target.value)}
                  rows={5} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
                  placeholder='{"query": "{{input}}"}'
                />
              </div>
              <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-2.5 text-[10px] text-pink-400">
                支持 {"{{variable}}"} 占位符从上下文读取变量
              </div>
            </div>
          );
        })()}

        {/* Input/Output node — minimal config */}
        {(node.data.nodeType === "input" || node.data.nodeType === "output") && (
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">描述</Label>
            <Textarea value={String(config.description ?? "")} onChange={e => setConfigField("description", e.target.value)}
              rows={3} className="text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
              placeholder="节点描述..." />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/8">
        <Button onClick={handleSave} className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2" size="sm">
          <Save className="h-4 w-4" />保存配置
        </Button>
      </div>
    </div>
  );
}

// ─── Run Panel ────────────────────────────────────────────────────────────────
function RunPanel({
  agentId,
  onClose,
}: {
  agentId: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [inputJson, setInputJson] = useState('{\n  "query": "test"\n}');
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: runs } = trpc.agents.listRuns.useQuery({ agentId, limit: 10 });
  const { data: activeRun } = trpc.agents.getRun.useQuery(
    { runId: activeRunId ?? 0 },
    { enabled: !!activeRunId && polling, refetchInterval: polling ? 1500 : false }
  );

  // Stop polling when run finishes
  useEffect(() => {
    if (activeRun && ["completed", "failed", "cancelled", "paused"].includes(activeRun.status)) {
      setPolling(false);
    }
  }, [activeRun?.status]);

  const runMutation = trpc.agents.run.useMutation({
    onSuccess: (data) => {
      setActiveRunId(data.runId);
      setPolling(true);
      utils.agents.listRuns.invalidate({ agentId });
    },
    onError: (e) => toast.error(`运行失败：${e.message}`),
  });

  const resumeMutation = trpc.agents.resumeRun.useMutation({
    onSuccess: () => {
      setPolling(true);
      toast.success("已批准，继续执行");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRun = () => {
    try {
      const parsed = JSON.parse(inputJson);
      runMutation.mutate({ agentId, inputData: parsed });
    } catch {
      toast.error("输入 JSON 格式有误");
    }
  };

  const nodeLogs = (activeRun?.nodeExecutionLog ?? []) as Array<{
    nodeId: string; nodeType: string; label: string; status: string;
    startedAt?: string; completedAt?: string; error?: string; durationMs?: number;
  }>;

  const statusColor: Record<string, string> = {
    completed: "text-emerald-400", failed: "text-red-400", running: "text-violet-400",
    waiting_review: "text-amber-400", pending: "text-slate-500", skipped: "text-slate-600",
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">运行测试</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-xs">输入参数 (JSON)</Label>
          <Textarea value={inputJson} onChange={e => setInputJson(e.target.value)}
            rows={5} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y" />
        </div>
        <Button onClick={handleRun} disabled={runMutation.isPending}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2" size="sm">
          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          运行 Agent
        </Button>

        {/* Active run status */}
        {activeRun && (
          <div className="rounded-xl border border-white/8 bg-[#0a0d14] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                {activeRun.status === "running" && <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />}
                {activeRun.status === "completed" && <div className="h-3 w-3 rounded-full bg-emerald-400" />}
                {activeRun.status === "failed" && <div className="h-3 w-3 rounded-full bg-red-400" />}
                {activeRun.status === "paused" && <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />}
                <span className="text-sm font-medium text-white">
                  {activeRun.status === "running" ? "执行中..." :
                   activeRun.status === "completed" ? "执行完成" :
                   activeRun.status === "failed" ? "执行失败" :
                   activeRun.status === "paused" ? "等待人工审核" :
                   activeRun.status === "cancelled" ? "已取消" : activeRun.status}
                </span>
              </div>
              {polling && (
                <button onClick={() => setPolling(false)} className="text-xs text-slate-500 hover:text-slate-300">
                  停止轮询
                </button>
              )}
            </div>

            {/* Node execution log */}
            <div className="divide-y divide-white/5">
              {nodeLogs.map((log, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    log.status === "completed" ? "bg-emerald-400" :
                    log.status === "failed" ? "bg-red-400" :
                    log.status === "running" ? "bg-violet-400 animate-pulse" :
                    log.status === "waiting_review" ? "bg-amber-400 animate-pulse" :
                    "bg-slate-600"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-200 truncate">{log.label}</p>
                    <p className="text-[10px] text-slate-600">{log.nodeType}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${statusColor[log.status] ?? "text-slate-500"}`}>
                      {log.status === "completed" ? "✓" : log.status === "failed" ? "✗" :
                       log.status === "running" ? "..." : log.status === "waiting_review" ? "⏸" : "○"}
                    </p>
                    {log.durationMs && <p className="text-[10px] text-slate-600">{log.durationMs}ms</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Human review actions */}
            {activeRun.status === "paused" && (
              <div className="p-4 border-t border-white/8 space-y-2">
                <p className="text-xs text-amber-400 font-medium">需要人工审核</p>
                <p className="text-xs text-slate-500">工作流已暂停，请确认是否继续执行。</p>
                <div className="flex gap-2">
                  <Button onClick={() => resumeMutation.mutate({ runId: activeRun.id, approved: true })}
                    disabled={resumeMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white" size="sm">
                    批准继续
                  </Button>
                  <Button onClick={() => resumeMutation.mutate({ runId: activeRun.id, approved: false, reviewNote: "人工拒绝" })}
                    disabled={resumeMutation.isPending}
                    variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10" size="sm">
                    拒绝
                  </Button>
                </div>
              </div>
            )}

            {/* Error message */}
            {activeRun.status === "failed" && activeRun.errorMessage && (
              <div className="p-4 border-t border-white/8">
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{activeRun.errorMessage}</p>
                </div>
              </div>
            )}

            {/* Output */}
            {activeRun.status === "completed" && activeRun.outputData && (
              <div className="p-4 border-t border-white/8">
                <p className="text-xs text-slate-500 mb-2 font-medium">输出结果</p>
                <pre className="text-xs text-emerald-300 font-mono bg-black/20 p-3 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(activeRun.outputData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Run history */}
        {runs && runs.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 font-medium mb-2">历史运行</p>
            <div className="space-y-1">
              {runs.slice(0, 5).map(run => (
                <button key={run.id} onClick={() => { setActiveRunId(run.id); setPolling(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    activeRunId === run.id ? "bg-violet-500/10 border border-violet-500/20" : "hover:bg-white/3"
                  }`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    run.status === "completed" ? "bg-emerald-400" :
                    run.status === "failed" ? "bg-red-400" :
                    run.status === "running" ? "bg-violet-400" :
                    run.status === "paused" ? "bg-amber-400" : "bg-slate-600"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300">Run #{run.id}</p>
                    <p className="text-[10px] text-slate-600">{new Date(run.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs ${statusColor[run.status] ?? "text-slate-500"}`}>{run.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main AgentCanvas Page ────────────────────────────────────────────────────
let nodeCounter = 0;
function makeNodeId() { return `node_${++nodeCounter}_${Date.now()}`; }

export default function AgentCanvas() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const agentId = Number(params.id);

  const { data: agent, isLoading } = trpc.agents.get.useQuery({ id: agentId }, { enabled: !!agentId });
  const { data: availableSkills } = trpc.agents.getAvailableSkills.useQuery();
  const { data: availableModels } = trpc.agents.getAvailableModels.useQuery();
  const { data: availableMcpTools } = trpc.agents.getAvailableMcpTools.useQuery();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node<AgentNodeData> | null>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const saveWorkflowMutation = trpc.agents.saveWorkflow.useMutation({
    onSuccess: () => { toast.success("工作流已保存"); setIsDirty(false); },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  });

  // Load workflow from agent data
  useEffect(() => {
    if (!agent?.workflowJson) return;
    const wf = agent.workflowJson as { nodes?: unknown[]; edges?: unknown[] };
    if (wf.nodes?.length) {
      setNodes((wf.nodes as Node<AgentNodeData>[]).map(n => ({
        ...n,
        type: "agentNode",
      })));
    }
    if (wf.edges?.length) {
      setEdges(wf.edges as Edge[]);
    }
  }, [agent?.id]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({
      ...connection,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#7c3aed", strokeWidth: 2 },
    }, eds));
    setIsDirty(true);
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData("application/agentnode") as AgentNodeType;
    if (!nodeType || !reactFlowWrapper.current) return;

    const palette = NODE_PALETTE.find(p => p.type === nodeType);
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = {
      x: event.clientX - bounds.left - 80,
      y: event.clientY - bounds.top - 40,
    };

    const newNode: Node<AgentNodeData> = {
      id: makeNodeId(),
      type: "agentNode",
      position,
      data: {
        label: palette?.label ?? nodeType,
        nodeType,
        config: {},
      },
    };
    setNodes(nds => [...nds, newNode]);
    setIsDirty(true);
  }, [setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<AgentNodeData>) => {
    setSelectedNode(node);
    setShowRunPanel(false);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeUpdate = useCallback((id: string, data: Partial<AgentNodeData>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
    setIsDirty(true);
  }, [setNodes]);

  const handleSave = () => {
    saveWorkflowMutation.mutate({
      id: agentId,
      workflow: {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.data.nodeType,
          label: n.data.label,
          config: n.data.config,
          position: n.position,
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          label: typeof e.label === "string" ? e.label : undefined,
          type: e.type ?? "smoothstep",
        })),
      },
    });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
  );

  if (!agent) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <AlertCircle className="h-8 w-8 text-slate-600" />
      <p className="text-slate-400">Agent 不存在</p>
      <Button onClick={() => navigate("/agents")} variant="outline" size="sm">返回列表</Button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#080b11]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-[#0d1117] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/agents")}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">{agent.name}</span>
            <span className="text-xs text-slate-500 font-mono">{agent.slug}</span>
          </div>
          {isDirty && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">未保存</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{nodes.length} 节点 · {edges.length} 连线</span>
          <Button variant="outline" size="sm" onClick={() => { setShowRunPanel(true); setSelectedNode(null); }}
            className="border-white/10 text-slate-300 hover:bg-white/5 gap-1.5 h-7 text-xs">
            <Play className="h-3.5 w-3.5" />运行测试
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveWorkflowMutation.isPending || !isDirty}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-1.5 h-7 text-xs">
            {saveWorkflowMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />}
            保存
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Node palette */}
        <div className="w-52 flex-shrink-0 border-r border-white/8 bg-[#0d1117] flex flex-col">
          <div className="px-3 py-2.5 border-b border-white/8">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">节点类型</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {NODE_PALETTE.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={e => e.dataTransfer.setData("application/agentnode", item.type)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors group"
              >
                <div className={`rounded-lg p-1.5 ${item.bgColor} flex-shrink-0`}>
                  <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{item.label}</p>
                  <p className="text-[10px] text-slate-600 truncate">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/8">
            <p className="text-[10px] text-slate-600 text-center">拖拽节点到画布</p>
          </div>
        </div>

        {/* Center: React Flow canvas */}
        <div className="flex-1 min-w-0 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={e => { onNodesChange(e); setIsDirty(true); }}
            onEdgesChange={e => { onEdgesChange(e); setIsDirty(true); }}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "#7c3aed", strokeWidth: 2 },
            }}
            style={{ background: "#080b11" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.04)" />
            <Controls style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }} />
            <MiniMap
              style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}
              nodeColor={n => NODE_COLOR_MAP[(n.data as AgentNodeData)?.nodeType] ?? "#475569"}
              maskColor="rgba(0,0,0,0.5)"
            />
            {/* Empty state */}
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-20 flex flex-col items-center gap-3 text-center pointer-events-none">
                  <div className="rounded-2xl border border-white/8 bg-[#0d1117]/80 backdrop-blur p-8 max-w-sm">
                    <Bot className="h-10 w-10 text-violet-500/40 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-400 mb-1">画布为空</p>
                    <p className="text-xs text-slate-600">从左侧拖拽节点到此处开始编排工作流</p>
                  </div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Right: Property panel or Run panel */}
        {(selectedNode || showRunPanel) && (
          <div className="w-72 flex-shrink-0">
            {showRunPanel ? (
              <RunPanel agentId={agentId} onClose={() => setShowRunPanel(false)} />
            ) : selectedNode ? (
              <NodePropertyPanel
                node={selectedNode}
                onUpdate={handleNodeUpdate}
                onClose={() => setSelectedNode(null)}
                availableSkills={availableSkills ?? []}
                availableModels={availableModels ?? []}
                availableMcpTools={availableMcpTools ?? []}
              />
            ) : null}
          </div>
        )}
      </div>
      {/* Phase 6 — Agent 上下文感知 AI 助手 */}
      <AIPlatformAssistant
        agentId={agentId || undefined}
        context={agent ? `当前编辑 Agent：${agent.name}，节点数：${nodes.length}，连线数：${edges.length}` : undefined}
      />
    </div>
  );
}
