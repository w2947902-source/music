"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-state">
      <span className="eyebrow">SLEEVE / SOMETHING WENT QUIET</span>
      <h1>暂时无法打开唱片馆。</h1>
      <p>你的本地收藏仍保存在浏览器中。</p>
      <button className="button primary" onClick={reset}>
        重试
      </button>
    </main>
  );
}
