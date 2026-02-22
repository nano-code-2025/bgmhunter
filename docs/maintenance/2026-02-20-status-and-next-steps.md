# BGM Hunter Pro — Maintenance Status and Next Steps (2026-02-20)

## TL;DR
- **Recommendation Engine V2 已完成并合并至 `feature/api-expansion` 分支**：多查询变体 × 多 Provider 并行检索、多因子评分、多样性约束、会话记忆、隐式偏好提取。
- Deezer Provider 已接入，与 Jamendo 并行搜索，结果合并去重。
- **所有改动都必须以手机端适配为前提。**
- 下一阶段核心方向：**Trend Radar 爬虫 + 本地曲库建设 + 基于 TikTok/抖音热门趋势的推荐系统深化。**

---

## 1) What Has Been Done So Far

### 1.1 Core Product and Search Flow
- Migrated AI analysis from Gemini to DeepSeek service abstraction.
- Implemented mixed input logic (script, keywords, script+keywords) with OR-style behavior.
- Added tag mapping pipeline and preference-aware search.
- Switched recommendation baseline toward popularity-related sorting where available.

### 1.2 Playback and UX
- Added progress bar, seek, download button (with availability constraints), and standalone Shuffle.
- Upgraded player to carousel interaction (desktop drag + mobile swipe behavior).
- Added copy/share actions and improved active-card behavior.
- Added collection/favorites workflow and persistence.

### 1.3 Architecture Refactor
- Reduced `App.tsx` complexity by moving logic into hooks: `useSearch`, `usePlayer`, `useCollections`, `usePersistedState`.
- Service layer split: `aiService`, `deepseekService`, `tagMappingService`.

### 1.4 3D Visual System
- Built specialized scenes (`RainGlass`, `Aurora`, `MilkyWayBackdrop`).
- Themes reduced to three: **Milky Way** (`halo`), **Rain Glass** (`rainGlass`), **Aurora** (`aurora`).
- All shaders use clip-space full-screen quad + DPR-correct resolution.

### 1.5 Mobile Adaptation Fixes
- DPR (Device Pixel Ratio) mismatch fix across all shader scenes.
- MilkyWay clip-space rewrite for portrait viewports.
- Waveform bar dynamic scaling by viewport width.
- RainGlass brightness enhancement.

### 1.6 Multi-Provider Architecture (feature/api-expansion)
- Defined `MusicProvider` interface with unified `SearchQuery` / `SearchOptions` / `MusicTrack` types.
- Implemented **JamendoProvider** (full tracks) and **DeezerProvider** (30s previews via Vite proxy).
- Created `searchOrchestrator.ts` as the single entry point for all search operations.
- Track IDs prefixed by provider (`jamendo-123`, `deezer-456`), tracks carry `provider` + `playbackType` metadata.
- Player UI shows provider badge and "30s PREVIEW" label.

### 1.7 Recommendation Engine V2 ✅ (just completed)

| Module | File | Purpose |
|--------|------|---------|
| Query Variant Generator | `services/queryGenerator.ts` | 从单次 AI 调用生成 3 个查询变体（精确/召回/探索），含静态 fallback |
| Ranking Engine | `services/rankingEngine.ts` | 多因子评分 + 多样性约束选择 |
| Session Memory | `services/sessionMemory.ts` | 200 条环形缓冲，novelty 评分 + 刷新去重 |
| Implicit Preferences | `services/implicitPreferences.ts` | 从收藏中提取 top genres/instruments/moods（带时间衰减加权） |

**搜索管线 V2**:
```
用户输入 → Intent Extraction (AI/static)
        → Query Variant Generator (精确 / 召回 / 探索)
        → M queries × N providers (Jamendo + Deezer) parallel
        → Merge + Dice dedup (~40-50 candidates)
        → Multi-factor scoring (relevance 0.40 + popularity 0.22 + prefs 0.22 + novelty 0.06 + quality 0.10)
        → Diversity filter (artist ≤2, provider mix ≥30%, genre spread ≤50%)
        → Session Memory update
        → Top K output
```

**Refresh V2**: 递增 exploration seed → 重新生成查询变体 → novelty ≥ 60% 保障 → 不满足时自动 broaden 查询。

**Trend-aware AI**: DeepSeek 分析提示词中注入了 10 类内容趋势 BGM 模式（Vlog/知识分享/美食/旅行等），新增 `contentCategory` 字段。

**Provider-agnostic tags**: `tagMappingService` 已移除所有 Jamendo 专属措辞，输出通用音乐搜索标签。

---

## 2) Current Gaps / Risks

### 2.1 曲库深度仍然不足
- Jamendo 偏独立音乐，Deezer 仅 30s 预览，缺少主流热门曲目的完整播放能力。
- 没有 TikTok/抖音热门音乐的直接数据源。
- 缺少本地曲库，完全依赖在线 API 实时搜索。

