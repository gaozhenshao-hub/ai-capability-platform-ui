/**
 * AIPlatformAssistant — 平台内置 AI 助手浮动聊天组件
 * 支持多轮对话、工具调用、Markdown 渲染、快捷操作
 * Phase 6.2 升级：会话历史持久化，刷新页面后对话上下文不丢失
 * Phase 6.3 升级：LLM 大模型设置面板（模型选择 + 参数调整）
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, X, Send, Loader2, Sparkles, Zap, Plus, ChevronDown,
  History, Trash2, MessageSquare, ChevronLeft, PenLine, Settings, Save, RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIPlatformAssistantProps {
  /** 当前正在编辑的 Agent ID（在 AgentCanvas 页面时传入，实现上下文感知） */
  agentId?: number;
  /** 额外上下文描述 */
  context?: string;
}

// ─── 简单 Markdown 渲染 ───────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-zinc-800 rounded p-2 my-2 overflow-x-auto text-xs"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 rounded text-xs text-blue-300">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-2 mb-1 text-blue-300">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-sm mt-3 mb-1 text-blue-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-base mt-3 mb-1 text-white">$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-3 list-disc list-inside text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal list-inside text-sm">$1</li>')
    .replace(/\n/g, "<br/>");
}

// ─── 快捷操作按钮配置 ────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: Sparkles, label: "推荐 Skill", prompt: "请根据我的需求推荐合适的 Skill 组合，我想了解平台有哪些可用的 Skill。" },
  { icon: Zap, label: "优化 Agent", prompt: "请帮我分析当前 Agent 的运行情况，给出优化建议。" },
  { icon: Plus, label: "创建 Agent", prompt: "我想创建一个新的 Agent，请帮我规划工作流节点和配置步骤。" },
];

// ─── 打字指示器 ──────────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-400 ml-1">AI 正在思考...</span>
    </div>
  );
}

