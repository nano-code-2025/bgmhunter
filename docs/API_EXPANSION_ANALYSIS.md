# Music API Expansion Analysis

**日期**: 2026-02-20  
**分支**: `feature/api-expansion`  
**目标**: 评估 YouTube Music / Spotify / Deezer 三个 API 的整合可行性，丰富 BGM Hunter Pro 曲库

---

## TL;DR

| API | 应用内播放 | 推荐优先级 | 整合难度 |
|-----|-----------|-----------|---------|
| **Jamendo** (现有) | ✅ 完整曲目 | 主力源 | 已完成 |
| **Deezer** | ✅ 30s 预览直链 | ⭐ 第一优先 | 低 |
| **Spotify** | ⚠️ 预览链接正在被废弃 | 元数据增强 | 中 |
| **YouTube Music** | ❌ 无法应用内播放 | 仅外部链接 | 高（需后端） |

**结论**：Deezer 是最佳第二音源——30 秒预览直链、无需认证、73M+ 曲库、可直接用 `<audio>` 播放。

---

## 1) YouTube Music (ytmusicapi) 深度分析

### 已验证能力（见 YTMUSICAPI_TEST_RESULTS.md）
- ✅ 搜索：无 Cookie 可用，返回 20+ 结果，含标题/艺术家/时长/封面
- ✅ 元数据：专辑、封面（60x60 到 544x544）
- ✅ 相关度排序：API 默认按相关度排序

### 致命缺陷（无法用于应用内播放）

1. **无直接音频 URL**：
   - 无 Cookie：只能获取 `videoId`，没有音频流 URL
   - 有 Cookie：通过 `get_streaming_data()` 获取临时 URL，但：
     - URL 有时效性（几小时内过期）
     - 绑定会话/IP，不能跨设备使用
     - 需要持续维护 Cookie（3-6 个月过期）

2. **无法嵌入 `<audio>` 元素**：
   - YouTube 音频流使用自适应格式（DASH/HLS），不是简单的 MP3 URL
   - 受 DRM / Google 反爬保护
   - 无法通过 `AudioContext` 做频率分析（CORS 不允许）

3. **播放 = 跳转到 YouTube Music**：
   - `https://music.youtube.com/watch?v={videoId}`
   - 非 Premium 用户有广告
   - 用户离开应用 → 断裂的 UX

4. **ytmusicapi 是 Python 库**：
   - 前端（React/TypeScript）无法直接调用
   - 需要搭建后端代理（增加架构复杂度）

### 结论
> **不适合应用内卡片播放。** 只能作为"在 YouTube Music 打开"的外部链接功能。

---

## 2) Spotify Web API 深度分析

### API 概述
- **认证**：Client Credentials Flow（无需用户登录）→ 可搜索/浏览
- **注册**：https://developer.spotify.com/dashboard → 免费创建 App → 获取 `client_id` + `client_secret`

### 可用端点（Client Credentials，无需用户登录）

| 端点 | 用途 | 可用性 |
|------|------|--------|
| `GET /v1/search` | 搜索曲目 | ✅ |
| `GET /v1/tracks/{id}` | 曲目详情 | ✅ |
| `GET /v1/audio-features/{id}` | BPM/能量/舞蹈性/情绪值 | ✅ |
| `GET /v1/recommendations` | 基于种子的推荐 | ✅ |
| `GET /v1/browse/categories` | 浏览分类 | ✅ |

### 搜索返回数据示例
```json
{
  "id": "3n3Ppam7vgaVa1iaRUc9Lp",
  "name": "Mr. Brightside",
  "artists": [{"name": "The Killers"}],
  "album": {
    "images": [{"url": "https://i.scdn.co/image/...", "width": 640}]
  },
  "duration_ms": 222000,
  "popularity": 87,
  "preview_url": "https://p.scdn.co/mp3-preview/..." // ⚠️ 可能为 null
}
```

