import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, RefreshCw, Activity, Zap, AlertCircle, CheckCircle2,
  Play, Trash2, Edit, ChevronDown, ChevronRight, Clock, Globe,
  Shield, Code2, Database, Wrench, Terminal, Loader2, Eye, EyeOff
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type McpTool = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: "rest_api" | "openapi" | "database" | "custom_script";
  config: Record<string, unknown> | null;
  authConfig: Record<string, unknown> | null;
  capabilities: unknown[];
  retryCount: number | null;
  timeoutMs: number | null;
  status: "active" | "inactive" | "error" | null;
  lastHealthCheck: Date | null;
  lastLatencyMs: number | null;
  projectId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type Capability = {
  name: string;
  description?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_ICONS = {
  rest_api: Globe,
  openapi: Code2,
  database: Database,
  custom_script: Terminal,
};

const TYPE_LABELS = {
  rest_api: "REST API",
  openapi: "OpenAPI",
  database: "数据库",
  custom_script: "自定义脚本",
};

const AUTH_LABELS: Record<string, string> = {
  none: "无认证",
  api_key: "API Key",
  bearer: "Bearer Token",
  basic: "Basic Auth",
  oauth2: "OAuth 2.0",
};

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />正常</Badge>;
  if (status === "error")
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs"><AlertCircle className="w-3 h-3 mr-1" />异常</Badge>;
  return <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 text-xs">未知</Badge>;
}

