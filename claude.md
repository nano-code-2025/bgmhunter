# BGM Hunter Pro — AI Assistant Project Briefing (2026-02-20)

## 项目概述
**项目名称**：BGM Hunter Pro  
**一句话描述**：AI 驱动的 BGM 搜索与推荐 Web 应用，用户输入口播稿或关键词，自动分析并从多个音乐源（Jamendo + Deezer + 未来本地库）推荐匹配 BGM。  
**主要技术栈**：React 19 + Vite + TypeScript (strict) + Tailwind CSS + Three.js (React Three Fiber/Drei) + Framer Motion  
**当前阶段**：Recommendation Engine V2 已完成，下一阶段为 Trend Radar + 本地曲库建设

## 核心原则

> **所有改动（功能、视觉、架构）都必须以手机端适配为前提。**  
> 任何新功能或视觉效果必须在竖屏 (360–412px 宽度) 验证通过后才算完成。

> **核心逻辑：基于 TikTok/抖音热门趋势来构建推荐系统。**  
> 当前的 API 搜索是"基础层"，未来需要叠加趋势数据驱动的推荐层。

## 项目结构

```
bgm-hunter-pro/
├── App.tsx                    # 主应用组件，状态编排
├── index.tsx                  # 入口
├── types.ts                   # 全局 TypeScript 类型定义
├── constants.ts               # 静态标签组 (TAG_GROUPS, ADVANCED_TAG_GROUPS)
├── components/
│   ├── input/SearchPanel.tsx           # 搜索面板（口播稿/关键词输入 + 标签选择）
│   ├── player/CentralPlayer.tsx        # 核心播放器（卡片轮播 + 音频波形 + 控制按钮）
│   ├── collection/CollectionSidebar.tsx # 桌面端收藏侧边栏
│   ├── collection/CollectionModal.tsx   # 移动端收藏弹窗
│   ├── settings/PreferencesModal.tsx    # 用户偏好设置 + 主题切换
│   └── visualizer/
│       ├── Scene3D.tsx                 # 3D 场景调度（粒子 + MilkyWay）
│       ├── MilkyWayBackdrop.tsx        # 银河背景 Shader（clip-space 全屏渲染）
│       ├── RainGlassScene.tsx          # 雨玻璃 + 散景灯光 Shader
│       └── AuroraScene.tsx             # 极光 Shader
├── hooks/
│   ├── useSearch.ts           # 搜索/刷新 hook（V2：调用 orchestrator）
│   ├── usePlayer.ts           # 音频播放控制 + CORS 重试 + 自动下一曲
│   ├── useCollections.ts      # 收藏管理（localStorage 持久化）
│   ├── usePersistedState.ts   # 通用 localStorage 持久化 hook
│   └── useAudioAnalyzer.ts    # 音频频率分析（AudioContext + AnalyserNode）
├── services/
│   ├── aiService.ts           # DeepSeek API 统一调用层
│   ├── deepseekService.ts     # AI 内容分析（口播稿→情绪/标签/摘要 + trend-aware prompts）
│   ├── tagMappingService.ts   # 标签映射（provider-agnostic）
│   ├── queryGenerator.ts      # ★ 查询变体生成器（precision/recall/exploration）
│   ├── searchOrchestrator.ts  # ★ 搜索编排器 V2（M queries × N providers + scoring + diversity）
│   ├── rankingEngine.ts       # ★ 多因子评分引擎 + 多样性约束选择
│   ├── sessionMemory.ts       # ★ 会话记忆（200 条环形缓冲）
│   ├── implicitPreferences.ts # ★ 隐式偏好提取（从收藏中挖掘用户口味）
│   └── providers/
│       ├── index.ts           # Provider 注册中心
│       ├── jamendoProvider.ts # Jamendo API 适配器（完整曲目）
│       └── deezerProvider.ts  # Deezer API 适配器（30s 预览，via Vite proxy）
├── data/
│   ├── tag_mapping.json       # 静态标签映射表
│   └── jamendo_tags.json      # Jamendo 标签参考数据
├── docs/
│   ├── maintenance/           # 维护文档
│   ├── 推荐算法.md            # 网易云/Spotify/YouTube Music 推荐系统调研
│   ├── API_EXPANSION_ANALYSIS.md  # Jamendo/Deezer/Spotify/YouTube Music API 对比
│   └── ...
├── scripts/                   # 测试脚本（Deezer/Spotify/YouTube Music API 测试）
└── vite.config.ts             # Vite 配置（含 Deezer CORS proxy）
```

## 搜索与推荐逻辑（V2 — 当前）

### 输入模式
1. **纯关键词模式**：选择/输入标签 → `tagMappingService` 映射 → 搜索。不调用 AI。
2. **口播稿模式**：输入文本 → `deepseekService.analyzeInput()` 分析 → 生成搜索标签 → 搜索。
3. **混合模式**：AI 分析口播稿时参考用户手动标签。

### V2 推荐管线
```
用户输入 → Intent Extraction (AI/static)
        → Query Variant Generator:
            A. Precision (core tags)
            B. Recall (AI-expanded synonyms)
            C. Exploration (mood + implicit prefs)
        → M variants × N providers (Jamendo + Deezer) parallel
        → Merge + Dice coefficient dedup (~40-50 candidates)
        → Multi-factor scoring:
            relevance (0.40) + popularity (0.22) + prefs (0.22) + novelty (0.06) + quality (0.10)
        → Diversity filter:
            max 2 per artist, provider mix ≥ 30%, genre spread ≤ 50%
        → Session Memory update (200-entry ring buffer)
        → Top K output
```