### 2.2 趋势感知是 prompt-level，非数据驱动
- 当前的趋势感知仅通过 AI prompt 中的静态描述实现，不是基于实际爬取的热门数据。
- 无法感知实时趋势变化（如某首歌突然在 TikTok 爆火）。

### 2.3 Cross-Platform Stability
- DPR mismatch 和 MilkyWay 已修复，但仍需 iOS Safari / Android Chrome 真机测试。
- 低端移动 GPU 性能未验证。

### 2.4 Data and Account Layer
- 仍是 localStorage，无 per-user 云端持久化。
- 无 auth/角色/配额管理。

---

## 3) Agreed Strategic Directions

> **核心逻辑**：基于 TikTok/抖音热门趋势来构建推荐系统。当前的 API 搜索是"基础层"，未来需要在此之上叠加趋势数据驱动的推荐层。

### Phase D: Trend Radar + 本地曲库建设 (next major milestone)

#### D.1 Trend Radar (爬虫工具)
- 定期爬取 TikTok/抖音热门音乐列表（使用 Apify / 自建 scraper）。
- 提取热门模式：歌曲名、艺术家、标签、使用量、关联内容类型。
- 输出结构化 trend report → 存入本地数据库 → 供推荐引擎使用。
- 工具选择：Apify TikTok Trending Music Scraper / TikAPI / 自建 Python 爬虫。

#### D.2 Audio Capture Pipeline
- 对 Spotify、TikTok Commercial Music Library 等源，使用 **ffmpeg** 录制/转换音频片段。
- 至少获取 **30s 试听片段**（合规前提下的最小可用单位）。
- 建立自动化流水线：trend report → 查找对应歌曲 → 录制 → 存入本地库。

#### D.3 本地曲库 (Local Music Library)
- 建立本地数据库存储已收录歌曲的元数据 + 音频文件路径。
- 数据模型：`{ id, title, artist, tags, source, audioPath, duration, coverPath, trendScore, addedAt }`
- 持续收录策略：
  1. **Trend 驱动**：Trend Radar 发现的热门歌曲自动入库。
  2. **购买 BGM 包**：从小红书/淘宝购买常用 BGM 库，批量导入。
  3. **用户贡献**：未来允许用户上传。
- 本地库作为**优先搜索源**，API 搜索作为补充。

#### D.4 推荐系统 V3: Trend-Driven
```
                    ┌──────────────────────────┐
                    │    Trend Radar (Cron)     │
                    │  TikTok / Douyin / Reels  │
                    └────────┬─────────────────┘
                             │ trend data
                    ┌────────▼─────────────────┐
                    │   Trend DB / Index        │
                    │  songs × categories ×     │
                    │  popularity × recency     │
                    └────────┬─────────────────┘
                             │
    ┌────────────────────────▼────────────────────────┐
    │            Search Orchestrator V3                │
    │                                                  │
    │  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │
    │  │ Local Library │  │ Jamendo  │  │  Deezer    │ │
    │  │ (priority)    │  │ Provider │  │  Provider  │ │
    │  └──────┬───────┘  └────┬─────┘  └──────┬─────┘ │
    │         └───────────────┼───────────────┘       │
    │                         │                        │
    │            Merge + Dedup + Trend Boost           │
    │            Multi-factor Scoring V3               │
    │            (+ trendScore weight)                 │
    │            Diversity Filter                       │
    └─────────────────────┬────────────────────────────┘
                          │
                    Final Track List
```

- 评分公式 V3 新增 `trendScore` 权重（基于 Trend Radar 数据的热度分）。
- 本地库歌曲自带 trend 标注，搜索时优先匹配。
- API 结果与本地库结果合并排序。

### Phase E: 用户系统 + 云端持久化
- 邀请码注册 + 验证码
- per-user 偏好/收藏后端存储
- 管理员视图

---

## 4) Execution Order

| Phase | 内容 | 状态 |
|-------|------|------|
| A | Recommendation Engine V2 (multi-query, scoring, diversity) | ✅ Complete |
| B | Mobile rendering robustness + real device QA | 🟡 Partial |
| C | Auth + user data persistence | ⬜ Not started |
| **D** | **Trend Radar + Audio Capture + Local Library** | **⬜ Next** |
| E | User system + cloud persistence | ⬜ Planned |

---

## 5) Definition of Success (Next Milestone — Phase D)
- Trend Radar 能定期爬取 TikTok/抖音 Top 100 热门音乐并输出结构化数据。
- 本地曲库至少收录 500 首热门 BGM（含至少 30s 试听片段）。
- 搜索结果中本地库歌曲占比 ≥ 40%。
- 推荐列表中热门趋势歌曲的命中率显著提升。

---

## 6) Linked Docs
- Architecture and implementation plan: `docs/maintenance/architecture-and-delivery-plan.md`
- Search/recommendation deep plan: `docs/maintenance/recommendation-engine-v2-plan.md`
- API expansion analysis: `docs/API_EXPANSION_ANALYSIS.md`
- Project briefing for AI assistants: `claude.md`
