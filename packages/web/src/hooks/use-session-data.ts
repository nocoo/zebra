"use client";

import { useState, useEffect, useCallback } from "react";
import {
  toSessionOverview,
  toWorkingHoursGrid,
  toMessageDailyStats,
  toProjectBreakdown,
  type SessionRow,
  type SessionOverview,
  type WorkingHoursDay,
  type MessageDailyStat,
  type ProjectBreakdownItem,
} from "@/lib/session-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSessionDataOptions {
  /** Explicit start date (ISO date string, e.g. "2026-01-01") */
  from?: string;
  /** Explicit end date (ISO date string). Defaults to today. */
  to?: string;
  /** Source filter (optional) */
  source?: string;
  /** Project filter — project name, or "_unassigned" for no-project sessions */
  project?: string;
}

interface UseSessionDataResult {
  records: SessionRow[];
  overview: SessionOverview;
  hoursGrid: WorkingHoursDay[];
  dailyMessages: MessageDailyStat[];
  projectBreakdown: ProjectBreakdownItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSessionData(
  options: UseSessionDataOptions = {}
): UseSessionDataResult {
  const { from: fromDate, to: toDate, source, project } = options;
  const [records, setRecords] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (source) params.set("source", source);
      if (project) params.set("project", project);

      const qs = params.toString();
      const url = qs ? `/api/sessions?${qs}` : "/api/sessions";
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }

      const json = (await res.json()) as { records: SessionRow[] };
      setRecords(json.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
    }, [fromDate, toDate, source, project]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const overview = toSessionOverview(records);
  const hoursGrid = toWorkingHoursGrid(records);
  const dailyMessages = toMessageDailyStats(records);
  const projectBreakdown = toProjectBreakdown(records);

  return {
    records,
    overview,
    hoursGrid,
    dailyMessages,
    projectBreakdown,
    loading,
    error,
    refetch: fetchData,
  };
}