### Refresh (换一批) V2
- 递增 exploration seed → 生成新查询变体。
- Session Memory 惩罚已展示曲目。
- Novelty < 60% 时自动 broaden 查询（去掉 genre 约束，保留 mood）。

### DeepSeek AI Prompt 增强
- 注入 10 类内容趋势 BGM 模式（Vlog/知识分享/美食/旅行/时尚/运动/游戏/情感/萌宠/转场）。
- 新增 `contentCategory` 字段供 Query Generator 使用。
- Tag mapping 已去除 Jamendo 专属措辞，输出通用音乐搜索标签。

## Provider 架构

### MusicProvider 接口
```typescript
interface MusicProvider {
  readonly name: ProviderName;
  search(query: SearchQuery, options?: SearchOptions): Promise<MusicTrack[]>;
}
```

### 当前 Provider
| Provider | 特点 | playbackType |
|----------|------|-------------|
| Jamendo | 免费完整曲目，CC 授权 | `full` |
| Deezer | 30s 预览，无需认证 | `preview-30s` |

### 添加新 Provider
1. 在 `services/providers/` 下创建新文件，实现 `MusicProvider` 接口。
2. 在 `services/providers/index.ts` 的 `defaultProviders` 数组中注册。
3. Orchestrator 自动并行搜索新 Provider。

## 3D 视觉系统

### 可用主题
| 主题 key | 名称 | 渲染方式 |
|----------|------|---------|
| `halo` | Milky Way | Scene3D Canvas 内 clip-space quad |
| `rainGlass` | Rain Glass | 独立 Canvas + orthographic |
| `aurora` | Aurora | 独立 Canvas + orthographic |

### Shader 渲染规则（重要）
- **所有全屏 Shader 使用 clip-space 2×2 quad**：`gl_Position = vec4(position.xy, 0, 1)`
- **UV 归一化**：`(gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y)`
- **uResolution 来源**：`state.gl.domElement.width / height`（帧缓冲像素，非 CSS 像素）
- 新增 Shader 必须遵循以上三条规则

## 编码规范

### TypeScript
- strict 模式，尽量避免 `any`
- 组件 PascalCase，函数/变量 camelCase，常量 UPPER_CASE
- 每个源文件 < 800 行；超出则拆分
- 函数式组件 + hooks 优先

### CSS
- 优先 Tailwind CSS，禁止独立 CSS 文件
- 响应式断点：`sm:640px`, `md:768px`, `lg:1024px`
- 移动优先编写

### GLSL Shader
- 不依赖 `vUv` + 相机投影；统一用 `gl_FragCoord` + `uResolution`
- 可调参数提取为 JS 常量（文件顶部），附注释
- 新 uniform 必须在 `useMemo` 初始化 + `useFrame` 更新

### 提交
- Conventional Commits：`feat:` / `fix:` / `refactor:` / `perf:` / `docs:`

## 常用命令

```bash
npx vite          # 开发（HMR）
npx vite build    # 生产构建
npx vite preview  # 预览构建产物
```

## 下一步工作方向

### 优先级 1：Trend Radar + 本地曲库（Phase D）
1. **Trend Radar**：Python 爬虫定期爬取 TikTok/抖音 Top 100 热门 BGM。
2. **Audio Capture**：ffmpeg 录制 30s 试听片段（从 Deezer/Spotify/TikTok CML）。
3. **Local Library**：本地数据库存储元数据 + 音频，实现 `LocalLibraryProvider`。
4. **购买 BGM 包**：从小红书/淘宝采购常用 BGM 库，批量导入。
5. **Ranking V3**：评分公式新增 `trendScore` 权重（来自 Trend DB）。

### 优先级 2：移动端适配持续优化
- iOS Safari / Android Chrome 真机测试
- 搜索面板紧凑布局
- 低端移动 GPU 性能分析
- 详见：`docs/maintenance/architecture-and-delivery-plan.md` §4

### 优先级 3：用户认证与管理
- 邀请码注册 + 验证码
- Per-user 偏好/收藏后端持久化
- 管理员视图
- 详见：`docs/maintenance/architecture-and-delivery-plan.md` §5

## API 与环境变量

- **DeepSeek API**：`VITE_DEEPSEEK_API_KEY` (`.env.local`)
- **Jamendo API**：Client ID hardcoded (free tier, `f2567443`)
- **Deezer API**：通过 Vite proxy `/api/deezer` → `api.deezer.com`（无需 API key）
- 绝不在前端代码中硬编码敏感 API 密钥

## 维护文档索引
- 项目状态与下一步：`docs/maintenance/2026-02-19-status-and-next-steps.md`
- 架构与交付计划：`docs/maintenance/architecture-and-delivery-plan.md`
- 推荐引擎计划：`docs/maintenance/recommendation-engine-v2-plan.md`
- API 扩展分析：`docs/API_EXPANSION_ANALYSIS.md`
- 推荐算法调研：`docs/推荐算法.md`

## 禁止事项
- 不要假设用户意图，不确定时主动询问
- 不要跳过移动端验证
- 不要引入未讨论的新依赖
- 不要一次性大规模重写，小步迭代
- Shader 中不要用 `window.innerWidth/Height` 设 `uResolution`（DPR 问题）
- 不要在前端硬编码 API 密钥
