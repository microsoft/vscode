# TSCode Welcome Page 使用说明

## 概述

已成功添加了一个新的启动页面选项：`tscodeWelcomePage`。这个页面通过继承 `GettingStartedPage` 实现，与默认 `welcomePage` 的内容完全一致，可以用于后续的自定义修改。

## 内容说明

**重要**：`tscodeWelcomePage` 当前与 `welcomePage` 显示完全相同的内容，包括：
- Start 区域的快速操作（New File, Open Folder, Clone Repository 等）
- Recent 区域的最近打开项目列表
- Walkthroughs 区域的所有教程（Setup, Beginner, Notebooks 等）

这是通过继承实现的，两个页面共享相同的数据源（`gettingStartedService`）。详细的内容验证和自定义方法请参考 `TSCODE_WELCOME_VERIFICATION.md`。

## 新增文件

1. **tscodeWelcomeInput.ts** - TSCode Welcome 页面的 EditorInput 类
   - 路径：`src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcomeInput.ts`
   - 定义了 `TscodeWelcomeInput` 类和相关选项接口

2. **tscodeWelcome.ts** - TSCode Welcome 页面的主要实现
   - 路径：`src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts`
   - 继承自 `GettingStartedPage`，可以在此基础上进行自定义修改

## 修改的文件

1. **gettingStarted.contribution.ts**
   - 添加了 `tscodeWelcomePage` 配置选项
   - 注册了 TscodeWelcomePage 编辑器和序列化器

2. **startupPage.ts**
   - 添加了 `openTscodeWelcome()` 方法
   - 在启动逻辑中添加了对 `tscodeWelcomePage` 的处理
   - 注册了 TscodeWelcomeInput 的编辑器解析器

3. **layout.ts**
   - 更新了 `startupEditor` 的类型定义，包含 `tscodeWelcomePage`

4. **themeMainServiceImpl.ts**
   - 更新了 `STARTUP_EDITOR` 的类型定义

## 如何使用

### 方法 1：通过设置界面

1. 打开 VS Code 设置（File > Preferences > Settings）
2. 搜索 "startup editor"
3. 在 "Workbench > Startup Editor" 下拉菜单中选择 "TSCode Welcome Page"

### 方法 2：通过 settings.json

在 `settings.json` 中添加：

```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 方法 3：通过命令行

```bash
code --setting workbench.startupEditor=tscodeWelcomePage
```

## 后续自定义

目前 `TscodeWelcomePage` 继承自 `GettingStartedPage`，使用相同的页面内容和布局。要进行自定义修改：

1. **修改页面内容**：
   - 编辑 `tscodeWelcome.ts`，重写父类的方法
   - 例如：重写 `buildCategoriesSlide()` 方法来自定义页面布局

2. **修改页面样式**：
   - 可以添加自定义 CSS 类
   - 修改现有的样式文件或创建新的样式文件

3. **添加自定义功能**：
   - 在 `TscodeWelcomePage` 类中添加新的方法
   - 修改 `TscodeWelcomeInput` 来支持新的选项

## 示例：自定义页面标题

在 `tscodeWelcome.ts` 中：

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
	public static override readonly ID = 'tscodeWelcomePage';

	override get editorInput(): TscodeWelcomeInput | undefined {
		return this._input as TscodeWelcomeInput | undefined;
	}

	// 自定义方法示例
	protected override async buildCategoriesSlide(preserveFocus?: boolean) {
		// 调用父类方法
		await super.buildCategoriesSlide(preserveFocus);

		// 添加自定义逻辑
		// 例如：修改页面标题
		const header = this.container.querySelector('h1.product-name');
		if (header) {
			header.textContent = 'Welcome to TSCode!';
		}
	}
}
```

## 注意事项

- 所有修改都使用了 `test-workbench_change` 标记，便于识别和管理
- 新页面与原 welcomePage 共享相同的 walkthrough 内容和服务
- 如果需要完全独立的内容，需要创建新的 walkthrough 定义

## 架构说明

```
TscodeWelcomeInput (EditorInput)
    ↓
TscodeWelcomePage (EditorPane, extends GettingStartedPage)
    ↓
使用 GettingStartedService 获取 walkthrough 内容
```

这种设计允许你：
- 复用现有的 walkthrough 基础设施
- 独立控制页面的显示和行为
- 逐步添加自定义功能而不影响原有的 welcomePage

## 技术说明

由于 TypeScript 的限制，`TscodeWelcomePage` 类不能重写父类 `GettingStartedPage` 的静态 `ID` 属性。因此：
- 编辑器 Pane 的 ID 在注册时使用字符串常量 `'tscodeWelcomePage'`
- 类本身继承父类的所有功能，不需要重写静态属性
- 这不影响功能，只是实现细节
