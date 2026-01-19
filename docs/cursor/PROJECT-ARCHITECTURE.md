# 自研 IDE 项目架构文档

> 基于 VS Code 1.109.0 源码，扩展 Cursor 风格的 AI 核心能力

---

## 一、项目概览

```
vscode/
├── build/          # 构建脚本与配置
├── cli/            # Rust 实现的 CLI 工具
├── docs/cursor/    # Cursor 核心改造文档
├── extensions/     # 内置扩展
├── remote/         # 远程开发服务
├── resources/      # 图标与静态资源
├── scripts/        # 开发脚本
├── src/            # 核心源代码（主体）
└── test/           # 测试代码
```

---

## 二、核心源码架构 (`src/vs/`)

```
src/vs/
├── base/           # 基础工具库（通用 UI、数据结构、异步工具）
│   ├── browser/    # 浏览器环境工具
│   ├── common/     # 跨平台通用工具
│   ├── node/       # Node.js 环境工具
│   └── parts/      # 可复用 UI 组件
│
├── code/           # 应用入口与启动逻辑
│
├── editor/         # Monaco 编辑器核心
│   ├── browser/    # 编辑器 UI 与交互
│   ├── common/     # 编辑器数据模型
│   ├── contrib/    # 编辑器扩展功能
│   └── standalone/ # 独立编辑器打包
│
├── platform/       # 平台服务层（DI、文件系统、配置、日志...）
│
├── server/         # 远程服务端
│
└── workbench/      # 工作台（IDE 主界面）
    ├── api/        # 扩展 API 实现
    ├── browser/    # 浏览器端工作台
    ├── common/     # 工作台通用逻辑
    ├── contrib/    # 功能模块（Chat、终端、调试...）
    ├── electron-browser/  # Electron 桌面端
    └── services/   # 工作台服务（★ AI 核心在此）
```

---

## 三、AI 核心架构（Cursor 改造重点）

### 3.1 架构层次图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        交互层 (UI Entry)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  ChatWidget │  │ InlineChat  │  │  侧边栏 Tab │  │  命令面板   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    会话与模型管理 (IChatService)                     │
│  contrib/chat/common/chatService/                                   │
│  - 会话生命周期                                                      │
│  - 请求/响应模型                                                     │
│  - Agent/Participant 调度                                           │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ 委托
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                ★ AI 核心服务层 (IAICoreService)                      │
│  services/aiCore/                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ sendRequest  │ │ buildContext │ │   runTools   │ │ applyEdits │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  上下文构建      │  │   索引与检索 (TODO) │  │   编辑应用          │
│  ContextBuilder │  │   aiIndex/          │  │   chatEditing/      │
│  - 当前文件      │  │   - Indexer         │  │   inlineChat/       │
│  - 选区内容      │  │   - Embedding       │  │   - Diff 预览       │
│  - 最近文件      │  │   - Retrieval       │  │   - 批量应用        │
└─────────────────┘  └─────────────────────┘  └─────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    模型调用层 (Model Provider)                       │
│  - 云端模型 API                                                      │
│  - 本地模型（可选）                                                   │
│  - 配额/降级/超时策略                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 已实现模块

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| `IAICoreService` | `services/aiCore/common/aiCoreService.ts` | ✅ 骨架 | 核心服务接口与基础实现 |
| `AICoreTypes` | `services/aiCore/common/aiCoreTypes.ts` | ✅ 完成 | 请求/响应/上下文类型定义 |
| `AICoreContextBuilder` | `services/aiCore/browser/aiCoreContextBuilder.ts` | ✅ v1 | 当前文件 + 选区上下文 |
| Debug Command | `services/aiCore/browser/aiCore.contribution.ts` | ✅ 完成 | 调试命令：AI Core: Dump Context |

### 3.3 待实现模块

| 模块 | 计划路径 | 优先级 | 说明 |
|------|----------|--------|------|
| `aiCoreRegistry` | `services/aiCore/common/` | P1 | 模型/提供商注册 |
| `aiCoreToolRunner` | `services/aiCore/common/` | P1 | 工具调度与执行 |
| `aiCorePolicy` | `services/aiCore/common/` | P2 | 配额/降级/超时策略 |
| `aiCoreCache` | `services/aiCore/common/` | P2 | 请求与上下文缓存 |
| `aiIndex/` | `services/aiIndex/` | P1 | 索引、chunking、embedding、检索 |
| `aiCoreTelemetry` | `services/aiCore/common/` | P3 | 遥测与诊断 |

---

## 四、Chat 系统架构

```
contrib/chat/
├── browser/           # UI 层
│   ├── chat.ts        # Chat 视图入口
│   ├── widget/        # ChatWidget 主体
│   ├── chatEditing/   # 多文件编辑 UI
│   └── attachments/   # 附件 UI
│
├── common/            # 服务与模型层
│   ├── chatService/   # IChatService 核心
│   │   ├── chatService.ts       # 接口定义
│   │   └── chatServiceImpl.ts   # 实现（1300+ 行）
│   ├── model/         # 会话、请求、响应模型
│   ├── participants/  # Agent/Participant 注册
│   ├── tools/         # 工具系统
│   │   ├── builtinTools/        # 内置工具
│   │   └── languageModelToolsService.ts
│   ├── attachments/   # 附件与上下文变量
│   ├── editing/       # 编辑服务
│   └── promptSyntax/  # Prompt 语法与模板
│
└── electron-browser/  # Electron 特有功能
    ├── builtInTools/  # 桌面端工具（如 fetchPage）
    └── actions/       # 桌面端操作
```

