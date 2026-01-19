# Cursor 内核架构落点（第 1 周）

本周目标：明确 VS Code 现有 Chat/InlineChat 架构落点，制定“Cursor 核心能力”的底层模块边界与数据流，输出可执行的改造清单。

## 现有架构落点（VS Code 内置 Chat）
- UI 入口
  - `src/vs/workbench/contrib/chat/browser/chat.ts`
  - `src/vs/workbench/contrib/chat/browser/widget/`（ChatWidget 主体）
  - `src/vs/workbench/contrib/inlineChat/browser/`（编辑器内联对话）
- 服务层
  - `src/vs/workbench/contrib/chat/common/chatService/`（`IChatService` 与实现）
  - `src/vs/workbench/contrib/chat/common/model/`（会话、请求、响应模型）
- 参与者/Agent 与工具
  - `src/vs/workbench/contrib/chat/common/participants/`
  - `src/vs/workbench/contrib/chat/common/tools/`
- 编辑与多文件改动
  - `src/vs/workbench/contrib/chat/browser/chatEditing/`
  - `src/vs/workbench/contrib/inlineChat/browser/`
- 上下文/附件
  - `src/vs/workbench/contrib/chat/browser/attachments/`
  - `src/vs/workbench/contrib/chat/common/attachments/`

## Cursor 核心能力分层建议
1. **AI 核心服务层（新建）**
   - 建议位置：`src/vs/workbench/services/aiCore/`
   - 职责：模型调用、上下文构建、工具调度、策略/配额、缓存与降级
2. **上下文与索引层**
   - Context Builder：当前文件、选区、最近文件、项目检索
   - Indexer：扫描、chunking、embedding、检索策略
3. **交互层与入口**
   - 复用现有 ChatWidget 与 InlineChat
   - 新增 Cursor 特有入口（如侧边栏 Tab、快速命令）
4. **编辑执行层**
   - 统一 Diff/Apply & 预览机制
   - 复用 `chatEditing` 与 `inlineChat` 编辑动作

## 关键数据流（初版）
请求 → 解析 → 上下文拼装 → 模型调用 → 工具调用/编辑计划 → 结果渲染 → 可选应用

## 本周输出清单
1. **架构改造清单（可执行）**
   - 新服务/模块命名与路径
   - 与 `IChatService` 的边界定义
2. **核心 API 草案**
   - `IAICoreService`：`sendRequest() / buildContext() / runTools() / applyEdits()`
3. **阶段性风险清单**
   - 模型配额、隐私边界、性能、工具安全确认

## 待你确认的产品决策
1. 第一阶段功能排序（Chat/InlineChat/自动改写/Agent）
2. 模型策略（云端/本地/混合）
3. 用户默认体验（开箱即用 vs 手动配置 Key）

