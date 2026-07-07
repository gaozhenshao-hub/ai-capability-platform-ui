// Knowledge Base Page
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { api, KnowledgeCollection, KnowledgeItem } from "@/lib/api";
import { BookOpen, Search, RefreshCw, Tag, Clock } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  approved:    "oklch(0.65 0.18 155)",
  pending:     "oklch(0.75 0.18 80)",
  draft:       "oklch(0.55 0.012 265)",
  rejected:    "oklch(0.62 0.22 25)",
};

const SENSITIVITY_COLOR: Record<string, string> = {
  public:       "oklch(0.65 0.18 155)",
  internal:     "oklch(0.60 0.20 265)",
  confidential: "oklch(0.75 0.18 80)",
  restricted:   "oklch(0.62 0.22 25)",
};

export default function Knowledge() {
  const { data: collections, loading: loadingCols } = useApi(() =>
    api.get<{ collections: KnowledgeCollection[] }>("/v1/knowledge/collections").then(r => r.collections)
  );
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);

  const { data: items, loading: loadingItems } = useApi(() => {
    if (!selectedCol) return Promise.resolve([] as KnowledgeItem[]);
    return api.get<{ items: KnowledgeItem[] }>(`/v1/knowledge/collections/${selectedCol}/items`).then(r => r.items);
  }, [selectedCol]);

  const filtered = (items ?? []).filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.content?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 0 }}>
      {/* Collections */}
      <div className="flex flex-col rounded-xl border overflow-hidden"
        style={{ width: 220, flexShrink: 0, background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        <div className="p-4 border-b" style={{ borderColor: "oklch(0.22 0.016 265)" }}>
          <h2 className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>知识集合</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingCols && <div className="flex items-center justify-center h-16"><RefreshCw size={13} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} /></div>}
          {(collections ?? []).map(col => (
            <div key={col.id}
              onClick={() => { setSelectedCol(col.id); setSelectedItem(null); }}
              className="px-4 py-3 border-b cursor-pointer transition-colors"
              style={{
                borderColor: "oklch(0.20 0.015 265)",
                background: selectedCol === col.id ? "oklch(0.18 0.016 265)" : "transparent",
              }}
              onMouseEnter={e => { if (selectedCol !== col.id) (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)"; }}
              onMouseLeave={e => { if (selectedCol !== col.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div className="flex items-center gap-2">
                <BookOpen size={12} style={{ color: "oklch(0.60 0.20 265)", flexShrink: 0 }} />
                <span className="text-xs font-medium text-white truncate">{col.name}</span>
              </div>
              <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "oklch(0.45 0.012 265)" }}>{col.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Items List */}
      <div className="flex flex-col rounded-xl border overflow-hidden"
        style={{ width: 300, flexShrink: 0, background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        <div className="p-4 border-b" style={{ borderColor: "oklch(0.22 0.016 265)" }}>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "oklch(0.45 0.012 265)" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索条目…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: "oklch(0.18 0.016 265)", border: "1px solid oklch(0.25 0.016 265)", color: "white" }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedCol && (
            <div className="flex items-center justify-center h-24 text-xs" style={{ color: "oklch(0.40 0.012 265)" }}>选择知识集合</div>
          )}
          {loadingItems && <div className="flex items-center justify-center h-16"><RefreshCw size={13} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} /></div>}
          {filtered.map(item => (
            <div key={item.id}
              onClick={() => setSelectedItem(item)}
              className="px-4 py-3 border-b cursor-pointer transition-colors"
              style={{
                borderColor: "oklch(0.20 0.015 265)",
                background: selectedItem?.id === item.id ? "oklch(0.18 0.016 265)" : "transparent",
              }}
              onMouseEnter={e => { if (selectedItem?.id !== item.id) (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)"; }}
              onMouseLeave={e => { if (selectedItem?.id !== item.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-white line-clamp-1">{item.title}</span>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: STATUS_COLOR[item.status] ?? "oklch(0.55 0.012 265)" }} />
              </div>
              <p className="text-xs line-clamp-2 mb-1.5" style={{ color: "oklch(0.50 0.012 265)" }}>{item.content}</p>
              <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.40 0.012 265)" }}>
                <span style={{ color: SENSITIVITY_COLOR[item.sensitivity] ?? "oklch(0.55 0.012 265)" }}>{item.sensitivity}</span>
                {item.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className="flex items-center gap-0.5"><Tag size={9} />{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Item Detail */}
      <div className="flex-1 rounded-xl border p-5 overflow-y-auto"
        style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        {!selectedItem ? (
          <div className="flex flex-col items-center justify-center h-full">
            <BookOpen size={32} className="mb-3" style={{ color: "oklch(0.30 0.016 265)" }} />
            <p className="text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>选择一个条目查看详情</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{selectedItem.title}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ background: "oklch(0.18 0.016 265)", color: STATUS_COLOR[selectedItem.status] ?? "oklch(0.55 0.012 265)" }}>
                  {selectedItem.status}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ background: "oklch(0.18 0.016 265)", color: SENSITIVITY_COLOR[selectedItem.sensitivity] ?? "oklch(0.55 0.012 265)" }}>
                  {selectedItem.sensitivity}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs" style={{ color: "oklch(0.45 0.012 265)" }}>
              <span className="flex items-center gap-1"><Clock size={10} />更新于 {new Date(selectedItem.updatedAt).toLocaleString()}</span>
            </div>

            {selectedItem.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                    style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)" }}>
                    <Tag size={9} />{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="rounded-lg p-4 text-sm leading-relaxed"
              style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.75 0.012 265)", border: "1px solid oklch(0.25 0.016 265)" }}>
              {selectedItem.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
