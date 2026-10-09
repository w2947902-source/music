import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let adminClient: SupabaseClient<Database> | undefined;
let visitorClient: SupabaseClient<Database> | undefined;
export function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key && !url.includes("your-project") && !key.includes("example_replace"));
}
export function getSupabaseClient(mode: "public" | "admin" = "public"): SupabaseClient<Database> {
  if (!hasSupabaseConfig()) throw new Error("档案馆尚未完成云端连接，请稍后再来。");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (mode === "admin") {
    adminClient ??= createClient<Database>(url, key, {
      auth: { storageKey: "music-archive-admin-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
    return adminClient;
  }
  // Public pages always read as anon, even when this browser has an admin session.
  visitorClient ??= createClient<Database>(url, key, {
    auth: { storageKey: "music-archive-visitor", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return visitorClient;
}
export function archiveError(cause: unknown, fallback: string): Error {
  const error = cause as { code?: string; message?: string } | null;
  if (error?.code === "40001") return new Error("内容已在其他窗口修改，请关闭编辑器并刷新后重试。");
  if (error?.code === "42501" || error?.message?.includes("row-level security")) return new Error("没有管理权限，或登录已过期。请重新登录。");
  if (error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205") return new Error("云端数据库尚未配置完成，请按部署说明安装数据表与权限策略。");
  return new Error(fallback);
}
