import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Skills from "./pages/Skills";
import Agents from "./pages/Agents";
import Models from "./pages/Models";
import McpPage from "./pages/Mcp";
import Knowledge from "./pages/Knowledge";
import Audit from "./pages/Audit";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/"          component={Dashboard} />
        <Route path="/skills"    component={Skills} />
        <Route path="/agents"    component={Agents} />
        <Route path="/models"    component={Models} />
        <Route path="/mcp"       component={McpPage} />
        <Route path="/knowledge" component={Knowledge} />
        <Route path="/audit"     component={Audit} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
