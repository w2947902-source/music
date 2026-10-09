# 个人音乐档案馆升级方案

## 现有项目检查

基线：GitHub `w2947902-source/music`，提交 `d38ea0d`；正式站点 https://music-mu-navy.vercel.app。
本地 54 个原文件的 Git tree 与线上源代码一致。原文件已保存在 `archive/original-local-baseline` 分支，开发使用 `codex/personal-music-archive`。

Next.js 16 / React 19 / TypeScript / Tailwind 4，Motion 控制专辑封面、文字和背景转场，WaveSurfer Regions 提供试听和片段选择。`/` 由 Gallery、AlbumView、AudioPlayer 和 AlbumDirectory 组成；`/admin` 有 AlbumEditor、TrackEditor、AlbumList 和拖拽排序。AudioManager 独立管理播放、循环、交叉淡变及资源释放。

原版元数据、完整上传文件保存在 IndexedDB，无法跨浏览器共享；后台无认证；片段仅保存起止时间，没有生成独立音频。原文件及示例素材保留，升级后公共页面不再读取或自动创建本地示例。原三张原创示例可一次迁入云端；旧 `/covers/`、`/audio/` URL 返回 404，使取消发布后的素材不能从旧静态地址重新取得。

## 分阶段实施

1. 检查原项目、保存基线、创建分支、设计表与权限。
2. 版本化 SQL migration：albums、tracks、media_assets、删除队列和唯一管理员 UID；接入 Supabase Auth。
3. 复用后台，增加草稿、发布、取消发布、登录、登出、草稿预览及云端排序。
4. 复用波形，本地 MP3 解码及 20–60 秒独立 WAV 编码；只上传生成片段，增加文件限制及错误提示。
5. 公共展示使用独立匿名 Supabase 客户端，只读取已发布内容；保留样式与播放器。
6. SQL 权限、事务、音频编码、浏览器和生产构建验证；通过 PR 接入原 GitHub → Vercel 流程。

## 数据与安全边界

- `albums`：名称、艺术家、年份、说明、封面路径、背景色、顺序、发布状态、代表歌曲、创建/更新时间。
- `tracks`：专辑关联、名称、顺序、可选音频片段路径和片段实际长度。
- `media_assets`：不可覆盖的随机路径、封面/片段类型、大小、编码、所属专辑、素材状态。
- `archive_media_gc`：数据库修改后再删除失去引用的文件，失败保留队列重试。
- `archive_private.administrators`：只有 SQL 控制台可配置，单个 Auth UID；邮箱和前端按钮不决定权限。

数据库和 Storage 共同实施 RLS。素材桶始终 private。访客使用 publishable key，通过 Storage download 的权限检查读取已发布专辑当前引用的素材，再在当前页面生成临时 Blob URL；不创建长期 signed URL，也不使用 public 存储 URL。管理员预览使用管理员会话。取消发布后新的匿名读取立即失效；此前已下载到访客设备的内容无法收回。

素材先登记并上传，再用单个数据库事务保存专辑和歌曲。失去引用的文件进入清理队列，认领时将素材锁定为 deleting，阻止另一个编辑窗口重新引用它。清理通过 Storage API 完成，不直接删除 storage.objects。中断上传 24 小时后进入回收；管理员打开后台或修改数据后重试。数据库使用更新时间防止旧窗口覆盖新编辑。

只需要两个公开 Vercel 环境变量，不需要 service_role。没有配置时构建仍可通过，页面提供配置提示；不自动回退到各浏览器独立的示例数据库。
