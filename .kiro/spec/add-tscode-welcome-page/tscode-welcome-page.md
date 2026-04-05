# TSCode Welcome Page 功能规范

## 需求概述

在 VS Code 的 Startup Editor 配置选项中新增一个 `tscodeWelcomePage` 选项，用于显示自定义的欢迎页面。该页面当前与默认的 `welcomePage` 内容完全一致，但为后续自定义提供了独立的实现基础。

## 功能目标

1. 在 `workbench.startupEditor` 配置中添加 `tscodeWelcomePage` 选项
2. 当用户选择此选项时，启动时显示 TSCode Welcome 页面
3. 页面内容与默认 welcomePage 一致，包括：
   - Start 区域（快速操作）
   - Recent 区域（最近打开的项目）
   - Walkthroughs 区域（引导式教程）
4. 为后续自定义提供独立的代码基础

## 技术方案

### 架构设计

```
TscodeWelcomeInput (EditorInput)
    ↓
TscodeWelcomePage (EditorPane, extends GettingStartedPage)
    ↓
使用 GettingStartedService 获取 walkthrough 内容
```

通过继承 `GettingStartedPage` 实现，复用现有的 walkthrough 基础设施，同时保持独立性以便后续自定义。

### 实现细节

#### 1. 新增文件

**文件：`src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcomeInput.ts`**
- 定义 `TscodeWelcomeInput` 类（继承自 `EditorInput`）
- 定义 `TscodeWelcomeEditorOptions` 接口
- 使用独立的 URI：`walkThrough://tscode_welcome_page`
- 使用独立的 typeId：`workbench.editors.tscodeWelcomeInput`

**文件：`src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts`**
- 定义 `TscodeWelcomePage` 类（继承自 `GettingStartedPage`）
- 定义 `TscodeWelcomeInputSerializer` 类
- 通过继承自动获得所有 welcomePage 的功能

#### 2. 修改的文件

**文件：`src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts`**

修改内容：
1. 导入 `TscodeWelcomePage` 和 `TscodeWelcomeInput`
2. 注册编辑器序列化器
3. 注册编辑器面板
4. 在配置枚举中添加 `tscodeWelcomePage` 选项
5. 添加配置描述

关键代码：
```typescript
// 导入
import { TscodeWelcomePage, TscodeWelcomeInputSerializer } from './tscodeWelcome.js';
import { TscodeWelcomeInput } from './tscodeWelcomeInput.js';

// 注册编辑器
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
    .registerEditorSerializer(TscodeWelcomeInput.ID, TscodeWelcomeInputSerializer);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
        TscodeWelcomePage,
        'tscodeWelcomePage',
        localize('tscodeWelcome', "TSCode Welcome")
    ),
    [new SyncDescriptor(TscodeWelcomeInput)]
);

// 配置选项
'enum': [..., 'tscodeWelcomePage']
```

**文件：`src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts`**

修改内容：
1. 导入 `TscodeWelcomeInput`
2. 在 `StartupPageEditorResolverContribution` 中注册编辑器解析器
3. 在 `run()` 方法中添加 `tscodeWelcomePage` 的处理逻辑
4. 添加 `openTscodeWelcome()` 方法
5. 在 `isStartupPageEnabled()` 函数中添加 `tscodeWelcomePage` 判断

关键代码：
```typescript
// 编辑器解析器
this._register(editorResolverService.registerEditor(
    `${TscodeWelcomeInput.RESOURCE.scheme}://tscode_welcome_page/**`,
    {
        id: TscodeWelcomeInput.ID,
        label: localize('tscodeWelcome.displayName', "TSCode Welcome Page"),
        priority: RegisteredEditorPriority.builtin,
    },
    {
        singlePerResource: true,
        canSupportResource: uri => uri.scheme === TscodeWelcomeInput.RESOURCE.scheme
            && uri.authority === 'tscode_welcome_page',
    },
    {
        createEditorInput: ({ options }) => {
            return {
                editor: this.instantiationService.createInstance(TscodeWelcomeInput, options || {}),
                options: { ...options, pinned: false }
            };
        }
    }
));

