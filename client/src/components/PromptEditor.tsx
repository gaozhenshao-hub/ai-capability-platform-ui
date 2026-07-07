import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string | number;
  readOnly?: boolean;
  /** 已知变量列表，用于自动补全 */
  knownVariables?: string[];
  /** 是否显示变量预览面板 */
  showPreview?: boolean;
  /** 变量示例值（用于预览渲染） */
  previewValues?: Record<string, string>;
  onPreviewValuesChange?: (values: Record<string, string>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 从 Prompt 文本中提取所有 {{变量名}} */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  const names = matches.map((m) => m.slice(2, -2).trim());
  return Array.from(new Set(names));
}

/** 将 Prompt 文本中的 {{变量}} 替换为示例值 */
function renderPreview(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    const key = name.trim();
    return values[key] !== undefined ? `[${values[key]}]` : `[${key}]`;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const MONACO_LANGUAGE = "prompt-template";

export const PromptEditor: React.FC<PromptEditorProps> = ({
  value,
  onChange,
  placeholder,
  height = 220,
  readOnly = false,
  knownVariables = [],
  showPreview = true,
  previewValues = {},
  onPreviewValuesChange,
}) => {
  const monaco = useMonaco();
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [localPreviewValues, setLocalPreviewValues] = useState<Record<string, string>>(previewValues);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Sync external previewValues
  useEffect(() => {
    setLocalPreviewValues(previewValues);
  }, [JSON.stringify(previewValues)]);

  // Detect variables whenever value changes
  useEffect(() => {
    const vars = extractVariables(value);
    setDetectedVars(vars);
  }, [value]);

  // Register language + tokens once Monaco is ready
  useEffect(() => {
    if (!monaco) return;

    // Register language if not already registered
    const existing = monaco.languages.getLanguages().find((l) => l.id === MONACO_LANGUAGE);
    if (!existing) {
      monaco.languages.register({ id: MONACO_LANGUAGE });
    }

    // Tokenizer: highlight {{variable}} in orange
    monaco.languages.setMonarchTokensProvider(MONACO_LANGUAGE, {
      tokenizer: {
        root: [
          [/\{\{[^}]*\}\}/, "variable.template"],
          [/[^\{]+/, "text"],
          [/\{/, "text"],
        ],
      },
    });

    // Define theme tokens
    monaco.editor.defineTheme("prompt-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "variable.template", foreground: "f59e0b", fontStyle: "bold" },
        { token: "text", foreground: "e2e8f0" },
      ],
      colors: {
        "editor.background": "#0f172a",
        "editor.foreground": "#e2e8f0",
        "editorLineNumber.foreground": "#475569",
        "editor.lineHighlightBackground": "#1e293b",
        "editorCursor.foreground": "#a78bfa",
        "editor.selectionBackground": "#334155",
      },
    });

    // Auto-completion for {{variables}}
    const allVars = Array.from(new Set([...knownVariables, ...detectedVars]));
    const disposable = monaco.languages.registerCompletionItemProvider(MONACO_LANGUAGE, {
      triggerCharacters: ["{"],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.substring(0, position.column - 1);

        // Only suggest after {{
        if (!beforeCursor.endsWith("{{")) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: MonacoType.languages.CompletionItem[] = allVars.map((v) => ({
          label: v,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `${v}}}`,
          detail: "Prompt 变量",
          documentation: `插入变量 {{${v}}}`,
          range,
        }));

        return { suggestions };
      },
    });

    return () => {
      disposable.dispose();
    };
  }, [monaco, knownVariables.join(","), detectedVars.join(",")]);

  const handleEditorMount = useCallback(
    (editor: MonacoType.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      // Apply theme
      editor.updateOptions({ theme: "prompt-dark" });
    },
    []
  );

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? "");
    },
    [onChange]
  );

  const handlePreviewValueChange = (varName: string, val: string) => {
    const next = { ...localPreviewValues, [varName]: val };
    setLocalPreviewValues(next);
    onPreviewValuesChange?.(next);
  };

  const previewText = renderPreview(value, localPreviewValues);

  return (
    <div className="flex flex-col gap-2">
      {/* Editor */}
      <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-[#0f172a]">
        {/* Placeholder overlay */}
        {!value && placeholder && (
          <div className="absolute top-3 left-14 text-slate-500 text-sm pointer-events-none z-10 font-mono">
            {placeholder}
          </div>
        )}
        <Editor
          height={height}
          language={MONACO_LANGUAGE}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="prompt-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            renderLineHighlight: "line",
            padding: { top: 12, bottom: 12 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              vertical: "auto",
              horizontal: "hidden",
              useShadows: false,
            },
            suggest: {
              showVariables: true,
            },
          }}
        />
      </div>

      {/* Variable chips */}
      {detectedVars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-500">检测到变量：</span>
          {detectedVars.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30"
            >
              {`{{${v}}}`}
            </span>
          ))}
          {showPreview && (
            <button
              type="button"
              onClick={() => setPreviewOpen((p) => !p)}
              className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {previewOpen ? "收起预览 ▲" : "展开预览 ▼"}
            </button>
          )}
        </div>
      )}

      {/* Preview panel */}
      {showPreview && previewOpen && detectedVars.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-3">
          <p className="text-xs text-slate-400 font-medium">填写示例值预览渲染结果</p>
          {/* Variable inputs */}
          <div className="grid grid-cols-2 gap-2">
            {detectedVars.map((v) => (
              <div key={v} className="flex flex-col gap-1">
                <label className="text-xs text-amber-400 font-mono">{`{{${v}}}`}</label>
                <input
                  type="text"
                  value={localPreviewValues[v] ?? ""}
                  onChange={(e) => handlePreviewValueChange(v, e.target.value)}
                  placeholder={`输入 ${v} 的示例值`}
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            ))}
          </div>
          {/* Rendered preview */}
          <div className="rounded bg-slate-800 border border-slate-700 p-3">
            <p className="text-xs text-slate-500 mb-1.5">渲染结果：</p>
            <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">
              {previewText || <span className="text-slate-500 italic">（空）</span>}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptEditor;
