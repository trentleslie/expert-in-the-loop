import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // FOOTGUN: this default query function fetches `queryKey[0]` as the URL and
    // IGNORES every later segment. A multi-segment key like
    // ["/api/campaigns", id] therefore hits the LIST endpoint, not the detail
    // one — silently returning the wrong data (this caused the config-editor
    // clobber bug). When you need path params, use a single-string key
    // (`/api/campaigns/${id}`) or supply an explicit `queryFn`.
    if (import.meta.env.DEV && queryKey.length > 1) {
      console.warn(
        `[queryClient] Query key ${JSON.stringify(queryKey)} has >1 segment but no explicit queryFn; ` +
          `only queryKey[0] ("${String(queryKey[0])}") is fetched. Use a single-string key or an explicit queryFn.`,
      );
    }
    const url = queryKey[0] as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
