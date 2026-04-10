"use client";

import { useState, useEffect, useCallback } from "react";
import type { AchievementTier, AchievementCategory } from "@/lib/achievement-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EarnedByUser {
  id: string;
  name: string;
  image: string | null;
  slug: string | null;
  tier: AchievementTier;
}

export interface Achievement {
  id: string;
  name: string;
  flavorText: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  currentValue: number;
  tiers: readonly [number, number, number, number];
  progress: number;
  displayValue: string;
  displayThreshold: string;
  unit: string;
  earnedBy: EarnedByUser[];
  totalEarned: number;
}

export interface AchievementSummary {
  totalUnlocked: number;
  totalAchievements: number;
  diamondCount: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
}

export interface AchievementData {
  achievements: Achievement[];
  summary: AchievementSummary;
}

export interface AchievementMember {
  id: string;
  name: string;
  image: string | null;
  slug: string | null;
  tier: AchievementTier;
  earnedAt: string;
  currentValue: number;
}

export interface AchievementMembersData {
  members: AchievementMember[];
  cursor: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAchievementsResult {
  data: AchievementData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseAchievementsOptions {
  /** Limit to top N achievements (3, 6, or 9). Omit for full list with earnedBy data. */
  limit?: 3 | 6 | 9;
}

export function useAchievements(options?: UseAchievementsOptions): UseAchievementsResult {
  const limit = options?.limit;
  const [data, setData] = useState<AchievementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const tzOffset = new Date().getTimezoneOffset();
      const params = new URLSearchParams({ tzOffset: String(tzOffset) });
      if (limit) params.set("limit", String(limit));
      const res = await fetch(`/api/achievements?${params}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useAchievementMembers Hook
// ---------------------------------------------------------------------------

interface UseAchievementMembersResult {
  data: AchievementMembersData | null;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
}

export function useAchievementMembers(
  achievementId: string | null,
  limit = 20
): UseAchievementMembersResult {
  const [data, setData] = useState<AchievementMembersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchData = useCallback(async (nextCursor?: string) => {
    if (!achievementId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/achievements/${achievementId}/members?${params}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const json: AchievementMembersData = await res.json();

      if (nextCursor) {
        // Append to existing data
        setData((prev) => ({
          members: [...(prev?.members ?? []), ...json.members],
          cursor: json.cursor,
        }));
      } else {
        setData(json);
      }
      setCursor(json.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [achievementId, limit]);

  useEffect(() => {
    if (achievementId) {
      setData(null);
      setCursor(null);
      fetchData();
    }
  }, [achievementId, fetchData]);

  const loadMore = useCallback(() => {
    if (cursor && !loading) {
      fetchData(cursor);
    }
  }, [cursor, loading, fetchData]);

  return {
    data,
    loading,
    error,
    loadMore,
    hasMore: cursor !== null,
  };
}
