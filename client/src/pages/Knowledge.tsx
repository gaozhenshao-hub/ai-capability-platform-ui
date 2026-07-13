import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  BookOpen, Search, Plus, Upload, Filter, ChevronRight,
  FileText, Tag, Clock, CheckCircle, XCircle, AlertCircle,
  Edit2, Trash2, Send, Bot, X, Loader2,
  FolderOpen, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AmzKbPanel } from "@/components/AmzKbPanel";

// ─── 类型 ──────────────────────────────────────────────────────────────────────
type KbItem = {
  id: number;
  collection: string;
  title: string;
  content: string;
  contentType: "text" | "example" | "rule" | "template";
  tags: string[] | null;
  status: "draft" | "pending_review" | "approved" | "rejected";
  source: "manual" | "auto";
  createdAt: Date;
  updatedAt: Date;
};

type Collection = {
  name: string;
  total: number;
  approved: number;
  draft: number;
  pending: number;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:          { label: "草稿",   color: "bg-slate-500/20 text-slate-400 border-slate-500/30",   icon: FileText },
  pending_review: { label: "待审核", color: "bg-amber-500/20 text-amber-400 border-amber-500/30",   icon: AlertCircle },
  approved:       { label: "已发布", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  rejected:       { label: "已拒绝", color: "bg-red-500/20 text-red-400 border-red-500/30",         icon: XCircle },
};

const CONTENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  text:     { label: "文本",   color: "bg-blue-500/20 text-blue-400" },
  example:  { label: "示例",   color: "bg-purple-500/20 text-purple-400" },
  rule:     { label: "规则",   color: "bg-orange-500/20 text-orange-400" },
  template: { label: "模板",   color: "bg-teal-500/20 text-teal-400" },
};

