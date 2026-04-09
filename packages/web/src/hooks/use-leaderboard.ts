"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = "week" | "month" | "all";
export type LeaderboardScope = "global" | "org" | "team";

export interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    slug: string | null;
  };
  teams: { id: string; name: string; logo_url: string | null }[];
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  session_count: number;
  total_duration_seconds: number;
}

export interface LeaderboardData {
  period: string;
  scope: LeaderboardScope;
  scopeId?: string;
  entries: LeaderboardEntry[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseLeaderboardOptions {
  period?: LeaderboardPeriod;
  limit?: number;
  teamId?: string | null;
  orgId?: string | null;
}

interface UseLeaderboardResult {
  /** All accumulated entries across pages */
  entries: LeaderboardEntry[];
  /** True during initial load (no entries yet) */
  loading: boolean;
  /** True when loading more pages (entries already visible) */
  loadingMore: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether more pages are available */
  hasMore: boolean;
  /** Load the next page */
  loadMore: () => void;
  /** Re-fetch from the beginning */
  refetch: () => void;
  /** Index where new entries start (for animation) */
  animationStartIndex: number;
}

export function useLeaderboard(
  options: UseLeaderboardOptions = {},
): UseLeaderboardResult {
  const { period = "week", limit = 20, teamId, orgId } = options;

  // All accumulated entries
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  // Current offset for pagination
  const [offset, setOffset] = useState(0);
  // Loading states
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Error and pagination info
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Animation tracking
  const [animationStartIndex, setAnimationStartIndex] = useState(0);

  // Track current filter params to detect changes
  const filterKeyRef = useRef({ period, teamId, orgId });

  // Generate a stable key for current filters
  const getFilterKey = useCallback(() => {
    return `${period}|${teamId ?? ""}|${orgId ?? ""}`;
  }, [period, teamId, orgId]);

  // Fetch a single page
  const fetchPage = useCallback(
    async (pageOffset: number, isLoadMore: boolean) => {
      // Set appropriate loading state
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        // Clear entries immediately on filter change
        setEntries([]);
        setAnimationStartIndex(0);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ period });
        params.set("limit", String(limit));
        if (pageOffset > 0) {
          params.set("offset", String(pageOffset));
        }
        if (teamId) {
          params.set("team", teamId);
        }
        if (orgId) {
          params.set("org", orgId);
        }

        const res = await fetch(`/api/leaderboard?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }

        const json = (await res.json()) as LeaderboardData;

        // Check if filters changed during fetch - if so, discard results
        const currentKey = getFilterKey();
        const expectedKey = `${period}|${teamId ?? ""}|${orgId ?? ""}`;
        if (currentKey !== expectedKey) {
          return; // Stale response, ignore
        }

        if (isLoadMore) {
          // Append to existing entries
          setEntries((prev) => {
            setAnimationStartIndex(prev.length);
            return [...prev, ...json.entries];
          });
        } else {
          // Replace entries
          setAnimationStartIndex(0);
          setEntries(json.entries);
        }
        setHasMore(json.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [period, limit, teamId, orgId, getFilterKey],
  );

  // Reset and fetch when filters change
  useEffect(() => {
    const prevKey = `${filterKeyRef.current.period}|${filterKeyRef.current.teamId ?? ""}|${filterKeyRef.current.orgId ?? ""}`;
    const currentKey = getFilterKey();

    if (prevKey !== currentKey) {
      // Filters changed - reset everything
      filterKeyRef.current = { period, teamId, orgId };
      setOffset(0);
      fetchPage(0, false);
    }
  }, [period, teamId, orgId, getFilterKey, fetchPage]);

  // Initial fetch
  useEffect(() => {
    fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load more handler
  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchPage(newOffset, true);
  }, [loadingMore, loading, hasMore, offset, limit, fetchPage]);

  // Refetch from beginning
  const refetch = useCallback(() => {
    setOffset(0);
    fetchPage(0, false);
  }, [fetchPage]);

  return {
    entries,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    animationStartIndex,
  };
}
