# TSCode Welcome Page 测试和调试

## 关键修复

已添加 `tscodeWelcomePage` 到 `isStartupPageEnabled` 函数中。这是导致页面不显示的根本原因。

## 修复的问题

**问题**：`isStartupPageEnabled` 函数返回 `false`，导致整个启动页面逻辑被跳过。

**修复前**：
```typescript
return startupEditor.value === 'welcomePage'
    || startupEditor.value === 'readme'
    || (contextService.getWorkbenchState() === WorkbenchState.EMPTY && startupEditor.value === 'welcomePageInEmptyWorkbench')
    || startupEditor.value === 'terminal';
```

**修复后**：
```typescript
return startupEditor.value === 'welcomePage'
    || startupEditor.value === 'readme'
    || (contextService.getWorkbenchState() === WorkbenchState.EMPTY && startupEditor.value === 'welcomePageInEmptyWorkbench')
    || startupEditor.value === 'terminal'
    || startupEditor.value === 'tscodeWelcomePage'; // 新增
```

## 测试步骤

### 1. 清理和重新编译

```bash
# 停止所有运行的实例
# 删除缓存
rm -rf ~/.vscode-oss-dev

# 重新编译
yarn compile

# 或者使用 watch 模式
yarn watch
```

### 2. 启动应用

```bash
./scripts/code.sh
```

### 3. 配置设置

打开 settings.json (Cmd/Ctrl + Shift + P -> "Preferences: Open User Settings (JSON)")

```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 4. 完全重启

- 关闭所有 VS Code 窗口
- 重新运行 `./scripts/code.sh`

## 添加调试日志

如果仍然不工作，在代码中添加调试日志：

### 在 startupPage.ts 的 run() 方法中添加：

```typescript
private async run() {
    await this.lifecycleService.when(LifecyclePhase.Restored);

    console.log('[TSCode Debug] run() called');

    const enabled = isStartupPageEnabled(this.configurationService, this.contextService, this.environmentService);
    console.log('[TSCode Debug] isStartupPageEnabled:', enabled);

    if (enabled && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
        if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
            const startupEditorSetting = this.configurationService.inspect<string>(configurationKey);
            console.log('[TSCode Debug] startupEditorSetting.value:', startupEditorSetting.value);

            if (startupEditorSetting.value === 'tscodeWelcomePage') {
                console.log('[TSCode Debug] Opening TSCode Welcome');
                await this.openTscodeWelcome();
            }
        }
    }
}
```

### 在 openTscodeWelcome() 方法中添加：

```typescript
private async openTscodeWelcome() {
    console.log('[TSCode Debug] openTscodeWelcome() called');

    const editor = this.editorService.activeEditor;
    console.log('[TSCode Debug] activeEditor:', editor);

    if (editor?.typeId === TscodeWelcomeInput.ID || this.editorService.editors.some(e => e.typeId === TscodeWelcomeInput.ID)) {
        console.log('[TSCode Debug] TSCode Welcome already open, skipping');
        return;
    }

    console.log('[TSCode Debug] Opening editor with resource:', TscodeWelcomeInput.RESOURCE.toString());

    this.editorService.openEditor({
        resource: TscodeWelcomeInput.RESOURCE,
        options: {
            override: TscodeWelcomeInput.ID,
            index: editor ? 0 : undefined,
            pinned: false,
            preserveFocus: this.shouldPreserveFocus()
        },
    });

    console.log('[TSCode Debug] openEditor called');
}
```

### 在 TscodeWelcomePage 构造函数中添加：

```typescript
// 在 tscodeWelcome.ts 中
export class TscodeWelcomePage extends GettingStartedPage {
    constructor(...args: any[]) {
        console.log('[TSCode Debug] TscodeWelcomePage constructor called');
        super(...args);
        console.log('[TSCode Debug] TscodeWelcomePage initialized');
    }
}
```

## 检查开发者工具

1. 启动应用后，立即打开开发者工具：Help > Toggle Developer Tools
2. 查看 Console 标签
3. 搜索 "[TSCode Debug]" 查看日志输出

## 预期的日志输出

如果一切正常，你应该看到：

```
[TSCode Debug] run() called
[TSCode Debug] isStartupPageEnabled: true
[TSCode Debug] startupEditorSetting.value: tscodeWelcomePage
[TSCode Debug] Opening TSCode Welcome
[TSCode Debug] openTscodeWelcome() called
[TSCode Debug] activeEditor: null
[TSCode Debug] Opening editor with resource: walkThrough://tscode_welcome_page
[TSCode Debug] openEditor called
[TSCode Debug] TscodeWelcomePage constructor called
[TSCode Debug] TscodeWelcomePage initialized
```

## 可能的问题和解决方案

### 问题 1: isStartupPageEnabled 返回 false
**检查**：
- 确保 `workbench.startupEditor` 设置为 `tscodeWelcomePage`
- 确保没有设置 `--skip-welcome` 启动参数

### 问题 2: openTscodeWelcome() 没有被调用
**检查**：
- `startupEditorSetting.value` 的值是否正确
- 是否有其他编辑器已经打开（`activeEditor` 不为 null）

### 问题 3: 编辑器打开但显示空白
**检查**：
- 编辑器解析器是否正确注册
- URI 是否正确匹配
- TscodeWelcomePage 是否正确继承 GettingStartedPage

### 问题 4: 编译错误
**检查**：
```bash
yarn compile 2>&1 | grep -i error
```

## 验证编辑器注册

在开发者工具的 Console 中运行：

```javascript
// 检查编辑器是否注册
const editorService = (window as any).vscode?.services?.get('editorService');
console.log('Editor Service:', editorService);

// 检查配置
const configService = (window as any).vscode?.services?.get('configurationService');
const startupEditor = configService?.getValue('workbench.startupEditor');
console.log('Startup Editor Setting:', startupEditor);
```

## 完整的测试清单

- [ ] 代码已重新编译，无错误
- [ ] 缓存已清除 (~/.vscode-oss-dev)
- [ ] 应用已完全重启（不是重新加载）
- [ ] settings.json 中设置了 `"workbench.startupEditor": "tscodeWelcomePage"`
- [ ] 开发者工具已打开
- [ ] Console 中有调试日志输出
- [ ] 没有 JavaScript 错误
- [ ] isStartupPageEnabled 返回 true
- [ ] openTscodeWelcome() 被调用
- [ ] TscodeWelcomePage 构造函数被调用

## 对比测试

### 测试 welcomePage（应该工作）
```json
{ "workbench.startupEditor": "welcomePage" }
```
如果这个工作但 tscodeWelcomePage 不工作，说明问题在编辑器注册或 URI 解析。

### 测试 terminal（应该工作）
```json
{ "workbench.startupEditor": "terminal" }
```
如果这个工作，说明 isStartupPageEnabled 函数正常。

## 最后的手段

如果以上都不工作，尝试：

1. **完全清理构建**：
```bash
yarn clean
yarn compile
```

2. **检查是否有多个 VS Code 实例运行**：
```bash
ps aux | grep code
```

3. **使用不同的用户数据目录**：
```bash
./scripts/code.sh --user-data-dir=/tmp/vscode-test
```

4. **检查文件是否真的被编译**：
```bash
ls -la out/vs/workbench/contrib/welcomeGettingStarted/browser/tscode*
```

应该看到：
- tscodeWelcome.js
- tscodeWelcomeInput.js

## 获取帮助

如果问题仍然存在，请提供：
1. Console 中的完整日志输出
2. 任何错误消息
3. `yarn compile` 的输出
4. `workbench.startupEditor` 的实际值