### Audio Features（独特优势）
```json
{
  "tempo": 148.114,          // BPM
  "energy": 0.918,           // 0-1
  "danceability": 0.355,     // 0-1
  "valence": 0.240,          // 情绪值 0=悲伤 1=欢快
  "instrumentalness": 0.00,  // 0=有人声 1=纯乐器
  "acousticness": 0.00109    // 0=电子 1=原声
}
```
→ 这些数据对 AI 推荐算法非常有价值！

### 致命缺陷

1. **`preview_url` 正在被废弃**：
   - Spotify 从 2024 年 11 月开始逐步移除 `preview_url`
   - 许多曲目已经返回 `null`
   - 不能依赖它做应用内播放

2. **完整播放需要 Spotify Premium + OAuth**：
   - 用户必须有 Premium 账户
   - 需要 OAuth 2.0 用户授权流程
   - 使用 Spotify Web Playback SDK（创建一个 Spotify Connect 设备）
   - 免费用户：只能随机播放，有广告
   - DRM 保护：无法直接获取音频流 URL

3. **速率限制**：
   - 未认证：不可用
   - Client Credentials：有速率限制（通常 ~30 请求/秒）

### 结论
> **元数据金矿，但播放不可靠。** `audio_features` 对推荐算法非常有价值，但 `preview_url` 被废弃后无法保证应用内播放。建议用于**元数据增强和推荐算法**，不依赖其播放能力。

---

## 3) Deezer API 深度分析 ⭐ 推荐

### API 概述
- **认证**：搜索和预览 **完全不需要认证**
- **注册**：不需要！直接调用即可
- **文档**：https://developers.deezer.com/api

### 关键端点

| 端点 | 用途 | 认证 |
|------|------|------|
| `GET /search?q={query}` | 搜索 | ❌ 不需要 |
| `GET /track/{id}` | 曲目详情 | ❌ 不需要 |
| `GET /artist/{id}/top` | 艺术家热门 | ❌ 不需要 |
| `GET /chart` | 排行榜 | ❌ 不需要 |

### 搜索返回数据
```json
{
  "id": 3135556,
  "title": "Harder, Better, Faster, Stronger",
  "duration": 224,
  "rank": 898730,
  "preview": "https://cdns-preview-d.dzcdn.net/stream/c-deda7fa9...",
  "artist": {
    "id": 27,
    "name": "Daft Punk",
    "picture_xl": "https://api.deezer.com/artist/27/image?size=xl"
  },
  "album": {
    "id": 302127,
    "title": "Discovery",
    "cover_xl": "https://api.deezer.com/album/302127/image?size=xl"
  }
}
```

### 核心优势

1. **✅ `preview` 字段 = 直接 MP3 URL**：
   - 30 秒高质量预览
   - 直链，可直接用于 `<audio src="...">`
   - CORS 友好，可通过 `AudioContext` 做频率分析
   - 稳定，不会过期

2. **✅ 无需任何认证**：
   - 不需要 API Key
   - 不需要 OAuth
   - 直接 `fetch('https://api.deezer.com/search?q=lofi')` 即可

3. **✅ 大曲库**：
   - 73M+ 曲目
   - 主流 + 独立音乐覆盖
   - 比 Jamendo 的 600K 大 100+ 倍

4. **✅ 丰富元数据**：
   - 高清封面（多尺寸）
   - 排名/热度数据（`rank` 字段）
   - 艺术家/专辑信息

5. **✅ 前端可直接调用**：
   - 纯 REST API，TypeScript `fetch` 即可
   - 不需要后端代理

### 限制
- 30 秒预览（vs Jamendo 全曲），但足够用于试听和频率分析
- 有速率限制（约 50 请求/5 秒），需要做节流
- 版权音乐，不能下载完整曲目（下载按钮应禁用）

### 实测发现（2026-02-20）

| 指标 | 结果 |
|------|------|
| 搜索 "lofi" | ✅ 返回 20 首，100% 有 preview URL |
| 预览 URL 验证 | ✅ 5/5 全部可访问，Content-Type: audio/mpeg |
| 预览 CDN CORS | ✅ `Access-Control-Allow-Origin: *` |
| 搜索 API CORS | ⚠️ 无 CORS 头 → 前端需 Vite proxy 或后端中转 |
| 与 Jamendo 重叠 | 0 位艺术家重叠 → 互补性极佳 |

