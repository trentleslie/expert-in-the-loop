import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/app-layout";
import { Skeleton } from "@/components/ui/skeleton";

import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import ReviewPage from "@/pages/review";
import StatsPage from "@/pages/stats";
import VoteHistoryPage from "@/pages/vote-history";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminCampaigns from "@/pages/admin/campaigns";
import AdminResults from "@/pages/admin/results";
import AdminDatabase from "@/pages/admin/database";
import AdminDomains from "@/pages/admin/domains";
import AdminUsers from "@/pages/admin/users";
import AdminSettings from "@/pages/admin/settings";
import AdminAnalytics from "@/pages/admin/analytics";
import NotFound from "@/pages/not-found";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 w-full max-w-md p-8">
        <Skeleton className="h-12 w-12 rounded-full mx-auto" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
      </div>
    </div>
  );
}

function ProtectedRoute({ 
  children, 
  requireAdmin = false 
}: { 
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Redirect to="/" />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Route>

      {/* Protected reviewer routes */}
      <Route path="/">
        <ProtectedRoute>
          <HomePage />
        </ProtectedRoute>
      </Route>

      <Route path="/review/:id">
        <ProtectedRoute>
          <ReviewPage />
        </ProtectedRoute>
      </Route>

      <Route path="/stats">
        <ProtectedRoute>
          <StatsPage />
        </ProtectedRoute>
      </Route>

      <Route path="/vote-history">
        <ProtectedRoute>
          <VoteHistoryPage />
        </ProtectedRoute>
      </Route>

      {/* Protected admin routes */}
      <Route path="/admin">
        <ProtectedRoute requireAdmin>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/campaigns">
        <ProtectedRoute requireAdmin>
          <AdminCampaigns />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/campaigns/:id/results">
        <ProtectedRoute requireAdmin>
          <AdminResults />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/database">
        <ProtectedRoute requireAdmin>
          <AdminDatabase />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/domains">
        <ProtectedRoute requireAdmin>
          <AdminDomains />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/users">
        <ProtectedRoute requireAdmin>
          <AdminUsers />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/settings">
        <ProtectedRoute requireAdmin>
          <AdminSettings />
        </ProtectedRoute>
      </Route>

      <Route path="/analytics">
        <ProtectedRoute>
          <AdminAnalytics />
        </ProtectedRoute>
      </Route>

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="entity-validator-theme">
        <TooltipProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