// ─── 消息气泡 ────────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2 mb-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
          isUser ? "bg-blue-600 text-white" : "bg-gradient-to-br from-violet-600 to-blue-600 text-white"
        )}
      >
        {isUser ? "我" : <Bot className="w-4 h-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div
            className="prose-sm text-zinc-100"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
        <div className={cn("text-xs mt-1 opacity-50", isUser ? "text-right" : "text-left")}>
          {message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── 会话列表面板 ────────────────────────────────────────────────────────────
interface SessionListPanelProps {
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onClose: () => void;
}

function SessionListPanel({ currentSessionId, onSelectSession, onNewSession, onClose }: SessionListPanelProps) {
  const { data, isLoading, refetch } = trpc.assistant.listSessions.useQuery({ limit: 30, offset: 0 });
  const deleteSessionMutation = trpc.assistant.deleteSession.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-white">历史对话</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            新对话
          </button>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-500">还没有历史对话</p>
            <button
              onClick={onNewSession}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              开始第一次对话
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                  currentSessionId === session.id
                    ? "bg-blue-600/20 border border-blue-500/30"
                    : "hover:bg-zinc-800 border border-transparent"
                )}
                onClick={() => onSelectSession(session.id)}
              >
                <MessageSquare className={cn(
                  "w-4 h-4 mt-0.5 flex-shrink-0",
                  currentSessionId === session.id ? "text-blue-400" : "text-zinc-500"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-200 truncate">{session.title}</div>
                  {session.lastMessagePreview && (
                    <div className="text-xs text-zinc-500 truncate mt-0.5">{session.lastMessagePreview}</div>
                  )}
                  <div className="text-xs text-zinc-600 mt-0.5">
                    {new Date(session.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                    {" · "}
                    {session.messageCount} 条消息
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("确认删除此对话？")) {
                      deleteSessionMutation.mutate({ sessionId: session.id });
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LLM 设置面板 ────────────────────────────────────────────────────────────
interface SettingsPanelProps {
  onClose: () => void;
}

function SettingsPanel({ onClose }: SettingsPanelProps) {
  const utils = trpc.useUtils();
  const { data: currentSettings, isLoading: settingsLoading } = trpc.assistant.getSettings.useQuery();
  const { data: models = [], isLoading: modelsLoading } = trpc.assistant.listAvailableModels.useQuery();

  const [modelId, setModelId] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("0.7");
  const [maxTokens, setMaxTokens] = useState<string>("2048");
  const [enableTools, setEnableTools] = useState<boolean>(true);
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  // 从服务端加载设置
  useEffect(() => {
    if (currentSettings && !initialized) {
      setModelId(currentSettings.modelId ?? "");
      setTemperature(currentSettings.temperature ?? "0.70");
      setMaxTokens(String(currentSettings.maxTokens ?? 2048));
      setEnableTools(currentSettings.enableTools ?? true);
      setCustomSystemPrompt(currentSettings.customSystemPrompt ?? "");
      setInitialized(true);
    }
  }, [currentSettings, initialized]);

  const updateSettingsMutation = trpc.assistant.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("设置已保存");
      utils.assistant.getSettings.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  });

  const handleSave = () => {
    const tempNum = parseFloat(temperature);
    const tokensNum = parseInt(maxTokens, 10);
    if (isNaN(tempNum) || tempNum < 0 || tempNum > 2) {
      toast.error("Temperature 必须在 0 ~ 2 之间");
      return;
    }
    if (isNaN(tokensNum) || tokensNum < 256 || tokensNum > 8192) {
      toast.error("最大 Token 数必须在 256 ~ 8192 之间");
      return;
    }
    updateSettingsMutation.mutate({
      modelId: modelId || null,
      temperature: tempNum,
      maxTokens: tokensNum,
      enableTools,
      customSystemPrompt: customSystemPrompt.trim() || null,
    });
  };

  const handleReset = () => {
    setModelId("");
    setTemperature("0.70");
    setMaxTokens("2048");
    setEnableTools(true);
    setCustomSystemPrompt("");
  };

  const isLoading = settingsLoading || modelsLoading;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-white">AI 助手设置</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 设置内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {/* 模型选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">LLM 模型</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">系统默认模型</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">选择 AI 助手使用的语言模型，留空则使用系统默认模型</p>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">Temperature（创造性）</label>
                <span className="text-xs text-blue-400 font-mono">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={parseFloat(temperature) || 0.7}
                onChange={(e) => setTemperature(parseFloat(e.target.value).toFixed(1))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-zinc-600">
                <span>0 精确</span>
                <span>1 平衡</span>
                <span>2 创意</span>
              </div>
              <p className="text-xs text-zinc-500">较低值输出更稳定，较高值输出更有创意</p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">最大输出 Token 数</label>
              <input
                type="number"
                min={256}
                max={8192}
                step={256}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-zinc-500">范围 256 ~ 8192，建议 2048（默认）</p>
            </div>

            {/* 工具调用开关 */}
            <div className="flex items-center justify-between py-2 border-t border-zinc-700/50">
              <div>
                <p className="text-xs font-medium text-zinc-300">启用工具调用</p>
                <p className="text-xs text-zinc-500 mt-0.5">允许 AI 助手查询平台数据（Skill 列表、Agent 状态等）</p>
              </div>
              <button
                onClick={() => setEnableTools((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                  enableTools ? "bg-blue-600" : "bg-zinc-600"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                    enableTools ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            {/* 自定义系统 Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">自定义补充说明（可选）</label>
              <textarea
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                placeholder="在此输入对 AI 助手的额外说明，例如：请重点关注广告优化相关问题..."
                rows={4}
                maxLength={2000}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none placeholder:text-zinc-600"
              />
              <div className="flex justify-between text-xs text-zinc-600">
                <span>将追加到系统 Prompt 末尾</span>
                <span>{customSystemPrompt.length}/2000</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="px-4 py-3 border-t border-zinc-700 flex-shrink-0 flex gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          恢复默认
        </button>
        <button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all",
            "bg-blue-600 hover:bg-blue-500 text-white",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {updateSettingsMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          保存设置
        </button>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export function AIPlatformAssistant({ agentId, context }: AIPlatformAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 当前会话 ID（null = 尚未创建）
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // 本地消息状态（UI 展示用）
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好！我是 **Emperor 皇帝 AI 助手** 🤖\n\n我可以帮你：\n- 了解 Emperor 皇帝平台功能和模块\n- 推荐适合任务的 Skill 组合\n- 分析 Agent 运行问题\n- 辅助配置工作流节点\n\n**对话记录已自动保存**，刷新页面后可从历史记录恢复。\n\n请问有什么我可以帮你的？",
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();

  // 持久化对话 mutation（新接口）
  const chatWithSessionMutation = trpc.assistant.chatWithSession.useMutation({
    onError: (err) => {
      toast.error(`AI 助手出错：${err.message}`);
      setIsLoading(false);
    },
  });

  // 更新会话标题 mutation
  const updateTitleMutation = trpc.assistant.updateSessionTitle.useMutation({
    onSuccess: () => {
      utils.assistant.listSessions.invalidate();
      setEditingTitle(false);
    },
    onError: (e) => toast.error(`更新标题失败：${e.message}`),
  });

  // 加载指定会话的历史消息
  const loadSessionMessages = useCallback(async (sessionId: number) => {
    setIsLoadingHistory(true);
    setShowHistory(false);
    setShowSettings(false);
    try {
      const result = await utils.assistant.getSessionMessages.fetch({ sessionId });
      if (result.messages.length > 0) {
        const loadedMessages: Message[] = result.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id.toString(),
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
        setMessages(loadedMessages);
        setShowQuickActions(false);
        setCurrentSessionId(sessionId);
        if (result.session?.title) {
          setTitleInput(result.session.title);
        }
      }
    } catch (e) {
      toast.error("加载历史消息失败");
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [utils.assistant.getSessionMessages]);

  // 自动滚动到底部
  useEffect(() => {
    if (isOpen && !showHistory && !showSettings) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, showHistory, showSettings]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen && !showHistory && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, showHistory, showSettings]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);
      setShowQuickActions(false);

      try {
        const result = await chatWithSessionMutation.mutateAsync({
          sessionId: currentSessionId ?? undefined,
          userMessage: text.trim(),
          agentId,
          context,
        });

        // 如果是新会话，记录 sessionId
        if (!currentSessionId && result.sessionId) {
          setCurrentSessionId(result.sessionId);
          utils.assistant.listSessions.invalidate();
        }

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // 刷新会话列表（更新 lastMessagePreview）
        utils.assistant.listSessions.invalidate();
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, chatWithSessionMutation, currentSessionId, agentId, context, utils.assistant.listSessions]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([
      {
        id: "welcome-" + Date.now(),
        role: "assistant",
        content: "已开始新对话！有什么我可以帮你的？",
        timestamp: new Date(),
      },
    ]);
    setShowQuickActions(true);
    setShowHistory(false);
    setShowSettings(false);
    setEditingTitle(false);
  };

  const handleTitleSave = () => {
    if (!currentSessionId || !titleInput.trim()) return;
    updateTitleMutation.mutate({ sessionId: currentSessionId, title: titleInput.trim() });
  };

  // 未读消息数（仅 assistant 回复，排除欢迎消息）
  const unreadCount = messages.filter((m) => m.role === "assistant" && m.id !== "welcome" && !m.id.startsWith("welcome-")).length;

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-300",
          "bg-gradient-to-br from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500",
          "active:scale-95"
        )}
        title="AI 平台助手"
      >
        {isOpen ? (
          <ChevronDown className="w-6 h-6 text-white" />
        ) : (
          <Bot className="w-6 h-6 text-white" />
        )}
        {/* 未读消息角标 */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
            {Math.min(unreadCount, 9)}
          </span>
        )}
      </button>

      {/* 聊天窗口 */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-24 right-6 z-50 w-[380px]",
            "flex flex-col rounded-2xl shadow-2xl border border-zinc-700",
            "bg-zinc-900 overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-200"
          )}
          style={{ maxHeight: "calc(100vh - 120px)", height: "600px" }}
        >
          {showHistory ? (
            /* ── 历史会话面板 ── */
            <SessionListPanel
              currentSessionId={currentSessionId}
              onSelectSession={loadSessionMessages}
              onNewSession={startNewSession}
              onClose={() => setShowHistory(false)}
            />
          ) : showSettings ? (
            /* ── 设置面板 ── */
            <SettingsPanel onClose={() => setShowSettings(false)} />
          ) : (
            /* ── 聊天面板 ── */
            <>
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900/50 to-blue-900/50 border-b border-zinc-700 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingTitle && currentSessionId ? (
                      <input
                        autoFocus
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onBlur={handleTitleSave}
                        onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(); if (e.key === "Escape") setEditingTitle(false); }}
                        className="w-full text-sm font-semibold bg-zinc-800 text-white border border-zinc-600 rounded px-2 py-0.5 focus:outline-none focus:border-blue-500"
                      />
                    ) : (
                      <div
                        className="text-sm font-semibold text-white truncate cursor-pointer hover:text-blue-300 transition-colors flex items-center gap-1"
                        onClick={() => {
                          if (currentSessionId) {
                            setEditingTitle(true);
                          }
                        }}
                        title={currentSessionId ? "点击编辑标题" : undefined}
                      >
                        AI 平台助手
                        {currentSessionId && <PenLine className="w-3 h-3 opacity-50" />}
                      </div>
                    )}
                    <div className="text-xs text-zinc-400">
                      {agentId ? `上下文：Agent #${agentId}` : currentSessionId ? `会话 #${currentSessionId}` : "新对话"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* 设置按钮 */}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-700 transition-colors"
                    title="AI 助手设置"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {/* 历史记录按钮 */}
                  <button
                    onClick={() => setShowHistory(true)}
                    className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-700 transition-colors"
                    title="历史对话"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  {/* 新对话按钮 */}
                  <button
                    onClick={startNewSession}
                    className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-700 transition-colors"
                    title="新对话"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {/* 关闭按钮 */}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                    <span className="text-xs text-zinc-500">加载历史消息...</span>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {isLoading && <TypingIndicator />}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 快捷操作 */}
              {showQuickActions && messages.length <= 2 && (
                <div className="px-4 pb-2 flex-shrink-0">
                  <div className="text-xs text-zinc-500 mb-2">快捷操作</div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        disabled={isLoading}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs",
                          "bg-zinc-800 text-zinc-300 border border-zinc-700",
                          "hover:bg-zinc-700 hover:text-white hover:border-zinc-600",
                          "transition-all duration-150 active:scale-95",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        <action.icon className="w-3 h-3" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 输入区域 */}
              <div className="px-4 pb-4 pt-2 border-t border-zinc-700 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
                    disabled={isLoading || isLoadingHistory}
                    rows={1}
                    className={cn(
                      "flex-1 resize-none rounded-xl px-3 py-2.5 text-sm",
                      "bg-zinc-800 text-zinc-100 border border-zinc-700",
                      "placeholder:text-zinc-500",
                      "focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-all duration-150",
                      "max-h-32 overflow-y-auto"
                    )}
                    style={{ minHeight: "40px" }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 128) + "px";
                    }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={isLoading || isLoadingHistory || !input.trim()}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      "bg-blue-600 hover:bg-blue-500 text-white",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      "transition-all duration-150 active:scale-95"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="text-xs text-zinc-600 mt-1.5 text-center">
                  {currentSessionId
                    ? `对话已自动保存（会话 #${currentSessionId}）· AI 建议仅供参考`
                    : "发送消息后将自动创建会话并保存 · AI 建议仅供参考"}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
