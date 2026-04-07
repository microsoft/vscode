# 重置欢迎动画标记

## 问题说明

TSCode Welcome 页面的欢迎动画只在用户第一次打开时显示。之后会通过 `Memento` 存储一个标记 `hasShownAnimation: true`，防止动画重复播放。

如果需要重新观看动画（例如测试或演示），需要手动清除这个标记。

## 存储位置

动画标记存储在以下位置：

### 开发模式（Code - OSS Dev）
```
~/Library/Application Support/code-oss-dev/User/globalStorage/state.vscdb
```

### 正式版本（Code - OSS）
```
~/Library/Application Support/Code - OSS/User/globalStorage/state.vscdb
```

### 正式版本（Code）
```
~/Library/Application Support/Code/User/globalStorage/state.vscdb
```

## 清除方法

### 开发模式
```bash
sqlite3 ~/Library/Application\ Support/code-oss-dev/User/globalStorage/state.vscdb "DELETE FROM ItemTable WHERE key = 'memento/tscodeWelcome';"
```

### Code - OSS 版本
```bash
sqlite3 ~/Library/Application\ Support/Code\ -\ OSS/User/globalStorage/state.vscdb "DELETE FROM ItemTable WHERE key = 'memento/tscodeWelcome';"
```

### Code 正式版本
```bash
sqlite3 ~/Library/Application\ Support/Code/User/globalStorage/state.vscdb "DELETE FROM ItemTable WHERE key = 'memento/tscodeWelcome';"
```

## 操作步骤

1. **完全关闭 VS Code**
   - 确保所有 VS Code 窗口都已关闭
   - 可以使用 `pkill -f "Code - OSS"` 强制关闭（开发模式）

2. **执行清除命令**
   - 根据你使用的版本选择对应的命令
   - 命令会删除数据库中的 `memento/tscodeWelcome` 键

3. **重新启动 VS Code**
   - 启动后会重新显示欢迎动画

## 验证清除成功

执行以下命令检查标记是否已删除：

```bash
# 开发模式
sqlite3 ~/Library/Application\ Support/code-oss-dev/User/globalStorage/state.vscdb "SELECT key, value FROM ItemTable WHERE key = 'memento/tscodeWelcome';"
```

如果没有输出，说明标记已成功删除。

## 技术细节

- **存储键名**: `memento/tscodeWelcome`
- **存储范围**: `StorageScope.APPLICATION`
- **存储目标**: `StorageTarget.USER`
- **数据结构**: `{ hasShownAnimation: boolean }`

标记在用户点击"进入工作台"按钮或 20 秒自动进入后被设置为 `true`。

## 相关代码

- 标记初始化: `src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts` (line 101-103)
- 标记检查: `src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts` (line 143-147)
- 标记保存: `src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts` (line 485-487)