> **CORS 注意**：Deezer 搜索 API 不返回 CORS 头，浏览器直接 `fetch` 会被拦截。解决方案：
> 1. **开发环境**：Vite `server.proxy` → `/api/deezer` → `https://api.deezer.com`
> 2. **生产环境**：Cloudflare Worker / Vercel Edge Function 做简单代理
> 3. 预览音频 CDN 允许 `*` CORS，`<audio>` 可直接加载

### 结论
> **最佳第二音源。** 完美满足"丰富曲库 + 应用内播放 + 无缝卡片整合"的需求。搜索 API 需要 proxy，但预览音频可以直接播放。

---

## 4) 整合架构设计

### 4.1 Provider Adapter 模式

```
MusicProvider (interface)
├── JamendoProvider     ← 现有，全曲播放 + 下载
├── DeezerProvider      ← 新增，30s 预览播放
├── SpotifyProvider     ← 新增，仅元数据 + audio_features
└── YouTubeMusicRef     ← 可选，仅外部链接
```

### 4.2 MusicTrack 类型扩展

```typescript
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  previewUrl: string;              // 可播放的音频 URL
  sourceUrl: string;               // 来源页面链接
  license: string;
  tags: string[];
  cover?: string;
  // 新增字段
  provider: 'jamendo' | 'deezer' | 'spotify' | 'youtube-music';
  playbackType: 'full' | 'preview-30s' | 'external-only';
  popularity?: number;             // 统一的热度分（0-100）
  audioFeatures?: {                // Spotify audio features
    bpm?: number;
    energy?: number;
    valence?: number;
    danceability?: number;
  };
  // 现有字段
  audiodownload?: string;
  audiodownloadAllowed?: boolean;
  position?: number;
  releasedate?: string;
}
```

### 4.3 UI 适配要点

卡片播放器需要区分展示：
- **Jamendo 曲目**：完整播放 + 下载可用
- **Deezer 曲目**：30s 预览标记 + 下载按钮禁用
- **Spotify 曲目**（如果 preview_url 可用）：30s 预览标记
- **YouTube Music 曲目**：外部链接按钮（"在 YouTube Music 打开"）

### 4.4 搜索策略

```
用户输入 → AI 分析 → 标签生成
                    ↓
        ┌───────────┼───────────┐
        ↓           ↓           ↓
    Jamendo      Deezer      Spotify
    (全曲)      (30s预览)    (元数据)
        ↓           ↓           ↓
        └───────────┼───────────┘
                    ↓
            合并 + 去重 + 排序
                    ↓
              最终结果列表
```

---

## 5) 实施优先级

### Phase 1：Deezer 整合（推荐立即做）
1. ✅ 写 Deezer API 测试脚本验证
2. 写 `services/deezerService.ts`
3. 修改 `useSearch.ts` 并行查询 Jamendo + Deezer
4. 添加合并/去重逻辑
5. UI: 卡片标记 provider 和 playbackType

### Phase 2：Spotify 元数据增强（后续）
1. 注册 Spotify Developer App
2. 写 `services/spotifyService.ts`（Client Credentials flow）
3. 用 audio_features 丰富推荐算法
4. 如果 preview_url 可用，也作为播放源

### Phase 3：YouTube Music 外部链接（可选）
1. 仅做搜索 + 外部链接按钮
2. 需要后端代理（ytmusicapi 是 Python）
3. 优先级最低

---

## 6) 测试脚本

| 脚本 | 用途 | 依赖 |
|------|------|------|
| `scripts/test_deezer_api.py` | Deezer 搜索 + 预览验证 | `requests` |
| `scripts/test_spotify_api.py` | Spotify 搜索 + audio_features | `requests` + `.env` |
| `test_ytmusicapi.py` (已有) | YouTube Music 搜索 | `ytmusicapi` |

