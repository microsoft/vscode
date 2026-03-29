# VSCode 开发快速参考

本文档提供 VSCode 二次开发的快速参考和常用命令。

## 环境状态

✅ **已完成设置**：
- Node.js v22.22.1
- npm 10.9.4
- node-gyp
- 项目依赖已安装
- 编译进程已启动（后台运行）

⚠️ **可选组件**：
- Rust（仅编译 CLI 时需要）- 运行 `bash scripts/install-rust.sh` 安装

## 常用命令

### 编译相关

```bash
# 持续编译（开发推荐，已在后台运行）
npm run watch

# 一次性编译
npm run compile

# 编译特定模块
npm run compile-build      # 仅编译构建工具
npm run compile-extensions # 仅编译扩展
```

### 运行开发版

```bash
# 启动开发版 VSCode（桌面）
./scripts/code.sh

# 启动 Web 版
npm run web

# 启动 CLI
./scripts/code-cli.sh
```

### 调试

```bash
# 查看编译进程输出
# 在 Kiro 中使用 getProcessOutput 工具，terminalId: 2

# 打开开发者工具（在运行的开发版中）
Ctrl+Shift+I (macOS: Cmd+Option+I)

# 重载窗口（应用编译后的更改）
Ctrl+R (macOS: Cmd+R)
```

### 代码质量

```bash
# 运行 ESLint
npm run eslint

# 格式化代码
npm run format

# 运行测试
npm test

# 运行特定测试
npm test -- --grep "test name"
```

### 清理

```bash
# 清理编译输出
npm run clean

# 完全重新构建
npm run clean && npm install && npm run compile
```

## 项目结构速查

```
src/vs/
├── base/          # 基础工具和 UI 组件
├── platform/      # 平台层（DI、核心服务）
├── editor/        # Monaco 编辑器
│   ├── common/    # 编辑器核心逻辑
│   ├── browser/   # 浏览器渲染
│   └── contrib/   # 编辑器扩展功能
├── workbench/     # 工作台（IDE 框架）
│   ├── services/  # 工作台服务
│   ├── contrib/   # 功能模块（搜索、Git、调试等）
│   └── api/       # 扩展 API 实现
├── code/          # 应用入口
└── server/        # 远程开发服务器
```

## 开发工作流

### 1. 修改代码
在 `src/vs/` 下修改相关文件

### 2. 等待编译
`npm run watch` 会自动检测更改并重新编译

### 3. 测试更改
- 在开发版 VSCode 中按 `Ctrl+R` 重载窗口
- 或重启 `./scripts/code.sh`

### 4. 调试
- 使用开发者工具（Ctrl+Shift+I）
- 或从稳定版 VSCode 附加调试器

## Fork 特定更改标记

**重要**：所有 fork 特定的更改必须标记，以便后续合并：

```typescript
// 单行更改
const value = 42; // test-workbench_change

// 多行更改
// test-workbench_change start
const foo = 1;
const bar = 2;
// test-workbench_change end

// 新文件（文件顶部）
// test-workbench_change - new file
```

## 常见开发模式

### 添加新功能模块

1. 在 `src/vs/workbench/contrib/` 创建新目录
2. 创建 `.contribution.ts` 文件注册功能
3. 在 `workbench.desktop.main.ts` 中导入

### 添加新服务

1. 定义接口：`export const IMyService = createDecorator<IMyService>('myService')`
2. 实现服务类
3. 注册：`registerSingleton(IMyService, MyService, InstantiationType.Delayed)`

### 添加 UI 元素

```typescript
// 状态栏
statusbarService.addEntry({...}, 'id', StatusbarAlignment.LEFT, 1000);

// 菜单
MenuRegistry.appendMenuItem(MenuId.EditorContext, {...});

// 命令
CommandsRegistry.registerCommand('my.command', handler);

// 快捷键
KeybindingsRegistry.registerCommandAndKeybindingRule({...});
```

## 调试端口

- **渲染进程**: 9222 (Chrome DevTools Protocol)
- **扩展主机**: 5870 (Node.js Inspector)
- **Web 版**: 8080 (HTTP)

## 有用的环境变量

```bash
# 跳过 Node 版本检查
export VSCODE_SKIP_NODE_VERSION_CHECK=1

# 强制重新安装依赖
export VSCODE_FORCE_INSTALL=1

# 跳过预启动编译
export VSCODE_SKIP_PRELAUNCH=1

# 启用详细日志
export VSCODE_LOG=trace
```

## 性能优化

### 加速编译
- 使用 `npm run watch` 而不是重复 `compile`
- 仅修改必要的文件
- 关闭不需要的扩展编译

### 减少内存使用
- 编译时关闭其他应用
- 使用 `--max-old-space-size` 调整 Node 内存限制（已在 package.json 配置）

## 故障排除

### 编译失败
```bash
# 清理并重新安装
npm run clean
rm -rf node_modules
npm install
npm run compile
```

### Electron 无法启动
```bash
# 重新下载 Electron
npm run electron
```

### 扩展主机错误
- 检查扩展代码的 TypeScript 错误
- 查看扩展主机调试端口 5870 的日志

### 内存不足
- 确保至少有 9GB 可用内存
- 关闭其他应用
- 增加系统交换空间

## 参考文档

- **架构参考**: `.kiro/steering/vscode-architecture-reference.md`
- **Dev Container 替代方案**: `.kiro/steering/devcontainer-alternative.md`
- **官方贡献指南**: `CONTRIBUTING.md`
- **官方 Wiki**: https://github.com/microsoft/vscode/wiki

## 下一步

1. ✅ 编译正在后台运行（`npm run watch`）
2. ⏳ 等待首次编译完成（约 5-10 分钟）
3. 🚀 运行 `./scripts/code.sh` 启动开发版
4. 📝 开始开发你的功能！

---

**提示**：首次编译需要较长时间，请耐心等待。后续增量编译会快很多。
