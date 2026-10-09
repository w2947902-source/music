"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import { useDialog } from "@/components/ui/useDialog";
import { useAlbums } from "@/lib/albums/useAlbums";
import { albumRepository } from "@/lib/storage/albumRepository";
import type { Album } from "@/types/album";
import { AlbumEditor } from "./AlbumEditor";
import { AlbumList } from "./AlbumList";
function DeleteConfirmation({
  album,
  onClose,
  onConfirm,
  busy,
}: {
  album: Album;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const panel = useDialog(onClose);
  return (
    <div className="modal-backdrop">
      <div
        ref={panel}
        className="confirm-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        tabIndex={-1}
      >
        <h2 id="delete-title">Remove this record?</h2>
        <p id="delete-description">
          将删除 “{album.title}” 及其上传素材。此操作无法撤销。
        </p>
        <div className="confirm-actions">
          <button className="button" disabled={busy} onClick={onClose}>
            保留专辑
          </button>
          <button className="button danger" disabled={busy} onClick={onConfirm}>
            {busy ? "删除中…" : "删除专辑"}
          </button>
        </div>
      </div>
    </div>
  );
}
export function AdminPage() {
  const { albums, loading, error: storageError, refresh } = useAlbums();
  const [editor, setEditor] = useState<Album | "new" | null>(null);
  const [deleting, setDeleting] = useState<Album | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const idsRef = useRef(ids);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const ordered = albums.map((album) => album.id);
    idsRef.current = ordered;
    queueMicrotask(() => setIds(ordered));
  }, [albums]);
  const closeEditor = useCallback(() => setEditor(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const updateOrder = (next: string[]) => {
    idsRef.current = next;
    setIds(next);
  };
  const commitOrder = async (next = idsRef.current) => {
    if (busy || storageError) return;
    setBusy(true);
    setError(undefined);
    try {
      await albumRepository.reorder(next);
      await refresh();
      setMessage("专辑顺序已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "排序保存失败。");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    const next = [...idsRef.current];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    updateOrder(next);
    void commitOrder(next);
  };
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await albumRepository.delete(deleting.id);
      setDeleting(null);
      await refresh();
      setMessage("专辑已移出收藏。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <MotionConfig reducedMotion="user">
      <main className="admin-shell">
        <header className="site-header">
          <Brand />
          <span className="header-caption">
            THE ARCHIVE / BEHIND THE SLEEVE
          </span>
          <nav>
            <Link href="/" className="archive-link">
              LISTENING ROOM
              <ArrowUpRight size={15} />
            </Link>
          </nav>
        </header>
        <div className="admin-main">
          <div className="admin-heading">
            <div>
              <span className="eyebrow">YOUR RECORDS, YOUR ORDER</span>
              <h1>The collection.</h1>
              <p className="admin-description">
                每一张唱片，都有自己的位置。
                <br />
                添加专辑、选择音乐片段，让收藏慢慢生长。
              </p>
            </div>
            <button
              className="button primary"
              disabled={loading || Boolean(storageError) || busy}
              onClick={() => {
                setEditor("new");
                setMessage(undefined);
              }}
            >
              <Plus size={17} />
              Add Album
            </button>
          </div>
          {storageError && (
            <p className="notice error" role="alert">
              {storageError} 当前示例仅供预览，无法保存修改。
            </p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {loading ? (
            <div className="waveform-status">正在打开收藏…</div>
          ) : albums.length ? (
            <>
              <div className="album-list-head">
                <span>
                  ALBUM LIST / {String(albums.length).padStart(2, "0")} RECORDS
                </span>
                <span>{busy ? "SAVING…" : "DRAG TO REORDER"}</span>
              </div>
              <AlbumList
                albums={albums}
                ids={ids}
                onReorder={updateOrder}
                onCommit={() => void commitOrder()}
                onMove={move}
                onEdit={(album) => setEditor(album)}
                onDelete={setDeleting}
                disabled={busy || Boolean(storageError)}
              />
              <p className="admin-bottom-note">
                拖动左侧手柄调整展览顺序，也可以使用上下按钮。顺序会自动保存。
                <br />
                收藏保存在当前浏览器与设备；清除网站数据会同时移除上传素材。
              </p>
            </>
          ) : (
            <div className="empty-state">
              <h2>Your first record awaits.</h2>
              <p>点击 Add Album，放入第一张专辑。</p>
            </div>
          )}
        </div>
        <AnimatePresence>
          {editor && (
            <AlbumEditor
              key={editor === "new" ? "new" : editor.id}
              album={editor === "new" ? undefined : editor}
              order={albums.length}
              onClose={closeEditor}
              onSaved={async () => {
                await refresh();
                setMessage("专辑已保存。进入 Listening Room 即可预览。");
              }}
            />
          )}
        </AnimatePresence>
        {deleting && (
          <DeleteConfirmation
            album={deleting}
            onClose={closeDelete}
            onConfirm={() => void remove()}
            busy={busy}
          />
        )}
      </main>
    </MotionConfig>
  );
}