// 启动逻辑
if (startupEditorSetting.value === 'tscodeWelcomePage') {
    await this.openTscodeWelcome();
}

// openTscodeWelcome 方法
private async openTscodeWelcome() {
    const editor = this.editorService.activeEditor;

    if (editor?.typeId === TscodeWelcomeInput.ID ||
        this.editorService.editors.some(e => e.typeId === TscodeWelcomeInput.ID)) {
        return;
    }

    this.editorService.openEditor({
        resource: TscodeWelcomeInput.RESOURCE,
        options: {
            override: TscodeWelcomeInput.ID,  // 关键：指定使用哪个编辑器
            index: editor ? 0 : undefined,
            pinned: false,
            preserveFocus: this.shouldPreserveFocus()
        },
    });
}

// isStartupPageEnabled 函数
return startupEditor.value === 'welcomePage'
    || startupEditor.value === 'readme'
    || (contextService.getWorkbenchState() === WorkbenchState.EMPTY
        && startupEditor.value === 'welcomePageInEmptyWorkbench')
    || startupEditor.value === 'terminal'
    || startupEditor.value === 'tscodeWelcomePage';  // 新增
```

**文件：`src/vs/workbench/browser/layout.ts`**

修改内容：
- 更新 `startupEditor` 的类型定义，添加 `'tscodeWelcomePage'`

**文件：`src/vs/platform/theme/electron-main/themeMainServiceImpl.ts`**

修改内容：
- 更新 `STARTUP_EDITOR` 的类型定义，添加 `'tscodeWelcomePage'`

## 关键技术点

### 1. 编辑器注册

使用 `EditorResolverService` 注册编辑器解析器，确保当打开特定 URI 时能正确创建编辑器实例。

关键点：
- glob 模式：`walkThrough://tscode_welcome_page/**`
- `canSupportResource` 检查 scheme 和 authority
- `createEditorInput` 创建 `TscodeWelcomeInput` 实例

### 2. 启动逻辑

在 `StartupPageRunnerContribution.run()` 方法中添加处理逻辑。

关键点：
- 必须在 `isStartupPageEnabled()` 函数中返回 true
- 在 `run()` 方法中检查配置值并调用相应的打开方法
- 使用 `override` 选项指定使用哪个编辑器

### 3. URI 设计

使用独立的 URI 避免与默认 welcomePage 冲突：
- Scheme: `walkThrough`（与 welcomePage 相同）
- Authority: `tscode_welcome_page`（独立的标识）

### 4. 继承策略

通过继承 `GettingStartedPage` 实现代码复用：
- 自动获得所有 walkthrough 功能
- 共享 `gettingStartedService` 数据源
- 保持独立性，便于后续自定义

## 代码标记

所有修改都使用 `test-workbench_change` 标记，便于识别和管理：

```typescript
// 单行修改
const value = 42; // test-workbench_change

// 多行修改
// test-workbench_change start
const foo = 1;
const bar = 2;
// test-workbench_change end

// 新文件
// test-workbench_change - new file
```

## 使用方法

### 配置方式

**方法 1：通过设置界面**
1. 打开设置（Cmd/Ctrl + ,）
2. 搜索 "startup editor"
3. 选择 "TSCode Welcome Page"

**方法 2：通过 settings.json**
```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 显示内容

当前 TSCode Welcome Page 显示与默认 welcomePage 完全相同的内容：

- **Start 区域**（左上）：New File, Open Folder, Clone Repository 等快速操作
- **Recent 区域**（左下）：最近打开的项目列表
- **Walkthroughs 区域**（右侧）：Setup, Beginner, Notebooks 等引导式教程
- **页面底部**："Show welcome page on startup" 复选框

## 后续扩展

### 自定义页面内容

可以通过重写 `TscodeWelcomePage` 的方法来自定义内容：

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        await super.buildCategoriesSlide(preserveFocus);

        // 自定义修改
        const header = this.container.querySelector('h1.product-name');
        if (header) {
            header.textContent = 'Welcome to TSCode!';
        }
    }
}
```

