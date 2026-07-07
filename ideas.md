# AI Capability Platform — 设计方案

## 选定方案：Deep Space Command Center（深空指挥中心）

**Design Movement:** 深色科技 SaaS / Neomorphic Dark
**Brand Essence:** 企业级 AI 能力管理平台 · 面向技术团队 · 专业、精准、可控

### Core Principles
1. **深色优先**：深海蓝黑为底，减少视觉疲劳，突出数据与状态
2. **信息密度平衡**：侧边导航 + 内容区，高密度但不拥挤
3. **状态可视化**：颜色编码（绿=健康、黄=警告、红=错误、紫=AI）贯穿全局
4. **精准微交互**：hover 高亮、状态切换、数据加载动画

### Color Philosophy
- 背景：`oklch(0.10 0.01 265)` — 深海蓝黑
- 侧边栏：`oklch(0.13 0.012 265)` — 略浅一层
- 卡片：`oklch(0.15 0.015 265)` — 卡片层
- 主色：`oklch(0.60 0.20 265)` — 电光蓝紫（Indigo）
- 强调：`oklch(0.65 0.18 155)` — 翠绿（成功/健康）
- 警告：`oklch(0.75 0.18 80)` — 琥珀黄
- 危险：`oklch(0.65 0.22 25)` — 深红

### Layout Paradigm
- 固定左侧导航栏（240px），图标 + 文字
- 顶部 header 显示面包屑 + 用户信息
- 主内容区自适应宽度，最大 1400px
- 卡片式布局，圆角 8px，微阴影

### Typography System
- 标题：Space Grotesk（技术感几何字体）
- 正文：Inter（清晰可读）
- 代码：JetBrains Mono（等宽代码）

### Signature Elements
1. 侧边栏激活项：左侧 3px 彩色竖线 + 背景高亮
2. 状态徽章：圆角 pill 形，颜色编码
3. 数据卡片：顶部彩色渐变线条

### Brand Voice
- 标题：简洁、技术、精准 — "Skill 管理"而非"管理您的技能"
- 操作按钮：动词开头 — "运行测试"、"发布版本"

## Style Decisions
- 使用 dark theme，背景色 oklch(0.10 0.01 265)
- 侧边栏宽度 240px，固定不折叠
- 所有卡片使用 border + 微阴影，不使用纯色背景块
- 代码区域使用 JetBrains Mono，颜色 oklch(0.70 0.15 265)
