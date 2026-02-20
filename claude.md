# BGM Hunter Pro — AI Assistant Project Briefing

## 项目概述
**项目名称**：BGM Hunter Pro  
**一句话描述**：AI 驱动的 BGM 搜索与推荐 Web 应用，用户输入口播稿或关键词，自动分析并从 Jamendo 高质量音乐库中推荐匹配 BGM。  
**主要技术栈**：React 19 + Vite + TypeScript (strict) + Tailwind CSS + Three.js (React Three Fiber/Drei) + Framer Motion  
**当前阶段**：MVP 已完成，正在迭代优化搜索推荐质量 + 移动端适配 + 用户系统

## 核心原则

> **所有改动（功能、视觉、架构）都必须以手机端适配为前提。**  
> 任何新功能或视觉效果必须在竖屏 (360–412px 宽度) 验证通过后才算完成。

## 项目结构

```
bgm-hunter-pro/
├── App.tsx                    # 主应用组件，负责路由（landing/results）、状态编排
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
│   ├── useSearch.ts           # 搜索/刷新状态 + AI 分析 + Jamendo 检索
│   ├── usePlayer.ts           # 音频播放控制 + CORS 重试 + 自动下一曲
│   ├── useCollections.ts      # 收藏管理（localStorage 持久化）
│   ├── usePersistedState.ts   # 通用 localStorage 持久化 hook
│   └── useAudioAnalyzer.ts    # 音频频率分析（AudioContext + AnalyserNode）
├── services/
│   ├── aiService.ts           # DeepSeek API 统一调用层
│   ├── deepseekService.ts     # AI 内容分析（口播稿→情绪/标签/摘要）
│   ├── tagMappingService.ts   # 标签映射（用户标签→Jamendo API 标签）
│   └── jamendoService.ts      # Jamendo API 检索 + 排序 + 过滤
├── data/
│   ├── tag_mapping.json       # 静态标签映射表
│   └── jamendo_tags.json      # Jamendo 标签参考数据
├── docs/maintenance/          # 维护文档
│   ├── 2026-02-19-status-and-next-steps.md
│   ├── architecture-and-delivery-plan.md
│   └── recommendation-engine-v2-plan.md
└── vite.config.ts
```

## 搜索与推荐逻辑（当前）

### 输入模式
1. **纯关键词模式**：用户选择/输入标签 → 直接通过 `tagMappingService` 映射为 Jamendo 标签 → 搜索。不调用 AI。
2. **口播稿模式**：用户输入文本 → `deepseekService.analyzeInput()` 分析情绪、关键词、能量 → 生成搜索标签 → 搜索。
3. **混合模式**（口播稿 + 手动标签）：AI 分析口播稿时同时参考用户选的标签，最终输出一组综合标签。

### 推荐管线
```
用户输入 → [AI 分析 (可选)] → 标签映射 → Jamendo API 搜索 (popularity_total_desc)
         → 结果过滤 (可播放/可下载) → 展示
```

### 已知瓶颈（待优化，详见 recommendation-engine-v2-plan.md）
- 单次查询，结果多样性不足
- 缺少多查询变体检索 + 合并去重
- Shuffle 换一批的新鲜度不够
- 用户偏好融合权重待调优

## 3D 视觉系统

### 可用主题
| 主题 key     | 名称         | 渲染方式                    |
|-------------|-------------|---------------------------|
| `halo`      | Milky Way   | Scene3D Canvas 内 clip-space quad |
| `rainGlass` | Rain Glass  | 独立 Canvas + orthographic        |
| `aurora`    | Aurora      | 独立 Canvas + orthographic        |

### Shader 渲染规则（重要）
- **所有全屏 Shader 使用 clip-space 2×2 quad**：`gl_Position = vec4(position.xy, 0, 1)`
- **UV 归一化**：`(gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y)`
- **uResolution 来源**：`state.gl.domElement.width / height`（帧缓冲像素，非 CSS 像素），避免 DPR 偏移
- 新增 Shader 必须遵循以上三条规则

## 编码规范

### TypeScript
- strict 模式，尽量避免 `any`
- 组件 PascalCase，函数/变量 camelCase，常量 UPPER_CASE
- 每个源文件 < 800 行；超出则拆分子模块
- 函数式组件 + hooks 优先

### CSS
- 优先 Tailwind CSS，禁止独立 CSS 文件
- 响应式断点：`sm:640px`, `md:768px`, `lg:1024px`
- 移动优先编写：先写基础样式，再用 `sm:`/`md:` 覆盖

### GLSL Shader
- 避免 `vUv` 依赖相机投影；统一用 `gl_FragCoord` + `uResolution`
- 可调参数提取为 JS 常量（文件顶部），附注释说明用途和取值范围
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

### 优先级 1：搜索推荐算法升级
- 每次请求生成 2-3 个查询变体（精确/扩展/探索）
- 合并去重 Top 40-50 候选
- 加入多样性排序 + 新鲜度过滤
- 融合用户偏好（收藏历史 + 显式偏好 + 会话上下文）
- 详见：`docs/maintenance/recommendation-engine-v2-plan.md`

### 优先级 2：移动端适配持续优化
- iOS Safari / Android Chrome 真机测试
- 搜索面板紧凑布局
- 低端移动 GPU 性能分析
- 详见：`docs/maintenance/architecture-and-delivery-plan.md` §5

### 优先级 3：用户认证与管理
- 邀请码注册（初始 5 个名额）+ 验证码
- 用户登录/登出
- 偏好/收藏 per-user 后端持久化
- 管理员视图
- 详见：`docs/maintenance/architecture-and-delivery-plan.md` §6

## API 与环境变量

- **DeepSeek API**：`VITE_DEEPSEEK_API_KEY` (`.env.local`)
- **Jamendo API**：`VITE_JAMENDO_CLIENT_ID` (`.env.local`)
- 绝不在前端代码中硬编码 API 密钥

## 维护文档索引
- 项目状态与下一步：`docs/maintenance/2026-02-19-status-and-next-steps.md`
- 架构与交付计划：`docs/maintenance/architecture-and-delivery-plan.md`
- 推荐引擎 V2 计划：`docs/maintenance/recommendation-engine-v2-plan.md`

## 禁止事项
- 不要假设用户意图，不确定时主动询问
- 不要跳过移动端验证
- 不要引入未讨论的新依赖
- 不要一次性大规模重写，小步迭代
- Shader 中不要用 `window.innerWidth/Height` 设 `uResolution`（DPR 问题）
