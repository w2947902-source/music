# Supabase 与 Vercel 配置（网页操作）

## 1. 创建项目

打开 https://supabase.com/dashboard 并登录。点击 **New project**，选择你的组织（没有组织时先创建），名称填 `music-archive`，设置并自己保存数据库密码，选择合适区域，点击 **Create new project**，等待启动。无需把数据库密码发给开发助手。

## 2. 关闭注册并创建唯一管理员

左侧 **Authentication → Sign In / Providers**，关闭 **Allow new users to sign up** 和 **Allow anonymous sign-ins**，点击 **Save**。保留 Email 登录。然后进入 **Authentication → Users → Add user → Create new user**，填你自己的邮箱、密码，勾选 **Auto Confirm User** 并创建。打开该用户详情，复制 **UID**。不要发送登录密码。

## 3. 安装数据表与权限

左侧 **SQL Editor → New query**。打开仓库文件 `supabase/migrations/202610090001_archive.sql`（GitHub 文件页面点击 **Raw** 可复制完整内容），将全部 SQL 粘贴到编辑器，点击 **Run**。这是版本化 migration，只执行一次；升级将提供新的 migration 文件。

再新建一条 query，复制 `supabase/admin-setup.sql.example`，把 `REPLACE_WITH_YOUR_AUTH_USER_UID` 换成第 2 步复制的 UID，点击 **Run**。不能填邮箱。唯一管理员表不通过公开 API 开放编辑。

左侧 **Storage** 应出现 `archive-media` 桶。它必须是 **Private**，不要改成 Public。此 SQL 已设置大小、格式和文件权限，不需要另建 public 桶。左侧 **Table Editor** 应看到 albums、tracks、media_assets 和 archive_media_gc。

## 4. 取得公开连接信息

项目顶部 **Connect** 对话框可查看 **Project URL** 和 **Publishable key**；也可以在 **Project Settings → Data API** 找 Project URL，在 **Project Settings → API Keys → Publishable key** 找 `sb_publishable_...`。只复制公开 publishable key，不复制 secret key、service_role 或数据库密码。

## 5. 配置 Vercel

打开 https://vercel.com/dashboard → 选择已部署的 **music** 项目 → **Settings → Environment Variables**。添加：

| Name | Value | Environments |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 第 4 步 Project URL | Production、Preview、Development |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 第 4 步 Publishable key | Production、Preview、Development |

点击 **Save**。首次增加或更换这些变量后需要重新构建：**Deployments → 相应部署右侧 ⋯ → Redeploy → Redeploy**。此后新增/编辑/发布专辑只更新数据库，不需要重新部署。

开发电脑如需测试，可把 `.env.example` 复制为 `.env.local` 并在本机填入这两个公开值。`.env.local` 已被 Git 忽略，不能提交真实配置。此应用没有 service_role 环境变量。

## 6. 预览、验收和合并

在 PR 的 Vercel 预览部署中打开 `/admin`，用第 2 步账号登录。创建草稿、添加封面和 MP3，拖动 20–60 秒选区、生成片段、保存草稿、预览、发布。另开一个没有登录的浏览器访问同一预览站点，验证只看到已发布内容，不能修改和获取草稿素材；取消发布后刷新访客页面，专辑与素材应不可读取。

完成后合并 PR 到 `main`，原 GitHub → Vercel 自动部署流程保持不变。正式网址仍是 https://music-mu-navy.vercel.app，后台是 https://music-mu-navy.vercel.app/admin。

此版本不会把旧浏览器的 IndexedDB 自动上传到云端。原代码与文件仍保留，但正式收藏以 Supabase 为准；原三张原创示例已迁入云端，个人在旧浏览器中添加的其他收藏需要在新后台重新添加。旧 `/covers/`、`/audio/` 静态地址已停用，素材通过私有 Storage 权限检查读取。

## 音频处理与浏览器兼容性

使用已有 WaveSurfer 显示波形，Web Audio 在本地解码 MP3，module Worker 编码独立的 16-bit PCM WAV，不引入 FFmpeg 或额外的大型编码库。原曲限制为非空 MP3、30 MB 以内、20 秒至 10 分钟、最多双声道；每次处理一首，生成片段后才能选择下一首。片段限制为 20–60 秒；44.1 kHz 双声道 60 秒约 10.1 MiB，私有桶上限为 12 MiB，封面上限 5 MiB。

面向最新版 Chrome、Edge、Firefox、Safari，要求支持 Web Audio、Blob URL 和 module Worker；旧版浏览器会显示处理失败或不支持的提示。已在 Windows Chrome 实测；其余浏览器仍需在相应设备验证。手机解码完整 MP3 会占用内存，遇到错误可换用电脑或较短文件。上传 WAV 会比压缩 MP3 大，但编码依赖轻、播放兼容性好；完整原曲从不进入云端上传列表。

## 常见提示

- **尚未完成云端连接**：确认变量名、值和 Preview/Production 环境，然后重新部署。
- **无法验证管理权限**：确认 migration 成功执行、管理员 UID 正确。
- **没有管理权限**：登录的 UID 不在管理员表，邮箱相同也不能绕过权限。
- **内容已在其他窗口修改**：关闭编辑器、刷新，重新编辑；这是防止旧窗口覆盖新内容。
- **素材清理待重试**：专辑已保存，旧文件已不可被访客读取；后台下次打开会重试物理清理。

官方参考：[Auth 配置](https://supabase.com/docs/guides/auth/general-configuration)、[私有素材桶](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[Storage RLS](https://supabase.com/docs/guides/storage/security/access-control)、[公开 API keys](https://supabase.com/docs/guides/getting-started/api-keys)。
