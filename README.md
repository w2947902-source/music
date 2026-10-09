# SLEEVE — 数字唱片馆

右下角循环图标可切换单曲循环与列表循环。默认单曲循环；列表循环在片段结束后按云端专辑顺序切换，最后一张回到第一张，并同步主封面、侧边卡槽、背景和音频。没有音频的专辑自动跳过，仅一张可播放专辑时循环该片段。

前台采用沉浸式唱片空间：正中清晰封面、两侧透视队列、封面模糊背景与轻微镜面倒影。鼠标拖动、横向触控板、触摸滑动及左右方向键切换；左侧箭头展开浮动纵向滑轮，上下滚动或拖动后吸附到固定中央卡槽。两种滑轮共用同一顺序、同一专辑选择与同一动画位置，侧栏不会挤压主封面。

点击中央封面或卡槽中的封面，在原处展示专辑名和歌手；再次点击或 Esc 收起。右上角图标进入管理员后台，右下角控制播放和静音。页面尝试自动播放；浏览器要求用户操作时，点击页面或播放图标后开始。播放保持现有片段循环和交叉淡化，并预加载相邻素材。可见页面每 30 秒及窗口重新获得焦点时获取最新云端顺序，选择按稳定专辑 ID 保持。

本次 UI 更新按用户要求不运行额外测试或浏览器验收；由现有 GitHub → Vercel 流程构建并发布。

由唯一管理员维护、向所有访客开放的个人音乐档案馆。保留原专辑封面布局、Motion 转场、目录、片段循环和音乐交叉淡入淡出，内容统一保存在 Supabase。

正式站点：https://music-mu-navy.vercel.app · 管理后台：https://music-mu-navy.vercel.app/admin

首次配置请按 [Supabase 与 Vercel 网页操作说明](docs/SUPABASE_SETUP.md) 完成数据库、唯一管理员和两个公开环境变量。数据库规则位于 `supabase/migrations/202610090001_archive.sql`；真实配置和密码不能提交到 Git。

## 启动

需要 Node.js 20.9 或更新版本，建议使用 Node.js 22 / 24 LTS。

```bash
npm install
npm run dev
```

打开 http://localhost:3000 展示页，http://localhost:3000/admin 管理页。

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

依赖由 `package-lock.json` 锁定，重新安装也可以使用 `npm ci`。开发时复制 `.env.example` 为 `.env.local`，填公开 Supabase URL 和 publishable key。没有配置时页面会给出连接提示，生产构建仍可通过。后台需要指定的 Supabase Auth 管理员登录；访客无需登录。

## 添加第一张专辑

1. 进入 `/admin`，用指定的管理员邮箱和密码登录，点击 **Add Album**。
2. 点击 **添加 MP3 文件**，选择一首 30 MB 以内、20 秒至 10 分钟的本地 MP3。自动读取内嵌封面、专辑名、歌手、歌名和年份；缺少标签时使用文件名补充。只读取文件自带信息，不联网猜测。
3. 默认选取前 30 秒。等待波形出现，可直接 **Play Selection** 试听，或拖动两端选择 20–60 秒。
4. 点击 **保存草稿** 或 **保存并发布**，自动截取并上传当前选区，无需先点生成。也可先 **生成独立片段** 再保存；生成后仍能在原始波形上重新选择范围。完整原曲不会上传。发布后访客刷新展示页即可看到，无需重新部署。

每张专辑只管理一首歌曲；重新选择 MP3 会替换当前歌曲，不会追加曲目列表。旧专辑保留云端历史数据，展示和编辑采用原默认歌曲（或第一首可播放歌曲）。如需调整，展开 **修改识别信息 / 更多设置**：可修改名称、歌手、年份、简介、封面、背景颜色和歌曲名。大尺寸或其他浏览器可识别的内嵌封面会在本地转换为 JPEG。标签库 `mp3tag.js` 按需加载，仅在管理员选择文件时使用，支持 ID3v1 与 ID3v2.2/2.3/2.4；适用于现代 Chrome、Edge、Firefox 和 Safari，音频处理仍使用现有浏览器 Web Audio 和 Worker。

初次播放需点击 **Start Listening**。上一张/下一张按钮、键盘左右方向键切换专辑；页面空白处按空格可播放或暂停。草稿预览入口使用 `/admin/preview?album=<id>`，需要管理员会话，共用原展示模板。

管理页通过左侧手柄拖动排序，也提供上下按钮；云端排序自动保存。Edit 编辑，删除时二次确认；发布、取消发布无需部署。所有访客读取同一数据库，公共页面没有管理操作。原三张原创虚拟专辑可一次迁入云端，删空后不会自动添加。

