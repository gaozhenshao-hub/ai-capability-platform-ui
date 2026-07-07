/**
 * AIPlatformAssistant — 平台内置 AI 助手浮动聊天组件
 * 右下角浮动按钮，点击展开聊天窗口
 * 支持多轮对话、工具调用、Markdown 渲染、快捷操作
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, Sparkles, Zap, Plus, ChevronDown } from "lucide-react";
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

// ─── 简单 Markdown 渲染（不引入额外依赖）──────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-zinc-800 rounded p-2 my-2 overflow-x-auto text-xs"><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 rounded text-xs text-blue-300">$1</code>')
    // 粗体
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    // 斜体
    .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
    // 标题
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-2 mb-1 text-blue-300">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-sm mt-3 mb-1 text-blue-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-base mt-3 mb-1 text-white">$1</h1>')
    // 无序列表
    .replace(/^[-*] (.+)$/gm, '<li class="ml-3 list-disc list-inside text-sm">$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal list-inside text-sm">$1</li>')
    // 换行
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
      {/* 头像 */}
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
          isUser ? "bg-blue-600 text-white" : "bg-gradient-to-br from-violet-600 to-blue-600 text-white"
        )}
      >
        {isUser ? "我" : <Bot className="w-4 h-4" />}
      </div>
      {/* 消息内容 */}
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

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export function AIPlatformAssistant({ agentId, context }: AIPlatformAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好！我是 **AI 能力平台助手** 🤖\n\n我可以帮你：\n- 了解平台功能和模块\n- 推荐适合任务的 Skill 组合\n- 分析 Agent 运行问题\n- 辅助配置工作流节点\n\n请问有什么我可以帮你的？",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.assistant.chat.useMutation({
    onError: (err) => {
      toast.error(`AI 助手出错：${err.message}`);
      setIsLoading(false);
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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

      // 构建发送给后端的消息历史（排除欢迎消息）
      const history = [...messages.filter((m) => m.id !== "welcome"), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      try {
        const result = await chatMutation.mutateAsync({
          messages: history,
          agentId,
          context,
        });

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, chatMutation, agentId, context]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearHistory = () => {
    setMessages([
      {
        id: "welcome-" + Date.now(),
        role: "assistant",
        content: "对话已清空。有什么新问题我可以帮你解答？",
        timestamp: new Date(),
      },
    ]);
    setShowQuickActions(true);
  };

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-300",
          "bg-gradient-to-br from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500",
          "active:scale-95",
          isOpen && "rotate-0"
        )}
        title="AI 平台助手"
      >
        {isOpen ? (
          <ChevronDown className="w-6 h-6 text-white" />
        ) : (
          <Bot className="w-6 h-6 text-white" />
        )}
        {/* 未读消息指示器 */}
        {!isOpen && messages.length > 1 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
            {Math.min(messages.filter((m) => m.role === "assistant").length - 1, 9)}
          </span>
        )}
      </button>

      {/* 聊天窗口 */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px]",
            "flex flex-col rounded-2xl shadow-2xl border border-zinc-700",
            "bg-zinc-900 overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-200"
          )}
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900/50 to-blue-900/50 border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">AI 平台助手</div>
                <div className="text-xs text-zinc-400">
                  {agentId ? `上下文：Agent #${agentId}` : "全局模式"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                title="清空对话"
              >
                清空
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* 快捷操作 */}
          {showQuickActions && messages.length <= 2 && (
            <div className="px-4 pb-2">
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
          <div className="px-4 pb-4 pt-2 border-t border-zinc-700">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
                disabled={isLoading}
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
                disabled={isLoading || !input.trim()}
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
              AI 助手可能出错，重要决策请人工确认
            </div>
          </div>
        </div>
      )}
    </>
  );
}