### 过滤 Walkthrough

```typescript
protected override async buildCategoriesSlide(preserveFocus?: boolean) {
    // 过滤不需要的内容
    this.gettingStartedCategories = this.gettingStartedCategories.filter(
        category => category.id !== 'Notebooks'
    );

    await super.buildCategoriesSlide(preserveFocus);
}
```

### 添加自定义样式

```typescript
protected override async buildCategoriesSlide(preserveFocus?: boolean) {
    await super.buildCategoriesSlide(preserveFocus);

    // 添加自定义 CSS 类
    this.container.classList.add('tscode-welcome');
}
```

## 测试验证

### 功能测试

1. ✅ 配置选项在设置中可见
2. ✅ 选择 tscodeWelcomePage 后重启显示页面
3. ✅ 页面内容与 welcomePage 一致
4. ✅ Start 区域功能正常
5. ✅ Recent 区域显示最近项目
6. ✅ Walkthroughs 区域可以正常导航
7. ✅ 页面底部复选框功能正常

### 对比测试

- `welcomePage`：显示默认欢迎页面 ✅
- `tscodeWelcomePage`：显示 TSCode 欢迎页面 ✅
- `none`：不显示任何页面 ✅
- `readme`：显示 README 文件 ✅
- `terminal`：打开终端 ✅

## 问题排查

### 常见问题

**问题 1：页面显示空白**
- 原因：`isStartupPageEnabled()` 函数未包含 `tscodeWelcomePage`
- 解决：已在函数中添加判断条件

**问题 2：编辑器无法打开**
- 原因：缺少 `override` 选项
- 解决：在 `openEditor` 调用中添加 `override: TscodeWelcomeInput.ID`

**问题 3：URI 解析失败**
- 原因：glob 模式不匹配
- 解决：使用 `walkThrough://tscode_welcome_page/**` 模式

### 调试方法

添加调试日志：
```typescript
console.log('[TSCode Debug] run() called');
console.log('[TSCode Debug] isStartupPageEnabled:', enabled);
console.log('[TSCode Debug] startupEditorSetting.value:', startupEditorSetting.value);
console.log('[TSCode Debug] Opening TSCode Welcome');
```

## 文件清单

### 新增文件
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcomeInput.ts`
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts`

### 修改文件
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts`
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts`
- `src/vs/workbench/browser/layout.ts`
- `src/vs/platform/theme/electron-main/themeMainServiceImpl.ts`

### 文档文件
- `TSCODE_WELCOME_PAGE.md` - 完整使用说明
- `TSCODE_WELCOME_VERIFICATION.md` - 内容验证和自定义方法
- `TSCODE_WELCOME_QUICK_START.md` - 快速开始指南
- `TSCODE_WELCOME_DEBUG.md` - 调试指南
- `TSCODE_WELCOME_TEST.md` - 测试和调试详解
- `test-tscode-welcome.sh` - 自动化测试脚本

## 总结

本次实现成功添加了 `tscodeWelcomePage` 启动选项，通过继承现有的 `GettingStartedPage` 实现了代码复用，同时保持了独立性以便后续自定义。所有修改都有清晰的标记，便于维护和管理。

关键成功因素：
1. 正确注册编辑器和编辑器解析器
2. 在启动逻辑中添加处理分支
3. 在 `isStartupPageEnabled()` 函数中添加判断条件（最关键）
4. 使用 `override` 选项指定编辑器
5. 使用独立的 URI 避免冲突

该实现为后续的自定义开发提供了良好的基础。
