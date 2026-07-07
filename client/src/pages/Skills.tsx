// Skills Management Page
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { api, Skill } from "@/lib/api";
import { Zap, Play, Clock, ChevronRight, Search, RefreshCw, Tag } from "lucide-react";
import { toast } from "sonner";

const RISK_COLOR: Record<string, string> = {
  low:      "oklch(0.65 0.18 155)",
  medium:   "oklch(0.75 0.18 80)",
  high:     "oklch(0.62 0.22 25)",
  critical: "oklch(0.62 0.22 25)",
};

const STATUS_COLOR: Record<string, string> = {
  active:   "oklch(0.65 0.18 155)",
  inactive: "oklch(0.55 0.012 265)",
  draft:    "oklch(0.75 0.18 80)",
};

export default function Skills() {
  const { data, loading, error, refetch } = useApi(() =>
    api.get<{ skills: Skill[] }>("/v1/skills").then(r => r.skills)
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Skill | null>(null);
  const [testInput, setTestInput] = useState('{"text": "Hello, world!"}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const skills = (data ?? []).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  async function runTest() {
    if (!selected) return;
    setRunning(true);
    setTestResult(null);
    try {
      let input: unknown;
      try { input = JSON.parse(testInput); } catch { input = testInput; }
      const result = await api.post(`/v1/skills/${selected.slug}/run`, { input });
      setTestResult(JSON.stringify(result, null, 2));
      toast.success("运行成功");
    } catch (e: unknown) {
      setTestResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      toast.error("运行失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 0 }}>
      {/* Left: Skill List */}
      <div className="flex flex-col rounded-xl border overflow-hidden"
        style={{ width: 320, flexShrink: 0, background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: "oklch(0.22 0.016 265)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Skills <span className="ml-1 text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)" }}>
                {skills.length}
              </span>
            </h2>
            <button onClick={refetch} className="p-1.5 rounded-lg transition-colors"
              style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)" }}>
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "oklch(0.45 0.012 265)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索 Skill..."
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "oklch(0.18 0.016 265)", border: "1px solid oklch(0.25 0.016 265)", color: "white" }} />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <RefreshCw size={16} className="animate-spin" style={{ color: "oklch(0.60 0.20 265)" }} />
            </div>
          )}
          {error && (
            <div className="p-4 text-xs" style={{ color: "oklch(0.62 0.22 25)" }}>
              加载失败：{error}
            </div>
          )}
          {skills.map(skill => (
            <div key={skill.slug}
              onClick={() => { setSelected(skill); setTestResult(null); }}
              className="px-4 py-3 border-b cursor-pointer transition-colors"
              style={{
                borderColor: "oklch(0.20 0.015 265)",
                background: selected?.slug === skill.slug ? "oklch(0.18 0.016 265)" : "transparent",
              }}
              onMouseEnter={e => { if (selected?.slug !== skill.slug) (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)"; }}
              onMouseLeave={e => { if (selected?.slug !== skill.slug) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap size={13} style={{ color: "oklch(0.65 0.20 300)", flexShrink: 0 }} />
                  <span className="text-sm font-medium text-white truncate font-mono">{skill.slug}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[skill.status] ?? "oklch(0.55 0.012 265)" }} />
                  <span className="text-xs" style={{ color: RISK_COLOR[skill.riskTier] ?? "oklch(0.55 0.012 265)" }}>
                    {skill.riskTier}
                  </span>
                </div>
              </div>
              <p className="text-xs mt-1 line-clamp-1" style={{ color: "oklch(0.55 0.012 265)" }}>{skill.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: "oklch(0.45 0.012 265)" }}>
                <span className="flex items-center gap-1"><Tag size={10} />{skill.category}</span>
                <span className="flex items-center gap-1"><Clock size={10} />v{skill.version}</span>
                <span className="ml-auto">{skill.callCount?.toLocaleString() ?? 0} 次</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail + Test */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border"
            style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
            <div className="text-center">
              <Zap size={32} className="mx-auto mb-3" style={{ color: "oklch(0.30 0.016 265)" }} />
              <p className="text-sm" style={{ color: "oklch(0.45 0.012 265)" }}>选择一个 Skill 查看详情</p>
            </div>
          </div>
        ) : (
          <>
            {/* Detail Card */}
            <div className="rounded-xl border p-5"
              style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)", borderTop: "2px solid oklch(0.65 0.20 300)" }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {selected.name || selected.slug}
                  </h2>
                  <p className="text-xs mt-1 font-mono" style={{ color: "oklch(0.55 0.012 265)" }}>{selected.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{ background: "oklch(0.18 0.016 265)", color: STATUS_COLOR[selected.status] ?? "oklch(0.55 0.012 265)", border: `1px solid ${STATUS_COLOR[selected.status] ?? "oklch(0.30 0.016 265)"}30` }}>
                    {selected.status}
                  </span>
                </div>
              </div>
              <p className="text-sm mb-4" style={{ color: "oklch(0.65 0.012 265)" }}>{selected.description}</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "分类", value: selected.category },
                  { label: "版本", value: `v${selected.version}` },
                  { label: "风险等级", value: selected.riskTier, color: RISK_COLOR[selected.riskTier] },
                ].map(item => (
                  <div key={item.label} className="rounded-lg p-3"
                    style={{ background: "oklch(0.18 0.016 265)" }}>
                    <div className="text-xs mb-1" style={{ color: "oklch(0.45 0.012 265)" }}>{item.label}</div>
                    <div className="text-sm font-semibold" style={{ color: item.color ?? "white", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Runner */}
            <div className="flex-1 rounded-xl border p-5 flex flex-col"
              style={{ background: "oklch(0.14 0.014 265)", borderColor: "oklch(0.22 0.016 265)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  运行测试
                </h3>
                <button onClick={runTest} disabled={running}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: running ? "oklch(0.25 0.016 265)" : "oklch(0.60 0.20 265)", color: "white" }}>
                  <Play size={11} />
                  {running ? "运行中…" : "运行"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                <div className="flex flex-col">
                  <div className="text-xs mb-2" style={{ color: "oklch(0.45 0.012 265)" }}>输入 (JSON)</div>
                  <textarea
                    value={testInput} onChange={e => setTestInput(e.target.value)}
                    className="flex-1 code-block p-3 resize-none outline-none text-xs"
                    style={{ minHeight: 120 }} />
                </div>
                <div className="flex flex-col">
                  <div className="text-xs mb-2" style={{ color: "oklch(0.45 0.012 265)" }}>输出结果</div>
                  <div className="flex-1 code-block p-3 overflow-auto text-xs"
                    style={{ minHeight: 120, color: testResult?.startsWith("Error") ? "oklch(0.62 0.22 25)" : "oklch(0.70 0.15 265)" }}>
                    {running ? (
                      <span style={{ color: "oklch(0.60 0.20 265)" }}>运行中…</span>
                    ) : testResult ?? (
                      <span style={{ color: "oklch(0.35 0.012 265)" }}>等待运行…</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
