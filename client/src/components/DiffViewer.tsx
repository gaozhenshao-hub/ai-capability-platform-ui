import React, { useMemo } from "react";
import * as Diff from "diff";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
  /** 'split' = 左右对比，'unified' = 统一视图 */
  mode?: "split" | "unified";
}

interface LineInfo {
  lineNumber: number | null;
  content: string;
  type: "added" | "removed" | "unchanged";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSplitLines(
  oldText: string,
  newText: string
): { left: LineInfo[]; right: LineInfo[] } {
  const changes = Diff.diffLines(oldText, newText, { newlineIsToken: false });

  const left: LineInfo[] = [];
  const right: LineInfo[] = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const part of changes) {
    const lines = part.value.split("\n");
    // Remove trailing empty string from split
    if (lines[lines.length - 1] === "") lines.pop();

    if (part.removed) {
      for (const line of lines) {
        left.push({ lineNumber: leftLine++, content: line, type: "removed" });
        right.push({ lineNumber: null, content: "", type: "unchanged" });
      }
    } else if (part.added) {
      for (const line of lines) {
        left.push({ lineNumber: null, content: "", type: "unchanged" });
        right.push({ lineNumber: rightLine++, content: line, type: "added" });
      }
    } else {
      for (const line of lines) {
        left.push({ lineNumber: leftLine++, content: line, type: "unchanged" });
        right.push({ lineNumber: rightLine++, content: line, type: "unchanged" });
      }
    }
  }

  return { left, right };
}

function buildUnifiedLines(oldText: string, newText: string): LineInfo[] {
  const changes = Diff.diffLines(oldText, newText, { newlineIsToken: false });
  const result: LineInfo[] = [];
  let lineNum = 1;

  for (const part of changes) {
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();

    for (const line of lines) {
      if (part.removed) {
        result.push({ lineNumber: lineNum++, content: line, type: "removed" });
      } else if (part.added) {
        result.push({ lineNumber: lineNum++, content: line, type: "added" });
      } else {
        result.push({ lineNumber: lineNum++, content: line, type: "unchanged" });
      }
    }
  }

  return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const lineClass = (type: LineInfo["type"]) => {
  switch (type) {
    case "added":
      return "bg-emerald-950/60 border-l-2 border-emerald-500";
    case "removed":
      return "bg-red-950/60 border-l-2 border-red-500";
    default:
      return "bg-transparent border-l-2 border-transparent";
  }
};

const linePrefix = (type: LineInfo["type"]) => {
  switch (type) {
    case "added":
      return <span className="text-emerald-400 select-none w-4 inline-block">+</span>;
    case "removed":
      return <span className="text-red-400 select-none w-4 inline-block">−</span>;
    default:
      return <span className="text-slate-600 select-none w-4 inline-block"> </span>;
  }
};

const DiffLine: React.FC<{ info: LineInfo }> = ({ info }) => (
  <div className={`flex items-start px-2 py-0.5 font-mono text-xs ${lineClass(info.type)}`}>
    <span className="text-slate-600 select-none w-8 text-right mr-3 shrink-0">
      {info.lineNumber ?? ""}
    </span>
    {linePrefix(info.type)}
    <span
      className={`whitespace-pre-wrap break-all leading-5 ${
        info.type === "added"
          ? "text-emerald-200"
          : info.type === "removed"
          ? "text-red-200 line-through opacity-70"
          : "text-slate-300"
      }`}
    >
      {info.content || " "}
    </span>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const DiffViewer: React.FC<DiffViewerProps> = ({
  oldText,
  newText,
  oldLabel = "旧版本",
  newLabel = "新版本",
  mode = "split",
}) => {
  const stats = useMemo(() => {
    const changes = Diff.diffLines(oldText, newText);
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      const lines = c.value.split("\n").filter((l) => l !== "" || c.value.endsWith("\n")).length;
      if (c.added) added += lines;
      if (c.removed) removed += lines;
    }
    return { added, removed };
  }, [oldText, newText]);

  const { left, right } = useMemo(
    () => (mode === "split" ? buildSplitLines(oldText, newText) : { left: [], right: [] }),
    [oldText, newText, mode]
  );

  const unified = useMemo(
    () => (mode === "unified" ? buildUnifiedLines(oldText, newText) : []),
    [oldText, newText, mode]
  );

  const hasChanges = stats.added > 0 || stats.removed > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Stats bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700">
        <span className="text-xs text-slate-400">变更统计：</span>
        <span className="text-xs font-mono text-emerald-400">+{stats.added} 行新增</span>
        <span className="text-xs font-mono text-red-400">−{stats.removed} 行删除</span>
        {!hasChanges && (
          <span className="text-xs text-slate-500 italic">内容完全相同</span>
        )}
      </div>

      {!hasChanges ? (
        <div className="flex items-center justify-center h-24 rounded-lg border border-slate-700 bg-slate-900/40">
          <span className="text-sm text-slate-500">两个版本内容完全相同</span>
        </div>
      ) : mode === "split" ? (
        /* Split view */
        <div className="grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-slate-700">
          {/* Left panel header */}
          <div className="px-3 py-2 bg-red-950/40 border-b border-r border-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs font-medium text-red-300 truncate">{oldLabel}</span>
          </div>
          {/* Right panel header */}
          <div className="px-3 py-2 bg-emerald-950/40 border-b border-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-emerald-300 truncate">{newLabel}</span>
          </div>
          {/* Left lines */}
          <div className="border-r border-slate-700 bg-slate-950/60 overflow-auto max-h-96">
            {left.map((info, i) => (
              <DiffLine key={i} info={info} />
            ))}
          </div>
          {/* Right lines */}
          <div className="bg-slate-950/60 overflow-auto max-h-96">
            {right.map((info, i) => (
              <DiffLine key={i} info={info} />
            ))}
          </div>
        </div>
      ) : (
        /* Unified view */
        <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-950/60">
          <div className="px-3 py-2 bg-slate-800/60 border-b border-slate-700 flex items-center gap-4">
            <span className="text-xs text-slate-400">
              <span className="text-red-400 font-mono">{oldLabel}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-emerald-400 font-mono">{newLabel}</span>
            </span>
          </div>
          <div className="overflow-auto max-h-96">
            {unified.map((info, i) => (
              <DiffLine key={i} info={info} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DiffViewer;
