# TSCode Welcome Page 快速开始

## 当前状态 ✅

`tscodeWelcomePage` 已经完全实现，内容与默认 `welcomePage` 完全一致。

## 如何使用

### 1. 编译项目
```bash
yarn compile
# 或者使用 watch 模式
yarn watch
```

### 2. 启动应用
```bash
./scripts/code.sh
# 或者
yarn run watch
```

### 3. 配置启动页面

**方法 A：通过设置界面**
1. 打开设置（Cmd/Ctrl + ,）
2. 搜索 "startup editor"
3. 选择 "TSCode Welcome Page"

**方法 B：通过 settings.json**
```json
{
  "workbench.startupEditor": "tscodeWelcomePage"
}
```

### 4. 重启应用
关闭并重新打开 VS Code，你会看到 TSCode Welcome Page。

## 显示的内容

TSCode Welcome Page 当前显示与默认 Welcome Page 完全相同的内容：

### 左侧
- **Start** - 快速操作（New File, Open Folder, Clone Repository 等）
- **Recent** - 最近打开的项目

### 右侧
- **Walkthroughs** - 引导式教程
  - Setup - 开始使用 VS Code
  - Beginner - 学习基础功能
  - Notebooks - 自定义笔记本
  - Accessibility - 无障碍功能

### 底部
- "Show welcome page on startup" 复选框

## 下一步：自定义内容

如果你想自定义 TSCode Welcome Page 的内容，可以编辑 `tscodeWelcome.ts` 文件。

### 示例 1：修改页面标题

```typescript
// src/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.ts

export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        await super.buildCategoriesSlide(preserveFocus);

        // 修改产品名称
        const productName = this.container.querySelector('h1.product-name');
        if (productName) {
            productName.textContent = 'TSCode';
        }

        // 修改副标题
        const subtitle = this.container.querySelector('p.subtitle');
        if (subtitle) {
            subtitle.textContent = 'Your Custom Development Environment';
        }
    }
}
```

### 示例 2：隐藏某些 Walkthrough

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        // 过滤掉不需要的 walkthrough
        this.gettingStartedCategories = this.gettingStartedCategories.filter(
            category => category.id !== 'Notebooks' // 隐藏 Notebooks
        );

        await super.buildCategoriesSlide(preserveFocus);
    }
}
```

### 示例 3：添加自定义样式

```typescript
export class TscodeWelcomePage extends GettingStartedPage {
    protected override async buildCategoriesSlide(preserveFocus?: boolean) {
        await super.buildCategoriesSlide(preserveFocus);

        // 添加自定义 CSS 类
        this.container.classList.add('tscode-welcome');

        // 可以在 CSS 文件中定义 .tscode-welcome 的样式
    }
}
```

## 文件结构

```
src/vs/workbench/contrib/welcomeGettingStarted/browser/
├── tscodeWelcomeInput.ts          # EditorInput 定义
├── tscodeWelcome.ts                # 页面实现（可在此自定义）
├── gettingStarted.contribution.ts  # 注册和配置
└── startupPage.ts                  # 启动逻辑
```

## 相关文档

- `TSCODE_WELCOME_PAGE.md` - 完整的使用说明和架构文档
- `TSCODE_WELCOME_VERIFICATION.md` - 内容验证和自定义方法详解

## 故障排除

### 问题：编译错误
**解决**：确保所有文件都已保存，运行 `yarn compile` 查看详细错误信息。

### 问题：看不到 TSCode Welcome Page 选项
**解决**：
1. 确保编译成功
2. 重启 VS Code
3. 检查设置中是否有 "TSCode Welcome Page" 选项

### 问题：页面显示空白
**解决**：
1. 打开开发者工具（Help > Toggle Developer Tools）
2. 查看 Console 中的错误信息
3. 检查 Network 标签页，确保资源加载正常

## 技术支持

如果遇到问题，请检查：
1. 所有修改的文件都有 `test-workbench_change` 标记
2. TypeScript 编译没有错误
3. 浏览器控制台没有 JavaScript 错误

## 总结

✅ TSCode Welcome Page 已完全实现
✅ 内容与默认 Welcome Page 一致
✅ 可以通过重写方法进行自定义
✅ 所有代码都有清晰的标记便于维护