// ─── Create / Edit Dialog ─────────────────────────────────────────────────────
function McpFormDialog({
  open,
  onClose,
  tool,
}: {
  open: boolean;
  onClose: () => void;
  tool?: McpTool | null;
}) {
  const utils = trpc.useUtils();
  const isEdit = !!tool;

  const [step, setStep] = useState(0);
  const [name, setName] = useState(tool?.name ?? "");
  const [slug, setSlug] = useState(tool?.slug ?? "");
  const [description, setDescription] = useState(tool?.description ?? "");
  const [type, setType] = useState<"rest_api" | "openapi" | "database" | "custom_script">(
    tool?.type ?? "rest_api"
  );
  const [baseUrl, setBaseUrl] = useState(
    ((tool?.config as Record<string, unknown>)?.baseUrl as string) ?? ""
  );
  const [authType, setAuthType] = useState<string>(
    ((tool?.authConfig as Record<string, unknown>)?.type as string) ?? "none"
  );
  const [authKey, setAuthKey] = useState("");
  const [authHeader, setAuthHeader] = useState("X-API-Key");
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>(
    (tool?.capabilities as Capability[]) ?? []
  );
  const [retryCount, setRetryCount] = useState(tool?.retryCount ?? 2);
  const [timeoutMs, setTimeoutMs] = useState(tool?.timeoutMs ?? 30000);

  const createMutation = trpc.mcp.create.useMutation({
    onSuccess: () => {
      toast.success("MCP 工具创建成功");
      utils.mcp.list.invalidate();
      utils.mcp.getStats.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.mcp.update.useMutation({
    onSuccess: () => {
      toast.success("MCP 工具更新成功");
      utils.mcp.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const buildAuthConfig = () => {
    if (authType === "api_key") return { type: "api_key" as const, key: authKey, header: authHeader };
    if (authType === "bearer") return { type: "bearer" as const, token: authToken };
    if (authType === "basic") return { type: "basic" as const, username: authUser, password: authPass };
    return { type: "none" as const };
  };

  const handleSubmit = () => {
    const authConfig = buildAuthConfig();
    if (isEdit && tool) {
      updateMutation.mutate({
        id: tool.id,
        name,
        description,
        config: { baseUrl, headers: {} },
        authConfig,
        capabilities,
        retryCount,
        timeoutMs,
      });
    } else {
      createMutation.mutate({
        name,
        slug,
        description,
        type,
        config: { baseUrl, headers: {} },
        authConfig,
        capabilities,
        retryCount,
        timeoutMs,
      });
    }
  };

  const addCapability = () => {
    setCapabilities([...capabilities, { name: "", description: "", method: "POST", path: "/" }]);
  };

  const updateCap = (i: number, field: keyof Capability, value: string) => {
    setCapabilities(capabilities.map((c, idx) => {
      if (idx !== i) return c;
      if (field === 'method') return { ...c, method: value as Capability['method'] };
      return { ...c, [field]: value };
    }));
  };

  const removeCap = (i: number) => {
    setCapabilities(capabilities.filter((_, idx) => idx !== i));
  };

  const steps = ["基本信息", "连接配置", "认证方式", "能力定义"];
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "编辑 MCP 工具" : "接入新 MCP 工具"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2 flex-wrap">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === i
                  ? "bg-violet-600 text-white"
                  : i < step
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] border border-current">
                {i < step ? "✓" : i + 1}
              </span>
              {s}
            </button>
          ))}
        </div>

        {/* Step 0: 基本信息 */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">工具名称 *</Label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!isEdit)
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/\s+/g, "-")
                          .replace(/[^a-z0-9._-]/g, "")
                      );
                  }}
                  placeholder="如：天气查询 API"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">标识符 (slug) *</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="如：weather-api"
                  disabled={isEdit}
                  className="bg-zinc-800 border-zinc-700 text-white disabled:opacity-50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">工具类型 *</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["rest_api", "openapi", "database", "custom_script"] as const).map((t) => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        type === t
                          ? "border-violet-500 bg-violet-500/10 text-white"
                          : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium">{TYPE_LABELS[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">描述</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述该工具的用途..."
                className="bg-zinc-800 border-zinc-700 text-white resize-none"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 1: 连接配置 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Base URL *</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <p className="text-xs text-zinc-500">所有能力调用的基础地址，不含末尾斜杠</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">重试次数</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={retryCount}
                  onChange={(e) => setRetryCount(Number(e.target.value))}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">超时时间 (ms)</Label>
                <Input
                  type="number"
                  min={1000}
                  max={120000}
                  step={1000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 认证方式 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">认证类型</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {Object.entries(AUTH_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-white">
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {authType === "api_key" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Header 名称</Label>
                  <Input
                    value={authHeader}
                    onChange={(e) => setAuthHeader(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">API Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={authKey}
                      onChange={(e) => setAuthKey(e.target.value)}
                      placeholder="sk-..."
                      className="bg-zinc-800 border-zinc-700 text-white pr-10"
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {authType === "bearer" && (
              <div className="space-y-2">
                <Label className="text-zinc-300">Bearer Token</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="eyJhbGci..."
                    className="bg-zinc-800 border-zinc-700 text-white pr-10"
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {authType === "basic" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">用户名</Label>
                  <Input
                    value={authUser}
                    onChange={(e) => setAuthUser(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">密码</Label>
                  <Input
                    type="password"
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
              </div>
            )}

            {authType === "none" && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm">
                <Shield className="w-4 h-4" />
                该工具无需认证，所有请求将直接发送
              </div>
            )}
          </div>
        )}

        {/* Step 3: 能力定义 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">定义该工具对外暴露的可调用能力</p>
              <Button
                size="sm"
                variant="outline"
                onClick={addCapability}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="w-3 h-3 mr-1" />添加能力
              </Button>
            </div>
            {capabilities.length === 0 && (
              <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-700 rounded-lg">
                暂无能力定义，点击"添加能力"开始配置
              </div>
            )}
            {capabilities.map((cap, i) => (
              <div key={i} className="p-4 rounded-lg bg-zinc-800 border border-zinc-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">能力 #{i + 1}</span>
                  <button
                    onClick={() => removeCap(i)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">能力名称 *</Label>
                    <Input
                      value={cap.name}
                      onChange={(e) => updateCap(i, "name", e.target.value)}
                      placeholder="如：get_weather"
                      className="bg-zinc-900 border-zinc-600 text-white text-sm h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">描述</Label>
                    <Input
                      value={cap.description ?? ""}
                      onChange={(e) => updateCap(i, "description", e.target.value)}
                      placeholder="获取指定城市天气"
                      className="bg-zinc-900 border-zinc-600 text-white text-sm h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">HTTP 方法</Label>
                    <Select
                      value={cap.method ?? "POST"}
                      onValueChange={(v) => updateCap(i, "method", v)}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-600 text-white h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                          <SelectItem key={m} value={m} className="text-white text-sm">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">路径</Label>
                    <Input
                      value={cap.path ?? "/"}
                      onChange={(e) => updateCap(i, "path", e.target.value)}
                      placeholder="/weather"
                      className="bg-zinc-900 border-zinc-600 text-white text-sm h-8"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              上一步
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              下一步
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "保存更改" : "完成接入"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoke Sandbox Dialog ────────────────────────────────────────────────────
function InvokeDialog({
  open,
  onClose,
  tool,
}: {
  open: boolean;
  onClose: () => void;
  tool: McpTool;
}) {
  const [selectedCap, setSelectedCap] = useState("");
  const [payload, setPayload] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [invokeError, setInvokeError] = useState("");

  const invokeMutation = trpc.mcp.invoke.useMutation({
    onSuccess: (data) => {
      setResult(JSON.stringify(data, null, 2));
      setInvokeError("");
    },
    onError: (e) => setInvokeError(e.message),
  });

  const caps = (tool.capabilities as Capability[]) ?? [];

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-violet-400" />
            调用沙箱 — {tool.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">选择能力</Label>
            <Select value={selectedCap} onValueChange={setSelectedCap}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue placeholder="选择要调用的能力..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {caps.map((c) => (
                  <SelectItem key={c.name} value={c.name} className="text-white">
                    <span className="font-mono text-xs mr-2 text-violet-400">
                      {c.method ?? "POST"}
                    </span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">请求 Payload (JSON)</Label>
            <Textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm resize-none"
              rows={5}
              placeholder='{"key": "value"}'
            />
          </div>
          {result && (
            <div className="space-y-1">
              <Label className="text-zinc-300 text-xs">响应结果</Label>
              <pre className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs text-emerald-400 overflow-auto max-h-48 font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {invokeError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {invokeError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              let parsedPayload: Record<string, unknown> = {};
              try {
                parsedPayload = JSON.parse(payload);
              } catch {
                toast.error("Payload JSON 格式错误");
                return;
              }
              invokeMutation.mutate({
                id: tool.id,
                capabilityName: selectedCap,
                payload: parsedPayload,
              });
            }}
            disabled={!selectedCap || invokeMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {invokeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            发送请求
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tool Card ────────────────────────────────────────────────────────────────
function ToolCard({
  tool,
  onEdit,
  onInvoke,
}: {
  tool: McpTool;
  onEdit: () => void;
  onInvoke: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const healthCheck = trpc.mcp.healthCheck.useMutation({
    onSuccess: (data) => {
      if (data.status === "active") toast.success(`健康检查通过，延迟 ${data.latencyMs}ms`);
      else toast.error(`健康检查失败：${data.error}`);
      utils.mcp.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.mcp.delete.useMutation({
    onSuccess: () => {
      toast.success("工具已删除");
      utils.mcp.list.invalidate();
      utils.mcp.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const Icon = TYPE_ICONS[tool.type];
  const caps = (tool.capabilities as Capability[]) ?? [];
  const authType =
    ((tool.authConfig as Record<string, unknown>)?.type as string) ?? "none";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white text-sm">{tool.name}</span>
                <code className="text-xs text-zinc-500 font-mono">{tool.slug}</code>
                <StatusBadge status={tool.status} />
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                {tool.description || "暂无描述"}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {TYPE_LABELS[tool.type]}
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {AUTH_LABELS[authType] ?? authType}
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {caps.length} 个能力
                </span>
                {tool.lastLatencyMs != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {tool.lastLatencyMs}ms
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => healthCheck.mutate({ id: tool.id })}
              disabled={healthCheck.isPending}
              className="text-zinc-400 hover:text-white h-7 px-2"
              title="健康检查"
            >
              {healthCheck.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Activity className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onInvoke}
              className="text-zinc-400 hover:text-violet-400 h-7 px-2"
              title="调用沙箱"
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="text-zinc-400 hover:text-white h-7 px-2"
              title="编辑"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`确认删除 "${tool.name}"？`))
                  deleteMutation.mutate({ id: tool.id });
              }}
              disabled={deleteMutation.isPending}
              className="text-zinc-400 hover:text-red-400 h-7 px-2"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-400 hover:text-white h-7 px-2"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {expanded && caps.length > 0 && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <p className="text-xs font-medium text-zinc-400 mb-2">已定义能力</p>
          <div className="space-y-1.5">
            {caps.map((cap, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                    cap.method === "GET"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : cap.method === "DELETE"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-blue-500/15 text-blue-400"
                  }`}
                >
                  {cap.method ?? "POST"}
                </span>
                <code className="text-violet-400">{cap.path ?? "/"}</code>
                <span className="text-zinc-400 font-medium">{cap.name}</span>
                {cap.description && (
                  <span className="text-zinc-600">— {cap.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function McpPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editTool, setEditTool] = useState<McpTool | null>(null);
  const [invokeTool, setInvokeTool] = useState<McpTool | null>(null);

  const { data: tools = [], isLoading, refetch } = trpc.mcp.list.useQuery();
  const { data: stats } = trpc.mcp.getStats.useQuery();
  const { data: logs = [] } = trpc.mcp.getLogs.useQuery({ limit: 50 });

  const statCards = [
    { label: "工具总数", value: stats?.total ?? 0, icon: Wrench, color: "text-violet-400" },
    { label: "正常运行", value: stats?.active ?? 0, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "异常工具", value: stats?.error ?? 0, icon: AlertCircle, color: "text-red-400" },
    { label: "已停用", value: stats?.inactive ?? 0, icon: Activity, color: "text-zinc-400" },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">MCP 工具管理</h1>
          <p className="text-sm text-zinc-500 mt-0.5">管理外部工具接入、能力定义与调用监控</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />刷新
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />接入工具
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color} shrink-0`} />
              <div>
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-zinc-500">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tools">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger
            value="tools"
            className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white"
          >
            工具列表
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white"
          >
            调用日志
          </TabsTrigger>
        </TabsList>

        {/* Tools Tab */}
        <TabsContent value="tools" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />加载中...
            </div>
          ) : (tools as McpTool[]).length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
              <Wrench className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">暂无 MCP 工具</p>
              <p className="text-zinc-600 text-sm mt-1">
                点击"接入工具"开始配置第一个外部工具
              </p>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-4 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />接入工具
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {(tools as McpTool[]).map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onEdit={() => setEditTool(tool)}
                  onInvoke={() => setInvokeTool(tool)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-300">最近调用记录</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                显示最近 50 条 MCP 工具操作日志
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm">暂无调用记录</div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-800 text-xs"
                    >
                      <span
                        className={`px-2 py-0.5 rounded font-medium shrink-0 ${
                          log.result === "success"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {log.result === "success" ? "成功" : "失败"}
                      </span>
                      <code className="text-violet-400 font-mono">{log.action}</code>
                      {log.resourceId && (
                        <span className="text-zinc-500">ID: {log.resourceId}</span>
                      )}
                      {log.errorMessage && typeof log.errorMessage === 'string' && (
                        <span className="text-red-400 truncate max-w-xs">
                          {log.errorMessage}
                        </span>
                      )}
                      <span className="ml-auto text-zinc-600 shrink-0">
                        {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <McpFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {editTool && (
        <McpFormDialog
          open={!!editTool}
          onClose={() => setEditTool(null)}
          tool={editTool}
        />
      )}
      {invokeTool && (
        <InvokeDialog
          open={!!invokeTool}
          onClose={() => setInvokeTool(null)}
          tool={invokeTool}
        />
      )}
    </div>
  );
}
