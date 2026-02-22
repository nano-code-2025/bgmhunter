# BGM Hunter Pro — 部署架构设计

**日期**: 2026-02-22
**状态**: Approved
**方案**: 方案 C — Vercel 一体化 + 预留后端扩展

## 背景

项目当前是纯前端 Vite + React SPA，需要部署上线。核心问题：
1. DeepSeek API 密钥通过 `vite.config.ts` define 暴露在客户端 bundle 中
2. Deezer CORS proxy 仅在 Vite dev server 工作，生产环境不可用
3. 源码无 `src/` 目录组织，不利于后续扩展
4. 未来需要添加 Trend Radar、本地曲库、AI 生成音乐、用户系统

## 约束

- 目标用户规模：20-200 人（小众）
- 优先快速上线
- 代码模块化、可扩展、可维护
- 使用 Vercel Serverless Functions 作为后端

## 目录结构

```
bgm-hunter-pro/
├── api/                              ← Vercel Serverless Functions
│   ├── deepseek.ts                   ← DeepSeek AI 代理
│   ├── deezer/
│   │   └── [...path].ts             ← Deezer CORS proxy
│   └── lib/
│       ├── rateLimit.ts              ← 内存 rate limiter
│       └── validate.ts               ← 请求校验
│
├── src/                              ← 前端源码
│   ├── App.tsx
│   ├── main.tsx                      ← 入口（原 index.tsx）
│   ├── types.ts
│   ├── constants.ts
│   ├── components/
│   │   ├── input/SearchPanel.tsx
│   │   ├── player/CentralPlayer.tsx
│   │   ├── collection/
│   │   ├── settings/
│   │   └── visualizer/
│   ├── hooks/
│   │   ├── useSearch.ts
│   │   ├── usePlayer.ts
│   │   ├── useCollections.ts
│   │   ├── usePersistedState.ts
│   │   └── useAudioAnalyzer.ts
│   ├── services/
│   │   ├── api/                      ← 前端 API client 层
│   │   │   ├── deepseekClient.ts
│   │   │   └── deezerClient.ts
│   │   ├── providers/
│   │   │   ├── index.ts
│   │   │   ├── jamendoProvider.ts
│   │   │   └── deezerProvider.ts
│   │   ├── aiService.ts
│   │   ├── deepseekService.ts
│   │   ├── searchOrchestrator.ts
│   │   ├── rankingEngine.ts
│   │   ├── queryGenerator.ts
│   │   ├── sessionMemory.ts
│   │   ├── implicitPreferences.ts
│   │   └── tagMappingService.ts
│   └── data/
│       ├── tag_mapping.json
│       └── jamendo_tags.json
│
├── docs/
├── scripts/
├── index.html
├── vite.config.ts
├── vercel.json
├── tsconfig.json
└── package.json
```

## API 安全层

### DeepSeek 代理 (`api/deepseek.ts`)

```
浏览器 → POST /api/deepseek → Vercel Function → DeepSeek API
```

- 校验请求体（prompt 必填，长度限制）
- 从环境变量读取 DEEPSEEK_API_KEY（不加 VITE_ 前缀）
- Rate limit: 每 IP 每分钟 10 次
- 转发请求，返回结果

### Deezer Proxy (`api/deezer/[...path].ts`)

```
浏览器 → GET /api/deezer/search?q=jazz → Vercel Function → api.deezer.com/search?q=jazz
```

- Rate limit: 每 IP 每分钟 30 次
- 透传查询参数

### Rate Limiting (`api/lib/rateLimit.ts`)

内存 Map 方案，每个 Serverless Function 实例独立计数。适合 200 人规模。未来可替换为 Upstash Redis，接口不变。

## 构建与部署

### vercel.json

- buildCommand: `vite build`
- outputDirectory: `dist`
- SPA fallback rewrite

### vite.config.ts 改动

- 移除 `define` 块（不再注入 API 密钥到前端）
- 保留 dev proxy（Deezer + DeepSeek）
- `@` alias 指向 `src/`

### 开发流程

- 本地：`vercel dev` 或 `npx vite`（proxy 模式）
- 部署：`git push` → Vercel 自动构建

### Vercel 环境变量

- `DEEPSEEK_API_KEY`：仅服务端

## 代码清理

### 删除

- `constants.tsx`（1 行重复）
- `services/jamendoService.ts`（Legacy，已被 provider 替代）

### 不改动

- 组件内部逻辑
- 推荐引擎（rankingEngine, searchOrchestrator, queryGenerator）
- Provider 适配器核心逻辑
- 3D 可视化系统
- Hooks 内部逻辑
- Tailwind CSS CDN 方式

### YAGNI — 不做的事

- 不拆分 types.ts（109 行足够）
- 不引入状态管理库
- 不迁移 Tailwind 到 PostCSS
- 不添加用户系统（后续独立任务）
- 不移动推荐算法到后端

## 执行计划

### Phase 1：目录重组
1. 创建 `src/`，移入源码
2. 移入 `data/` 到 `src/data/`
3. 删除无用文件
4. 更新 `index.html`、`vite.config.ts`、`tsconfig.json`

### Phase 2：API 安全层
5. 创建 `api/lib/` 工具
6. 创建 `api/deepseek.ts`、`api/deezer/[...path].ts`
7. 创建 `src/services/api/` client 层
8. 修改 `aiService.ts` 调用 client
9. 移除 `vite.config.ts` define 块

### Phase 3：部署配置
10. 创建 `vercel.json`
11. 更新 dev proxy
12. 更新 `.gitignore`
13. 添加 `vercel` devDependency

### Phase 4：验证
14. `vite build` 构建通过
15. `vercel dev` 测试 API
16. 推送 GitHub，Vercel 部署

## 未来扩展路径

- **Trend Radar**：新增 `api/trends/` + 定时任务（Vercel Cron）
- **本地曲库**：新增 `api/library/` + 数据库（Supabase/Neon）
- **用户系统**：新增 `api/auth/` + Better Auth/Clerk
- **AI 生成音乐**：新增 `api/generate/`
- **推荐算法保护**：将 rankingEngine/searchOrchestrator 移到 `api/recommend/`
