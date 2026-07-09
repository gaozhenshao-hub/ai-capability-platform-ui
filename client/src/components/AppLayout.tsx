import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plug,
  ScrollText,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { icon: LayoutDashboard, label: "仪表盘", path: "/" },
  { icon: FolderKanban, label: "项目管理", path: "/projects" },
  { icon: Brain, label: "LLM 模型", path: "/models" },
  { icon: Sparkles, label: "Skill 技能", path: "/skills" },
  { icon: Bot, label: "Agent 智能体", path: "/agents" },
  { icon: Plug, label: "MCP 连接器", path: "/mcp" },
  { icon: BookOpen, label: "知识库", path: "/knowledge" },
  { icon: ScrollText, label: "审计日志", path: "/audit" },
  { icon: ArrowLeftRight, label: "数据迁移", path: "/migration" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const { user, loading } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = getLoginUrl();
    },
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="h-8 w-8 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Emperor 皇帝</h1>
            <p className="mt-2 text-slate-400">请登录以继续</p>
          </div>
          <a
            href={getLoginUrl()}
            className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e1a]">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-white/5 bg-[#0d1117] transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-white/5">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="truncate text-sm font-semibold text-white">Emperor 皇帝</span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="ml-1 shrink-0 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-violet-600/20 text-violet-300 ring-1 ring-violet-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 p-2 space-y-0.5">
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-medium text-violet-300">
                  {(user.name || "U").charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate text-xs text-slate-300">{user.name || user.email || "用户"}</span>
              </div>
              <button
                onClick={() => logoutMutation.mutate()}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>退出登录</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
