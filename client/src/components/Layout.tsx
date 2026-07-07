// Deep Space Command Center — Layout
// Persistent left sidebar (240px) + top header + main content area

import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Zap, Bot, Cpu, Plug, BookOpen,
  ClipboardList, ChevronRight, Activity, Settings, LogOut
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/",          label: "仪表盘",    icon: LayoutDashboard, accent: "blue"   },
  { path: "/skills",    label: "Skill 管理", icon: Zap,             accent: "purple" },
  { path: "/agents",    label: "Agent 管理", icon: Bot,             accent: "green"  },
  { path: "/models",    label: "模型路由",   icon: Cpu,             accent: "yellow" },
  { path: "/mcp",       label: "MCP 连接器", icon: Plug,            accent: "purple" },
  { path: "/knowledge", label: "知识库",     icon: BookOpen,        accent: "blue"   },
  { path: "/audit",     label: "审计日志",   icon: ClipboardList,   accent: "gray"   },
];

const ACCENT_COLORS: Record<string, string> = {
  blue:   "oklch(0.60 0.20 265)",
  green:  "oklch(0.65 0.18 155)",
  yellow: "oklch(0.75 0.18 80)",
  purple: "oklch(0.65 0.20 300)",
  gray:   "oklch(0.55 0.012 265)",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.10 0.012 265)" }}>
      {/* ── Sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col h-full border-r"
        style={{
          width: 240,
          background: "oklch(0.12 0.013 265)",
          borderColor: "oklch(0.20 0.015 265)",
        }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: "oklch(0.20 0.015 265)" }}>
          <div className="flex items-center justify-center rounded-lg"
            style={{ width: 32, height: 32, background: "oklch(0.60 0.20 265)", flexShrink: 0 }}>
            <Activity size={16} color="white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              AI Platform
            </div>
            <div className="text-xs" style={{ color: "oklch(0.55 0.012 265)" }}>能力管理控制台</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="text-xs font-medium uppercase tracking-wider px-3 mb-2"
            style={{ color: "oklch(0.40 0.012 265)", fontFamily: "'Space Grotesk', sans-serif" }}>
            核心功能
          </div>
          {NAV_ITEMS.map(({ path, label, icon: Icon, accent }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            const color = ACCENT_COLORS[accent];
            return (
              <Link key={path} href={path}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 cursor-pointer transition-all relative"
                  style={{
                    background: isActive ? "oklch(0.18 0.016 265)" : "transparent",
                    color: isActive ? "white" : "oklch(0.65 0.012 265)",
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "oklch(0.16 0.014 265)";
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}>
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                      style={{ width: 3, height: 20, background: color }} />
                  )}
                  <Icon size={15} style={{ color: isActive ? color : "oklch(0.50 0.012 265)", flexShrink: 0 }} />
                  <span className="text-sm font-medium">{label}</span>
                  {isActive && <ChevronRight size={12} className="ml-auto" style={{ color: "oklch(0.50 0.012 265)" }} />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t" style={{ borderColor: "oklch(0.20 0.015 265)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "oklch(0.15 0.014 265)" }}>
            <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "oklch(0.65 0.18 155)" }} />
            <span className="text-xs" style={{ color: "oklch(0.65 0.012 265)" }}>服务运行中</span>
            <span className="text-xs ml-auto font-mono" style={{ color: "oklch(0.50 0.012 265)" }}>:4800</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b"
          style={{ background: "oklch(0.12 0.013 265)", borderColor: "oklch(0.20 0.015 265)", height: 56 }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "oklch(0.55 0.012 265)" }}>
            <span>AI Platform</span>
            <ChevronRight size={12} />
            <span style={{ color: "white" }}>
              {NAV_ITEMS.find(n => n.path === "/" ? location === "/" : location.startsWith(n.path))?.label || "页面"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: "oklch(0.18 0.016 265)", color: "oklch(0.60 0.20 265)", border: "1px solid oklch(0.25 0.018 265)" }}>
              v1.0.0
            </div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "oklch(0.60 0.20 265)", color: "white" }}>
              A
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
