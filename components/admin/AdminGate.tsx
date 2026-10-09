"use client";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Brand } from "@/components/ui/Brand";
import { useAdminSession } from "@/lib/supabase/useAdminSession";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminGate({ children }: { children: ReactNode }) {
  const session = useAdminSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(undefined);
    const values = new FormData(event.currentTarget);
    try {
      const result = await getSupabaseClient("admin").auth.signInWithPassword({
        email: String(values.get("email")).trim(), password: String(values.get("password")),
      });
      if (result.error) throw new Error("登录失败，请检查邮箱、密码和网络连接。");
      session.recheck();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败，请重试。"); }
    finally { setBusy(false); }
  }
  if (session.status === "admin") return children;
  return (
    <main className="admin-shell">
      <header className="site-header"><Brand /><Link href="/" className="archive-link">返回档案馆</Link></header>
      <div className="admin-main auth-panel">
        <span className="eyebrow">THE ARCHIVE / ADMINISTRATOR</span>
        <h1>管理我的档案馆</h1>
        {session.status === "loading" ? <p role="status">正在验证登录…</p>
          : session.status === "unconfigured" ? <p role="status">档案馆尚未完成云端连接。请先按项目的部署说明完成配置。</p>
          : session.status === "forbidden" ? <><p role="alert">该账号没有管理权限。</p><button className="button" onClick={() => void getSupabaseClient("admin").auth.signOut()}>退出此账号</button></>
          : session.status === "error" ? <><p className="notice error" role="alert">{session.error}</p><button className="button" onClick={session.recheck}>重新验证</button><button className="button" onClick={() => void getSupabaseClient("admin").auth.signOut()}>重新登录</button></>
          : <form onSubmit={login}>
            <p className="admin-description">仅档案馆管理员可以登录。访客无需登录即可浏览已发布专辑。</p>
            <div className="field"><label htmlFor="admin-email">管理员邮箱</label><input className="input" id="admin-email" name="email" type="email" autoComplete="username" required disabled={busy} /></div>
            <div className="field"><label htmlFor="admin-password">密码</label><input className="input" id="admin-password" name="password" type="password" autoComplete="current-password" required disabled={busy} /></div>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="button primary" disabled={busy}>{busy ? "登录中…" : "登录管理后台"}</button>
          </form>}
      </div>
    </main>
  );
}
