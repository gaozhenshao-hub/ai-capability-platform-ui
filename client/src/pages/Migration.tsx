/**
 * Migration.tsx — 跨系统数据迁移管理页面
 * 支持：
 * 1. 连接状态检查（Listing 工具 / 产品开发工具）
 * 2. 从对端系统拉取 Skill 列表并批量导入
 * 3. 从对端系统拉取知识库条目并批量导入
 * 4. 导出本平台 Skill 到对端系统
 * 5. 手动粘贴 JSON 批量导入
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Link2,
  Unlink,
  FileJson,
  BookOpen,
  Zap,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

type PeerSystem = "listing" | "product";

// ─── 连接状态卡片 ─────────────────────────────────────────────────────────────
function ConnectionCard({
  system,
  label,
  description,
}: {
  system: PeerSystem;
  label: string;
  description: string;
}) {
  const { data, isLoading, refetch } = trpc.migration.checkPeerConnection.useQuery(
    { system },
    { retry: false }
  );

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
          </div>
          {isLoading ? (
            <Badge variant="secondary" className="text-xs">检测中...</Badge>
          ) : data?.connected ? (
            <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" />已连接
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              <Unlink className="w-3 h-3 mr-1" />未连接
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {data?.connected && data.apiUrl && (
          <p className="text-xs text-muted-foreground font-mono truncate mb-2">{data.apiUrl}</p>
        )}
        {!data?.connected && data?.reason && (
          <p className="text-xs text-destructive mb-2">{data.reason}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          重新检测
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── 从对端导入 Skill ─────────────────────────────────────────────────────────
function ImportSkillsFromPeer() {
  const [system, setSystem] = useState<PeerSystem>("listing");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);

  const { data: peerSkills = [], isLoading, refetch } = trpc.migration.listPeerSkills.useQuery(
    { system },
    { retry: false, enabled: false }
  );

  const importMutation = trpc.migration.importSkills.useMutation({
    onSuccess: (result) => {
      toast.success(`导入完成：新增 ${result.created} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 个`);
      setSelectedIds(new Set());
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === peerSkills.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(peerSkills.map(s => s.id)));
  };

  const handleImport = () => {
    const toImport = peerSkills.filter(s => selectedIds.has(s.id));
    importMutation.mutate({
      skills: toImport.map(s => ({
        name: s.name,
        description: s.description,
        category: s.category,
        systemPrompt: s.systemPrompt,
        promptTemplate: s.promptTemplate ?? s.systemPrompt ?? "",
      })),
      overwriteExisting: overwrite,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={system} onValueChange={(v) => setSystem(v as PeerSystem)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listing">Listing 工具</SelectItem>
            <SelectItem value="product">产品开发工具</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          拉取列表
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Switch id="overwrite-skill" checked={overwrite} onCheckedChange={setOverwrite} />
          <Label htmlFor="overwrite-skill" className="text-xs text-muted-foreground">覆盖已存在</Label>
        </div>
      </div>

      {peerSkills.length > 0 ? (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === peerSkills.length && peerSkills.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead className="text-xs">名称</TableHead>
                  <TableHead className="text-xs">分类</TableHead>
                  <TableHead className="text-xs">描述</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peerSkills.map((skill) => (
                  <TableRow key={skill.id} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleSelect(skill.id)}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(skill.id)}
                        onChange={() => toggleSelect(skill.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{skill.name}</TableCell>
                    <TableCell>
                      {skill.category && (
                        <Badge variant="secondary" className="text-xs">{skill.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {skill.description ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || importMutation.isPending}
            onClick={handleImport}
          >
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            导入选中 ({selectedIds.size})
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Zap className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">点击"拉取列表"从对端系统获取 Skill</p>
        </div>
      )}
    </div>
  );
}

// ─── 从对端导入知识库 ─────────────────────────────────────────────────────────
function ImportKnowledgeFromPeer() {
  const [system, setSystem] = useState<PeerSystem>("listing");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);

  const { data: peerItems = [], isLoading, refetch } = trpc.migration.listPeerKnowledge.useQuery(
    { system },
    { retry: false, enabled: false }
  );

  const importMutation = trpc.migration.importKnowledge.useMutation({
    onSuccess: (result) => {
      toast.success(`导入完成：新增 ${result.created} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
      setSelectedIds(new Set());
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleImport = () => {
    const toImport = peerItems.filter(s => selectedIds.has(s.id));
    importMutation.mutate({
      items: toImport.map(s => ({
        title: s.title,
        content: s.content,
        collection: s.collection,
        tags: Array.isArray(s.tags) ? s.tags : [],
        source: "manual" as const,
      })),
      overwriteExisting: overwrite,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={system} onValueChange={(v) => setSystem(v as PeerSystem)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listing">Listing 工具</SelectItem>
            <SelectItem value="product">产品开发工具</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          拉取列表
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Switch id="overwrite-kb" checked={overwrite} onCheckedChange={setOverwrite} />
          <Label htmlFor="overwrite-kb" className="text-xs text-muted-foreground">覆盖已存在</Label>
        </div>
      </div>

      {peerItems.length > 0 ? (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === peerItems.length && peerItems.length > 0}
                      onChange={() => {
                        if (selectedIds.size === peerItems.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(peerItems.map(i => i.id)));
                      }}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead className="text-xs">标题</TableHead>
                  <TableHead className="text-xs">集合</TableHead>
                  <TableHead className="text-xs">内容预览</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peerItems.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleSelect(item.id)}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{item.collection}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {item.content.slice(0, 60)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || importMutation.isPending}
            onClick={handleImport}
          >
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            导入选中 ({selectedIds.size})
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <BookOpen className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">点击"拉取列表"从对端系统获取知识库条目</p>
        </div>
      )}
    </div>
  );
}

// ─── 手动 JSON 导入 ───────────────────────────────────────────────────────────
function ManualJsonImport() {
  const [jsonText, setJsonText] = useState("");
  const [importType, setImportType] = useState<"skills" | "knowledge">("skills");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const importSkillsMutation = trpc.migration.importSkills.useMutation({
    onSuccess: (result) => {
      toast.success(`导入完成：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`);
      setPreview(null);
      setJsonText("");
    },
    onError: (err) => toast.error(err.message),
  });

  const importKbMutation = trpc.migration.importKnowledge.useMutation({
    onSuccess: (result) => {
      toast.success(`导入完成：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`);
      setPreview(null);
      setJsonText("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleParse = () => {
    setParseError(null);
    try {
      const parsed = JSON.parse(jsonText);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      setPreview(arr);
    } catch (e) {
      setParseError("JSON 格式错误，请检查输入");
    }
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    if (importType === "skills") {
      importSkillsMutation.mutate({
        skills: preview as Parameters<typeof importSkillsMutation.mutate>[0]["skills"],
        overwriteExisting: overwrite,
      });
    } else {
      importKbMutation.mutate({
        items: preview as Parameters<typeof importKbMutation.mutate>[0]["items"],
        overwriteExisting: overwrite,
      });
    }
  };

  const isPending = importSkillsMutation.isPending || importKbMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={importType} onValueChange={(v) => setImportType(v as "skills" | "knowledge")}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skills">Skill 列表</SelectItem>
            <SelectItem value="knowledge">知识库条目</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Switch id="overwrite-manual" checked={overwrite} onCheckedChange={setOverwrite} />
          <Label htmlFor="overwrite-manual" className="text-xs text-muted-foreground">覆盖已存在</Label>
        </div>
      </div>

      {/* JSON 格式提示 */}
      <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">
          {importType === "skills" ? "Skill JSON 格式示例：" : "知识库条目 JSON 格式示例："}
        </p>
        {importType === "skills" ? (
          <pre className="font-mono text-[11px] leading-relaxed">{`[
  {
    "name": "Listing 标题优化",
    "description": "优化亚马逊商品标题",
    "category": "listing",
    "systemPrompt": "你是一个亚马逊 Listing 专家...",
    "promptTemplate": "请优化以下标题：{{title}}"
  }
]`}</pre>
        ) : (
          <pre className="font-mono text-[11px] leading-relaxed">{`[
  {
    "title": "亚马逊标题优化规则",
    "content": "标题应包含核心关键词...",
    "collection": "listing_rules",
    "contentType": "rule",
    "tags": ["标题", "关键词"]
  }
]`}</pre>
        )}
      </div>

      <Textarea
        placeholder="粘贴 JSON 数据..."
        value={jsonText}
        onChange={e => { setJsonText(e.target.value); setPreview(null); setParseError(null); }}
        className="font-mono text-xs min-h-[160px] resize-y"
      />

      {parseError && (
        <div className="flex items-center gap-2 text-destructive text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          {parseError}
        </div>
      )}

      {!preview ? (
        <Button variant="outline" size="sm" onClick={handleParse} disabled={!jsonText.trim()}>
          <FileJson className="w-3.5 h-3.5 mr-1.5" />
          解析预览
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              解析成功：共 {preview.length} 条记录
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {preview.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {(item as Record<string, unknown>).name as string ??
                     (item as Record<string, unknown>).title as string ??
                     `条目 ${i + 1}`}
                  </span>
                </div>
              ))}
              {preview.length > 5 && (
                <p className="text-xs text-muted-foreground pl-5">... 还有 {preview.length - 5} 条</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirmImport} disabled={isPending}>
              <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
              {isPending ? "导入中..." : `确认导入 (${preview.length})`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
              重新编辑
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 导出到对端系统 ───────────────────────────────────────────────────────────
function ExportToPeer() {
  const [system, setSystem] = useState<PeerSystem>("listing");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: skills = [], isLoading } = trpc.skills.list.useQuery({});

  const exportMutation = trpc.migration.exportSkillsToPeer.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`已导出 ${result.exported} 个 Skill 到对端系统`);
        setSelectedIds(new Set());
      } else {
        toast.error(result.reason ?? "导出失败");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={system} onValueChange={(v) => setSystem(v as PeerSystem)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listing">Listing 工具</SelectItem>
            <SelectItem value="product">产品开发工具</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          已选 {selectedIds.size} / {skills.length}
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
      ) : skills.length > 0 ? (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === skills.length && skills.length > 0}
                      onChange={() => {
                        if (selectedIds.size === skills.length) setSelectedIds(new Set());
                        else setSelectedIds(new Set(skills.map(s => s.id)));
                      }}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead className="text-xs">名称</TableHead>
                  <TableHead className="text-xs">分类</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow key={skill.id} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleSelect(skill.id)}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(skill.id)}
                        onChange={() => toggleSelect(skill.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{skill.name}</TableCell>
                    <TableCell>
                      {skill.category && (
                        <Badge variant="secondary" className="text-xs">{skill.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={skill.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {skill.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || exportMutation.isPending}
            onClick={() => exportMutation.mutate({ system, skillIds: Array.from(selectedIds) })}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
            {exportMutation.isPending ? "导出中..." : `导出到 ${system === "listing" ? "Listing 工具" : "产品开发工具"} (${selectedIds.size})`}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Zap className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">暂无可导出的 Skill</p>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function Migration() {
  const { data: syncStatus } = trpc.migration.getSyncStatus.useQuery();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* 页头 */}
      <div>
        <h1 className="text-xl font-semibold">跨系统数据迁移</h1>
        <p className="text-sm text-muted-foreground mt-1">
          在亚马逊工具矩阵（Listing 工具 / 产品开发工具 / 运营 AI 工具）之间同步 Skill 和知识库数据
        </p>
      </div>

      {/* 连接状态 */}
      <div className="grid grid-cols-2 gap-4">
        <ConnectionCard
          system="listing"
          label="Listing 工具"
          description="amzlisting-a79tkwus.manus.space"
        />
        <ConnectionCard
          system="product"
          label="产品开发工具"
          description="配置 PRODUCT_TOOL_API_URL 和 PRODUCT_TOOL_API_KEY"
        />
      </div>

      {/* 同步状态提示 */}
      {syncStatus && !syncStatus.listing.configured && !syncStatus.product.configured && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">尚未配置对端系统连接</p>
            <p className="text-xs mt-0.5 opacity-80">
              请在项目 Secrets 中配置 <code className="font-mono">LISTING_TOOL_API_URL</code>、
              <code className="font-mono">LISTING_TOOL_API_KEY</code>（或 PRODUCT_TOOL_* 前缀）后重新检测。
              手动 JSON 导入功能无需配置即可使用。
            </p>
          </div>
        </div>
      )}

      {/* 功能标签页 */}
      <Tabs defaultValue="import-skills">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="import-skills" className="text-xs">
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            导入 Skill
          </TabsTrigger>
          <TabsTrigger value="import-knowledge" className="text-xs">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            导入知识库
          </TabsTrigger>
          <TabsTrigger value="manual-json" className="text-xs">
            <FileJson className="w-3.5 h-3.5 mr-1.5" />
            JSON 手动导入
          </TabsTrigger>
          <TabsTrigger value="export" className="text-xs">
            <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
            导出到对端
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import-skills">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">从对端系统导入 Skill</CardTitle>
              <CardDescription className="text-xs">
                选择来源系统，拉取其 Skill 列表，勾选后批量导入到本平台
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportSkillsFromPeer />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import-knowledge">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">从对端系统导入知识库</CardTitle>
              <CardDescription className="text-xs">
                选择来源系统，拉取其知识库条目，勾选后批量导入（状态为"待审核"）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportKnowledgeFromPeer />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual-json">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">手动 JSON 批量导入</CardTitle>
              <CardDescription className="text-xs">
                粘贴符合格式的 JSON 数组，解析预览后确认导入，无需配置对端连接
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ManualJsonImport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">导出 Skill 到对端系统</CardTitle>
              <CardDescription className="text-xs">
                选择本平台的 Skill，推送到 Listing 工具或产品开发工具（需对端已配置 migrationRouter）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExportToPeer />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
