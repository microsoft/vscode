# TSCode Welcome Page 内容验证

## 当前状态

`TscodeWelcomePage` 已经通过继承 `GettingStartedPage` 实现了与默认 `welcomePage` 完全相同的内容。

## 内容来源

所有的 welcome page 内容都来自同一个数据源：

```
gettingStartedService.getWalkthroughs()
    ↓
读取 gettingStartedContent.ts 中定义的内容
    ↓
包括：startEntries + walkthroughs
```

## 内容完全一致的原因

### 1. 继承关系
```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    // 继承所有父类的功能和内容
}
```

### 2. 共享的服务
两个页面都使用相同的服务来获取内容：
- `IWalkthroughsService` - 提供 walkthrough 数据
- `IWorkspacesService` - 提供最近打开的项目
- 其他所有服务都是共享的

### 3. 共享的内容定义
内容定义在 `gettingStartedContent.ts` 中：
- `startEntries` - Start 区域的快速操作
- `walkthroughs` - Walkthroughs 区域的教程

## 验证方法

### 方法 1：运行应用并比较

1. 设置 `workbench.startupEditor` 为 `welcomePage`，重启查看内容
2. 设置 `workbench.startupEditor` 为 `tscodeWelcomePage`，重启查看内容
3. 两者应该显示完全相同的内容

### 方法 2：代码验证

查看 `GettingStartedPage` 的构造函数：
```typescript
this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
```

`TscodeWelcomePage` 继承这个构造函数，因此会获取相同的数据。

## 显示的内容

### Start 区域（左上）
- New File...
- Open... / Open File... / Open Folder...
- Clone Git Repository...
- Open Repository...
- Connect to...
- Open Tunnel...
- Generate New Workspace...

### Recent 区域（左下）
- 最近打开的文件夹和工作区列表

### Walkthroughs 区域（右侧）
- **Setup** - Get started with VS Code
  - Use AI features with Copilot
  - Choose your theme
  - Watch video tutorials

- **SetupWeb** - Get Started with VS Code for the Web
  - Choose your theme
  - Just the right amount of UI
  - Code with extensions
  - Rich support for all your languages
  - Sync settings across devices
  - Unlock productivity with the Command Palette
  - Open up your code
  - Quickly navigate between your files

- **SetupAccessibility** - Get Started with Accessibility Features
  - 无障碍功能相关的多个步骤

- **Beginner** - Learn the Fundamentals
  - Tune your settings
  - Code with extensions
  - Built-in terminal
  - Watch your code in action
  - Track your code with Git
  - Install Git
  - Automate your project tasks
  - Customize your shortcuts
  - Safely browse and edit code

- **Notebooks** - Customize Notebooks
  - Select the layout for your notebooks

### 页面底部
- "Show welcome page on startup" 复选框
- 隐私声明和遥测设置（首次启动时）

## 如何自定义内容

如果将来需要让 `tscodeWelcomePage` 显示不同的内容，有以下几种方法：

### 方法 1：重写 buildCategoriesSlide 方法

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        // 调用父类方法获取默认内容
        await super.buildCategoriesSlide(preserveFocus);

        // 自定义修改
        const header = this.container.querySelector('h1.product-name');
        if (header) {
            header.textContent = 'Welcome to TSCode!';
        }

        // 可以添加、删除或修改任何 DOM 元素
    }
}
```

### 方法 2：过滤 walkthrough 内容

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        // 在调用父类方法之前过滤内容
        this.gettingStartedCategories = this.gettingStartedCategories.filter(
            category => category.id !== 'Notebooks' // 例如：隐藏 Notebooks
        );

        await super.buildCategoriesSlide(preserveFocus);
    }
}
```

### 方法 3：创建自定义 walkthrough 内容

在 `gettingStartedContent.ts` 中添加新的 walkthrough 定义，然后在 `TscodeWelcomePage` 中使用。

### 方法 4：修改 Start 区域

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    private buildCustomStartList(): GettingStartedIndexList<IWelcomePageStartEntry> {
        // 创建自定义的 Start 列表
        const customStartEntries = [
            // 自定义的快速操作
        ];

        // 返回自定义列表
    }
}
```

## 注意事项

1. **当前实现**：`TscodeWelcomePage` 与 `welcomePage` 内容完全相同
2. **未来扩展**：可以通过重写方法来自定义任何部分
3. **数据共享**：两个页面共享相同的 walkthrough 数据源
4. **独立性**：虽然内容相同，但它们是独立的编辑器实例，可以独立配置

## 测试建议

1. 编译项目：`yarn compile` 或 `yarn watch`
2. 启动应用：`./scripts/code.sh` 或 `yarn run watch`
3. 打开设置，搜索 "startup editor"
4. 选择 "TSCode Welcome Page"
5. 重启应用，验证显示的内容与默认 welcomePage 相同

## 总结

✅ `tscodeWelcomePage` 已经与 `welcomePage` 的内容完全一致
✅ 通过继承实现，无需复制代码
✅ 保持了代码的可维护性
✅ 为将来的自定义提供了灵活的扩展点
