# TSCode Welcome Page 调试指南

## 问题修复

已修复 `tscodeWelcomePage` 显示为空白（像 `none` 一样）的问题。

## 修复内容

### 1. 添加了 `override` 选项
在 `openTscodeWelcome()` 方法中添加了 `override: TscodeWelcomeInput.ID`：

```typescript
this.editorService.openEditor({
    resource: TscodeWelcomeInput.RESOURCE,
    options: {
        override: TscodeWelcomeInput.ID,  // 关键：指定使用哪个编辑器
        index: editor ? 0 : undefined,
        pinned: false,
        preserveFocus: this.shouldPreserveFocus()
    },
});
```

### 2. 更新了编辑器解析器的 glob 模式
从 `walkThrough:/**` 改为 `walkThrough://tscode_welcome_page/**`，使其更精确地匹配 TSCode Welcome 的 URI。

## 验证步骤

### 1. 重新编译
```bash
yarn compile
# 或者如果正在运行 watch
# 它应该会自动重新编译
```

### 2. 重启应用
完全关闭并重新启动 VS Code。

### 3. 配置启动编辑器
在 settings.json 中设置：
```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 4. 重启并验证
关闭并重新打开 VS Code，你应该看到：
- 左侧有 Start 和 Recent 区域
- 右侧有 Walkthroughs 区域
- 底部有 "Show welcome page on startup" 复选框

## 对比测试

### 测试 welcomePage（应该正常工作）
```json
{
  "workbench.startupEditor": "welcomePage"
}
```
重启后应该看到完整的欢迎页面。

### 测试 tscodeWelcomePage（现在应该也正常工作）
```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```
重启后应该看到与 welcomePage 相同的内容。

### 测试 none（作为对比）
```json
{
  "workbench.startupEditor": "none"
}
```
重启后应该是空白编辑器区域。

## 调试技巧

### 1. 打开开发者工具
Help > Toggle Developer Tools (或 Cmd/Ctrl + Shift + I)

### 2. 检查 Console
查看是否有错误信息，特别是：
- 编辑器注册错误
- URI 解析错误
- 资源加载错误

### 3. 检查 Network 标签
确保所有资源（SVG、CSS 等）都正确加载。

### 4. 检查 DOM
在 Elements 标签中查找：
- `.gettingStartedContainer` - 主容器
- `.gettingStartedSlideCategories` - 分类滑块
- `.start-container` - Start 区域
- `.recently-opened` - Recent 区域
- `.getting-started` - Walkthroughs 区域

## 常见问题

### Q: 仍然显示空白
**A**:
1. 确保完全重启了应用（不是重新加载窗口）
2. 检查编译是否成功，没有错误
3. 清除缓存：删除 `~/.vscode-oss-dev` 或类似的开发目录
4. 检查开发者工具的 Console 是否有错误

### Q: 显示 "Cannot read property..." 错误
**A**:
1. 检查 `TscodeWelcomeInput` 是否正确导入
2. 确保所有依赖的服务都已注入
3. 检查 `tscodeWelcome.ts` 是否正确继承 `GettingStartedPage`

### Q: 页面显示但内容不完整
**A**:
1. 检查 `gettingStartedService.getWalkthroughs()` 是否返回数据
2. 在 `buildCategoriesSlide()` 方法中添加 console.log 调试
3. 检查 `when` 条件是否满足

## 技术细节

### URI 结构
```
walkThrough://tscode_welcome_page
  ↓
scheme: walkThrough
authority: tscode_welcome_page
```

### 编辑器解析流程
```
1. openEditor({ resource: TscodeWelcomeInput.RESOURCE, options: { override: ... } })
   ↓
2. EditorResolverService 查找匹配的编辑器
   ↓
3. 检查 glob 模式: walkThrough://tscode_welcome_page/**
   ↓
4. 检查 canSupportResource: scheme === 'walkThrough' && authority === 'tscode_welcome_page'
   ↓
5. 调用 createEditorInput 创建 TscodeWelcomeInput 实例
   ↓
6. 打开 TscodeWelcomePage 编辑器
```

### 关键代码位置

**编辑器注册**：
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts` (第 133-145 行)

**编辑器解析器**：
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts` (第 79-101 行)

**启动逻辑**：
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts` (第 253-268 行)

## 验证清单

- [ ] 代码编译无错误
- [ ] 应用已完全重启
- [ ] 设置中有 "TSCode Welcome Page" 选项
- [ ] 选择 tscodeWelcomePage 后重启显示完整页面
- [ ] 页面内容与 welcomePage 一致
- [ ] 开发者工具 Console 无错误
- [ ] 所有资源正确加载

## 下一步

如果问题仍然存在，请：
1. 检查编译输出中是否有警告
2. 在 `openTscodeWelcome()` 方法开头添加 `console.log('Opening TSCode Welcome')`
3. 在 `TscodeWelcomePage` 构造函数中添加 `console.log('TscodeWelcomePage created')`
4. 检查这些日志是否出现在 Console 中
