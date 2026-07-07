import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Skills from "./pages/Skills";
import Agents from "./pages/Agents";
import AgentCanvas from "./pages/AgentCanvas";
import Models from "./pages/Models";
import McpPage from "./pages/Mcp";
import Knowledge from "./pages/Knowledge";
import Audit from "./pages/Audit";
import Projects from "./pages/Projects";
import Migration from "./pages/Migration";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/AppLayout";
import { AIPlatformAssistant } from "./components/AIPlatformAssistant";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/"          component={Dashboard} />
        <Route path="/projects"  component={Projects} />
        <Route path="/models"    component={Models} />
        <Route path="/skills"    component={Skills} />
        <Route path="/agents"    component={Agents} />
        <Route path="/agents/:id" component={AgentCanvas} />
        <Route path="/mcp"       component={McpPage} />
        <Route path="/knowledge" component={Knowledge} />
        <Route path="/audit"     component={Audit} />
        <Route path="/migration"  component={Migration} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          {/* Phase 6 — 全局 AI 助手浮动组件 */}
          <AIPlatformAssistant />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