## 架构和主要文件

```text
app/                          Next.js App Router 页面与共享样式
  page.tsx                    /，只组合 Gallery
  admin/page.tsx              /admin，AdminGate 认证后显示 AdminPage
  admin/preview/page.tsx      管理员专用草稿预览
components/
  album/                      Gallery、AlbumView、AlbumCover、AlbumInfo
  audio/                      AudioPlayer、AudioClipEditor（WaveSurfer Regions）
  navigation/                 AlbumNavigation、AlbumDirectory
  admin/                      AlbumEditor、TrackEditor、AlbumList、AdminPage
  ui/                         品牌与模态框键盘/焦点处理
types/album.ts                Album、Track、AudioClip、PendingAsset
lib/
  albums/                     校验、云端收藏 hook，保留旧示例文件
  supabase/                   独立匿名/管理员客户端、Auth UID 验证、云端仓储
  audio/AudioManager.ts        独立音频生命周期、循环、交叉淡变、音量和播放进度
  audio/probeFile.ts           浏览器实际检测音频与封面可读性
  audio/localClip.ts           本地 MP3 解码、波形采样、独立片段编码
  audio/mp3Metadata.ts         按需读取 MP3 标签和内嵌封面、文件名回退
  storage/
    database.ts               IndexedDB 连接与事务
    albumRepository.ts        initialize/getAll/getById/create/update/delete/reorder
    assetRepository.ts        素材仓储；audioRepository 别名
    mediaUrls.ts              引用计数 object URL 租约
    useMediaUrl.ts             封面和波形素材解析
public/covers/                保留的原创封面源文件，旧 URL 已停用
public/audio/                 保留的合成测试音频源文件，旧 URL 已停用
public/workers/               module Worker PCM WAV 编码器
supabase/migrations/          版本化 SQL、表、索引、RLS 与事务 RPC
proxy.ts                      旧素材地址返回 404，文件仍保留在仓库
scripts/generate-demo-audio.mjs  可重复生成测试音频
tests/                        存储事务与音频行为测试
```

所有专辑来自统一 Album 数据，经 `<AlbumView album={album} />` 自动展示。新增专辑不生成新 React 页面。Motion 驱动约 900ms 的封面/文字转场和 1000ms 的背景变化；音频管理器独立于动画组件，约 1000ms 淡变新旧两条音轨。

播放器以 HTMLAudioElement 播放音频。在首次用户播放时初始化 Web Audio GainNode 控制淡变，原生音量作为兼容回退；新音频准备并成功播放后再淡出旧音频，切换期间不会直接切断旧声音。暂停时切换保持暂停，离开页面释放音频、定时器与资源。波形选区在浏览器中编码成独立 WAV，只上传截取后的片段。处理能力与浏览器限制详见配置说明。

元数据保存在 Supabase albums/tracks，封面和音乐片段保存在 private Storage。数据库和文件权限通过 Auth UID 与 RLS 验证；匿名用户只能读已发布专辑及其当前引用的素材。没有 public URL 或长期 signed URL。渲染时下载经权限验证的 Blob，再生成引用计数管理的 object URL。

素材先登记和上传，再通过一个数据库事务保存专辑及歌曲；失败上传和旧文件进入可重试清理队列。更新时间校验阻止旧窗口覆盖新编辑。页面处理空收藏、缺失素材、加载失败、错误文件、片段越界和编码失败。移动端封面在上、文字控制在下；动画遵循 reduced-motion 系统设置。

## 数据范围

公共收藏由云端数据库共享，不依赖浏览器本地存储。原 IndexedDB 仓储文件为兼容与回归测试保留，活动页面不再使用；旧浏览器个人上传不会自动迁入云端。取消发布阻止后续匿名下载，无法收回已经下载到访客设备的内容。

示例标题、艺术家和封面均为虚构；音频是项目自身合成的测试音色，不包含真实专辑录音。同张示例专辑中的曲目复用测试音频，仅用于验证流程。

## 验证与下一阶段

自动测试覆盖交叉淡变中快速切换、加载期间暂停、文件末端循环、离开后资源释放，以及事务回滚、共享素材清理、排序和删空后不重建示例。

新增测试在 PostgreSQL 中执行完整 migration，验证匿名及非管理员限制、草稿素材隔离、发布撤回、事务冲突和文件回收；WAV 测试验证实际 PCM 编码和时间范围。浏览器验收与线上部署记录见 `docs/VERIFICATION.md`。
