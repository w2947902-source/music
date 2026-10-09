# SLEEVE — 数字唱片馆

可运行的音乐专辑视觉展示 Web 应用。以专辑封面为中心，包含统一展示模板、平滑转场、片段循环与音乐交叉淡入淡出，以及本地专辑管理。

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

依赖由 `package-lock.json` 锁定，重新安装也可以使用 `npm ci`。不需要数据库、环境变量、登录或外部音乐服务。

## 添加第一张专辑

1. 进入 `/admin`，点击 **Add Album**。
2. 填写专辑名、艺术家、可选年份、简介和背景颜色。
3. 上传 JPG / PNG / WebP 等位图封面，可不添加封面。
4. 点击 **Add tracks**，一次选择多首 MP3 / WAV / M4A 或其他浏览器支持的音频。
5. 修改曲目名称，用上下按钮调整顺序，或删除不需要的歌曲。
6. 选择代表专辑的歌曲。等待波形出现，拖动选区边缘、拖出新选区，或输入起点和终点（秒）。
7. **Play Selection** 试听、**Pause** 暂停、**Reset** 重置；点击 **Confirm Selection** 确认片段。也可选择不使用背景音乐。
8. 点击 **Save album**。通过专辑行中的 **Preview** 直接预览，或返回展示页打开 **Collection**。

初次播放需点击 **Start Listening**。上一张/下一张按钮、键盘左右方向键切换专辑；页面空白处按空格可播放或暂停。预览入口使用 `/?album=<id>`，共用同一个展示模板。

管理页通过左侧手柄拖动排序，也提供上下按钮；排序自动保存。Edit 编辑，删除时确认。首次打开有三张可删除的虚拟专辑，删空后不会再次自动添加。

## 架构和主要文件

```text
app/                          Next.js App Router 页面与共享样式
  page.tsx                    /，只组合 Gallery
  admin/page.tsx              /admin，只组合 AdminPage
components/
  album/                      Gallery、AlbumView、AlbumCover、AlbumInfo
  audio/                      AudioPlayer、AudioClipEditor（WaveSurfer Regions）
  navigation/                 AlbumNavigation、AlbumDirectory
  admin/                      AlbumEditor、TrackEditor、AlbumList、AdminPage
  ui/                         品牌与模态框键盘/焦点处理
types/album.ts                Album、Track、AudioClip、PendingAsset
lib/
  albums/                     示例数据、校验、收藏加载 hook
  audio/AudioManager.ts        独立音频生命周期、循环、交叉淡变、音量和播放进度
  audio/probeFile.ts           浏览器实际检测音频与封面可读性
  storage/
    database.ts               IndexedDB 连接与事务
    albumRepository.ts        initialize/getAll/getById/create/update/delete/reorder
    assetRepository.ts        素材仓储；audioRepository 别名
    mediaUrls.ts              引用计数 object URL 租约
    useMediaUrl.ts             封面和波形素材解析
public/covers/                三张原创虚拟唱片封面
public/audio/                 三段自行合成的环境测试音频
scripts/generate-demo-audio.mjs  可重复生成测试音频
tests/                        存储事务与音频行为测试
```

所有专辑来自统一 Album 数据，经 `<AlbumView album={album} />` 自动展示。新增专辑不生成新 React 页面。Motion 驱动约 900ms 的封面/文字转场和 1000ms 的背景变化；音频管理器独立于动画组件，约 1000ms 淡变新旧两条音轨。

播放器以 HTMLAudioElement 播放音频。在首次用户播放时初始化 Web Audio GainNode 控制淡变，原生音量作为兼容回退；新音频准备并成功播放后再淡出旧音频，切换期间不会直接切断旧声音。暂停时切换保持暂停，离开页面释放音频、定时器与资源。波形编辑只保存起止时间，不生成裁剪后的音频。

元数据只保存稳定的 `asset:<id>` 引用或项目内素材路径，实际 Blob 保存在 IndexedDB 的 `assets` store。创建/更新的元数据和新增文件同一事务保存；删除或更新会清理不再被任何专辑引用的素材。渲染时才生成 object URL，引用计数避免正在播放的音频被其他组件提前回收。

IndexedDB 不可用时展示只读示例并说明原因，禁止管理页保存。处理空收藏、缺失封面/音频、格式不支持、读取失败、用户取消选择、片段越界和存储失败。移动端封面在上、文字控制在下，目录覆盖全屏；动画遵循 reduced-motion 系统设置。

## 数据范围

本阶段收藏只属于当前浏览器、当前设备、当前站点源。不同端口、`localhost` 和 `127.0.0.1` 属于不同源，会拥有不同收藏。清除站点数据、某些隐私模式或浏览器自动回收存储可能移除素材；这一版没有跨设备同步或备份导出。

示例标题、艺术家和封面均为虚构；音频是项目自身合成的测试音色，不包含真实专辑录音。同张示例专辑中的曲目复用测试音频，仅用于验证流程。

## 验证与下一阶段

自动测试覆盖交叉淡变中快速切换、加载期间暂停、文件末端循环、离开后资源释放，以及事务回滚、共享素材清理、排序和删空后不重建示例。

后续可以在保持 AlbumView 和仓储接口不变的基础上接入数据库、对象存储、用户系统、备份导入导出及封面主色提取。本阶段未接入这些能力，`/admin` 无登录，仅管理该浏览器本地数据。
