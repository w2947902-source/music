"use client";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, hasSupabaseConfig } from "./client";

type SessionState = { status: "loading" | "unconfigured" | "anonymous" | "forbidden" | "admin" | "error"; user?: User; error?: string };
export function useAdminSession() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const recheck = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!hasSupabaseConfig()) {
      queueMicrotask(() => setState({ status: "unconfigured" }));
      return;
    }
    const client = getSupabaseClient("admin");
    let alive = true;
    let sequence = 0;
    const verify = async () => {
      const current = ++sequence;
      try {
        const { data, error } = await client.auth.getUser();
        if (!alive || current !== sequence) return;
        if (!data.user) {
          setState(error && error.name !== "AuthSessionMissingError"
            ? { status: "error", error: "无法验证登录状态，请检查网络后重试。" }
            : { status: "anonymous" });
          return;
        }
        const result = await client.rpc("is_archive_admin");
        if (!alive || current !== sequence) return;
        if (result.error) setState({ status: "error", error: "无法验证管理权限，请检查数据库配置后重试。" });
        else setState({ status: result.data === true ? "admin" : "forbidden", user: data.user });
      } catch { if (alive && current === sequence) setState({ status: "error", error: "连接失败，请检查网络。" }); }
    };
    void verify();
    // Defer auth API calls outside the auth event callback to avoid its session lock.
    const { data } = client.auth.onAuthStateChange(() => { window.setTimeout(() => { if (alive) void verify(); }, 0); });
    return () => { alive = false; sequence++; data.subscription.unsubscribe(); };
  }, [revision]);
  return { ...state, recheck };
}
