import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refetch: () => void;
};

export function useAuth(): AuthContextType {
  const { isSignedIn, isLoaded: clerkLoaded } = useClerkAuth();
  const { isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();

  // Fetch local user data (with role) from our API once Clerk is authenticated
  const {
    data,
    isLoading: queryLoading,
    error: queryError,
    refetch,
  } = useQuery<{ user: User } | null>({
    queryKey: ["/api/auth/me"],
    retry: 2,
    staleTime: 1000 * 60 * 5,
    enabled: !!isSignedIn,
  });

  const isLoading = !clerkLoaded || !userLoaded || (isSignedIn && queryLoading);
  const user = data?.user ?? null;

  // Treat as authenticated if Clerk says signed in AND either:
  // - we have user data, OR
  // - the query errored (user IS signed in, server just failed)
  // This prevents redirect loops when /api/auth/me is temporarily down
  const isAuthenticated = !!isSignedIn && (!!user || !!queryError);
  const isAdmin = user?.role === "admin";
  const error = queryError
    ? "Unable to load user data. Some features may be unavailable."
    : null;

  const logout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return { user, isLoading, isAuthenticated, isAdmin, error, logout, refetch };
}
