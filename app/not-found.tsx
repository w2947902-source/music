import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-state">
      <span className="eyebrow">404 / OFF THE RECORD</span>
      <h1>这里还没有唱片。</h1>
      <Link className="button" href="/">
        返回唱片馆
      </Link>
    </main>
  );
}
