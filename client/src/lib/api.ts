// API layer — proxies to the cloud computer backend at http://104.196.50.157:4800
// Deep Space Command Center design: professional SaaS dark theme

const BASE_URL = "http://104.196.50.157:4800";
const AUTH_TOKEN = "dev-service-token";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:   <T>(path: string) => request<T>(path),
  post:  <T>(path: string, body?: unknown) => request<T>(path, { method: "POST",  body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del:   <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Skill {
  slug: string;
  name: string;
  description: string;
  category: string;
  version: number;
  status: string;
  riskTier: string;
  callCount: number;
}

export interface SkillRunResult {
  output: unknown;
  duration: number;
  modelSlug?: string;
  usage: { promptTokens: number; completionTokens: number; cost: number };
}

export interface AgentNode {
  id: string; type: string; name: string;
  skillSlug?: string; requiresApproval?: boolean;
}
export interface AgentEdge {
  from: string; to: string; condition?: string;
}
export interface AgentStep {
  nodeId: string; nodeName: string; nodeType: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown; errorMessage?: string; progress: number;
}
export interface Agent {
  slug: string; name: string; description: string;
  status: string; nodeCount: number; edgeCount: number;
}
export interface AgentDetail extends Agent {
  nodes: AgentNode[]; edges: AgentEdge[];
  maxConcurrency: number; timeoutMs: number;
}
export interface AgentRunDetail {
  id: string; status: string; traceId?: string;
  input: unknown; durationMs?: number;
  createdAt: number; steps?: AgentStep[];
}

export interface Model {
  slug: string; displayName: string; provider: string;
  isActive: boolean; isDefault: boolean; health: string;
  contextWindow: number; inputCostPer1k: number; outputCostPer1k: number;
  supportsVision: boolean; supportsJsonMode: boolean; supportsStreaming: boolean;
  totalCalls: number; avgLatencyMs: number;
}

export interface McpConnector {
  slug: string; name: string; description?: string;
  type: string; endpoint?: string; status: string; totalCalls?: number;
}

export interface KnowledgeItem {
  id: string; collectionId: string; title: string; content: string;
  tags: string[]; status: string; sensitivity: string;
  createdAt: number; updatedAt: number;
}
export interface KnowledgeCollection {
  id: string; slug: string; name: string; description: string; status: string;
}

export interface AuditEvent {
  id: string; actor: string; action: string; target: string;
  payload: unknown; createdAt: number;
}

export interface PlatformStats {
  totalSkills: number; totalAgents: number; totalModels: number;
  totalCalls: number; callsToday: number; avgLatency: number;
  errorRate: number; activeModels: number;
  callTrend: { hour: string; calls: number; errors: number }[];
  skillUsage: { name: string; calls: number }[];
  modelDistribution: { name: string; value: number }[];
}
