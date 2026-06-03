import { Switch, Route, Redirect, useLocation } from "wouter";
import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/app-layout";
import { Skeleton } from "@/components/ui/skeleton";

import HomePage from "@/pages/home";
import JoinPage from "@/pages/join";
import ReviewPage from "@/pages/review";
import StatsPage from "@/pages/stats";
import VoteHistoryPage from "@/pages/vote-history";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminCampaigns from "@/pages/admin/campaigns";
import AdminResults from "@/pages/admin/results";
import AdminDatabase from "@/pages/admin/database";
import AdminUsers from "@/pages/admin/users";
import AdminSettings from "@/pages/admin/settings";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminUpload from "@/pages/admin/upload";
import NotFound from "@/pages/not-found";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    // Preserve the intended path (e.g. a campaign join link) so Clerk returns
    // the user there after sign-in, instead of dropping them on a generic home.
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
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

// Where to send the user after sign-in. Robust across the OAuth round-trip:
// the `?redirect=` query (set by ProtectedRoute when bouncing an unauthenticated
// deep-link visitor) is lost on the /login/sso-callback subpath, so we persist
// it in sessionStorage. Only relative paths are honored (no open redirects).
function readPostSignInRedirect(): string {
  const isRelative = (v: string | null): v is string =>
    !!v && v.startsWith("/") && !v.startsWith("//");
  const fromQuery = new URLSearchParams(window.location.search).get("redirect");
  if (isRelative(fromQuery)) {
    sessionStorage.setItem("postSignInRedirect", fromQuery);
  } else if (window.location.pathname === "/login") {
    // Fresh sign-in with no target — don't reuse a stale one from a prior visit.
    sessionStorage.removeItem("postSignInRedirect");
  }
  const stored = sessionStorage.getItem("postSignInRedirect");
  return isRelative(stored) ? stored : "/";
}

function ClerkSignInPage() {
  const redirectUrl = readPostSignInRedirect();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/sign-up"
        forceRedirectUrl={redirectUrl}
        signUpForceRedirectUrl={redirectUrl}
      />
    </div>
  );
}

function ClerkSignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/login" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes — Clerk uses subpaths like /login/sso-callback */}
      <Route path="/login/:rest*">
        <PublicRoute>
          <ClerkSignInPage />
        </PublicRoute>
      </Route>
      <Route path="/login">
        <PublicRoute>
          <ClerkSignInPage />
        </PublicRoute>
      </Route>

      <Route path="/sign-up/:rest*">
        <PublicRoute>
          <ClerkSignUpPage />
        </PublicRoute>
      </Route>
      <Route path="/sign-up">
        <PublicRoute>
          <ClerkSignUpPage />
        </PublicRoute>
      </Route>

      {/* Protected reviewer routes */}
      <Route path="/">
        <ProtectedRoute>
          <HomePage />
        </ProtectedRoute>
      </Route>

      <Route path="/campaigns/:id/join">
        <ProtectedRoute>
          <JoinPage />
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

      <Route path="/admin/campaigns/:id/upload">
        <ProtectedRoute requireAdmin>
          <AdminUpload />
        </ProtectedRoute>
      </Route>

      <Route path="/admin/database">
        <ProtectedRoute requireAdmin>
          <AdminDatabase />
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
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      routerPush={(to) => setLocation(to)}
      routerReplace={(to) => setLocation(to, { replace: true })}
      signInUrl="/login"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      afterSignOutUrl="/login"
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="entity-validator-theme">
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
