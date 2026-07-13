/**
 * AmzKbPanel.tsx — AMZ 知识库联动面板
 * 功能：
 * 1. 展示 AMZ 工具知识库统计（跨系统代理查询）
 * 2. 搜索 AMZ 知识库（L1/L2/L3 三层）
 * 3. 触发 Emperor 知识总结 Agent（方案三）
 * 4. 展示历史总结结果
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Brain, Search, RefreshCw, ChevronDown, ChevronUp,
  Sparkles, Database, BookOpen, Loader2, CheckCircle,
  AlertCircle, ExternalLink, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

type KbType = "product" | "listing" | "image" | "skill" | "video";

const KB_TYPE_CONFIG: Record<KbType, { label: string; color: string; emoji: string }> = {
  product: { label: "产品创意", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", emoji: "💡" },
  listing: { label: "Listing文案", color: "bg-violet-500/20 text-violet-400 border-violet-500/30", emoji: "📝" },
  image:   { label: "图片设计", color: "bg-pink-500/20 text-pink-400 border-pink-500/30", emoji: "🎨" },
  skill:   { label: "运营技巧", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", emoji: "⚡" },
  video:   { label: "视频内容", color: "bg-teal-500/20 text-teal-400 border-teal-500/30", emoji: "🎬" },
};

// ─── 知识总结对话框 ────────────────────────────────────────────────────────────
function SummarizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kbType, setKbType] = useState<KbType>("listing");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(8);
  const [summaryFocus, setSummaryFocus] = useState("优秀文案的共性规律和写作技巧");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("patterns");

  const summarizeMutation = trpc.knowledge.summarizeAmzKb.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        setResult(data.result);
        toast.success(`知识总结完成，分析了 ${data.itemCount} 个案例`);
      } else {
        toast.error(data.error ?? "总结失败，请检查 Emperor 连接状态");
      }
    },
    onError: (e) => toast.error(`请求失败: ${e.message}`),
  });

  const handleSummarize = () => {
    setResult(null);
    summarizeMutation.mutate({ kbType, category: category || undefined, limit, summaryFocus });
  };

  const FOCUS_PRESETS: Record<KbType, string> = {
    listing: "优秀文案的共性规律和写作技巧",
    product: "优秀产品创意的差异化特征和市场洞察",
    image:   "优秀图片的视觉设计规律和用户心理",
    skill:   "高效运营的核心方法论和最佳实践",
    video:   "高转化视频的脚本结构和内容策略",
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-[#0d1117] border-white/10 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Brain className="h-5 w-5 text-violet-400" />
            Emperor 知识总结 Agent
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-400">
              从 AMZ 知识库中抽取优秀案例，由 Emperor AI 提炼共性规律，生成可指导 Skill 执行的洞察。
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">知识库类型</label>
                <Select value={kbType} onValueChange={v => {
                  setKbType(v as KbType);
                  setSummaryFocus(FOCUS_PRESETS[v as KbType]);
                }}>
                  <SelectTrigger className="bg-[#0a0d14] border-white/10 text-slate-300 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-white/10">
                    {Object.entries(KB_TYPE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-slate-300 text-sm">
                        {v.emoji} {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">分析案例数量</label>
                <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
                  <SelectTrigger className="bg-[#0a0d14] border-white/10 text-slate-300 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-white/10">
                    {[5, 8, 10, 15, 20].map(n => (
                      <SelectItem key={n} value={String(n)} className="text-slate-300 text-sm">{n} 个案例</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">品类过滤（可选）</label>
              <Input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="如：家居、电子、户外..."
                className="bg-[#0a0d14] border-white/10 text-white h-9 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">总结聚焦方向</label>
              <Input
                value={summaryFocus}
                onChange={e => setSummaryFocus(e.target.value)}
                className="bg-[#0a0d14] border-white/10 text-white h-9 text-sm"
              />
            </div>

            <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 text-xs text-violet-300">
              <p className="font-medium mb-1">💡 工作流程</p>
              <p className="text-violet-400/80">
                1. 从 AMZ 工具知识库检索 {limit} 个优秀{KB_TYPE_CONFIG[kbType].label}案例（L3 完整内容）<br />
                2. Emperor AI 分析共性规律、提炼写作技巧<br />
                3. 生成可直接用于优化 Skill 提示词的建议
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span>总结完成</span>
              <Badge className={`text-[10px] border ml-auto ${KB_TYPE_CONFIG[kbType].color}`}>
                {KB_TYPE_CONFIG[kbType].emoji} {KB_TYPE_CONFIG[kbType].label}
              </Badge>
            </div>

            {(result as any).summary && (
              <div className="rounded-lg bg-[#0a0d14] border border-white/8 p-3">
                <p className="text-xs font-medium text-slate-300 mb-1">综合总结</p>
                <p className="text-xs text-slate-400 leading-relaxed">{(result as any).summary}</p>
              </div>
            )}

            {[
              { key: "patterns", label: "共性规律", icon: "🔍", color: "text-blue-400" },
              { key: "techniques", label: "写作/设计技巧", icon: "✏️", color: "text-violet-400" },
              { key: "promptSuggestions", label: "AI Prompt 优化建议", icon: "🤖", color: "text-amber-400" },
              { key: "typicalExamples", label: "典型示例", icon: "⭐", color: "text-emerald-400" },
            ].map(section => {
              const items = (result as any)[section.key] as string[] | undefined;
              if (!items?.length) return null;
              const isExpanded = expandedSection === section.key;
              return (
                <div key={section.key} className="rounded-lg bg-[#0a0d14] border border-white/8 overflow-hidden">
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm">{section.icon}</span>
                    <span className={`text-xs font-medium flex-1 ${section.color}`}>{section.label}</span>
                    <span className="text-[10px] text-slate-600">{items.length} 条</span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-1.5">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                          <span className="text-slate-600 flex-shrink-0 mt-0.5">{i + 1}.</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <Button
              onClick={() => setResult(null)}
              variant="outline"
              size="sm"
              className="w-full border-white/10 text-slate-400 hover:text-white text-xs h-8"
            >
              重新生成
            </Button>
          </div>
        )}

        <DialogFooter>
          {!result && (
            <Button
              onClick={handleSummarize}
              disabled={summarizeMutation.isPending}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
            >
              {summarizeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />AI 分析中...</>
              ) : (
                <><Sparkles className="h-4 w-4" />开始总结</>
              )}
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="border-white/10 text-slate-400 hover:text-white">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AMZ KB 搜索面板 ───────────────────────────────────────────────────────────
function AmzKbSearchPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [kbType, setKbType] = useState<KbType | "">("");
  const [level, setLevel] = useState<"L1" | "L2" | "L3">("L2");
  const [searchEnabled, setSearchEnabled] = useState(false);

  const { data: searchResult, isLoading } = trpc.knowledge.searchAmzKb.useQuery(
    { query, type: kbType || undefined, limit: 8, level },
    { enabled: searchEnabled && query.length >= 2 }
  );

  const handleSearch = () => {
    if (query.length < 2) return;
    setSearchEnabled(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-white">AMZ 知识库搜索</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 space-y-2 border-b border-white/8">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchEnabled(false); }}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="搜索知识库内容..."
            className="bg-[#0d1117] border-white/10 text-white h-8 text-sm flex-1"
          />
          <Button onClick={handleSearch} size="sm" className="bg-violet-600 hover:bg-violet-500 h-8 px-3">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Select value={kbType} onValueChange={v => setKbType(v as KbType | "")}>
            <SelectTrigger className="flex-1 bg-[#0d1117] border-white/10 text-slate-300 h-7 text-xs">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1117] border-white/10">
              <SelectItem value="" className="text-slate-300 text-xs">全部类型</SelectItem>
              {Object.entries(KB_TYPE_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-slate-300 text-xs">{v.emoji} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={v => setLevel(v as "L1" | "L2" | "L3")}>
            <SelectTrigger className="w-20 bg-[#0d1117] border-white/10 text-slate-300 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1117] border-white/10">
              <SelectItem value="L1" className="text-slate-300 text-xs">L1 索引</SelectItem>
              <SelectItem value="L2" className="text-slate-300 text-xs">L2 摘要</SelectItem>
              <SelectItem value="L3" className="text-slate-300 text-xs">L3 详情</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
          </div>
        ) : !searchEnabled || !query ? (
          <div className="text-center py-8 text-slate-600">
            <Search className="h-8 w-8 mx-auto mb-2 text-slate-700" />
            <p className="text-xs">输入关键词搜索 AMZ 知识库</p>
          </div>
        ) : !(searchResult as any)?.items?.length ? (
          <div className="text-center py-8 text-slate-600">
            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-slate-700" />
            <p className="text-xs">未找到相关内容</p>
            <p className="text-[10px] mt-1">请先在 AMZ 工具中上传知识库内容</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-600">
              找到 {(searchResult as any).items.length} 条 / 扫描 {(searchResult as any).totalScanned} 条
            </p>
            {((searchResult as any).items as any[]).map((item: any) => {
              const typeCfg = KB_TYPE_CONFIG[item.type as KbType] ?? KB_TYPE_CONFIG.listing;
              return (
                <div key={item.id} className="rounded-lg bg-[#0a0d14] border border-white/8 p-3 hover:border-violet-500/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{typeCfg.emoji}</span>
                    <p className="text-xs font-medium text-white flex-1 truncate">{item.title}</p>
                    <Badge className={`text-[10px] border flex-shrink-0 ${typeCfg.color}`}>{typeCfg.label}</Badge>
                  </div>
                  {item.summary && (
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{item.summary}</p>
                  )}
                  {item.keyPoints && (
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">要点: {item.keyPoints}</p>
                  )}
                  {item.category && (
                    <span className="text-[10px] text-slate-600 mt-1 block">品类: {item.category}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主面板：AMZ KB 状态卡片 ──────────────────────────────────────────────────
export function AmzKbPanel() {
  const [showSummarize, setShowSummarize] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const { data: amzStats, isLoading: statsLoading, refetch: refetchStats } = trpc.knowledge.getAmzKbStats.useQuery(
    undefined,
    { retry: 1, staleTime: 60_000 }
  );

  const { data: summariesData } = trpc.knowledge.getEmperorSummaries.useQuery(
    { limit: 3 },
    { retry: 1, staleTime: 30_000 }
  );

  const stats = (amzStats as any)?.stats ?? {};
  const isConnected = (amzStats as any)?.success === true;
  const summaries = (summariesData as any)?.summaries ?? [];

  return (
    <>
      {/* ─── AMZ KB 状态卡片 ─── */}
      <div className="rounded-xl border border-white/8 bg-[#0a0d14] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-medium text-white">AMZ 知识库联动</span>
            <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"}`} />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => refetchStats()}
              className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {statsLoading ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
            </div>
          ) : !isConnected ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">AMZ 工具未连接</p>
                <p className="text-amber-400/70 mt-0.5">请确认 AMZ Listing 工具已部署并配置了知识库 API</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: "产品创意", key: "product", emoji: "💡" },
                { label: "Listing文案", key: "listing", emoji: "📝" },
                { label: "图片设计", key: "image", emoji: "🎨" },
                { label: "运营技巧", key: "skill", emoji: "⚡" },
              ].map(item => (
                <div key={item.key} className="rounded-lg bg-[#080b12] p-2.5 text-center">
                  <p className="text-base">{item.emoji}</p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {(stats as any)[item.key] ?? (stats as any)[`${item.key}Count`] ?? stats.total ?? "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => setShowSearch(!showSearch)}
              variant="outline"
              size="sm"
              className={`flex-1 border-white/10 gap-1.5 h-8 text-xs ${showSearch ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : "text-slate-400 hover:text-white"}`}
            >
              <Search className="h-3.5 w-3.5" />搜索知识库
            </Button>
            <Button
              onClick={() => setShowSummarize(true)}
              size="sm"
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white gap-1.5 h-8 text-xs"
            >
              <Brain className="h-3.5 w-3.5" />AI 总结
            </Button>
          </div>
        </div>

        {/* 历史总结 */}
        {summaries.length > 0 && (
          <div className="border-t border-white/8 px-4 py-3">
            <p className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />最近总结
            </p>
            <div className="space-y-1.5">
              {summaries.map((s: any) => {
                const typeCfg = KB_TYPE_CONFIG[s.kbType as KbType] ?? KB_TYPE_CONFIG.listing;
                return (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-sm">{typeCfg.emoji}</span>
                    <span className="flex-1 text-slate-400 truncate">{s.summaryFocus}</span>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── 搜索侧面板 ─── */}
      {showSearch && (
        <div className="rounded-xl border border-white/8 bg-[#0a0d14] overflow-hidden" style={{ height: 400 }}>
          <AmzKbSearchPanel onClose={() => setShowSearch(false)} />
        </div>
      )}

      {/* ─── 总结对话框 ─── */}
      <SummarizeDialog open={showSummarize} onClose={() => setShowSummarize(false)} />
    </>
  );
}
