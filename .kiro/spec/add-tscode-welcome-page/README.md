# TSCode Welcome Page 规范文档

本目录包含 TSCode Welcome Page 功能的完整规范和文档。

## 文档索引

### 主要规范
- **[tscode-welcome-page.md](./tscode-welcome-page.md)** - 完整的功能规范和技术方案
  - 需求概述
  - 技术方案
  - 实现细节
  - 代码标记规范
  - 使用方法
  - 后续扩展指南

### 使用指南
- **[TSCODE_WELCOME_PAGE.md](./TSCODE_WELCOME_PAGE.md)** - 使用说明和架构文档
  - 新增文件说明
  - 修改文件说明
  - 使用方法
  - 自定义示例
  - 技术说明

- **[TSCODE_WELCOME_QUICK_START.md](./TSCODE_WELCOME_QUICK_START.md)** - 快速开始指南
  - 编译和启动步骤
  - 配置方法
  - 自定义示例
  - 故障排除

### 验证和测试
- **[TSCODE_WELCOME_VERIFICATION.md](./TSCODE_WELCOME_VERIFICATION.md)** - 内容验证和自定义方法
  - 内容来源说明
  - 验证方法
  - 自定义方法详解

- **[TSCODE_WELCOME_TEST.md](./TSCODE_WELCOME_TEST.md)** - 测试和调试详解
  - 关键修复说明
  - 测试步骤
  - 调试日志添加方法
  - 问题排查

- **[TSCODE_WELCOME_DEBUG.md](./TSCODE_WELCOME_DEBUG.md)** - 调试指南
  - 问题修复记录
  - 验证步骤
  - 调试技巧
  - 常见问题

- **[test-tscode-welcome.sh](./test-tscode-welcome.sh)** - 自动化测试脚本
  - 检查编译输出
  - 验证配置
  - 提供测试步骤

## 快速导航

### 我想...

**开始使用**
→ 阅读 [TSCODE_WELCOME_QUICK_START.md](./TSCODE_WELCOME_QUICK_START.md)

**了解技术实现**
→ 阅读 [tscode-welcome-page.md](./tscode-welcome-page.md)

**自定义页面内容**
→ 阅读 [TSCODE_WELCOME_VERIFICATION.md](./TSCODE_WELCOME_VERIFICATION.md) 的自定义方法部分

**解决问题**
→ 阅读 [TSCODE_WELCOME_DEBUG.md](./TSCODE_WELCOME_DEBUG.md) 或 [TSCODE_WELCOME_TEST.md](./TSCODE_WELCOME_TEST.md)

**运行测试**
→ 执行 `./test-tscode-welcome.sh`

## 功能概述

TSCode Welcome Page 是一个自定义的启动页面选项，添加到 VS Code 的 `workbench.startupEditor` 配置中。

### 主要特性
- ✅ 与默认 welcomePage 内容完全一致
- ✅ 独立的代码实现，便于后续自定义
- ✅ 通过继承复用现有功能
- ✅ 所有修改都有清晰标记

### 显示内容
- Start 区域：快速操作（New File, Open Folder 等）
- Recent 区域：最近打开的项目
- Walkthroughs 区域：引导式教程
- 页面底部：启动选项复选框

## 代码位置

### 新增文件
```
src/vs/workbench/contrib/welcomeGettingStarted/browser/
├── tscodeWelcomeInput.ts    # EditorInput 定义
└── tscodeWelcome.ts          # 页面实现
```

### 修改文件
```
src/vs/workbench/contrib/welcomeGettingStarted/browser/
├── gettingStarted.contribution.ts  # 注册和配置
└── startupPage.ts                  # 启动逻辑

src/vs/workbench/browser/
└── layout.ts                       # 类型定义

src/vs/platform/theme/electron-main/
└── themeMainServiceImpl.ts         # 类型定义
```

## 使用方法

### 配置
```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 编译和启动
```bash
# 编译
yarn compile

# 启动
./scripts/code.sh
```

### 测试
```bash
# 运行测试脚本
./.kiro/spec/test-tscode-welcome.sh
```

## 关键技术点

1. **编辑器注册**：使用 EditorResolverService 注册编辑器解析器
2. **启动逻辑**：在 StartupPageRunnerContribution 中添加处理逻辑
3. **URI 设计**：使用独立的 URI `walkThrough://tscode_welcome_page`
4. **继承策略**：继承 GettingStartedPage 实现代码复用
5. **关键修复**：在 isStartupPageEnabled() 函数中添加判断条件

## 代码标记

所有修改使用 `test-workbench_change` 标记：

```typescript
// 单行
const value = 42; // test-workbench_change

// 多行
// test-workbench_change start
const foo = 1;
// test-workbench_change end

// 新文件
// test-workbench_change - new file
```

## 后续开发

该实现为后续自定义提供了良好的基础。可以通过重写 `TscodeWelcomePage` 的方法来：
- 修改页面标题和副标题
- 过滤或添加 walkthrough 内容
- 自定义 Start 区域的快速操作
- 添加自定义样式
- 修改页面布局

详细的自定义方法请参考 [TSCODE_WELCOME_VERIFICATION.md](./TSCODE_WELCOME_VERIFICATION.md)。

## 维护说明

- 所有修改都有 `test-workbench_change` 标记
- 新增文件在文件头部标记
- 修改的代码块用 start/end 包围
- 单行修改在行尾添加注释
- 便于识别、维护和合并上游更新

## 版本历史

- **v1.0** (2024-04-05) - 初始实现
  - 添加 tscodeWelcomePage 配置选项
  - 实现与 welcomePage 一致的内容显示
  - 完成所有文档和测试脚本

## 联系和支持

如有问题或建议，请参考调试文档或查看代码中的注释。
