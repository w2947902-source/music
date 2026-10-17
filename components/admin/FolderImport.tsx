"use client";
import { useEffect, useRef, useState } from "react";
import { Check, FolderUp, Loader2, RotateCcw, Square } from "lucide-react";
import { formatTime } from "@/lib/albums/validation";
import { cloudAlbumRepository } from "@/lib/supabase/albumRepository";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AUDIO_FILE_ACCEPT, fileLabel, isImportableAudio, prepareFolderAlbum, type ExcerptRange, type FolderImportStage } from "@/lib/audio/folderImport";

type JobStatus = "pending" | FolderImportStage | "done" | "error";
interface ImportJob {
  id: string;
  trackId: string;
  file: File;
  status: JobStatus;
  published: boolean;
  range?: ExcerptRange;
  message?: string;
}
const STATUS: Record<JobStatus, string> = {
  pending: "等待处理", reading: "读取歌曲信息", encoding: "生成 30 秒片段",
  uploading: "上传中", done: "已完成", error: "未完成",
};

export function FolderImport({ disabled, onBusyChange, onImported }: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onImported: () => Promise<void>;
}) {
  const folderInput = useRef<HTMLInputElement>(null), filesInput = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [published, setPublished] = useState(true);
  const [running, setRunning] = useState(false), [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");
  const jobsRef = useRef<ImportJob[]>([]), filesRef = useRef<File[]>([]);
  const active = useRef(false), stop = useRef(false), alive = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stop.current = true; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  const update = (id: string, patch: Partial<ImportJob>) => {
    jobsRef.current = jobsRef.current.map(job => job.id === id ? { ...job, ...patch } : job);
    if (alive.current) setJobs(jobsRef.current);
  };
  async function run(queue: ImportJob[], retry = false) {
    if (active.current || !queue.length) return;
    active.current = true; stop.current = false;
    const abortController = new AbortController();
    controller.current = abortController;
    setRunning(true); setStopping(false); onBusyChange(true);
    try {
      for (const job of queue) {
        if (stop.current || !alive.current) break;
        try {
          update(job.id, { status: "reading", message: undefined });
          if (retry) {
            // A timed-out save may already have committed. Reuse its stable ID instead of duplicating it.
            const { data, error } = await getSupabaseClient("admin").from("albums").select("id").eq("id", job.id).maybeSingle();
            if (error) throw new Error("暂时无法确认上次保存结果，请稍后重试。");
            if (data) { update(job.id, { status: "done", message: "已确认上次上传成功。" }); continue; }
          }
          const ready = await prepareFolderAlbum({
            file: job.file, files: filesRef.current, albumId: job.id, trackId: job.trackId,
            published: job.published, signal: abortController.signal,
            onProgress: (stage, range) => update(job.id, { status: stage, ...(range ? { range } : {}) }),
          });
          if (!alive.current || abortController.signal.aborted) break;
          update(job.id, { status: "uploading" });
          const warning = await cloudAlbumRepository.save(ready.album, ready.assets);
          update(job.id, { status: "done", message: [ready.notice, warning].filter(Boolean).join(" ") || undefined });
        } catch (cause) {
          if (!alive.current) break;
          const message = cause instanceof Error ? cause.message : "处理失败，请重试。";
          update(job.id, { status: "error", message });
          if (/登录|管理权限|数据库尚未配置/.test(message)) {
            stop.current = true;
            setNotice("上传已暂停，请先检查管理员登录状态，再继续未完成文件。");
          }
        }
      }
    } finally {
      try {
        if (alive.current) await onImported();
      } catch {
        if (alive.current) setNotice("上传结果已保留，专辑列表暂时未能刷新，请稍后重试刷新。");
      } finally {
        if (alive.current) { setRunning(false); setStopping(false); onBusyChange(false); }
        active.current = false;
        controller.current = undefined;
      }
    }
  }
  function start(files: File[]) {
    if (disabled || active.current || !files.length) return;
    const audio = files.filter(isImportableAudio).sort((a, b) => fileLabel(a).localeCompare(fileLabel(b), "zh-CN", { numeric: true }));
    if (!audio.length) { setNotice("此文件夹没有可处理的音频。支持 MP3、WAV、M4A 等常见格式。"); return; }
    filesRef.current = files;
    const queue = audio.map(file => ({ id: crypto.randomUUID(), trackId: crypto.randomUUID(), file, status: "pending" as const, published }));
    jobsRef.current = queue; setJobs(queue);
    setNotice(`找到 ${audio.length} 首音频，将逐首随机截取 30 秒并${published ? "发布" : "保存为草稿"}。`);
    void run(queue);
  }
  const done = jobs.filter(job => job.status === "done").length;
  const failures = jobs.filter(job => job.status === "error").length;
  const remaining = jobs.filter(job => job.status === "pending" || job.status === "error");
  const completed = done + failures;
  return <section className="folder-import" aria-labelledby="folder-import-title" aria-busy={running}>
    <div className="folder-import-heading">
      <div><h2 id="folder-import-title">一键上传音频文件夹</h2><p>自动填写歌曲信息，每首随机截取 30 秒。每个文件生成一张单曲专辑。</p></div>
      <button className="button" disabled={disabled || running} onClick={() => {
        if (folderInput.current && "webkitdirectory" in folderInput.current) folderInput.current.click();
        else filesInput.current?.click();
      }}>{running ? <Loader2 size={18} className="space-spinner"/> : <FolderUp size={18}/>}上传音频文件夹</button>
    </div>
    <label className="folder-publish-option"><input type="checkbox" checked={published} disabled={disabled || running}
      onChange={event => setPublished(event.target.checked)}/>上传后直接发布</label>
    <input className="sr-only" ref={node => { folderInput.current = node; if (node && "webkitdirectory" in node) node.webkitdirectory = true; }}
      type="file" multiple accept={AUDIO_FILE_ACCEPT} aria-label="选择音频文件夹" disabled={disabled || running}
      onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; start(files); }}/>
    <input className="sr-only" ref={filesInput} type="file" multiple accept={AUDIO_FILE_ACCEPT}
      aria-label="批量选择音频文件" disabled={disabled || running}
      onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; start(files); }}/>
    <p className="file-help">包含子文件夹。只上传截取后的片段；缺少封面时会尝试读取同目录的 cover / folder 图片。每个音频需为 30 秒至 10 分钟、30 MB 以内。</p>
    {notice && <p className="folder-import-notice" role="status">{notice}</p>}
    {jobs.length > 0 && <>
      <div className="folder-import-progress" role="status">{running ? "正在处理，请保持页面打开" : "本次上传结果"} · 已完成 {done} / {jobs.length}{failures > 0 ? ` · 未完成 ${failures}` : ""}</div>
      <progress className="folder-progress-bar" value={completed} max={jobs.length} aria-label="音频文件夹上传进度"/>
      <ol className="folder-import-list">{jobs.map(job => <li key={job.id} className={`folder-import-file ${job.status}`}>
        <span className="folder-file-icon" aria-hidden="true">{job.status === "done" ? <Check size={16}/> : ["reading", "encoding", "uploading"].includes(job.status) ? <Loader2 size={16} className="space-spinner"/> : <span>·</span>}</span>
        <div><strong>{fileLabel(job.file)}</strong><p>{job.status === "done" ? job.published ? "已发布" : "已保存草稿" : STATUS[job.status]}{job.range ? ` · ${formatTime(job.range.start)}–${formatTime(job.range.end)}` : ""}</p>
          {job.message && <p className="folder-file-message">{job.message}</p>}</div>
      </li>)}</ol>
      <div className="folder-import-actions">
        {running ? <button className="button" disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}><Square size={14}/>{stopping ? "正在完成当前文件…" : "完成当前文件后停止"}</button>
          : remaining.length > 0 && <button className="button" disabled={disabled} onClick={() => { setNotice("继续处理未完成文件，成功上传的歌曲不会重复添加。"); void run(remaining, true); }}><RotateCcw size={15}/>继续未完成文件（{remaining.length}）</button>}
        {!running && <button className="text-button" disabled={disabled} onClick={() => { jobsRef.current = []; filesRef.current = []; setJobs([]); setNotice(""); }}>收起结果</button>}
      </div>
    </>}
  </section>;
}