### 关键接口

```typescript
// 核心 AI 服务接口
interface IAICoreService {
  sendRequest(req: AICoreRequest): Promise<AICoreResponse>;
  buildContext(req: AICoreRequest): Promise<AICoreContext>;
  runTools(plan: AICoreToolPlan): Promise<AICoreToolResult>;
  applyEdits(edits: AICoreEdits): Promise<AICoreEditResult>;
}

// 请求结构
interface AICoreRequest {
  sessionId: string;
  message: string;
  mode?: 'chat' | 'inline' | 'edit' | 'agent';
  agentId?: string;
  modelId?: string;
  userContext?: AICoreContextHint;
}

// 上下文结构
interface AICoreContext {
  files: Array<{ uri: string; content: string; ranges?: [number, number][] }>;
  snippets?: Array<{ uri: string; snippet: string }>;
  search?: Array<{ uri: string; score: number; excerpt: string }>;
}
```

---

## 五、数据流

```
┌──────────┐    ┌──────────┐    ┌───────────────┐    ┌─────────────┐
│ 用户输入  │───▶│ 解析请求  │───▶│ 上下文拼装     │───▶│ 模型调用     │
└──────────┘    └──────────┘    │ (ContextBuilder)│   └──────┬──────┘
                                └───────────────┘          │
                                                           ▼
┌──────────┐    ┌──────────┐    ┌───────────────┐    ┌─────────────┐
│ UI 渲染   │◀───│ 结果组装  │◀───│ 编辑应用/预览  │◀───│ 工具执行     │
└──────────┘    └──────────┘    └───────────────┘    └─────────────┘
```

---

## 六、依赖注入与服务注册

VS Code 使用 **依赖注入 (DI)** 模式管理服务：

```typescript
// 1. 创建服务装饰器
export const IAICoreService = createDecorator<IAICoreService>('IAICoreService');

// 2. 注册单例
registerSingleton(IAICoreService, AICoreService, InstantiationType.Delayed);

// 3. 在其他服务中注入
constructor(
  @IAICoreService private readonly aiCoreService: IAICoreService
) {}
```

### 服务入口注册

- `workbench.common.main.ts` — 工作台主入口，导入各服务 contribution
- `aiCore.contribution.ts` — AI 核心服务的命令与 UI 注册

---

## 七、8 周研发路线

| 周次 | 目标 | 交付物 |
|------|------|--------|
| **W1** ✅ | 基线与架构落点 | 架构文档、`IAICoreService` 骨架 |
| **W2** | 上下文系统 v1 | `ContextBuilder`（文件 + 选区） |
| **W3** | 上下文 v2 + Prompt | 最近文件、Prompt 模板系统 |
| **W4** | 索引与检索 v1 | Indexer、Embedding、TopK 检索 |
| **W5** | 智能编辑 v1 | Diff 预览、统一编辑出口 |
| **W6** | Agent 工作流 | 工具调度、任务链路 UI |
| **W7** | 性能与稳定性 | 缓存、限流、降级、日志 |
| **W8** | 体验打磨 | 设置面板、打包、内测版本 |

---

## 八、关键文件索引

### AI 核心服务
- `src/vs/workbench/services/aiCore/common/aiCoreService.ts` — 核心服务
- `src/vs/workbench/services/aiCore/common/aiCoreTypes.ts` — 类型定义
- `src/vs/workbench/services/aiCore/browser/aiCoreContextBuilder.ts` — 上下文构建

### Chat 系统
- `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts` — Chat 服务实现
- `src/vs/workbench/contrib/chat/common/model/chatModel.ts` — 会话模型
- `src/vs/workbench/contrib/chat/common/tools/` — 工具系统

### 编辑与 InlineChat
- `src/vs/workbench/contrib/chat/browser/chatEditing/` — 多文件编辑
- `src/vs/workbench/contrib/inlineChat/browser/` — 编辑器内联对话

### 入口与注册
- `src/vs/workbench/workbench.common.main.ts` — 工作台主入口
- `src/vs/workbench/services/aiCore/browser/aiCore.contribution.ts` — AI 核心注册

---

## 九、技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript (核心)、Rust (CLI) |
| **框架** | Electron 39.x、Monaco Editor |
| **构建** | Gulp、Webpack |
| **测试** | Mocha、Playwright |
| **包管理** | npm |

---

## 十、开发命令

```bash
# 安装依赖
npm install

# 编译与监听
npm run watch

# 启动开发版
./scripts/code.sh   # macOS/Linux
./scripts/code.bat  # Windows

# 运行测试
npm run test-node
npm run test-browser
```

---

## 附录：架构改造原则

1. **最小侵入** — 不破坏 VS Code 原有 Chat/InlineChat 功能
2. **服务解耦** — AI 核心与 UI 层分离，便于扩展
3. **渐进增强** — 分阶段落地，每周可验收
4. **可观测性** — 完善日志与遥测，便于调试

---

*文档生成时间：2026-01-17*
