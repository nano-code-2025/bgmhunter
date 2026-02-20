# 项目智能指南（CLAUDE.md）

## 项目概述
**项目名称**：你的项目名  
**一句话描述**：一句话说明项目做什么  
**主要技术栈**：Next.js 14 + TypeScript, Tailwind, Prisma, etc.  
**当前目标**：短期目标或当前迭代重点

## 项目结构
- src/          主源码
- src/app/      App Router 页面
- src/components/  可复用组件
- src/lib/      工具函数、数据库等
- tests/ 或 __tests__/   测试文件

## 编码规范
- 使用 TypeScript strict 模式，禁止 any
- 优先使用 named export，不要 default export
- CSS：只用 Tailwind 类，禁止写原生 CSS 文件
- 命名：组件用 PascalCase，函数/变量用 camelCase，常量用 UPPER_CASE
- 提交规范： Conventional Commits（feat: / fix: / refactor: 等）

## 常用命令
- pnpm dev          开发
- pnpm build        构建
- pnpm test         跑测试
- pnpm lint         格式+lint
- pnpm typecheck    类型检查

## 工作流程要求
1. 任何改动前必须先给出完整计划（Plan），包含测试点
2. 改动要小步、可逆，单次 commit 只做一件事
3. 每次改动后必须跑测试、typecheck、lint
4. 禁止跳过测试、直接写代码不写计划
5. 如果不确定，主动问我澄清需求

## 禁止事项
- 不要假设用户意图，必须明确后再行动
- 不要一次性改很多文件
- 不要引入新依赖，除非我同意