# Recommendation Engine V2 Plan (updated 2026-02-20)

## Status: ✅ V2 IMPLEMENTED — see V3 roadmap below

---

## V2 Implementation Summary

All V2 tasks have been completed and committed to `feature/api-expansion` branch.

### Completed modules

| Module | File | Status |
|--------|------|--------|
| Query Variant Generator | `services/queryGenerator.ts` | ✅ |
| Multi-query Orchestrator | `services/searchOrchestrator.ts` | ✅ (major rewrite) |
| Ranking Engine | `services/rankingEngine.ts` | ✅ |
| Diversity Filter | (integrated in rankingEngine) | ✅ |
| Session Memory | `services/sessionMemory.ts` | ✅ |
| Implicit Preferences | `services/implicitPreferences.ts` | ✅ |
| useSearch V2 (simplified refresh) | `hooks/useSearch.ts` | ✅ |
| Trend-aware AI prompts | `services/deepseekService.ts` | ✅ |
| Provider-agnostic tag mapping | `services/tagMappingService.ts` | ✅ |

### V2 Pipeline

```
用户输入 → Intent Extraction (AI for script / static for keywords)
        → Query Variant Generator (precision / recall / exploration)
        → M variants × N providers (Jamendo + Deezer) in parallel
        → Merge + Dice dedup (~40-50 candidates)
        → Multi-factor scoring:
            relevance (0.40) + popularity (0.22) + explicit prefs (0.12)
            + implicit prefs (0.10) + novelty (0.06) + quality (0.10)
        → Diversity filter:
            max 2/artist, provider mix ≥30%, genre spread ≤50%
        → Session Memory update (200-entry ring buffer)
        → Top K output
```

### V2 Refresh behavior
1. Increment exploration seed → Query Generator produces new variants.
2. Session Memory penalises recently shown tracks.
3. If novelty < 60%, auto-broaden query (drop genre constraints, keep mood).
4. No random tag mutation logic needed.

---

## V3 Roadmap: Trend-Driven Recommendations

> **核心逻辑**：基于 TikTok/抖音热门趋势来构建推荐系统。V2 是"搜索基础层"，V3 在此之上叠加趋势数据驱动的推荐层。

### V3 New Components

#### 1. Trend Radar (爬虫层)
- 定期爬取 TikTok/抖音热门音乐列表。
- 工具：Apify TikTok Trending Music Scraper / TikAPI / 自建 Python 爬虫。
- 输出结构化 trend report：`{ songTitle, artist, tags[], videoCount, platform, contentCategories[] }`。
- 存储到本地 Trend DB（SQLite 或 JSON）。
- 更新频率：每日 / 每周。

#### 2. Audio Capture Pipeline
- 目标：为 Trend Radar 发现的热门歌曲获取至少 30s 试听片段。
- 工具链：Python + ffmpeg + yt-dlp + Playwright。
- 来源优先级：
  1. Deezer preview URL（直接下载 30s MP3）
  2. Spotify Web Player（ffmpeg 录制）
  3. TikTok Commercial Music Library
  4. YouTube Music（yt-dlp 提取）
- 合规：仅用于个人推荐/试听。

#### 3. Local Music Library
- 本地数据库存储已收录歌曲元数据 + 音频路径。
- 收录来源：
  1. Trend Radar → Audio Capture（自动收录热门歌）
  2. 购买 BGM 包（小红书 / 淘宝常用 BGM 库 → 批量导入）
  3. 手动添加
- 实现 `LocalLibraryProvider`（implements `MusicProvider`），作为最高优先级搜索源。

#### 4. Ranking Engine V3
评分公式新增 `trendScore`：
```
score = W_relevance  * tagOverlapScore
      + W_popularity * normalizedPopularity
      + W_trend      * trendScore              ← NEW (from Trend DB)
      + W_preference * preferenceMatchScore
      + W_novelty    * noveltyScore
      + W_quality    * qualityScore
```

权重基线（V3）：
- relevance: 0.30
- popularity: 0.15
- **trend: 0.20**
- explicit prefs: 0.10
- implicit prefs: 0.10
- novelty: 0.05
- quality: 0.10

本地库歌曲天然有 trendScore（来自 Trend Radar）；API 结果可通过 title+artist 匹配 Trend DB 获得 trendScore。

### V3 Architecture Diagram

```
Trend Radar (Cron)        BGM Pack Import
    │                          │
    ▼                          ▼
  Trend DB ──────────► Local Music Library
    │                          │
    │                   LocalLibraryProvider ──┐
    │                                          │
    └──── trendScore ──► Ranking Engine V3 ◄───┤
                              ▲                │
                              │         ┌──────┴──────┐
                         Merge+Dedup ◄──┤  Jamendo    │
                                        │  Deezer     │
                                        │  (future)   │
                                        └─────────────┘
```

---

## KPIs (must track from V2 onward)

1. **Repetition rate** across consecutive batches (target: < 30%)
2. **Unique artist ratio** in top K (target: > 70%)
3. **Play success rate** (target: > 90%)
4. **Favorite/save conversion rate** (track over time)
5. **Skip rate** in first 10 seconds (target: < 20%)
6. **Trend hit rate** — % of recommended tracks that appear in TikTok/抖音 trending (V3 KPI)

---

## Historical Context

### 推荐算法参考调研（详见 `docs/推荐算法.md`）
- **网易云音乐 (2015-2019)**：决策树 + 协同过滤 + 向量嵌入，社区驱动。
- **YouTube Music**：Transformer 序列建模 + MuLan 音频-文本联合嵌入。
- **Spotify**：协同过滤 + 内容分析 + BaRT 强化学习，Discover Weekly。
- **TikTok/抖音**：无官方音乐 API，需第三方爬取。趋势特征：短片段、高能量、按内容类型分化。

### 当前项目的定位
BGM Hunter Pro 不需要构建完整的推荐系统（无海量用户行为数据），核心价值在于：
1. **趋势感知**：知道什么 BGM 正在热门。
2. **内容匹配**：根据用户输入（口播稿/关键词）精准匹配 BGM 风格。
3. **曲库丰富度**：本地库 + 多 API = 覆盖足够多的音乐选择。
