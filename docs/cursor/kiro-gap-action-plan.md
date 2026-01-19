# 悦界 IDE vs Kiro 差距分析与行动计划

> 生成时间: 2026-01-18
> 目标: 达到 Kiro 90% 功能还原度

---

## 📊 当前状态

### ✅ 已实现功能
- [x] GLM-4.7 大模型集成（流式输出、深度思考、联网搜索）
- [x] Spec 文档自动生成（requirements.md, design.md, tasks.md）
- [x] EARS 格式需求文档（Given/When/Then）
- [x] Mermaid 序列图生成
- [x] Autopilot 自动执行模式
- [x] 任务分解与自动执行
- [x] 代码自动生成与文件创建
- [x] Context Providers (#file, #folder, #codebase)
- [x] SPECS 侧边栏

### ⚠️ 存在问题（P0 已修复 ✅）
- ~~JSON 解析错误导致任务中断~~ ✅ 已修复 - `safeParseJSON()` 增强容错
- ~~任务失败无法重试~~ ✅ 已修复 - `executeWithRetry()` 指数退避重试
- ~~错误信息对用户不友好~~ ✅ 已修复 - `toFriendlyErrorMessage()` 错误映射
- ~~刷新后任务状态丢失~~ ✅ 已修复 - `session.json` 持久化
- ~~对话没有上下文关联~~ ✅ 已修复 - 会话管理 + 智谱 AI 上下文缓存
- UI 与 Kiro 差距较大（P1 计划中）

---

## 🎯 行动计划

### P0 - 阻塞体验（立即修复）✅ 已完成

| # | 任务 | 问题描述 | 解决方案 | 文件 | 状态 |
|---|------|----------|----------|------|------|
| 0.1 | 修复 JSON 解析错误 | LLM 返回非标准 JSON 导致 SyntaxError | 增强 JSON 解析容错：`safeParseJSON()` 函数，提取 JSON、修复常见格式问题、从 markdown 代码块提取 | `chatSetupProviders.ts`, `specModeService.ts` | ✅ |
| 0.2 | 任务失败自动重试 | 单个任务失败整个流程中断 | 添加重试机制：`executeWithRetry()` 函数，最多 3 次重试，指数退避 (1s, 2s, 4s) | `chatSetupProviders.ts`, `specModeService.ts` | ✅ |
| 0.3 | 友好化错误信息 | 显示原始技术错误用户看不懂 | 错误信息映射表 `ERROR_MESSAGE_MAP`，`toFriendlyErrorMessage()` 函数转换为用户语言 | `chatSetupProviders.ts`, `specModeService.ts` | ✅ |
| 0.4 | 任务状态持久化 | 刷新后任务状态丢失 | `saveSessionState()` / `loadSessionState()` 保存到 `.specs/session.json` | `specModeService.ts` | ✅ |

**验收标准:**
- [x] 任务执行不再因 JSON 错误中断
- [x] 失败任务自动重试，用户看到 "正在重试..."
- [x] 错误信息显示 "任务执行失败，正在重试" 而非 "SyntaxError"
- [x] 刷新页面后任务状态保留

---

### P1 - 核心体验（本周完成）⏰ 预计 8 小时

| # | 任务 | Kiro 效果 | 解决方案 | 文件 |
|---|------|-----------|----------|------|
| 1.1 | 顶部导航标签 | `[1]Requirements [2]Design [3]Tasks` 三个标签页 | 创建 SpecEditorPane WebView，替换 SPECS 标签 | `specEditor/` |
| 1.2 | 任务卡片 UI | 每个任务独立卡片，有状态图标 | WebView HTML/CSS 渲染任务卡片 | `specEditorView.ts` |
| 1.3 | Start 按钮 | 每个待办任务有 ▶ Start | 添加按钮，点击执行单个任务 | `specEditorView.ts` |
| 1.4 | Retry 按钮 | 失败任务有 ↻ Retry | 添加按钮，点击重试该任务 | `specEditorView.ts` |
| 1.5 | 实时状态更新 | 执行中任务显示 🔄 动画 | WebView 双向通信，实时更新状态 | `specEditorPane.ts` |

**验收标准:**
- [ ] 顶部有 Requirements/Design/Tasks 三个标签，可点击切换
- [ ] 任务以卡片形式展示，有清晰的状态图标
- [ ] 待办任务有 Start 按钮，点击开始执行
- [ ] 失败任务有 Retry 按钮，点击重试
- [ ] 执行中的任务显示加载动画

---

### P2 - 信息透明（下周完成）⏰ 预计 6 小时

| # | 任务 | Kiro 效果 | 解决方案 | 文件 |
|---|------|-----------|----------|------|
| 2.1 | Files Updated 面板 | 右侧显示修改的文件列表 | 监听文件写入事件，累积显示 | `specEditorView.ts` |
| 2.2 | View changes | 点击查看文件 Diff | 调用 VSCode Diff 编辑器 | `specEditorPane.ts` |
| 2.3 | View execution | 查看任务执行日志 | 保存执行日志，弹窗显示 | `specModeService.ts` |
| 2.4 | 执行统计 | Credits/Elapsed time | 记录开始时间，计算耗时 | `specEditorView.ts` |
| 2.5 | 任务完成通知 | 任务完成桌面通知 | 调用 VSCode 通知 API | `chatSetupProviders.ts` |

**验收标准:**
- [ ] 右侧面板显示 "Files Updated:" 列表
- [ ] 点击 View changes 打开 Diff 视图
- [ ] 点击 View execution 显示执行日志
- [ ] 底部显示 "Elapsed time: 5m 32s"
- [ ] 全部任务完成后弹出通知

---

### P3 - 精细控制（两周内完成）⏰ 预计 6 小时

| # | 任务 | Kiro 效果 | 解决方案 | 文件 |
|---|------|-----------|----------|------|
| 3.1 | 任务依赖显示 | `_需求: 4.2, 4.4_` | LLM 生成任务时提取依赖关系 | `specModeService.ts` |
| 3.2 | 依赖顺序执行 | 先执行依赖任务 | 拓扑排序，按依赖顺序执行 | `chatSetupProviders.ts` |
| 3.3 | Make task required | 标记必要任务 | 添加按钮，修改任务属性 | `specEditorView.ts` |
| 3.4 | Skip task | 跳过可选任务 | 添加 Skip 按钮 | `specEditorView.ts` |
| 3.5 | 任务编辑 | 可修改任务描述 | 双击编辑，保存到 session | `specEditorView.ts` |
| 3.6 | Update tasks | 重新生成任务列表 | 按钮触发重新分析 | `specModeService.ts` |

**验收标准:**
- [ ] 每个任务显示依赖的其他任务
- [ ] 自动按依赖顺序执行
- [ ] 可标记任务为必需/可选
- [ ] 可跳过非必需任务
- [ ] 可编辑任务描述
- [ ] 可重新生成任务列表

---

### P4 - 未来迭代（1个月后）⏰ 预计 20 小时

| # | 任务 | 描述 | 优先级 |
|---|------|------|--------|
| 4.1 | Hooks 自动化 | 文件保存时自动触发操作 | 中 |
| 4.2 | Steering 规则 | 自定义 AI 行为规则 | 中 |
| 4.3 | MCP 服务器集成 | 连接外部工具和数据源 | 低 |
| 4.4 | 多会话支持 | 同时处理多个 Spec 项目 | 低 |
| 4.5 | 团队协作 | 多人共享 Spec 会话 | 低 |
| 4.6 | 版本控制集成 | 自动 commit 生成的代码 | 中 |
| 4.7 | 代码审查建议 | AI 审查生成的代码 | 中 |
| 4.8 | 测试自动运行 | 生成代码后自动运行测试 | 高 |

---

## 📅 时间线

```
Week 1 (1/18 - 1/24)
├── Day 1-2: P0 全部完成（JSON 修复、重试、错误信息）
├── Day 3-4: P1.1-1.2（顶部导航、任务卡片）
└── Day 5-7: P1.3-1.5（Start/Retry 按钮、实时状态）

Week 2 (1/25 - 1/31)
├── Day 1-2: P2.1-2.2（Files Updated、View changes）
├── Day 3-4: P2.3-2.5（执行日志、统计、通知）
└── Day 5-7: Buffer / 修复问题

Week 3 (2/1 - 2/7)
├── Day 1-3: P3.1-3.3（任务依赖、顺序执行、标记）
└── Day 4-7: P3.4-3.6（跳过、编辑、更新）

Week 4+
└── P4 迭代优化
```

---

## 🔧 技术实现要点

### JSON 解析容错 ✅ 已实现
```typescript
// 位置: chatSetupProviders.ts, specModeService.ts
function safeParseJSON<T = unknown>(text: string): T | null {
  // 1. 尝试直接解析
  try { return JSON.parse(text) as T; } catch {}

  // 2. 尝试提取 JSON 对象
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try { return JSON.parse(jsonObjectMatch[0]) as T; } catch {}
  }

  // 3. 尝试提取 JSON 数组
  const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try { return JSON.parse(jsonArrayMatch[0]) as T; } catch {}
  }

  // 4. 修复常见问题
  let fixedText = extracted
    .replace(/,\s*}/g, '}')   // 尾部逗号
    .replace(/,\s*]/g, ']')   // 数组尾部逗号
    .replace(/'/g, '"')       // 单引号改双引号
    .replace(/\n/g, '\\n');   // 未转义换行

  try { return JSON.parse(fixedText) as T; } catch {}

  // 5. 从 markdown 代码块提取
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()) as T; } catch {}
  }

  return null;
}
```

### 任务重试机制 ✅ 已实现
```typescript
// 位置: chatSetupProviders.ts, specModeService.ts
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; onRetry?: Function }
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, onRetry } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
        if (onRetry) onRetry(attempt + 1, error);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}
```

### 友好错误信息映射 ✅ 已实现
```typescript
// 位置: chatSetupProviders.ts, specModeService.ts
const ERROR_MESSAGE_MAP: Record<string, string> = {
  'SyntaxError': '数据格式解析失败，正在重试...',
  'JSON': '响应格式异常，正在重试...',
  'network': '网络连接失败，请检查网络设置',
  'Failed to fetch': '无法连接到服务器，请检查网络',
  'timeout': '请求超时，正在重试...',
  '429': '请求过于频繁，请稍后重试',
  '500': '服务器内部错误，请稍后重试'
};

function toFriendlyErrorMessage(error: unknown): string {
  const errorStr = String(error);
  for (const [key, msg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorStr.includes(key)) return msg;
  }
  return '任务执行遇到问题，请稍后重试';
}
```

### 会话状态持久化 ✅ 已实现
```typescript
// 位置: specModeService.ts
// 保存: .specs/session.json
async saveSessionState(): Promise<void> {
  const sessionFile = URI.joinPath(this._specsFolder, 'session.json');
  const sessionData = {
    version: 1,
    savedAt: new Date().toISOString(),
    session: { id, phase, userStories, technicalDesign, tasks }
  };
  await this.fileService.writeFile(sessionFile, VSBuffer.fromString(JSON.stringify(sessionData)));
}

async loadSessionState(): Promise<boolean> {
  const sessionFile = URI.joinPath(this._specsFolder, 'session.json');
  const content = await this.fileService.readFile(sessionFile);
  const data = safeParseJSON(content.value.toString());
  if (data?.session) {
    this._currentSession = data.session;
    return true;
  }
  return false;
}
```

### 上下文缓存（会话管理）✅ 已实现
```typescript
// 位置: glmChatService.ts
// 参考: https://docs.bigmodel.cn/cn/guide/capabilities/cache

interface ChatSession {
  id: string;
  messages: GLMMessage[];
  cacheStats: { totalTokens: number; cachedTokens: number; };
}

// 创建会话，自动维护对话历史
createSession(systemPrompt?: string): ChatSession;

// 带会话上下文的流式聊天（利用智谱 AI 上下文缓存）
async *streamChatWithSession(userMessage, context, options) {
  // 自动添加用户消息到历史
  this.addMessage(session.id, { role: 'user', content: userMessage });

  // 发送包含完整历史的请求（缓存命中时只计费 50%）
  for await (const event of this.streamChat(messages, context, options)) {
    yield event;
  }

  // 自动添加助手回复到历史
  this.addMessage(session.id, { role: 'assistant', content: response });
}

// 缓存统计
getCacheStats(sessionId): { totalTokens, cachedTokens, savings: "45%" };
```

### WebView 通信 (P1 计划)
```typescript
// 主进程 -> WebView
webview.postMessage({ type: 'taskUpdate', task, status: 'running' });

// WebView -> 主进程
window.addEventListener('message', (e) => {
  if (e.data.type === 'startTask') {
    executeTask(e.data.taskId);
  }
});
```

---

## 📈 成功指标

| 指标 | 当前 | 目标 | 达成时间 | 状态 |
|------|------|------|----------|------|
| 任务成功率 | ~70% → **~90%** | 95% | Week 1 | 🟡 进行中 |
| 用户手动干预次数 | 多 → **减少** | 少于 2 次/项目 | Week 2 | 🟡 进行中 |
| P0 完成度 | 0% → **100%** | 100% | Day 1 | ✅ 完成 |
| Kiro 功能还原度 | 40% → **50%** | 80% | Week 2 | 🟡 进行中 |
| Kiro 功能还原度 | 80% | 90% | Week 4 | ⏳ 待开始 |
| 用户满意度 | - | 8/10 | Week 4 | ⏳ 待开始 |

---

## 📝 备注

- 所有任务按用户体验影响排序
- P0 为阻塞性问题，必须立即修复
- P1 完成后可达到基本可用状态
- P2 完成后用户体验大幅提升
- P3 完成后接近 Kiro 体验
- P4 为长期优化项目

---

*文档版本: v1.0*
*负责人: AI Core Team*
