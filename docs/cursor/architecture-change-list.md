# 架构改造清单（可执行）

目标：在不破坏 VS Code 现有 Chat/InlineChat 的前提下，新增 Cursor 核心能力的底层架构层与扩展点，形成稳定的调用链。

## 一、核心服务层（新增）
**新增目录**：`src/vs/workbench/services/aiCore/`

**新增模块**
- `aiCoreService.ts`：`IAICoreService` 接口 + 实现骨架
- `aiCoreTypes.ts`：通用类型、请求/响应、上下文结构
- `aiCoreRegistry.ts`：模型/提供商注册与选择
- `aiCoreContextBuilder.ts`：上下文拼装入口
- `aiCoreToolRunner.ts`：工具调度与执行
- `aiCorePolicy.ts`：配额/降级/超时策略
- `aiCoreCache.ts`：请求缓存与上下文缓存（可选）

**依赖关系**
- 读取 `IChatService` 但不强耦合 UI
- 可被 `IChatService`、`InlineChat` 与未来 Agent 直接调用

## 二、与现有 Chat 服务的边界
**改造目标**
- 现有 `IChatService` 仍负责会话模型与 UI 生命周期
- AI 调用、上下文构建、工具执行委托给 `IAICoreService`

**改造点**
- `src/vs/workbench/contrib/chat/common/chatService/`
  - 新增 `IAICoreService` 注入点
  - `sendRequest` 内部链路改为调用 `aiCoreService.sendRequest()`

## 三、上下文系统（阶段 1）
**新增模块**
- `aiCoreContextBuilder.ts`
  - 当前文件内容
  - 选区内容
  - 最近打开文件（可选）
  - 轻量文件摘要（可选）

**改造点**
- `chat/common/attachments` 与 `chat/browser/attachments` 连接到 `ContextBuilder`

## 四、索引与检索（阶段 2）
**新增目录**：`src/vs/workbench/services/aiIndex/`
- `indexer.ts`：扫描与 chunk
- `embedding.ts`：向量生成（可替换）
- `retrieval.ts`：检索策略
- `store.ts`：本地索引存储

## 五、工具系统与安全
**改造点**
- 对接现有 `chat/common/tools`
  - 将工具调用统一由 `aiCoreToolRunner` 出口管理
  - 在 tool runner 中做安全确认/权限控制

## 六、编辑与应用
**改造点**
- 复用 `chatEditing` 与 `inlineChat` 编辑应用机制
- `aiCoreService.applyEdits()` 负责统一出口

## 七、Telemetry / 日志 / 诊断
**新增**
- `aiCoreTelemetry.ts`：请求耗时、token、失败原因
- `aiCoreLogger.ts`：调试日志（开发期）

## 八、分阶段执行顺序
1. 创建 `aiCore` 核心服务与类型
2. 把 `IChatService.sendRequest()` 链路接入 `aiCoreService`
3. 落地上下文构建 v1（文件+选区）
4. 打通 Chat UI 最小闭环
5. 接入索引检索 v1
6. 工具系统升级与编辑链路稳定

