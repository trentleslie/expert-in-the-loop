import { useUser, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
};

export function useAuth(): AuthContextType {
  const { isSignedIn, isLoaded: clerkLoaded } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();

  // Fetch local user data (with role) from our API once Clerk is authenticated
  const {
    data,
    isLoading: queryLoading,
    refetch,
  } = useQuery<{ user: User } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 1000 * 60 * 5,
    enabled: !!isSignedIn,
  });

  const isLoading = !clerkLoaded || !userLoaded || (isSignedIn && queryLoading);
  const user = data?.user ?? null;
  const isAuthenticated = !!isSignedIn && !!user;
  const isAdmin = user?.role === "admin";

  const logout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return { user, isLoading, isAuthenticated, isAdmin, logout, refetch };
}