// ─── 条目编辑对话框 ────────────────────────────────────────────────────────────
function ItemDialog({ open, onClose, item, collections, defaultCollection }: {
  open: boolean; onClose: () => void; item?: KbItem | null;
  collections: Collection[]; defaultCollection?: string;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    title: item?.title ?? "",
    content: item?.content ?? "",
    contentType: (item?.contentType ?? "text") as KbItem["contentType"],
    tags: (item?.tags ?? []).join(", "),
    collection: item?.collection ?? defaultCollection ?? "",
    customCollection: "",
    status: (item?.status === "draft" || !item ? "draft" : "pending_review") as "draft" | "pending_review",
  });

  const createMutation = trpc.knowledge.create.useMutation({
    onSuccess: () => { toast.success("条目已创建"); utils.knowledge.list.invalidate(); utils.knowledge.getCollections.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.knowledge.update.useMutation({
    onSuccess: () => { toast.success("条目已更新"); utils.knowledge.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const col = form.customCollection || form.collection;
    if (item) {
      updateMutation.mutate({ id: item.id, title: form.title, content: form.content, contentType: form.contentType, tags, collection: col });
    } else {
      createMutation.mutate({ title: form.title, content: form.content, contentType: form.contentType, tags, collection: col, status: form.status });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const col = form.customCollection || form.collection;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0d1117] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{item ? "编辑条目" : "新建条目"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">集合</Label>
              <Select value={form.collection} onValueChange={v => setForm(f => ({ ...f, collection: v, customCollection: "" }))}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue placeholder="选择集合..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {collections.map(c => (
                    <SelectItem key={c.name} value={c.name} className="text-slate-300 text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={form.customCollection} onChange={e => setForm(f => ({ ...f, customCollection: e.target.value }))}
                className="h-7 text-xs bg-[#0a0d14] border-white/10 text-white mt-1" placeholder="或输入新集合名称..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">内容类型</Label>
              <Select value={form.contentType} onValueChange={v => setForm(f => ({ ...f, contentType: v as KbItem["contentType"] }))}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {Object.entries(CONTENT_TYPE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-slate-300 text-xs">{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">标题 *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm" placeholder="条目标题..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">内容 * (支持 Markdown)</Label>
            <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={10} className="font-mono text-xs bg-[#0a0d14] border-white/10 text-slate-200 resize-y"
              placeholder="在此输入知识库内容，支持 Markdown 格式..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">标签（逗号分隔）</Label>
            <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              className="bg-[#0a0d14] border-white/10 text-white h-8 text-sm" placeholder="亚马逊, Listing, SEO..." />
          </div>
          {!item && (
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">初始状态</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "draft" | "pending_review" }))}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  <SelectItem value="draft" className="text-slate-300 text-xs">草稿（保存后继续编辑）</SelectItem>
                  <SelectItem value="pending_review" className="text-slate-300 text-xs">直接提交审核</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-400 hover:text-white">取消</Button>
          <Button onClick={handleSave} disabled={isPending || !form.title || !form.content || !col}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {item ? "保存更改" : "创建条目"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 文档上传对话框 ────────────────────────────────────────────────────────────
function UploadDialog({ open, onClose, collections }: { open: boolean; onClose: () => void; collections: Collection[] }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [collection, setCollection] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [autoExtract, setAutoExtract] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const uploadMutation = trpc.knowledge.uploadDocument.useMutation({
    onSuccess: (data) => {
      setDone(true);
      utils.knowledge.list.invalidate();
      utils.knowledge.getCollections.invalidate();
      toast.success(`文档已上传：${data.title}`);
      setUploading(false);
    },
    onError: (e) => { toast.error(e.message); setUploading(false); },
  });

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("请选择文件");
    const col = newCollection || collection;
    if (!col) return toast.error("请选择或输入集合名称");
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({ collection: col, fileName: file.name, fileContent: base64, mimeType: file.type || "text/plain", autoExtract });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-[#0d1117] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-400" />上传文档
          </DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium text-emerald-400">上传成功！</p>
            <Button onClick={onClose} className="bg-violet-600 hover:bg-violet-500 text-white">完成</Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">目标集合</Label>
              <Select value={collection} onValueChange={setCollection}>
                <SelectTrigger className="h-8 text-xs bg-[#0a0d14] border-white/10 text-slate-300">
                  <SelectValue placeholder="选择已有集合..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-white/10">
                  {collections.map(c => (
                    <SelectItem key={c.name} value={c.name} className="text-slate-300 text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={newCollection} onChange={e => setNewCollection(e.target.value)}
                className="h-7 text-xs bg-[#0a0d14] border-white/10 text-white mt-1" placeholder="或输入新集合名称..." />
            </div>
            <div
              className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-violet-500/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">点击选择文件</p>
              <p className="text-xs text-slate-600 mt-1">支持 TXT、MD、CSV、PDF</p>
              <input ref={fileRef} type="file" className="hidden"
                accept=".txt,.md,.csv,.pdf,text/plain,text/markdown,text/csv,application/pdf" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoExtract" checked={autoExtract} onChange={e => setAutoExtract(e.target.checked)} className="rounded border-white/20" />
              <Label htmlFor="autoExtract" className="text-slate-300 text-xs cursor-pointer">AI 自动提取摘要（文本文件）</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-400">取消</Button>
              <Button onClick={handleUpload} disabled={uploading || uploadMutation.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                {(uploading || uploadMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                上传
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── AI 对话检索面板 ───────────────────────────────────────────────────────────
function AiSearchPanel({ collection, onClose }: { collection?: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    sources?: Array<{ index: number; id: number; title: string; collection: string; snippet: string }>;
  }>>([]);

  const aiSearchMutation = trpc.knowledge.aiSearch.useMutation({
    onSuccess: (data) => {
      const newMsg: { role: "user" | "assistant"; content: string; sources?: Array<{ index: number; id: number; title: string; collection: string; snippet: string }> } = {
        role: "assistant",
        content: typeof data.answer === "string" ? data.answer : String(data.answer),
        sources: data.sources,
      };
      setMessages(prev => [...prev, newMsg]);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAsk = () => {
    if (!question.trim()) return;
    setMessages(prev => [...prev, { role: "user" as const, content: question }]);
    aiSearchMutation.mutate({ question, collection, limit: 5 });
    setQuestion("");
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">AI 知识库检索</span>
          {collection && <Badge className="text-[10px] bg-violet-500/20 text-violet-400 border-violet-500/30">{collection}</Badge>}
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="h-10 w-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">向 AI 提问，从知识库中检索相关内容</p>
            <p className="text-xs text-slate-600 mt-1">例如：如何优化 Listing 标题？</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-violet-600 text-white" : "bg-[#0a0d14] border border-white/8 text-slate-200"}`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  <p className="text-[10px] text-slate-500 font-medium">引用来源：</p>
                  {msg.sources.map(s => (
                    <div key={s.id} className="rounded-lg border border-white/8 bg-[#0d1117] p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-violet-400 font-mono">[{s.index}]</span>
                        <span className="text-xs text-slate-300 font-medium">{s.title}</span>
                        <Badge className="text-[9px] bg-slate-500/20 text-slate-500 border-slate-500/30 ml-auto">{s.collection}</Badge>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2">{s.snippet}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {aiSearchMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-[#0a0d14] border border-white/8 rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-white/8">
        <div className="flex gap-2">
          <Input value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAsk()}
            className="bg-[#0a0d14] border-white/10 text-white text-sm h-9" placeholder="输入问题..." />
          <Button onClick={handleAsk} disabled={!question.trim() || aiSearchMutation.isPending}
            size="sm" className="bg-violet-600 hover:bg-violet-500 text-white px-3">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 条目详情面板 ──────────────────────────────────────────────────────────────
function ItemDetailPanel({ item, onEdit, onClose }: { item: KbItem; onEdit: () => void; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);

  const submitReviewMutation = trpc.knowledge.submitReview.useMutation({
    onSuccess: () => { toast.success("已提交审核"); utils.knowledge.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reviewMutation = trpc.knowledge.review.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approve" ? "已发布" : "已拒绝");
      utils.knowledge.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-violet-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="rounded p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5"><Edit2 className="h-3.5 w-3.5" /></button>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className={`text-xs border ${statusCfg.color} gap-1`}><StatusIcon className="h-3 w-3" />{statusCfg.label}</Badge>
          <Badge className={`text-xs ${CONTENT_TYPE_CONFIG[item.contentType]?.color ?? "bg-slate-500/20 text-slate-400"}`}>
            {CONTENT_TYPE_CONFIG[item.contentType]?.label ?? item.contentType}
          </Badge>
          <Badge className="text-xs bg-slate-500/20 text-slate-400 border-slate-500/30">{item.collection}</Badge>
        </div>
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[11px] border border-violet-500/20">
                <Tag className="h-2.5 w-2.5" />{tag}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-white/8 bg-[#0a0d14] p-4">
          <div className={`text-sm text-slate-300 whitespace-pre-wrap leading-relaxed ${!expanded && item.content.length > 600 ? "line-clamp-[12]" : ""}`}>
            {item.content}
          </div>
          {item.content.length > 600 && (
            <button onClick={() => setExpanded(!expanded)} className="mt-2 flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
              {expanded ? <><ChevronUp className="h-3 w-3" />收起</> : <><ChevronDown className="h-3 w-3" />展开全文</>}
            </button>
          )}
        </div>
        <div className="text-[10px] text-slate-600 space-y-1">
          <div className="flex items-center gap-1"><Clock className="h-3 w-3" />创建：{new Date(item.createdAt).toLocaleString()}</div>
          <div className="flex items-center gap-1"><RefreshCw className="h-3 w-3" />更新：{new Date(item.updatedAt).toLocaleString()}</div>
        </div>
        <div className="space-y-2">
          {item.status === "draft" && (
            <Button onClick={() => submitReviewMutation.mutate({ id: item.id })} disabled={submitReviewMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white gap-2" size="sm">
              {submitReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提交审核
            </Button>
          )}
          {item.status === "pending_review" && (
            <div className="flex gap-2">
              <Button onClick={() => reviewMutation.mutate({ id: item.id, action: "approve" })} disabled={reviewMutation.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white gap-2" size="sm">
                <CheckCircle className="h-4 w-4" />通过
              </Button>
              <Button onClick={() => reviewMutation.mutate({ id: item.id, action: "reject" })} disabled={reviewMutation.isPending}
                variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2" size="sm">
                <XCircle className="h-4 w-4" />拒绝
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────
export default function Knowledge() {
  const utils = trpc.useUtils();
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "pending_review" | "approved" | "rejected">("all");
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<KbItem | null>(null);
  const [editItem, setEditItem] = useState<KbItem | null | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);
  const [showAiSearch, setShowAiSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "search">("list");

  const { data: collections = [], isLoading: collectionsLoading } = trpc.knowledge.getCollections.useQuery();
  const { data: listData, isLoading: listLoading } = trpc.knowledge.list.useQuery({
    collection: selectedCollection,
    query: searchQuery || undefined,
    status: statusFilter,
    page,
    pageSize: 20,
  });
  const { data: stats } = trpc.knowledge.getStats.useQuery();
  const { data: searchResults, isLoading: searchLoading } = trpc.knowledge.search.useQuery(
    { query: searchQuery, collection: selectedCollection, limit: 20, statusFilter: "all" },
    { enabled: activeTab === "search" && searchQuery.length > 1 }
  );

  const deleteMutation = trpc.knowledge.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.knowledge.list.invalidate();
      utils.knowledge.getCollections.invalidate();
      setSelectedItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDelete = useCallback((item: KbItem) => {
    if (!confirm(`确认删除"${item.title}"？`)) return;
    deleteMutation.mutate({ id: item.id });
  }, [deleteMutation]);

  const items = (listData?.items ?? []) as KbItem[];
  const totalPages = listData?.totalPages ?? 1;

  return (
    <div className="flex h-screen bg-[#080b12] text-white overflow-hidden">
      {/* ─── 左侧：集合树 ─── */}
      <div className="w-56 flex-shrink-0 border-r border-white/8 flex flex-col bg-[#0a0d14]">
        <div className="px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-bold text-white">知识库</span>
          </div>
          {stats && (
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="rounded-lg bg-[#0d1117] p-2">
                <p className="text-lg font-bold text-white">{stats.total}</p>
                <p className="text-[10px] text-slate-500">总条目</p>
              </div>
              <div className="rounded-lg bg-[#0d1117] p-2">
                <p className="text-lg font-bold text-emerald-400">{(stats.byStatus as Record<string, number>)?.approved ?? 0}</p>
                <p className="text-[10px] text-slate-500">已发布</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => { setSelectedCollection(undefined); setPage(1); }}
            className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${!selectedCollection ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
          >
            <FolderOpen className="h-4 w-4" />
            <span className="flex-1 text-left truncate">全部集合</span>
            <span className="text-[10px] text-slate-600">{stats?.total ?? 0}</span>
          </button>
          {collectionsLoading ? (
            <div className="px-4 py-3 text-xs text-slate-600">加载中...</div>
          ) : (
            (collections as Collection[]).map(col => (
              <button
                key={col.name}
                onClick={() => { setSelectedCollection(col.name); setPage(1); }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${selectedCollection === col.name ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
              >
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
                <span className="flex-1 text-left truncate text-xs">{col.name}</span>
                <span className="text-[10px] text-slate-600">{col.total}</span>
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-white/8 space-y-1.5">
          <Button onClick={() => setEditItem(null)} size="sm"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-1.5 h-7 text-xs">
            <Plus className="h-3.5 w-3.5" />新建条目
          </Button>
          <Button onClick={() => setShowUpload(true)} variant="outline" size="sm"
            className="w-full border-white/10 text-slate-400 hover:text-white gap-1.5 h-7 text-xs">
            <Upload className="h-3.5 w-3.5" />上传文档
          </Button>
        </div>
        {/* ─── AMZ 知识库联动面板 ─── */}
        <div className="p-3 border-t border-white/8 overflow-y-auto" style={{ maxHeight: 480 }}>
          <AmzKbPanel />
        </div>
      </div>

      {/* ─── 中间：条目列表 ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 bg-[#0a0d14]">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "list" | "search")} className="flex-shrink-0">
            <TabsList className="bg-[#0d1117] border border-white/10 h-8">
              <TabsTrigger value="list" className="text-xs h-6 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">列表</TabsTrigger>
              <TabsTrigger value="search" className="text-xs h-6 px-3 data-[state=active]:bg-violet-600 data-[state=active]:text-white">搜索</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 bg-[#0d1117] border-white/10 text-white h-8 text-sm"
              placeholder={activeTab === "search" ? "搜索知识库内容..." : "过滤条目..."} />
          </div>
          {activeTab === "list" && (
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
              <SelectTrigger className="w-28 h-8 text-xs bg-[#0d1117] border-white/10 text-slate-300">
                <Filter className="h-3.5 w-3.5 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1117] border-white/10">
                <SelectItem value="all" className="text-slate-300 text-xs">全部状态</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-slate-300 text-xs">{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowAiSearch(!showAiSearch)} variant="outline" size="sm"
            className={`border-white/10 gap-1.5 h-8 text-xs flex-shrink-0 ${showAiSearch ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : "text-slate-400 hover:text-white"}`}>
            <Bot className="h-3.5 w-3.5" />AI 检索
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "list" ? (
            listLoading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 text-violet-400 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <BookOpen className="h-10 w-10 mb-3 text-slate-700" />
                <p className="text-sm">暂无条目</p>
                <p className="text-xs mt-1">点击左侧"新建条目"开始添加</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {items.map(item => {
                  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div key={item.id}
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors ${selectedItem?.id === item.id ? "bg-violet-500/10 border-l-2 border-violet-500" : "hover:bg-white/[0.03]"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-white truncate">{item.title}</p>
                          <Badge className={`text-[10px] border flex-shrink-0 gap-0.5 ${statusCfg.color}`}>
                            <StatusIcon className="h-2.5 w-2.5" />{statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2">{item.content}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-slate-600">{item.collection}</span>
                          {item.tags && item.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded-full">{tag}</span>
                          ))}
                          <span className="text-[10px] text-slate-700 ml-auto">{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <button className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-white/5 flex-shrink-0">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#0d1117] border-white/10" align="end">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditItem(item); }}
                            className="text-slate-300 text-xs gap-2 cursor-pointer"><Edit2 className="h-3.5 w-3.5" />编辑</DropdownMenuItem>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(item); }}
                            className="text-red-400 text-xs gap-2 cursor-pointer"><Trash2 className="h-3.5 w-3.5" />删除</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="p-4">
              {searchQuery.length < 2 ? (
                <div className="text-center py-10 text-slate-500">
                  <Search className="h-8 w-8 mx-auto mb-3 text-slate-700" />
                  <p className="text-sm">输入至少 2 个字符开始搜索</p>
                </div>
              ) : searchLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 text-violet-400 animate-spin" /></div>
              ) : !searchResults?.length ? (
                <div className="text-center py-10 text-slate-500">
                  <Search className="h-8 w-8 mx-auto mb-3 text-slate-700" />
                  <p className="text-sm">未找到相关内容</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">找到 {searchResults.length} 条结果</p>
                  {(searchResults as unknown as Array<KbItem & { snippet?: string }>).map(item => (
                    <div key={item.id} onClick={() => setSelectedItem(item)}
                      className="rounded-xl border border-white/8 bg-[#0a0d14] p-4 cursor-pointer hover:border-violet-500/30 transition-colors">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <Badge className={`text-[10px] border flex-shrink-0 ${STATUS_CONFIG[item.status]?.color}`}>
                          {STATUS_CONFIG[item.status]?.label}
                        </Badge>
                        <span className="text-[10px] text-slate-600 ml-auto">{item.collection}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.snippet ?? item.content.slice(0, 150)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {activeTab === "list" && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/8 bg-[#0a0d14]">
            <p className="text-xs text-slate-500">共 {listData?.total ?? 0} 条</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="h-7 text-xs border-white/10 text-slate-400 hover:text-white">上一页</Button>
              <span className="text-xs text-slate-400">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="h-7 text-xs border-white/10 text-slate-400 hover:text-white">下一页</Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 右侧面板 ─── */}
      {(selectedItem || showAiSearch) && (
        <div className="w-80 flex-shrink-0">
          {showAiSearch ? (
            <AiSearchPanel collection={selectedCollection} onClose={() => setShowAiSearch(false)} />
          ) : selectedItem ? (
            <ItemDetailPanel item={selectedItem} onEdit={() => setEditItem(selectedItem)} onClose={() => setSelectedItem(null)} />
          ) : null}
        </div>
      )}

      {/* ─── 对话框 ─── */}
      {editItem !== undefined && (
        <ItemDialog open={true} onClose={() => setEditItem(undefined)} item={editItem}
          collections={collections as Collection[]} defaultCollection={selectedCollection} />
      )}
      <UploadDialog open={showUpload} onClose={() => setShowUpload(false)} collections={collections as Collection[]} />
    </div>
  );
}
