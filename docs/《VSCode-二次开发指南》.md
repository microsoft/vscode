---
created: 2026-03-29T11:51:06 (UTC +08:00)
tags: [VSCode]
source: https://zhuanlan.zhihu.com/p/25726569753
author: 关于作者混沌随想技术&人文: 心得、总结、随想信息技术行业 前端开发工程师回答31文章80关注者501已关注发私信
---

# 《VSCode 二次开发指南》

> ## Excerpt
> 这是一份详细且深入的VSCode二次开发小书，经过研究和实战得到的一些总结，涵盖项目架构、核心设计理念、内部层次划分（数据层、服务层、渲染层等）、事件通信机制，以及实际的功能开发案例，如UI调整、新的内部扩…

---


目录

收起

《VSCode 二次开发指南》

1\. VSCode 项目架构

1.1 目录结构解析

1.2 核心模块介绍

2\. VSCode 内部逻辑与分层

2.1 数据层（State Management）

2.2 服务层（Services 与扩展点）

2.3 渲染层（Workbench 与 UI 组件）

2.4 事件通信（事件总线、观察者模式、IPC 机制）

3\. VSCode 的关键设计模式

3.1 依赖注入（DI）

3.2 扩展点机制（Contribution Points）

3.3 消息通信（IPC、事件系统、WebWorker）

4\. 实战案例

4.1 UI 调整与定制

4.2 新增 VSCode 内核功能（AI 辅助功能示例）

4.3 贡献点开发（内部 Contributions）

4.4 修改 VSCode 内部机制（调试工具、自定义 LSP 等）

5\. 开发流程与调试

5.1 如何编译 VSCode 源码

5.2 如何运行 VSCode 开发版

运行 VSCode Dev 版本注意事项：

5.3 如何 Debug VSCode 内部代码

6\. 整体 VSCode 内部架构

6.1 进程架构

6.2 服务调用流（从 UI 到数据处理的调用链）

最后

这是一份详细且深入的[VSCode](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=VSCode&zhida_source=entity)二次开发小书，经过研究和实战得到的一些总结，涵盖项目架构、核心设计理念、内部层次划分（数据层、[服务层](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E6%9C%8D%E5%8A%A1%E5%B1%82&zhida_source=entity)、[渲染层](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E6%B8%B2%E6%9F%93%E5%B1%82&zhida_source=entity)等）、事件通信机制，以及实际的功能开发案例，如UI调整、新的内部扩展（如AI功能）、核心功能修改等。

由于 vcode 源码非常庞大，本文将系统性地讲解VSCode的核心设计，并配备源码示例、流程图等辅助内容，使中/高级前端开发人员可以快速理解并直接投入VSCode的内核开发。阅读文本的前置知识：计算机基础、了解 TS/JS \\node\\electron\\LSP，知晓 vscode 插件开发、进程调用、设计模式有等。不同模块之间会相互交叉，本文可能会对同一模块以不同视角进行解读，内容面向开发者，本文字数在5-10万之间，可按需查阅。

内容涵盖 VSCode 的项目结构、内部逻辑分层、关键设计模式，以及通过实际案例了解如何定制 UI、扩展内核功能和调试源码。文章基于最新版 VSCode 稳定版本的源码，并结合实际开发经验，力求深入浅出、循序渐进。

## 1\. VSCode 项目架构

VSCode 采用模块化的多层架构，核心代码全部使用 TypeScript 实现。理解项目的目录结构和各模块职责，是进行二次开发的基础。

### 1.1 目录结构解析

VSCode 源码主要位于 `src/vs` 目录下，可分为数个层次（layers）和模块：

-   **`vs/base`**：基础模块，提供通用工具和UI构建块，可被其他层使用。例如各种数据结构、日志、事件、UI控件（列表、树等）等基础组件 。这里的代码不依赖于任何上层编辑器或工作台逻辑，确保可在不同环境重用。
-   **`vs/platform`**：平台层，定义了依赖注入支持和 VSCode 的基础服务接口。在该层中提供应用各处共享的核心服务（例如文件系统、配置、日志、存储等服务）。平台层不包含编辑器或工作台特定实现，主要定义接口和基础实现，以便上层扩展。**依赖注入容器**也在此层实现（详见第三章）。
-   **`vs/editor`**：编辑器层，即 [Monaco 编辑器](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=Monaco+%E7%BC%96%E8%BE%91%E5%99%A8&zhida_source=entity)核心。此部分实现了代码编辑器的所有基础功能，包括文本模型、编辑器组件、光标操作、文本渲染等。Monaco 编辑器也可作为独立组件使用 。`vs/editor`下面再细分：

-   `common` 子目录：与环境无关的编辑器核心逻辑（如文本缓冲、语法tokenization、撤销重做等），可在任何环境运行。
-   `browser` 子目录：浏览器环境相关的编辑器逻辑（如DOM渲染、事件处理）。
-   `contrib` 子目录：编辑器可选功能的扩展（contributions），例如代码折叠、参考查找、快捷提示等。这些功能可以在VSCode和独立Monaco中复用 。编辑器的核心不依赖这些扩展，以保持精简。
-   `standalone` 子目录：仅用于独立 Monaco 编辑器的代码，VSCode本身不会依赖此部分。

-   **`vs/workbench`**：工作台层，提供完整开发者工作台的框架，**大部分二次业务开发将会在此进行**。Workbench 承载编辑器以及侧边栏、面板、状态栏、菜单等各种UI组件 。利用 Electron 提供桌面应用能力，或利用浏览器API提供 Web 版 VSCode 。`vs/workbench`进一步划分：

-   `common` / `browser` / `electron-sandbox` 目录：工作台核心代码（最小化基础），分别针对通用、浏览器和 Electron 沙盒环境 。Workbench 核心不直接依赖所有功能模块，通过内部**贡献点机制**将各模块组装进来。
-   `services` 目录：工作台层的核心服务接口及实现，例如编辑器管理服务、视图管理服务等。这些服务供工作台各部分使用（不包含只被某个contrib用到的私有服务） 。
-   `contrib` 目录：工作台的各子功能模块（contributions）。大部分VSCode特性（搜索、Git集成、调试、终端等）都作为独立子模块放在这里 。Contrib 模块通过约定的注册机制集成到工作台，彼此解耦（见下节“[扩展点机制](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E6%89%A9%E5%B1%95%E7%82%B9%E6%9C%BA%E5%88%B6&zhida_source=entity)”）。
-   `api` 目录：VSCode扩展API的实现。这里提供了`vscode.d.ts`中定义的扩展API的内部实现（包括扩展主机和工作台两侧的实现）。换言之，扩展开发者使用的API在此处被具体实现为对内的服务调用或IPC通讯。

-   **`vs/code`**：应用入口层。用于将上述各层组装成完整应用，包括 Electron 主进程的入口代码、命令行界面（CLI）以及共享进程等。该层把 platform、workbench 等组合起来启动应用。桌面版 VSCode 从这里进入 Electron 主进程 (`electron-main`)，创建 BrowserWindow 加载工作台。命令行参数解析也在此处处理。
-   **`vs/server`**：服务器入口层。针对远程开发场景的 VSCode 后端服务（例如通过 `code-server` 或 GitHub Codespaces 的运行模式）。它提供在远程机器上运行VSCode服务端的入口，将 VSCode 作为服务运行以支持 Web IDE 客户端 。一般开发桌面版无需深入此部分。

**此外**，VSCode 仓库根目录还有一些重要内容：

-   **`extensions`** 文件夹：包含VSCode内置扩展的源码。例如 TypeScript/JavaScript 语言支持、JSON 支持、Git、主题等都作为扩展实现，放在此目录。这些内置扩展在打包时随VSCode发布，但逻辑上与第三方扩展类似，通过扩展API与核心交互。
-   **配置和构建脚本**：如`package.json`（包括构建配置、依赖等），`scripts` 文件夹（包含用于编译、启动的脚本`code.sh`等），还有`product.json`（产品配置）等。

通过以上目录结构，我们可以看到 VSCode 项目在架构上遵循高内聚、低耦合的原则：**下层提供通用功能，上层通过服务和扩展点组装，新增功能大多以contrib模块方式独立构建**。了解这些目录和模块划分，有助于我们找到修改或扩展某项功能对应的代码位置。

### 1.2 核心模块介绍

在VSCode的架构中，有一些贯穿全局的核心模块，需要重点理解：

-   **编辑器核心（Monaco）**：VSCode 编辑器部分由 Monaco 提供支持。Monaco 是VSCode团队提取出的独立浏览器文本编辑器，实现了丰富的编辑功能（多光标、语法高亮、自动补全等）。在 VSCode 中，Monaco 被集成在工作台中央的编辑器区域，用于显示和编辑代码。其核心逻辑在`vs/editor`中实现，并通过接口与工作台其他部分通信。例如，Workbench会将文件内容加载为 Monaco 的文本模型 (`TextModel`)，并将编辑操作结果通过文件服务保存。
    
-   **[命令系统](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E5%91%BD%E4%BB%A4%E7%B3%BB%E7%BB%9F&zhida_source=entity)（Command Service）**：VSCode 内建了统一的命令/动作系统。所有功能（无论核心还是扩展）基本都通过命令（命令ID）进行调用和触发。命令系统由 **命令注册表** 和 **命令服务** 组成：
    

-   **命令注册表** (`CommandsRegistry`)：提供全局静态注册方法，用于向VSCode注册命令ID及其实现函数。任意模块都可注册命令。例如 `CommandsRegistry.registerCommand(...)` 在注册表中登记一个命令及处理函数。
-   **命令服务** (`ICommandService`)：提供 `executeCommand(id, ...args)` 方法，用于运行指定ID的命令。命令服务会查找注册表中对应的命令实现并执行。如果该命令由扩展实现而未在主线程注册，命令服务会通过IPC将请求转发到扩展主机执行，再将结果返回。这种机制确保了**命令调用的统一性**，无论命令由何处提供，都可以通过同一服务调用。这也是实现命令面板、按键绑定等的基础。

-   **[快捷键系统](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E5%BF%AB%E6%8D%B7%E9%94%AE%E7%B3%BB%E7%BB%9F&zhida_source=entity)（Keybinding Service）**：VSCode 将用户按键与命令执行关联起来的模块。快捷键配置既包含默认绑定，也包括用户自定义和扩展贡献的绑定。其内部通过 **KeybindingsRegistry** 注册默认键位规则（指定键组合、目标命令、作用域条件等），并在运行时由 **键盘处理服务** 捕获键盘事件，匹配当前激活的按键是否有对应命令（需同时匹配当时的上下文条件，例如焦点在编辑器中才触发某命令）。当匹配成功时，调用命令服务执行命令。
    
    快捷键系统也涉及 **上下文键(Context Key)** 机制：很多键位和菜单只有在特定上下文下才有效，例如只有当编辑器有选中文本时才启用“格式化”命令的快捷键。这是通过 Context Key Service 提供的上下文状态来判断的（详见下文“事件通信”部分）。
    
-   **UI 框架与组件**：VSCode 并未使用主流前端框架（如 React/Vue），而是基于自身的架构开发了一套轻量 UI 框架。**Workbench（工作台）** 可以看作一个页面容器，里面划分出不同的 **部件(Part)**，如编辑器区域、侧边栏(Activity Bar/Side Bar)、面板(Panel)、状态栏(Status Bar)、标题栏等。每个 Part 通常对应一个实现类，负责该区域的渲染和布局。例如：
    

-   `EditorPart` 管理编辑器区域，包括多个 Editor Group（多个文件标签页）。
-   `SideBarPart` 管理侧边栏，其中承载资源管理器、搜索、源控件等 _视图容器(Viewlet)_。
-   `PanelPart` 管理底部面板区，包含终端、调试控制台、输出、问题等 _面板(Panels)_。
-   `ActivityBar` 显示侧边栏切换图标。
-   `StatusBar` 显示状态信息项。

Workbench 的布局由 `Layout.ts` 等文件通过网格/分割布局实现，可响应窗口尺寸变化调整各 Part 大小。UI绘制主要使用原生 HTML/CSS，与基础控件库结合。例如 `vs/base/browser/ui` 下提供了诸如按钮、下拉、列表、分割面板等基础UI组件，供工作台各部分组合使用。样式上，VSCode 通过定义 CSS 变量（如 `--vscode-editor-background`）和主题配色机制，实现不同主题下UI的统一风格。

-   **扩展扩展点**：VSCode 提供了强大的扩展机制，允许第三方通过 **扩展(Extension)** 增加功能。扩展通过 VSCode 提供的**扩展API**与核心交互，并可以在 package.json 中声明贡献点(Contribution Points)将自身集成到VSCode UI和功能中（比如增加命令、菜单项、语言语法支持等）。VSCode 核心会读取每个扩展的 `package.json`，根据其中的贡献点声明，将相应功能加载到运行时环境中（例如在命令面板中显示扩展命令，在编辑器启用某语言时加载该语言的语法高亮等）。这一机制使VSCode具有高度可扩展性。扩展点机制和VSCode内部“contrib”模块的衔接将在第3章详细介绍。
    

小结：VSCode 项目架构按职责分层，各目录模块明确职责。编辑器核心模块、命令/快捷键系统、UI框架和扩展机制等共同组成了VSCode的核心架构。掌握这些模块，有助于我们定位需要修改的代码区域。例如，要调整某UI元素，应定位对应 Part 或组件实现；要添加新命令，则需要在命令注册表注册并考虑键位绑定和上下文；要集成新功能模块，则可能在`workbench/contrib`中新建子模块并通过服务与其他部分交互。

## 2\. VSCode 内部逻辑与分层

VSCode 的内部逻辑可以理解为一个典型的分层应用，从数据层到服务层再到渲染层，以及不同层之间通过事件和消息通信解耦协作。本章我们按照**数据层 -> 服务层 -> 渲染层 -> 通信机制**的顺序，解析 VSCode 内部的逻辑架构。

### 2.1 数据层（State Management）

数据层包含应用运行过程中维护的各种状态和模型。VSCode 并没有使用类似传统前端集中式的[状态管理](https://zhida.zhihu.com/search?content_id=254167509&content_type=Article&match_order=1&q=%E7%8A%B6%E6%80%81%E7%AE%A1%E7%90%86&zhida_source=entity)库（如 Redux），而是通过**服务和模型对象**来管理各自领域的状态，并通过事件通知变更。

-   **编辑器模型**：这是一类重要的数据模型。例如文本编辑器使用 `TextModel` 表示打开的文档内容，它维护文本缓冲区、光标位置、撤销/重做栈等状态。当文件内容改变时，TextModel 发出事件，通知视图更新显示。再如，在调试功能中，有表示断点、调用栈等的数据模型。这些数据对象构成了VSCode应用状态的基础部分。
-   **设定与配置**：用户和工作区的配置、设置也属于数据层，由配置服务管理（`IConfigurationService`）。配置服务读取不同作用域的配置（默认值、用户 setting.json，工作区 setting.json 等），合成交付给上层使用。开发者可通过服务API获取配置值或监听配置变动事件，来更新应用状态。
-   **工作台状态**：工作台本身的一些UI状态也需要维护，例如打开的编辑器列表、活动的面板和视图、UI布局尺寸、UI可见性（侧边栏展开/折叠）等。这些状态通常由对应的服务或组件维护。如 EditorGroupService 维护编辑器组的状态，LayoutService 记录布局信息。关闭VSCode时，有些状态会持久化（如上次打开的文件），下次启动恢复。
-   **持久存储**：VSCode 提供 StorageService 用于持久化某些状态数据到本地（比如面板位置、上次会话信息等）。这可以认为是数据层的一部分，用于跨会话保存状态。
-   **上下文值**：VSCode使用上下文键(Context Key)机制来跟踪应用中的瞬时状态，用于控制功能的可用性。上下文键是一些命名值对，由应用各部分在不同场景设置。例如当焦点在编辑器时，设置 `editorTextFocus = true`。再如Git有改动时，设置 `gitHasChanges = true`。这些上下文值并非一个集中Store，而是由 ContextKeyService 管理，在代码中各处写入/读取。上下文值主要用于：

-   决定菜单项或按键绑定是否显示/生效（通过 `when` 表达式判断上下文）。
-   调整UI状态（比如当没有文件打开时禁用“保存”命令按钮等）。

VSCode 的数据层强调**就近管理**和**事件驱动**：每个子系统管理自己的状态模型，并在状态改变时通过事件将变化通知给需要更新的其他部分。这样避免了全局单一巨大状态，降低了复杂度。同时，通过**服务**将状态提供给需要的地方，而不是直接在组件间共享变量。这为应用解耦和功能扩展提供了灵活性。

**状态管理示例**：打开一个文件时，文件内容通过 FileService 读取 -> TextModel 创建并加载文本数据 -> EditorService 将 TextModel 赋给编辑器部件渲染显示 -> TextModel 发出 “contentChanged” 事件供其他监听者（如文件是否被修改的标记）处理。保存文件时，TextModel 标记未修改，并通过 FileService 将新内容写盘 -> 相应的Dirty状态事件通知 UI 更新标题上的标识。这一系列操作各司其职，通过事件串联，而非集中在一处处理。

### 2.2 服务层（Services 与扩展点）

服务层是 VSCode 架构的核心支柱。**服务**在VSCode中是一种单例对象（或接口），封装了一组相关的业务逻辑，为全局提供功能接口。服务层承担连接数据与UI的中间层角色，也相当于应用的业务逻辑层。

-   **服务的定义和注册**：VSCode使用接口(`IServiceName`)来定义服务契约，并在程序启动时将具体实现注册到全局 **服务集合** 中。服务通常在 `vs/platform` 或 `vs/workbench/services` 下定义。例如：
    

-   平台层服务：`IFileService`（文件读写服务）、`ILogService`（日志服务）、`IStorageService`（存储服务）、`IConfigurationService`（配置服务）等。这些服务的实现分别处理对应领域的数据操作，例如 FileService 内部可以调用Node文件系统或浏览器API访问文件。
-   工作台层服务：`IEditorService`（编辑器管理服务）、`ITextModelService`（文本模型服务）、`IViewletService`（侧边栏视图服务）、`IPanelService`（面板服务）等。这些服务与UI紧密相关，通常在工作台初始化时创建，为UI组件提供操作接口。例如 EditorService 提供 `openEditor`、`closeEditor` 等方法来打开/关闭文件，在内部协调 EditorPart 展示相应的编辑器。又如 `IQuickInputService` 管理快速输入面板（命令面板/模糊搜索框）的显示逻辑。

-   **服务层的逻辑**：服务的实现往往包含业务逻辑。它既可能调用底层数据操作（如文件服务调用文件系统API），也可能发出事件供UI层订阅。服务将复杂操作封装，向上提供简洁的方法。例如 TextFileService 实现“保存”功能：先检查文件是否有冲突或只读，再通过 FileService 写文件，成功后触发 saved 事件。这样，UI按钮只需调用一次 `save()` 方法，而具体流程由服务完成。
    
-   **扩展点 (Contribution Points)**：**服务层还负责处理扩展声明的贡献点**。VSCode通过**扩展点注册**机制，将扩展的贡献整合进核心。例如配置项、命令、语言、调试器等扩展点：当扩展加载时，扩展主机会将其 `package.json` 中声明的贡献点信息发送给工作台的扩展管理服务（`IExtensionService`）。然后：
    

-   对于 **命令** 扩展点，工作台的命令服务/注册表会据此在命令面板中列出命令名字。当用户执行该命令ID时，命令服务通过IPC让扩展主机调用对应扩展提供的函数。
-   对于 **菜单** 扩展点（例如在资源管理器添加右键菜单），VSCode 内部有菜单注册表 (`MenuRegistry`) 维护所有菜单项。扩展的菜单声明由扩展点处理代码注入 MenuRegistry，相应菜单出现时渲染出来。
-   对于 **语言** 扩展点（语法高亮、代码片段等），语言服务会读取扩展提供的语法定义、主题配色等资源，在打开对应语言文件时加载应用。
-   对于 **调试** 扩展点，DebugService 会注册扩展声明的调试适配器类型，以便用户选择该调试配置时能启动扩展提供的调试器。

这些“扩展点”处理逻辑实际上也是VSCode服务层的一部分：由**扩展管理服务**或相关服务解析扩展声明，并通过内部服务或注册表将其融入系统。例如 **配置扩展点** 由 ConfigurationService 解析扩展提供的新配置schema并合并进整体配置模式。

**服务与contrib的协作**：VSCode内部许多功能模块本质上也是通过服务机制解耦。工作台 `contrib` 目录下的功能会利用已有服务实现自身逻辑，并可能提供新的服务供别的模块使用。例如搜索功能作为 contrib，它注册自己的 `ISearchService`，供全局执行搜索。当用户触发搜索UI，搜索面板通过 SearchService 来执行搜索并获取结果。这样，即使搜索UI和实现在独立模块，也能通过服务接口与其他部分交互（例如通过 SearchService，命令面板的“在文件中查找”命令也能调用搜索功能）。

服务层确保了VSCode**各功能模块通过明确接口交互**，从而方便替换实现或在不同环境提供不同实现（如本地文件服务 vs 远程文件服务）。对于二次开发者来说，如果要增强或修改某项功能，往往需要了解相关的服务接口，并决定是扩展其实现还是添加新服务。例如想添加一个“代码评审”功能，可以考虑新增一个 `ICodeReviewService` 并在工作台启动时 `registerSingleton` 注册实现，然后UI部分调用该服务进行业务逻辑处理。

### 2.3 渲染层（Workbench 与 UI 组件）

渲染层主要指VSCode的用户界面展示和交互部分。在Electron桌面版中，这对应Electron的Renderer进程，即运行VSCode Workbench的那部分。渲染层直接与用户交互，处理输入（键鼠事件）、渲染输出，以及调用服务来完成用户请求的操作。

VSCode的渲染层架构围绕 **Workbench（工作台）** 展开，包含多个**UI组件和子系统**：

-   **Workbench 框架**：`Workbench`本身可以理解为一个控制整个应用UI的容器。它初始化各种部件(Parts)，并负责整体布局、主题应用、焦点管理等。Workbench 启动时，会创建并挂载所有主要 UI 部件，然后进入事件循环响应用户操作。其入口代码在 `workbench.ts` 中（区分桌面和web，调用相应的 `workbench.desktop.main.ts` 或 `workbench.web.main.ts` 进行初始化。在此过程中，会实例化必要的服务和贡献点模块。例如，会通过 Contribution 注册表创建各 `IWorkbenchContribution`（如后文提到的状态栏项、视图等）。
    
-   **主要 UI 部件 (Parts)**：如前节提到，Workbench划分了几个主要区域，每个区域由对应的 Part 类实现。这些 Part 的实现位于 `vs/workbench/browser/parts/...` 目录下。例如：
    

-   `EditorPart`（文件编辑器区域） – 管理多个 EditorGroup，每个Group显示一个或多个编辑器（选项卡）。EditorPart 提供切换组、布局编辑器等功能。其内部使用 EditorService 打开文件，并监听 EditorGroup 变化事件更新UI。
-   `PanelPart`（下方面板区域） – 包含终端、调试控制台、输出、问题(Poblems)等面板。PanelPart 通过 PanelRegistry（位于 `vs/workbench/browser/panel.ts`）注册/显示各Panel。比如 Terminal 面板在启动时通过注册表登记，当用户切换到Terminal视图时，PanelPart加载对应的UI组件。
-   `SidebarPart`（侧边栏） – 包括 ActivityBar 和实际的 SideBar 显示区域。侧边栏可在左侧（默认）或右侧显示，里面托管**视图容器(Viewlet)**。常见的资源管理器、搜索、源代码管理、扩展等就是不同的 Viewlet。它们通过 **ViewletRegistry** 注册（现很多改名叫 ViewContainer）。当用户点击 ActivityBar 的图标时，SidebarPart 会通过 ViewletService 创建或显示相应 Viewlet 实例。
-   `StatusBarPart`（状态栏） – 显示窗口底部的一排状态信息项，如行列号、Git分支、反馈图标等。StatusBarPart 提供 `IStatusbarService` 服务，其他模块可以调用 `statusbarService.addEntry(...)` 方法来添加一个状态栏项 。状态栏按照预定义的对齐和优先级来排列项（左/右两侧，不同priority决定先后顺序） 。例如语言模式、换行符等项被添加在右侧。
-   `TitleBar`（标题栏） – 在自定义标题栏模式下（Windows/Linux上默认），VSCode用HTML/CSS绘制了窗口标题栏，包含窗口名称和菜单。当使用原生标题栏时此部分不发挥作用。

-   **对话和悬浮UI**：除了上述固定布局的部件，Workbench中还包括一些临时UI组件，如**命令面板/Quick Pick**（模态弹出，供命令搜索、文件模糊搜索等），**通知(Notification)** 弹出框，**对话框** 等。这些由各自服务控制，例如 QuickInputService 管理 Quick Pick，NotificationService 管理通知。这些UI通常使用Overlay的形式，浮于主界面上，交互结束后销毁。
    

渲染层的组件主要职责是**呈现数据并提供交互**，但尽量避免包含业务逻辑。它们会通过调用**服务层**的方法来完成具体操作或获取数据。例如：

-   编辑器部件在需要打开文件时，调用 EditorService（服务层）去打开，而 EditorService 再利用 TextModelService 和 FileService 去读取文件数据并返回一个EditorInput交给编辑器部件渲染。
-   用户点击保存按钮，触发 TextFileService.save(specificFile) 执行保存逻辑，完成后FileService触发事件，Editor部件收到事件后更新UI（去除脏标记）。
-   侧边栏切换视图，由 ViewletService 实现实际视图创建逻辑，SidebarPart 仅负责把返回的视图DOM嵌入界面。

这种分层保证了**UI层只关心如何展示，不关心操作细节**。同时，由于VSCode支持运行在Web（浏览器）环境，UI层要处理环境差异。例如文件选择对话框在桌面版通过调用主进程API打开原生对话框；而在Web版只能提供简化实现（比如无权限访问本地文件系统）。因此代码中常根据运行环境不同调用不同服务实现。VSCode源码通过文件名后缀和分层来区分：如 `dialogService.browser.ts` 与 `dialogService.electron.ts` 提供不同平台下的实现，运行时会自动选择合适的注入。

渲染层还负责主题样式应用和响应式布局。VSCode提供主题机制，UI组件使用CSS变量表示颜色，当用户切换主题或高对比度模式，ThemeService 会应用新CSS变量，从而所有组件颜色随之改变。布局方面，Workbench监听窗口resize事件，通过LayoutService通知各部件调整大小布局。

**小结**：渲染层的 Workbench 将众多UI组件组合为完整IDE界面。每个组件各自独立又通过服务关联。对于二次开发，若需要自定义界面或增加UI元素，可以选择：

-   修改现有 Part 的渲染代码（例如调整侧边栏顺序）。
-   或通过提供新的 Workbench Contribution 添加UI（例如增加新的状态栏项、新的面板等）。 具体添加UI的案例会在后文实战部分详述。

### 2.4 事件通信（事件总线、观察者模式、IPC 机制）

在VSCode内部，大量使用**事件驱动**和**消息传递**机制来解耦组件和保障进程间通信。可将其分为**进程内事件**和**进程间通信**两类：

**进程内事件机制**：

-   VSCode广泛采用**观察者模式**：一个对象（事件发出者）维护一个事件，当状态变化时触发事件，将消息广播给所有监听者。监听者通常通过注册回调来响应事件。为了方便使用，VSCode在 `vs/base/common/event.ts` 中实现了通用的事件工具类，如 `Emitter<T>` 和 `Event<T>` 接口。任何地方都可以创建 Emitter 来管理事件订阅和触发。
-   例如，`TextModel` 内部有事件 `onDidChangeContent`，编辑器部件和状态栏都可监听它以更新字数统计、修改标记等UI。又如 `ConfigurationService` 有 `onDidChangeConfiguration` 事件，当用户修改设置时触发，相关组件（如设置界面、语言功能）收到通知后做出相应调整。
-   VSCode 的事件系统实现还有**生命周期管理**：许多对象实现了 `IDisposable` 接口，可以在销毁时自动解除对事件的订阅，以防止内存泄漏。常见模式是在组件创建时监听服务事件，在组件 `dispose` 时 dispose 掉注册，这样组件销毁后不会再响应事件。
-   **事件总线(Event Bus)** 的概念在VSCode中并非一个全局唯一总线，而是通过众多 **Service/Emitter** 形成的“分布式事件总线”。每个服务或模块的事件彼此独立。开发者可以把需要跨模块传递的信息通过定义事件来广播。由于使用了TypeScript强类型，这些事件的Payload都有清晰类型，使用起来相对安全。
-   除了Emitter，也有一些高级机制，比如 **Observable** 或 **Reactive** 模式并未直接用在VSCode中，但基于事件机制实现了类似效果。例如 ContextKeyService 的上下文值变化也可以看成特殊事件；一些组件状态变化（选项卡激活）通过工作台集中管理的事件发送等等。

**进程间通信 (IPC)**：

-   VSCode基于Electron，运行时涉及**主进程(Main Process)**、渲染进程(Renderer)**和**扩展主机进程(Extension Host)\*\*等多个进程。它们之间需要通信来协调工作。VSCode抽象出了一套IPC机制，让不同进程间可以调用彼此的功能，开发者无需手动处理底层套接字或Electron IPC细节。
-   **主进程 <-> 渲染进程**：主进程负责窗口管理、窗口创建等，全局只有一个。渲染进程在UI中有用户操作需要主进程执行时，通过Electron提供的 `ipcRenderer` / `ipcMain` 通道通信。比如用户按下`Ctrl+Shift+N`新建窗口，渲染进程检测到该按键绑定的命令是“新建窗口”，则会调用 Electron remote 或自定义IPC告诉主进程 `openNewWindow`，由主进程执行实际的新窗口创建（Chromium限制渲染进程不能直接开新窗口）。再如显示原生文件对话框，也是渲染->主进程IPC调用。
-   **渲染进程 <-> 扩展主机进程**：扩展主机是一个独立的Node.js进程（桌面版中）或 Web Worker（Web版中），用于运行所有扩展的代码，保证扩展崩溃或卡顿不影响主UI。渲染进程作为VSCode核心，需与扩展主机交换信息，例如：

-   激活某个扩展（渲染通知扩展主机加载该扩展模块）。
-   当扩展调用 `vscode.window.showInformationMessage` 等API时，实际上是扩展主机发送消息给渲染进程的工作台，让其显示对话框。
-   扩展提供某语言的自动补全：编辑器触发补全请求，渲染进程工作台通过RPC将请求转发给扩展主机，由对应扩展提供结果，再IPC回传给渲染更新UI。

-   这种通信由VSCode内置的**RPC框架**实现。VSCode为主进程-渲染、渲染-扩展主机分别建立了消息连接，然后使用类似 `Proxy` 的机制封装调用。具体而言，在渲染进程有一套 **主线程代理(MainThreadXYZ)** 类，在扩展主机有对应 **扩展线程代理(ExtHostXYZ)** 类，双方通过约定的频道(channel)发送JSON序列化的请求/响应 。开发者在调用扩展API时，其实调用了一个本地代理对象的方法，这方法通过IPC发消息给对侧真正实现功能。这套机制对扩展开发者透明，但对于我们改动VSCode内核，需要了解其存在以正确处理与扩展的互动。
-   **共享进程(Shared Process)**：VSCode还有一个共享进程，在主进程启动后后台运行（也是Node.js）。它主要处理一些后台任务和跨窗口共享的服务，例如：扩展推荐、设置同步、文件搜索（某些版本中）等。共享进程同样通过IPC与渲染通信。例如所有窗口的设置同步操作都交给共享进程执行，以避免冲突。

**Web Worker**：

-   VSCode也使用Web Workers在渲染进程内做多线程并行。例如：文件搜索在早期版本中会spawn一个Search Worker以避免阻塞UI线程；语言服务在Web环境下可能以Worker运行（因为没有独立进程）。这些Worker与主渲染线程的通信使用浏览器的 postMessage 通道，VSCode封装成类似扩展主机的RPC。
-   多扩展主机也能以Worker形式实现，因此对开发者来说，它与进程IPC类似，都是消息传递。

简而言之，VSCode通过**事件系统实现进程内解耦**，通过**IPC/RPC机制实现进程间协作**。这两方面相辅相成，保证了 VSCode 架构的弹性和稳定：

-   组件之间用事件而非直接调用，降低耦合。例如终端退出通过事件通知UI，而不是UI定时检查终端状态。
-   进程之间通过消息而非共享内存，增强容错和安全。扩展只能通过限定的接口与核心通信，避免直接操作DOM或数据，提升稳定性和安全性 。

对于二次开发者，这意味着：

1.  **善用事件**：可以通过订阅服务事件来触发自定义逻辑，而非修改服务代码。例如监听编辑器切换事件执行特定操作。
2.  **注意进程边界**：如果修改涉及主进程或扩展主机，要了解IPC调用的位置。例如增加一个需要主进程支持的新功能时，需要在渲染->主进程的通信层增加相应消息处理。

理解 VSCode 的通信机制是开发和调试的关键。当某项功能未按预期工作时，考虑是否因为事件未触发或IPC消息未正确发送。例如新增命令在扩展主机实现，却忘了在渲染这边注册，会导致 `executeCommand` 找不到实现（需要通过调试IPC才能发现）。

## 3\. VSCode 的关键设计模式

VSCode 在架构设计上应用了多种经典模式和架构理念，使其具备高度扩展性和灵活性。在二次开发时，理解这些设计模式有助于遵循VSCode的开发范式，以正确的方式扩展或修改功能。下面重点介绍三大模式：**依赖注入**、**扩展点机制** 和 **消息通信模式**。

### 3.1 依赖注入（DI）

**依赖注入 (Dependency Injection, DI)** 是 VSCode 架构的基石之一。简而言之，VSCode 将各种功能封装为服务，并通过依赖注入的方式将服务提供给使用它的对象，而不是让对象自行创建服务实例。这实现了**控制反转 (IoC)**：对象不负责构造其依赖的具体实现，而是由外部注入满足接口的实例。

VSCode的DI模式具有以下特点和优点 ：

-   **解耦**：使用方（如某UI组件）不需要关心服务实例是如何创建的、具体是哪种实现。只要接口相同，就能使用。这减少了模块间的直接依赖。
-   **统一生命周期管理**：通过一个IoC容器（InstantiationService）统一控制服务对象的创建、销毁，按需延迟实例化。这避免了全局单例不易控制的问题，也方便服务间依赖管理。
-   **多实现灵活性**：在不同运行环境或模式下，可以注册同一服务接口的不同实现。例如文件系统服务在Electron本地使用 Node 文件模块实现，在Browser环境则用IndexedDB或只读实现。使用方代码无需更改，由注入容器选择注册正确的实现 。

**VSCode DI的实现**： VSCode 使用 TypeScript 和一些装饰器/工厂函数实现了自己的DI：

-   每个服务接口在定义时，都会创建一个**服务标识符**。由于TypeScript接口在运行时会被擦除，VSCode采用工厂函数 `createDecorator` 来生成一个独特的标识。例如：

```text
export const IFileService = createDecorator<IFileService>('fileService');
```

这会创建一个用于标记 `IFileService` 的装饰器和标识符。名字 `'fileService'` 应与接口名称对应 。

-   在需要使用服务的类的构造函数参数前，使用这个装饰器标记依赖。如：

```text
class TextFileModel implements ITextFileModel {
    constructor(@IFileService private fileService: IFileService) {
        // ...
    }
}
```

这里 `@IFileService` 装饰器标记构造参数，需要注入一个实现了 IFileService 接口的对象。构造函数并不需要自己实例化 fileService，容器会提供。

-   VSCode 在应用启动时，会创建一个**服务集合** (`ServiceCollection`) 并注册所有基础服务实例或构造器。注册通常通过调用 `registerSingleton(Identifier, Implementation, InstantiationType)` 来完成 。例如，在工作台初始化时注册： registerSingleton(IFileService, FileService, InstantiationType.Delayed);
    
    表示将接口 IFileService 绑定到实现 FileService，并采用延迟实例化模式。延迟意味着只有当某处真正需要 IFileService 时才创建它。
-   **InstantiationService**：这是DI容器，负责解析依赖并创建实例。当你需要实例化一个依赖其它服务的类时，不直接 new，而是调用 `instantiationService.createInstance(SomeClass)`。容器会：

1.  查找 SomeClass 构造函数参数上的服务装饰器；
2.  从已注册的服务集合获取对应的服务实例（若尚未实例化且注册时标记可延迟，则先实例化它，递归解决它的依赖） ；
3.  将这些实例作为参数调用构造函数，返回创建的对象。

-   在VSCode源码中，大多数需要注入服务的类，都不会手动调用 createInstance；相反，它们是在**贡献点注册**时由框架自动实例化（见下节）。例如，一个 Viewlet 实现类实现 IWorkbenchContribution 接口并在 contributions 注册了，那么工作台启动时会自动用 instantiationService 创建其实例，无需显式 new。

举个简单例子，说明依赖注入的使用：

```text
// 定义服务接口及标识
export const IGreeterService = createDecorator<IGreeterService>('greeterService');
export interface IGreeterService {
    greet(name: string): string;
}

// 实现服务
class GreeterService implements IGreeterService {
    greet(name: string) {
        return `Hello, ${name}!`;
    }
}
// 注册服务为单例
registerSingleton(IGreeterService, GreeterService, InstantiationType.Eager);

// 使用服务的类
class MyPanel implements IWorkbenchContribution {
    constructor(@IGreeterService private greeterService: IGreeterService) {
        const msg = this.greeterService.greet('VSCode');
        console.log(msg); // 输出 "Hello, VSCode!"
    }
}
// 注册贡献，让工作台启动时创建 MyPanel 实例
Registry.as<IWorkbenchContributionsRegistry>(...).registerWorkbenchContribution(MyPanel, LifecyclePhase.Starting);
```

在上述代码中，我们定义了一个问候服务并注册，然后创建一个面板类使用该服务。由于用了 DI，MyPanel 并不关心 GreeterService 如何实现，registerSingleton 时可以随意替换实现而不影响 MyPanel。工作台启动时，instantiationService 会自动发现 MyPanel 构造需要 IGreeterService，于是提供 GreeterService 实例注入。这样 MyPanel 可直接使用服务方法，无需自己 new 服务。

VSCode DI 的实现非常高效，并考虑了性能：

-   通过 **延迟加载**（InstantiationType.Delayed 和 IdleValue 等）减少不必要的实例创建。许多服务在用到时才初始化，降低启动成本。
-   依赖解析发生在实例化时，一次完成，之后服务实例作为单例被重复使用。
-   服务实例也可以实现 `IDisposable`，VSCode在进程结束或模块关闭时统一释放。

对二次开发者的启示：

-   添加新的全局功能时，最好以服务的形式注入。例如想增加一个“AI助手服务”，可以定义 `IAssistantService` 接口并实现，使用 `registerSingleton` 注册。这样任何地方需要AI功能都通过接口调用，未来如果实现改变或切换为其它AI引擎，实现代码只在Service内部变化，调用方不变。
-   使用现有服务：在编写自己的模块时，尽量通过构造函数注入所需服务，而不是自己从全局获取实例。VSCode并没有公开类似 ServiceLocator 的全局对象，大部分情况下服务只能通过DI获取。这虽然增加了一点样板代码（构造函数参数列表），但换来模块易测试、易维护。
-   DI调试：如果遇到某服务未注入成功（undefined），检查是否忘记注册实现或名字不匹配。服务装饰器名称应与注册名一致，否则容器找不到。例如 `createDecorator('myService')` 注册时名字也应用 'myService'。另外，检查注册发生在调用之前的正确时机。

总而言之，依赖注入保证了VSCode模块间**低耦合高内聚**。几乎所有VSCode核心能力（编辑器、文件、窗口、配置……）都以服务提供，我们可以灵活地扩展和替换这些服务实现，以实现定制行为，而无须改动依赖它们的上层代码 。

### 3.2 扩展点机制（Contribution Points）

扩展点机制指VSCode为**外部扩展**和**内部功能模块**提供的统一扩展接口，使得新功能可以以松耦合方式集成到系统中，比如 github copilot chat 或者 cursor 等这类基于 vscode 进行二次开发的 AI IDE其核心功能都应该在以 Contribution 的形式提供，Contribution 本质就是**面向用户层的直接功能抽象**。这在设计上属于**插件架构模式**的实现。

VSCode的扩展点机制分为**对外**和**对内**两个层面：

-   **对外扩展点**：供第三方扩展（Extension）使用。在扩展的 `package.json` 中，可以声明贡献点 (contributions)，如命令、菜单、键绑定、语法定义、调试器、语言服务等。VSCode在启动时会读取所有已安装扩展的声明，根据不同扩展点类型，将它们注册到对应的内部系统中去。例如：
    

-   `contributes.commands`: VSCode会在命令面板中显示这些命令，并在扩展激活后通过扩展API注册实际执行函数。
-   `contributes.menus`: VSCode将菜单项插入指定菜单（比如编辑器右键菜单）。
-   `contributes.keybindings`: 添加默认快捷键。
-   `contributes.languages`: 注册新的语言以及关联的文件后缀等，由语言服务或语法高亮加载使用等。

这些对外扩展点在 VSCode 核心中都有对应的**注册管理逻辑**。通常位于`vs/workbench/services/extensions/common/extensionsRegistry.ts`和各子系统初始化代码中。比如 MenuService 会读取扩展菜单贡献，将其加入内部 MenuRegistry。

-   **对内扩展点**：指VSCode核心内部，为了组织自身功能模块，也采用了类似扩展的机制，这就是前文多次提到的 **Workbench Contrib** 体系。VSCode把很多内置功能当作“内置扩展”对待，只是它们不是通过 package.json 声明，而是直接在代码中实现，然后通过统一的注册接口注入工作台中运行 。这套机制包括：
    

-   **贡献(Contribution)** 接口：如 `IWorkbenchContribution`。凡是实现该接口并通过 `registerWorkbenchContribution` 注册的类，会在工作台初始化某阶段被实例化，从而“启动”该功能。例如 search.contribution.ts 中实现了一个 SearchContribution 类，实现 IWorkbenchContribution，在工作台 **restored** 阶段创建，负责注册搜索面板、命令等。
    
-   **Registry**（注册表）模式：VSCode内部定义了若干全局Registry用于收集各种贡献点数据 。例如：
    

-   `WorkbenchContributionsRegistry`：用于注册 IWorkbenchContribution 实现类及其生命周期时机。
-   `ViewletRegistry` / `PanelRegistry`：用于注册新的侧边栏视图容器或面板类型。
-   `EditorFactoryRegistry`：注册自定义编辑器（如Notebook、Custom Editor）。
-   `Action/Command/Keybinding/Menu Registry`：用于内部注册命令、动作、菜单和快捷键。
-   `ConfigurationRegistry`：注册新的配置项（包括内置功能的设置和扩展提供的设置）。

这些 Registry 提供静态方法 (`Registry.as(Extensions.X).registerY()`) 让各模块将自己的扩展点信息加入全局表中。Workbench 初始化时会调用它们来集成各部分功能 。

-   **Contrib 目录规范**([vscode-wiki](https://link.zhihu.com/?target=https%3A//github.com/microsoft/vscode-wiki/blob/main/Source-Code-Organization.md%23%3A~%3Atext%3D%2Cdepend%2520on%2520another%2520contribution%253A%2520is)) **：**前文已经引用了VSCode对于 `vs/workbench/contrib` 目录的一些约定。每个contrib模块:
    

-   都有一个 `.contribution.ts` 入口文件负责注册该模块的所有贡献点（服务、命令、菜单、视图等 。
-   该模块的内部实现应通过一个集中导出文件导出必要API（common/search.ts）。其他模块若需要调用，只能import这个导出，不能深入依赖其私有实现文件 。这有效防止了模块间的紧耦合循环依赖。
-   不允许外部模块随意依赖contrib内部，只有通过服务接口或前述导出API交互 。因此，一个contrib模块可以很容易被移除或替换，而不会破坏其他部分。
-   可以使用别的contrib模块公开的API，但要谨慎考虑依赖关系，尽量避免复杂的模块互相依赖。

**案例**：以“**搜索**”功能为例，它是 workbench 的一个contrib模块：

-   search.contribution.ts 注册了：

-   一个 SearchView 面板，通过 PanelRegistry 注册，使其成为可在PanelPart中显示的一个tab。
-   在命令注册表注册“打开搜索”、“在文件中查找”等命令，绑定对应 handler，比如调用 SearchService.runSearch。
-   在菜单注册表注册修改主菜单和上下文菜单项（如编辑菜单中添加“查找...”）。
-   如果有独占的服务（SearchService）仅供搜索模块使用，也在此文件中 `registerSingleton(ISearchService, SearchServiceImpl)` 注册。

-   SearchService 实现在 search/common 或 search/browser 下，提供搜索具体逻辑，内部可能调用文件索引、缓存等。
-   SearchUI（SearchView）实现作为 Panel，一旦用户切换到搜索视图，PanelPart根据注册信息实例化 SearchView 类，将其嵌入UI。SearchView 内部通过 DI 获取 SearchService，调用其方法执行搜索，并订阅其结果事件来显示结果列表。
-   其他模块如命令面板想调用搜索功能，则执行 `CommandsRegistry.executeCommand('workbench.action.findInFiles')`，命令handler中实际调用 SearchService，相当于其他模块通过命令这一扩展点调用了搜索模块的功能，而无需直接引用搜索模块的代码。

通过这个流程可以看到，VSCode内部的扩展点机制允许新增模块和功能**像插件一样接入系统**，而又比外部插件享有更多权限（可直接访问内部服务、无需走IPC）。同时它也强制模块边界清晰、依赖简洁，使得VSCode在增添大量功能后仍能维护良好的架构。

**对二次开发**：

-   如果要在VSCode中添加一个全新的大型功能模块（例如一个内置的AI助手），应该考虑将其作为一个contrib模块开发。创建 `vs/workbench/contrib/myFeature` 文件夹，定义 `.contribution.ts` 处理注册工作（服务、视图、命令等），将功能实现分散在 `common` / `browser` 子目录中。最后在 `workbench.desktop.main.ts` 和 `workbench.web.main.ts` 中 import 这个 contribution 文件，使其在VSCode启动时生效。
-   如果要扩展VSCode的某个已有扩展点，例如**增加新的设置项**或**扩展某菜单**，也可以直接使用 VSCode 提供的注册表：如通过 `configurationRegistry.registerConfiguration({...})` 添加配置（这通常在contrib的contribution.ts里完成），或 `MenuRegistry.appendMenuItem(MenuId.EditorContext, { command: ..., when: ... })` 添加菜单项。VSCode内部API丰富，但未在扩展API公开，作为二次开发者阅读源码可以发现并使用这些内部注册方法。
-   当修改核心机制时，如想引入新的“全局扩展点”，需要修改扩展管理器解析逻辑和定义新的 contribution schema。这相对复杂且需确保与现有架构兼容，一般更可取的做法是利用已有扩展点达到目的。

**注意**：内部contrib开发虽然强大，但官方并不鼓励通过fork直接修改内核非公开API，毕竟这样维护成本高。但在咱们进行定制版本开发时，这是必要途径。遵循VSCode既定的贡献点模式，可以**降低二次开发的维护成本**，因为你是在VSCode原生支持的扩展机制下工作，**未来跟进 vscode 升级时冲突可能更小**。同时，这套模式也应用于插件开发上，掌握它有助于理解VSCode如何加载和运行插件。

### 3.3 消息通信（IPC、事件系统、WebWorker）

消息通信机制在前文2.4节已有阐述，这里从设计模式的角度再总结其要点，以及VSCode在通信方面的特殊设计：

-   **基于事件的异步消息**：VSCode大量采用事件发布/订阅模式，这是一种观察者模式的具体应用，也可视为一种消息传递机制。通过 `Emitter` 来解耦发送方和接收方，使得系统具备**可扩展**和**可测试**的特点。发布者不需知道谁会处理消息，处理者也不需修改发布者代码即可获得消息。这是典型的**消息总线**思想的实现，只不过在VSCode中是分散为多个小总线（各服务的事件）。
-   **Promises & async**：由于TypeScript的支持，VSCode在需要请求-响应模式的内部通信上使用 `Promise`/`async` 来处理异步消息。这补充了事件的单向性。例如在需要得到返回值的场景，如命令执行 `executeCommand` 返回结果，就适合用Promise等待IPC结果，而不是简单事件。
-   **IPC 通道模式**：跨进程通信中，VSCode实现了\*\*通道(Channel)\*\*抽象。每个服务或功能可以有自己的通信通道名称，双方通过发送带通道标识的消息实现针对性的RPC。例如扩展主机请求打开文件对话框，会发消息到 `mainThreadDialogs` 通道，主线程 DialogService 接收并执行，再通过该通道回传结果。这样的通道划分让成百上千种API调用不会互相混淆，而且可以有选择地启用/禁用某些通道（比如安全模式下禁用某通道）。
-   **序列化与数据协议**：所有进程间消息需序列化为可传输的数据。VSCode主要使用JSON序列化，对于较复杂的对象，往往转换为简单数据结构再发送。如传输一个 `TextDocument` 会仅发送其uri和内容，不会直接发送内部复杂对象。双方各自维护上下文。例如扩展要操作一个编辑器，可能只发送一个 editorId 然后由主线程去找到对应的编辑器实例执行操作。这种模式可以视为DTO（数据传输对象）在IPC中的应用。
-   **WebWorker通信**：当使用Web Worker时，其通信模式和IPC类似，也是事件消息。值得注意的是，VSCode通过复用类似扩展host的机制，让 Worker 看起来像一个扩展进程。例如 web版中扩展就是跑在 worker 内，通过相同RPC协议与UI线程通信。这样开发者几乎不用关心当前扩展是在独立进程还是Worker，只要IPC层正常工作即可。
-   **错误处理和超时**：VSCode的通信实现也考虑了健壮性。例如扩展调用某API如果超时未返回，会给出超时错误并警告用户扩展无响应。IPC通道通常有请求ID来对应回应，并在扩展 host 崩溃或断开时拒绝所有Pending请求。这些属于**容错设计**，避免单个模块问题挂死全局。
-   **进程内与进程间的统一**：一个值得称道的设计是，VSCode尽量统一进程内调用和跨进程调用的体验。例如 `ICommandService.executeCommand` 对调用方来说始终一样，无论命令实际在本地执行还是通过IPC去扩展执行。这种“透明代理”模式使开发更简单，也体现了架构的一致性。这类似于分布式系统中的透明RPC调用模式，在VSCode中通过代理类和服务接口实现。
-   **沙箱与安全**：2022年后，VSCode逐步启用了Electron的渲染进程沙盒。这要求渲染线程不能直接使用Node模块，只能发送IPC让主进程做敏感操作。这其实强化了消息通信的重要性。在沙盒模式下，VSCode把过去在渲染里做的一些工作迁移到“**utility进程**”（实质也是独立进程通过IPC）。这种演进表明：**通过消息边界划分权限和职责**是一种安全可靠的架构。主进程可以作为“守门人”决定是否执行某请求，而渲染进程即使被恶意代码攻陷也受限于IPC接口，不至于直接危害系统 。

综合来看，VSCode采用了 **事件驱动架构(EDA)和消息驱动架构(MDA)**的混合模式：内部解耦用事件（发布/订阅），跨边界用消息传递（请求/响应或通知）。这使其具备高度模块化和分布式的特性，也正是大型IDE得以流畅运行的重要原因之一。

对于扩展VSCode功能的开发者，我们应该：

-   应多利用已有事件，不要试图通过轮询或直接耦合去同步状态。例如想在编辑器每次打开文件时注入些东西，可以监听 EditorService 的 onDidOpenEditor 事件来触发逻辑。
-   在引入新的需要跨进程的功能时，比如你的功能需要在扩展host做部分工作，就需要定义自己的通信通道。这涉及较高级内容，但可以参考VSCode已有的channel实现模式，在双方建立一个service和protocol进行通信。
-   考虑性能和时序：过多事件监听可能带来性能问题，要小心处理。此外事件回调中不要执行太重的逻辑，否则可能阻塞UI线程。可以考虑利用VSCode的 `RunOnceScheduler`（定时延迟调用）或`IdleValue`（空闲时初始化）等模式，降低即时开销。

总之，**消息通信模式**贯穿VSCode架构始终，从内部模块松耦合到多进程协作，都体现了这一思想。在二次开发中遵循这些模式，将使你的改动更好地融入VSCode架构并避免常见陷阱。

## 4\. 实战案例

理解架构之后，下面通过**实战案例**来进一步熟悉 VSCode 内核开发的方法。我们将逐步展示几个场景，包括：定制 UI、增加内核功能、编写内置贡献模块、修改内部机制等。每个案例都配有相应的源码示例和流程分析，帮助读者将理论应用于实践。

### 4.1 UI 调整与定制

**场景**：假设我们希望在 VSCode 窗口的状态栏增加一个自定义的状态项（比如显示问候语“Hello World”），并为它绑定一个命令操作。这个需求属于 UI 层面的定制，可以通过 VSCode 提供的状态栏服务来实现，而无需大改核心代码。

**步骤**：

1.  **定位相关模块**：状态栏由 StatusBarPart 管理，并通过 `IStatusbarService` 提供接口。我们计划编写一个新的 **Workbench Contribution** 来添加状态栏项。
2.  **创建 Contribution 类**：实现 `IWorkbenchContribution` 接口，这样工作台初始化时会创建我们的类实例。在类的构造函数中，通过依赖注入获取 `IStatusbarService`。
3.  **调用 addEntry**：使用状态栏服务的 `addEntry` 方法添加新项。根据接口定义，我们需要提供：显示内容（文本/图标、提示、命令等）、一个唯一ID、对齐位置和优先级。
4.  **注册命令**：因为我们希望点击状态栏项执行某动作，需要先注册一个命令供其调用。使用 `CommandsRegistry.registerCommand` 注册命令ID和处理函数。处理函数可以简单地弹出信息或打开Web链接等。
5.  **将 Contribution 注册到 Workbench**：在适当的入口（比如 `workbench.common.main.ts` 或相应 platform-specific main 文件）里 import 并注册这个 Contribution。可通过 `registerWorkbenchContribution(MyContribution, LifecyclePhase)` 注册，让VSCode在指定阶段初始化它。

**伪代码示例**：

```ts
// 1. 定义并注册命令
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
CommandsRegistry.registerCommand({
    id: 'myExtension.sayHello',
    handler() {
        console.log('Hello from custom status bar item!');
        // 实际应用中可弹出通知： 
        // notificationService.info('Hello from VSCode!');
    }
});

// 2. 实现 Workbench Contribution
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
class HelloStatusContribution implements IWorkbenchContribution {

    constructor(@IStatusbarService private readonly statusbarService: IStatusbarService) {
        // 在构造时添加状态栏项
        this.statusbarService.addEntry(
            {
                text: '$(smiley) Hello World',  // 使用 Octicon 图标加文本
                tooltip: 'Say Hello',          // 悬停提示
                command: 'myExtension.sayHello'// 绑定我们上面注册的命令
            },
            'status.helloWorld',              // 唯一ID
            StatusbarAlignment.LEFT,          // 左侧显示
            1000                              // 优先级，数字越大越靠左
        );
    }
}

// 3. 注册 Contribution
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(HelloStatusContribution, LifecyclePhase.Restored);
```

上述代码大致演示了我们如何添加一个状态栏项。解释如下：

-   利用 VSCode 内部的 CommandsRegistry 注册了ID为`myExtension.sayHello`的命令，并提供了一个简单处理器（此处仅打印日志）。实际开发中，我们可以调用 NotificationService 来弹出信息提示用户 。
-   创建 `HelloStatusContribution` 类，实现 IWorkbenchContribution。在构造函数中使用依赖注入拿到了 statusbarService。然后调用 `addEntry` 方法添加状态栏项：

-   text 使用 `$(smiley)` 语法插入一个内置笑脸图标，后跟文本 "Hello World"。
-   tooltip 设置悬浮提示为 "Say Hello"。
-   command 关联我们定义的命令ID，这样点击状态栏项时会触发该命令。
-   id 给定 'status.helloWorld'。状态栏服务要求每个项有唯一ID，以允许用户通过设置隐藏特定项及内部排序 。
-   alignment 设为 LEFT，将此项放在左侧区域（与Git分支等在同一侧）。若设 RIGHT 则会在右侧（与行列信息等一侧）。
-   priority 设置为 1000。状态栏排列顺序由优先级决定，在左侧区域里，这个值较高，将使我们的项排在较靠左的位置 。priority 在不同项间相对比较，例如VSCode内置的一些项用的是 -1000 等，我们可以调整确保相对顺序。

-   最后，通过 Registry 将我们的 Contribution 注册到 Workbench。当 Workbench 处于 LifecyclePhase.Restored（即窗口加载完毕并恢复编辑器状态后）执行此注册，于是我们的 HelloStatusContribution 就被实例化，运行其构造函数，成功将项添加。

完成以上改动后，重新编译运行 VSCode，我们将在状态栏左侧看到一个微笑图标和 "Hello World" 文案。点击它时，会在开发者工具控制台看到日志输出（若改为 NotificationService 则会弹出消息）。这样，我们无需修改 VSCode 核心状态栏部件的代码，就扩展了一个自定义UI。

**拓展**：通过类似方式，可以对 VSCode UI 做很多定制：

-   添加**菜单项**：使用 MenuRegistry 在特定 MenuId（如 MenuId.EditorContext 编辑器右键菜单）注入自定义命令；结合 when 上下文控制显示条件。
-   添加**标题栏按钮**：VSCode提供了注册 TitleBar 按钮的机制（譬如 Remote ssh 图标就是内部contrib添加的）。可以在 Window或Titlebar的贡献点里通过 `MenuId.TitleBar` 等实现，但这涉及修改核心UI布局，需要谨慎。
-   定制**ActivityBar**：虽然Activity Bar主要列出已注册的 View Container，但我们也可以通过 `ViewContainerRegistry` 添加自定义视图容器，使其在ActivityBar出现一个新图标（需要提供图标和对应视图实现）。
-   修改**主题颜色**：通过调整 `colorRegistry` 注册的颜色或者在 workbench.css 注入自定义CSS，可以改变UI配色。这通常通过扩展主题完成，而在二次开发中你也可更改默认主题颜色值。

需要注意的是，**尽量使用 VSCode 提供的 API/服务来定制UI**，不要直接手动操作DOM。因为 VSCode UI刷新和布局调整由内部机制管理，手动改DOM容易被后续刷新覆盖，或在版本更新时失效。我们的示例遵循了规范做法（使用StatusbarService），因此能与VSCode协作良好。

### 4.2 新增 VSCode 内核功能（AI 辅助功能示例）

**场景**：我们希望在VSCode中内置一个类似“**AI 代码助手**”的功能，例如用户可以选中一段代码并请求AI分析，AI返回结果显示在侧边栏或内嵌提示。这类似最近流行的AI辅助编码（如GitHub Copilot、Cursor AI）功能。尽管这通常通过扩展实现，但作为练习，我们考虑如何在VSCode内核中直接添加这样一个功能模块。

**设计思路**：

我们计划增加一个新的 **Workbench Contrib 模块**，名为 "AI Assistant"：

-   提供一个侧边栏视图或面板，供显示AI交互界面（比如聊天对话或代码分析结果）。
-   提供一些命令，例如“使用AI分析选中代码”、“打开AI助手面板”等。
-   在实现上，需要调用外部AI接口（假设有HTTP API可用）。因VSCode内核不能直接访问网络（渲染进程处于沙盒），可考虑：

-   通过扩展主机调用Node模块请求网络（我们可以在内置扩展 host 中实现HTTP请求），然后IPC回传结果。
-   或将AI请求功能实现为一个独立node进程/worker，通过VSCodeIPC通信（复杂度较高）。
-   为简化，我们这里假设可以直接fetch（在Sandbox下fetch仍可用HTTP，但跨域和认证需处理，这里不深究）。

**实现步骤**：

1.  **AI 服务**：定义 `IAssistantService` 接口，包含方法如 `ask(prompt: string): Promise<string>` 用于向AI发送请求并返回应答。实现 `AssistantService`，内部使用 fetch 调用AI API。可以在 Platform 层或 Workbench services 注册该服务，以便各处可用。为了串联不同进程，我们也许需要扩展host配合，但此处先聚焦核心逻辑。
2.  **侧边栏视图**：创建 `AIPanel`（或Viewlet）类，继承 Workbench 提供的 `ViewPane` 或实现 `IViewPaneContainer` 接口。它在UI上表现为一个类似输出或问题的面板，里面有一个文本区域显示AI回复，可加一个输入框让用户输入提问。这可以用简单的HTML文本元素或基于Workbench的SplitView/List组件。
3.  **命令和交互**：

-   注册命令“Ask AI (分析选中代码)”：当执行时，获取当前编辑器选中文本（可通过 EditorService 和 EditorModel 获取），然后调用 AssistantService.ask(prompt) 异步获取回答。得到回答后，将结果发送给 AIPanel 去显示。
-   注册命令“Open AI Assistant”：打开侧边栏AI视图。这需要通过 ViewletService 或 PanelService 显示我们的 AIPanel。
-   如果想做内嵌提示，也可考虑直接在编辑器中插入一个装饰（Decoration）显示AI结果，但这复杂度较高，这里以面板显示为例。

4.**工作流**：用户选中代码，执行命令 -> 调用服务获取AI回复 -> 弹出/聚焦 AI面板并显示结果；用户可在AI面板继续提问（这涉及实时交互，需要更多UI支持，但可简化为每次调用命令，或在面板内提供输入框+提交按钮来再次调用服务）。

**代码/伪代码要点**：

-   AssistantService 实现：
    

```ts
class AssistantService implements IAssistantService {
    async ask(prompt: string): Promise<string> {
        const response = await fetch('https://api.example.com/ask', {
            method: 'POST',
            body: JSON.stringify({ prompt }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            throw new Error('AI API request failed');
        }
        const data = await response.json();
        return data.answer; // 假设返回JSON含 answer 字段
    }
}
// 注册服务
registerSingleton(IAssistantService, AssistantService, InstantiationType.Eager);

  
```

（注：真实开发中，需要考虑在扩展Host执行fetch，这里为了演示简化）

-   AIPanel 实现：

```text
class AIPanel extends ViewPane { // ViewPane是VSCode提供的侧边栏/面板视图基类
    private _container: HTMLElement;
    private _content: HTMLElement;
    constructor(options, @IAssistantService private assistantService: IAssistantService) {
        super(options);
        // 创建DOM容器
        this._container = document.createElement('div');
        this._container.className = 'ai-panel';
        // 创建一个pre元素显示文本
        this._content = document.createElement('pre');
        this._container.appendChild(this._content);
        // （可选）创建一个输入框和按钮供用户继续提问
        // ...
    }
    public renderBody(container: HTMLElement): void {
        container.appendChild(this._container);
    }
    public layout(dimension: Dimension): void {
        // Adjust content size if needed
    }
    // 方法：显示AI回复
    showAnswer(answer: string) {
        this._content.textContent = answer;
    }
}
// 注册 AIPanel 为一个Viewlet或者Panel:
const viewletRegistry = Registry.as<ViewContainerRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const aiViewContainer = viewletRegistry.registerViewContainer({ id: 'workbench.view.aiAssistant', title: 'AI Assistant', ctorDescriptor: new SyncDescriptor(AIPanel) }, ViewContainerLocation.Sidebar);
// （或者用 PanelRegistry 注册到Panel区域，取决于设计，我们假设放Sidebar）
```

上面简单创建了一个View，实际还需要实现一些接口方法。此处Pseudo-code仅描述大概过程。

-   注册命令：

```ts
CommandsRegistry.registerCommand({
    id: 'aiAssistant.askSelection',
    handler: async (accessor) => {
        const editorService = accessor.get(IEditorService);
        const assistantService = accessor.get(IAssistantService);
        const panelService = accessor.get(IViewletService);
        // 获取选中文本
        const activeEditor = editorService.activeTextEditorControl;
        let prompt = '';
        if (activeEditor && activeEditor.getSelection) {
            prompt = activeEditor.getModel().getValueInRange(activeEditor.getSelection());
        }
        if (!prompt) {
            return;
        }
        // 调用AI服务
        const answer = await assistantService.ask(prompt);
        // 显示AI面板并输出答案
        const aiPanel = await panelService.openViewContainer('workbench.view.aiAssistant', true);
        (aiPanel.getViewPaneContainer() as AIPanel).showAnswer(answer);
    }
});
```

这个命令流程：拿到当前选区文本 -> 调用AI -> 打开侧边栏我们注册的AI Assistant视图 -> 调用视图实例的方法显示答案。

-   另注册一个打开面板命令:

```text
 CommandsRegistry.registerCommand({
    id: 'aiAssistant.openPanel',
    handler: (accessor) => {
        return accessor.get(IViewletService).openViewContainer('workbench.view.aiAssistant', true);
    }
});
```

-   注册菜单/键绑定：可以把 `aiAssistant.askSelection` 加入编辑器右键菜单，方便使用：

```text
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    command: { id: 'aiAssistant.askSelection', title: 'Ask AI about Selection' },
    when: EditorContextKeys.textFocus, // 仅在文本焦点（有选区情况再细化）
    group: 'navigation'
});
```

-   以及为其设一个快捷键，比如 Ctrl+Shift+Q：
    

```text
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'aiAssistant.askSelection',
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.hasNonEmptySelection,
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyQ
});

 
```

完成这些后，将相关代码放入一个新的 `aiAssistant.contribution.ts`，并在 Workbench 加载时导入注册。启动修改后的 VSCode，当我们右键选中文本会看到菜单“Ask AI about Selection”。点击后，侧边栏打开“AI Assistant”视图，稍等片刻应出现AI返回的分析/回答内容。

**注意事项**：

-   网络请求需要考虑异步和错误处理，实际实现中应在 UI 上反馈等待状态（比如在 AIPanel 显示“请稍候...”），并捕获异常显示错误消息。
-   如果AI响应较长，可能需要支持滚动或者在UI上分页。
-   由于内置实现复杂度高，很多这样的AI功能更实际的做法是作为一个扩展。但我们这里的练习展示了VSCode内核其实完全可以集成类似功能，只是官方选择将此类功能留给扩展，以保持核心轻量。
-   **安全**：如果在核心中集成AI，需要注意不泄露用户隐私代码等，因此默认应是手动触发，而非自动发送代码内容。另外，使用扩展host发起请求也能隔离核心进程的网络访问权限。

通过这个案例，我们实践了：

-   定义新服务并使用 DI 注入。
-   创建新 UI 视图部件并注册到工作台（侧边栏）。
-   使用命令将多个部分串联起来：编辑器选区 -> 服务调用 -> UI展示。
-   运用了菜单和键绑定扩展点来无缝整合UI操作。

这种新增内核功能的过程，与编写一个内置扩展的方式类似，但在内核中我们能直接访问所有服务和UI模块，具有更高自由度。在实际二次开发中，如果我们有一个特定领域需求（比如内置公司的代码审查工具、设计稿预览工具等），都可以参考此模式创建自己的contrib模块。

### 4.3 贡献点开发（内部 Contributions）

**场景**：我们希望通过\*\*内部贡献点(contrib)\*\*机制扩展VSCode。例如，在不编写外部扩展的前提下，为 VSCode 内置增加一个新视图或改造某项功能。这个案例主要演示如何按照VSCode内部规范开发一个contrib模块，以及利用内部扩展点接口完成扩展。

**案例设定**：增加一个 “Open in Browser” 功能：

-   当编辑器打开HTML文件时，我们希望在编辑器工具栏提供一个按钮，点击后在系统默认浏览器中打开此HTML文件预览。
-   这个功能假设我们的VSCode没有安装额外扩展，通过内核实现。

**实现分析**：

-   目标UI是编辑器标题栏的工具栏按钮（通常出现在文件tab右侧，像分屏、关闭按钮那些位置）。
-   VSCode提供了在编辑器工具栏添加按钮的机制。实际上，这是通过 **Editor Title Menu** 来实现的。VSCode有一个菜单扩展点 `editor/title`，扩展可以往这里贡献按钮。内部实现上，VSCode也使用 MenuRegistry 来配置默认按钮（如“拆分编辑器”等）。因此我们可以利用 MenuRegistry 添加一个菜单项到 editor title 区域。
-   菜单项出现条件应是当前文件类型是 HTML。我么可以利用 when 条件结合上下文键 `resourceLangId == 'html'` 来限定。
-   点击按钮执行的命令需要我们实现，比如命令 `workbench.action.openInBrowser`.

**实现步骤**：

1.  **注册命令**：定义 `openInBrowser` 命令，利用 VSCode的 shell 或 opener 系统打开浏览器。VSCode主进程有openExternal API，但渲染进程可通过 `IOpenerService` 来实现URL或资源的打开。OpenerService能打开http链接或文件URI。我们可以将文件路径转换为 file:// URL，然后调用 openerService。
2.  **菜单项**：通过 MenuRegistry.appendMenuItem(MenuId.EditorTitle) 添加我们的按钮。设置其 command 为上面注册的命令，图标可以使用内置 (比如 `$(browser)`如果有) 或自定义SVG（需要注册ThemeIcon）。这里简化用文字或假设有个 globe 图标: `$(globe)`。
3.  **when 条件**：`ResourceLangId == html` 这个上下文键可以通过 ContextKeyExpr 来构造。VSCode已经将当前资源的语言ID设置成一个上下文key `resourceLangId`。我们还能要求只有文件类型为文件（不是无标题或者diff）时才显示，可以加 `EditorContextKeys.isInDiffEditor.toNegated()` 之类。
4.  **打包到contrib**：这个功能小，可以直接写在某现有contrib模块的 .contribution.ts 中。但更好是新建一个专门模块，比如放在 `workbench/contrib/opener/browser/opener.contribution.ts`（如果已有opener模块也可扩展）。我们在 .contribution.ts 文件里执行上述注册代码。无需定义新服务或类，仅贡献菜单和命令。
5.  **导入注册**：确保在 workbench.desktop.main.ts 等入口引入该 contribution 文件，使其在启动时执行注册逻辑。

**伪/代码**：

```text
// contribution文件: openInBrowser.contribution.ts
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

// 1. 注册命令实现
CommandsRegistry.registerCommand('workbench.action.openInBrowser', async accessor => {
    const openerService = accessor.get(IOpenerService);
    const editorService = accessor.get(IEditorService);
    const resource = editorService.activeEditor?.resource; // URI of current file
    if (resource) {
        // 调用OpenerService打开URI。对于file:协议资源，默认行为是在本机用关联应用打开，即对于HTML会用浏览器。
        openerService.open(resource);
    }
});

// 2. 注册菜单项到编辑器标题栏
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: 'workbench.action.openInBrowser',
        title: 'Open in Default Browser',
        icon: { id: 'browser' }  // 假设我们已注册一个名为browser的图标
    },
    group: 'navigation',        // 放在导航区域
    order: 30,                  // 顺序，默认一些内置项有特定order，我们放30确保不冲突
    when: ContextKeyExpr.and(
        ContextKeyExpr.equals('resourceLangId', 'html'),
        EditorContextKeys.editorTextFocus           // 编辑器有焦点（可选，看需求）
    )
});
```

**解释**：

-   我们直接用 CommandsRegistry 而非 vscode.commands.registerCommand，因为我们在内核环境，可以这样做。
-   openerService.open(resource) 会根据资源协议处理：file协议就调用主进程shell打开，http则用系统浏览器。。
-   MenuId.EditorTitle 对应每个编辑器Tab右侧的按钮区域。我们放 group=navigation，跟其他导航按钮一起。when条件确保只有当资源语言是html才出现。EditorContextKeys.editorTextFocus 确保编辑器处于激活状态。
-   图标的 `{ id: 'browser' }` 需要预先在扩展的 icon注册表注册一个ThemeIcon。VSCode内置没有browser图标，可以选用已有如 `globe` icon或自定义。这里假定已有标识为browser的图标。

完成这段后，将 contribution 文件在 Workbench 启动时引入（例如在 `workbench.common.main.ts` 增加一行 import 'vs/workbench/contrib/opener/browser/openInBrowser.contribution';）。编译运行VSCode，然后打开一个HTML文件。在编辑器Tab右侧应该出现一个按钮“Open in Default Browser”（如果加了图标则是图标）。点击它，会调用系统默认浏览器打开该HTML文件。这个功能等效于很多扩展提供的"Open in Browser"功能，但我们在内核层实现并默认提供了。

**验证**： 可以新建/打开HTML，确认菜单和命令出现。也可按Ctrl+Shift+P输入命令名看看能否触发。同理，修改 when 条件试试看变化。

**总结**： 这个案例展示了使用 **MenuRegistry 和 CommandsRegistry** 直接向 VSCode 核心贡献功能的方式，而没有涉及编写复杂类或UI组件。由于VSCode本身对菜单和命令扩展点支持完善，我们只需几行代码即可把一个新按钮插入编辑器标题栏。这种做法适用于很多类似需求，例如：

-   想在资源管理器的文件右键菜单增加新命令 -> 使用 MenuRegistry 针对 MenuId.ExplorerContext 加项。
-   想在状态栏增加图标（前述例子），也可以通过 StatusBarService 或 MenuId.StatusBar 来做。
-   想调整现有菜单的排序或文本 -> 修改 MenuRegistry 中相应项（不过这些多数写死在源码，要改只能改代码）。

利用内部贡献点开发，需要对VSCode各类 Extension Points 的 MenuId、ContextKeys 熟悉。可以参考 VSCode 源码 `package.nls.json` 或文档列出的贡献点ID。

通过contrib机制，我们做到**不改动核心逻辑，通过注册扩展点增量地添加功能**。这保持了代码的模块化。如果将来不需要此功能，注释掉注册代码即可“移除”。这比直接更改核心模块（比如改 EditorPart 代码硬编码一个按钮）要优雅和稳健得多。

### 4.4 修改 VSCode 内部机制（调试工具、自定义 LSP 等）

**场景**：有时我们的需求需要修改VSCode内部的工作方式。例如：

-   **修改调试工具**：也许我们想更改调试控制台的行为，或者在调试时注入特定逻辑。
-   **自定义语言支持 (LSP)**：想要VSCode对某种语言提供特殊的编辑增强，可能需要内置一个语言服务器协议(LSP)客户端或自定义语言特性。
-   **调整性能或安全设置**：修改某些默认配置，如禁用某些telemetry、调整垃圾回收策略等等。

这些都属于**修改VSCode内部机制**的范畴。往往没有现成扩展点可用，需要直接改核心代码或替换部分实现。下面以两个具体例子说明处理方法：

**例1：定制调试协议逻辑**

假设我们想在VSCode调试过程中，每当程序暂停在断点时，自动执行一个我们定制的评估（evaluate）操作并把结果显示在调试控制台。例如，当断点暂停时，自动执行 `print(current_variable_values)`。这不是VSCode默认行为，我们需要深入调试组件实现。

-   VSCode调试功能由 `vs/workbench/contrib/debug` 模块提供，包括 DebugService、DebugSession 等。断点暂停事件从 Debug Adapter Protocol (DAP) 而来，由扩展或内置调试Adapter通过扩展Host驱动。但UI上，DebugService 会收到一个 `stop` 事件（onDidStop）。
-   我们可以在 DebugService 或 DebugSession 处插入逻辑。当收到 stop 事件且 session 有线程暂停，我们调用 session.customRequest('evaluate', {...}) 让调试适配器执行我们的命令。调试控制台一般已经实现了 evaluate 显示结果，我们可以让结果输出到 console.
-   具体做法：找到 `debugSession.ts` 中处理停止的地方，VSCode一般触发 `this._onDidStop.fire()` 通知UI更新。我们可以订阅这个事件或者修改事件处理：

-   最小侵入：使用 Contribution 注册一个 DebugService 的事件监听。

```text
debugService.onDidStopSession(session => {
     session.evaluate('print_vars()'); // pseudocode
});
```

Evaluate返回promise，我们可以忽略或将结果通过 console API输出。

-   或直接修改 debugSession.onStopped 方法，插入几行调用 evaluate。

-   这种修改需要熟悉 DAP。如果 target debug adapter doesn't understand 'print\_vars',这个例子就无效。换成一个通用表达式可能更实际，如 print 所有局部变量就复杂了，需要通过 scopes and variables requests获得。
-   简化点，可以在stop时做一些UI操作或记录日志，也能达到演示效果。

总之，调试相关改动必须考虑 debug adapter 的配合，以及不能让注入逻辑拖慢或干扰正常调试过程。作为实验，可以log一下：

```text
debugService.getModel().onDidChangeBreakpoints(e => {
    // or onDidStop
    console.log('Program stopped, sending custom command...');
    session.customRequest('evaluate', { expression: 'console.log("Paused!")', context: 'repl' });
});
```

这样或许能在调试控制台看到 "Paused!" 输出。但前提调试适配器配合（Node Debug可能支持evaluate这样的JS表达式）。

**例2：内置自定义 LSP 客户端**

假设我们开发一个新的编程语言X，需要编辑支持（语法高亮、补全、跳转），公司不希望使用扩展而是直接在我们定制的VSCode中内置对X的支持。可以考虑：

-   **语法高亮**：可以将语言X的TextMate语法文件(.tmLanguage.json)加到 VSCode 内置扩展或新增一个内置扩展加载。VSCode的语言语法高亮大都由扩展 (extensions/...) 提供，我们可以把X的语法文件放入 extensions目录并在 product.json 标记为内置扩展。
-   **LSP 客户端**：VSCode提供语言服务器客户端库作为npm包 (vscode-languageclient)，通常在扩展中用。但在内核我们并没有直接用npm包的惯例。不过可以参考内置扩展比如 `extensions/json-language-features`，里面其实运行了 JSON language server。实现模式：

-   在扩展主机启动时启动一个子进程运行 server.js。
-   通过 vscode-languageclient 建立通讯，将VSCode的语言能力（提供completion等）代理给该server。

-   为了不写扩展，也可把这套逻辑搬入 core contrib：

-   写一个 LanguageServiceContribution，在workbench启动时spawn子进程（使用 `fork` 或 `SharedProcess`）启动我们的X语言服务器（比如基于 Node 实现）。
-   利用 VSCode已有的 LanguageFeaturesService 注册该语言的 providers。实际上，VSCode core里没有现成Generic LSP client，需要自己实现通信。更简单还是走内置扩展路线。

-   其实**最可行**方案：**编写一个内置扩展**实现对语言X支持，然后将其直接包含在构建中。这在架构上依然是扩展，但对终端用户来说是开箱即用。VSCode的C++、Python都不是内置的，但TypeScript/JSON是内置扩展。这样不用改core，只需在 `extensions/` 加目录。二次开发时完全可以这样做而达到效果。
-   当然，如果坚持改 core，也不是不行，只是要自己处理协议通信。除非有特殊需要，内置扩展更省事。

**小结**：

-   修改调试、编辑器这些内部机制，需要定位到相应服务或组件的实现，并基于当前设计修改。最好遵循原有风格，不要粗暴hack。比如需一个新hook，看看能否像contribution一样添加listener，不行再考虑改源码。
-   在调试例子中，我们尽量不改 DebugAdapterProtocol 层次，而是利用现有扩展点 (customRequest) 实现额外功能。这样不破坏协议兼容性。
-   在语言支持例子里，我们发现不一定要改core，通过内置扩展就解决问题。这也反映出VSCode架构对扩展的依赖和友好。

**实践建议**：

-   找到类似功能的实现并模仿。例如调试输出在哪实现的？语言服务器怎么集成的？阅读VSCode源码相关模块（比如 search "onDidStop" "DebugSession"）即可找到切入点。
-   **测试**：调试改动需要实际运行调试会话测试，以确保没有副作用。语言支持需要打开相应文件测试补全等。
-   **配置项**：若你的改动可能不适用于所有用户，考虑做成可配置的。比如我们的自动评估功能，可增加一个设置 `"debug.autoEvaluate": true/false`，在执行时检查，给用户关闭选项。这就涉及在 ConfigurationRegistry 注册配置，并在代码中读取配置。

通过这些案例，我们体会到二次开发VSCode既可以**无侵入地增加新功能**，也可以**针对性地修改核心行为**。一般推荐优先走扩展点或contrib方式，必要时才直接改核心逻辑，并尽量保证模块边界清晰。调试和语言支持本质上也是通过扩展体系插入VSCode的，这也说明VSCode的架构很灵活可扩展。

## 5\. 开发流程与调试

在完成代码改动后，我们需要在本地编译运行VSCode源代码进行测试和调试。这部分介绍如何**构建VSCode**、**运行开发版本**以及**调试VSCode内部代码**的流程和技巧。

### 5.1 如何编译 VSCode 源码

VSCode 使用 npm 脚本和 gulp 构建，其依赖管理采用 yarn。官方仓库包含详细的构建说明，这里总结关键步骤：

1.  **克隆源码**：从 GitHub 上获取 VSCode 源码：
    

```text
git clone https://github.com/microsoft/vscode.git
cd vscode
```

确保切换到想要修改的版本分支（如 `main` 分支或某 release tag）。

2\. **安装依赖**：执行 yarn 安装所需的node模块：

```text
 yarn
```

这会读取 `package.json` 并安装开发依赖。由于 VSCode 使用 yarn workspaces，会安装子包依赖。国内环境可能需要设置yarn镜像或使用`yarn install --network-timeout 1000000`。

3\. **编译代码**：VSCode 源码需要先编译 TypeScript：

-   **持续增量编译**：推荐使用 yarn watch
    
    这会启动 TypeScript 编译器增量模式，监听文件改动自动重新编译。首次运行会花一点时间编译所有内容。等终端输出 `Compilation complete. Watching for file changes.` 表示编译成功并进入监听状态。
-   **一次性编译**：使用

```text
yarn compile
```

进行一次静态编译。若只是测试构建能否通过可用此，但开发时 watch 模式更高效。

-   **注意**：如果只修改少量TS代码，watch足够。如果改动底层构建脚本或本地化等，也可用 `yarn compile` 确认一遍。

4\. **运行开发版本**：编译完成后，可以启动 VSCode 的开发版：

-   对于 **桌面版**：运行脚本 ./scripts/code.sh
    
    （Windows下运行 `scripts\code.bat`）。这将打开一个新的 VSCode 窗口，运行的是刚编译的源码。你可以在这个窗口中验证你的改动效果 。如果你在 watch 模式下修改代码并保存，终端会自动重编译；切回开发版窗口会提示刷新或者直接反映部分改动（通常需要刷新Window：按`Ctrl+R`或者开发者菜单->重载窗口）。
-   对于 **Web版**：运行 yarn web
    
    然后在浏览器访问 `http://localhost:8080`（默认端口）即可加载 VSCode Web版。Web版某些功能有限，但适合测试无Electron依赖的部分。
-   **命令行工具**：可以用 `./scripts/code-cli.sh` 运行改动后的 VSCode CLI，测试诸如 `code --help` 等命令的行为。

初次运行 ./scripts/code.sh 会生成调试配置等信息，并在 `~/Library/Application Support/Code - OSS` （mac）或 `%APPDATA%\Code - OSS` 下创建用户数据用于开发版。开发版名称通常是 “Code - OSS”。

5\. **调试**：调试分两种，一种是**在VSCode中调试VSCode**，另一种是用VSCode Dev Tools。下一节详细介绍。

常见构建问题：

-   如果 `yarn` 报错，可以尝试 `npm install -g yarn` 更新yarn版本。国内环境建议全局代理，避免不必要的动态加载的依赖问题（早期版本，会去远程加载一些扩展）。
-   `yarn watch` 长时间无输出或报错，可尝试先 `yarn compile` 看是否有TS错误，需要先修正错误。
-   如果Electron无法启动（scripts/code.sh报错），确保依赖装全或者删掉 `node_modules` 重新 yarn。
-   构建速度慢可以：关闭一些不必要的watch或者增加内存。一般 watch 会吃较多CPU，可在改完一批后暂停watch（Ctrl+C终止）。

### 5.2 如何运行 VSCode 开发版

上一步已经提到，通过 `scripts/code.sh` 启动的是**开发版VSCode**（俗称 "Code - OSS" 版）。值得说明的是，这个开发版本身也是一个VSCode实例，可以用来打开项目、运行调试。不过**不要用它本身再去调试自己**，调试需要用另一个稳定VSCode实例，以避免混乱。

一个推荐做法是：**双实例调试**：

-   用你日常安装的稳定VSCode（或Insiders）来打开VSCode源码仓库，作为调试器。
-   用 `scripts/code.sh` 启动的开发版作为被调试程序。

这样，你可以在稳定版中设置断点，附加到开发版进程，检查变量等。

### 运行 VSCode Dev 版本注意事项：

-   开发版与正式版配置、扩展目录是独立的（通过 `--user-data-dir` 区分），不会干扰你的正常VSCode配置。开发版窗口标题会有 `[Unsupported]` 字样。
-   开发版默认开启了一些调试选项，例如 `--inspect-extensions` 用于调试扩展主机，`--remote-debugging-port` 用于调试渲染进程等。你可以在 `./scripts/code.sh` 脚本内看到这些参数。通常，渲染进程开启的调试端口为 9222（Chrome DevTools），扩展主机debug端口为 5870。
-   你可以在开发版内按 `F1` 输入 `Developer: Toggle Developer Tools` 打开Chromium开发者工具，像调试网页一样调试渲染进程的DOM、JS。对于UI问题排查很有用。

### 5.3 如何 Debug VSCode 内部代码

**调试 VSCode 渲染进程**：

1.  **使用 Developer Tools**：最简单的调试UI的方法是在开发版中按 `Ctrl+Shift+I` 打开开发者工具。它和Chrome devtools界面一样，可以：
    

-   在 Sources 选项卡中看到所有打包后的JS（带有 `.js` 后缀），如果 sourcemap 正常加载，也能映射回 TypeScript 源码。可以直接搜索你想调试的文件名，设置断点。
-   切换到 Console 查看日志输出或执行脚本。
-   利用 Elements 查看DOM结构和样式，调试布局和CSS。 由于VSCode在开发模式下会生成 sourcemaps，你应该可以看到TS源码并设置断点。如果没有，可以检查 `out` 目录下是否有 `.js.map` 文件，开发版是否开启了 sourceMap（默认开启）。

1.  **使用第二个VSCode实例调试**：在稳定版VSCode上打开源码文件，然后附加调试:
    

-   VSCode仓库自带 `.vscode/launch.json`，里面通常有多个调试配置。例如 "Launch VS Code"（启动一个新的 VSCode 并调试）、"Attach to Main Process", "Attach to Renderer" 等。你可以使用**Launch VS Code**配置让稳定版启动开发版并附加调试，不过这种方式相当于用VSCode本身来启动，被调试实例可能不一致。
-   更常用的是**Attach**配置：等你用`code.sh`启动开发版后，在稳定版选择相应的 Attach 配置附加：

-   附加渲染进程（工作台）：可能需要你在 launch.json 填上开发版渲染的调试端口（一般9222）。配置类似：

```text
{
    "name": "Attach to VSCode Renderer",
    "type": "pwa-chrome",
    "request": "attach",
    "port": 9222,
    "webRoot": "${workspaceFolder}"
}
```

点开始后，如果成功，会连接到开发版渲染进程，你就可以在稳定版里设置断点、单步、观察变量（通过Chrome DevTools协议）。

-   附加扩展主机：开发版通常启用了 `--inspect-extensions=5870`, 所以扩展主机在5870端口等待调试。可用 Node.js Attach:

```text
{
    "name": "Attach to VSCode Extension Host",
    "type": "node",
    "request": "attach",
    "port": 5870,
    "protocol": "inspector"
}
```

这样可调试内置扩展或扩展Host运行的代码（如LanguageClient等）。

-   附加主进程：主进程调试比较少需要，但如果改了 `electron-main` 层，可以加上:

```text
{
    "name": "Attach to VSCode Main",
    "type": "node",
    "request": "attach",
    "processId": "${command:pickProcess}",
    "protocol": "inspector"
}
```

然后在进程列表选 Code - OSS main 进程即可。

-   一旦附加成功，你就可以在稳定版中像平常调试应用一样，断点、watch、call stack 都能用了。这种方法比起浏览器DevTools，体验更一致，也可以调试到TypeScript源代码层面。

**调试 VSCode 主进程**：

-   Electron主进程涉及窗口创建、文件对话等。如果修改这部分，可以直接用稳定版VSCode附加调试（如上 processId 方式）。
-   也可以在启动开发版时，加启动参数如 `--inspect-brk=5858` 等让主进程等待调试器附加再执行。但一般没必要，因为主进程代码相对少且容易阅读日志调试。

**调试技巧**：

-   善用 VSCode 内置的**日志**功能：VSCode有 Logging 服务，可以在很多服务初始化时加 log(`this.logService.info(...)`) 查看运行轨迹。或者暂时插入 `console.log`（渲染进程输出见开发者工具Console，主进程输出见启动Terminal日志）。
-   **Conditional Breakpoint**：对频繁触发的事件，可设条件断点避免不停中断。Right click breakpoint -> Edit Condition。
-   **Source Maps**：有时 VSCode调试环境对source map支持不完美。如果断点不生效，尝试直接在 `.js` 文件上断。或者在Chrome DevTools调试时，可勾选 "Disable source map" 来看实际执行的JS（虽不方便读，但可确认逻辑）。
-   **Profiler**：开发者工具里可进行性能分析（Performance tab），找出耗时函数。也能检查内存泄露（Memory tab Timeline）。
-   **IPC 调试**：VSCode内部IPC通信有时难跟踪。可以开启一些 verbose log，比如启动参数 `--log=trace` 或在相关服务里 log message。扩展host里的console.log会在调试控制台输出，也可利用。
-   VSCode自带了一些**Developer Commands**（在命令面板搜索 Developer:），如 "Reload Window" (重载窗口，相当于软重启UI)，"Open Process Explorer" (查看进程与CPU占用) 等，善加利用有助于调试资源问题。

**边开发边调试**： 由于 `yarn watch` 能实时编译，你可以：改代码 -> 看终端编译成功 -> 切到开发版窗口按 Ctrl+R 重载 或点击某UI触发，新的代码就跑起来，然后通过附加调试捕获新的行为。调试器会断在你设置的断点上。如果改动涉及主进程/扩展Host，可能需要重启 `code.sh` 让新代码生效，因为那些进程不会自动重载。

## 6\. 整体 VSCode 内部架构

本章我们以更宏观的角度，通过架构图示和流程图来巩固对VSCode内部的理解。辅以文字描述两个关键方面：**进程架构**和**服务调用流程**。

![](vscode-%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97/v2-ff492d775b99c7e756b8f601cce4cea7_1440w.jpg)

### 6.1 进程架构

VSCode（桌面版）采用Electron，天然是多进程架构。主要涉及以下进程：

-   **主进程 (Main Process)**：负责应用的生命周期和全局管理。一个VSCode应用只有一个主进程。它主要任务：
    

-   创建渲染进程窗口（BrowserWindow）并加载工作台HTML。
-   管理多个窗口：追踪已打开窗口列表，转发菜单/任务到特定窗口（如菜单点击 "New Window" 会调用主进程创建新窗口）。
-   提供系统集成功能：如文件对话框、托盘图标、应用菜单、剪贴板、通知、自动更新，这些必须在主进程调用OS API。
-   承担部分服务：文件系统访问（如在沙盒模式下渲染不能直接访问文件，则主进程执行）、进程管理（启动扩展Host进程等）。
-   主进程几乎不涉及UI渲染（除了自定义标题栏在Win/Linux上通过数据通信，由渲染绘制UI）。
-   在源代码中，主进程代码集中在 `src/vs/code/electron-main` 和一些 platform 层 electron-main 子目录。

-   **渲染进程 (Renderer Process)**：每打开一个VSCode窗口，就有一个对应的渲染进程，运行VSCode工作台(Web技术构建的UI)。渲染进程职责：
    

-   承载全部**Workbench UI**：包括编辑器、面板、侧边栏、标题栏（自定义情况下）等等。
-   执行**前端逻辑**：所有用户交互处理、大部分服务逻辑都在此，因为TypeScript实现的大部分代码都运行在渲染进程（除了那些特别标注在主进程/扩展主机的）。
-   直接操作DOM渲染界面、响应用户输入事件。
-   启动时，渲染进程会通过 Node integration (若启用) 或 sandbox通道加载所有 vs/base, vs/platform, vs/workbench 的代码并运行 Workbench.startup。
-   渲染进程可以使用一部分 Node 能力。在2022之前，VSCode渲染进程是完全启用了Node整合的，所以能直接使用 fs 等模块。但为了安全，现在默认启用Electron sandbox，渲染进程被限制，不能直接调用大部分Node API，需要通过 `ipcRenderer` 请求主进程或[使用 preload 提供的受限API](https://link.zhihu.com/?target=https%3A//code.visualstudio.com/blogs/2022/11/28/vscode-sandbox%23%3A~%3Atext%3DEnabling%2520the%2520sandbox%2520in%2520Electron%2Cit%2520evolved%2520during%2520this%2520journey)。
-   VSCode对此做了大量改造，但基本透明对于我们开发，比如 fileService 在渲染请求主进程读文件，这对开发者来说还是调用 fileService 接口而已。

-   **扩展主机进程 (Extension Host Process)**：为了隔离扩展对主UI的影响，VSCode把扩展运行在一个单独的Node.js进程中。要点：
    

-   默认情况下，所有启用的扩展（插件)都在这一个进程里运行（按不同事件触发激活，但共用进程）。某些特定扩展可以要求**独立扩展主机**（如调试扩展每开启一个调试会话开新进程）。
-   扩展主机加载扩展的JavaScript/TypeScript代码，提供给它们 VSCode扩展API (通过在该进程注入一个 `vscode` 对象实现API方法，其背后与工作台通信)。
-   扩展主机通过 **IPC** 与渲染进程通讯。例如扩展调用 `vscode.window.showInformationMessage` 会发消息给渲染让其显示对话框。渲染那边调用 `MainThreadMessageService.showMessage` 来实现 UI。这种架构保证扩展即使无响应，UI仍可交互，只是相应功能卡顿。
-   扩展主机也不能直接操作UI或DOM，所以不会破坏IDE整体的稳定性。最差情况扩展崩溃，只会导致某些功能失效，用户界面仍在（可以提示扩展出问题让用户重启扩展主机）。
-   源码：`src/vs/workbench/services/extensions` 包含了扩展主机启动和通信的逻辑；`src/vs/workbench/api` 则实现了扩展API的MainThread/ExtHost部分。
-   **Web版**：没有Node进程，扩展主机在浏览器中以 Web Worker 实现。多个扩展则在一个WebWorker里一起运行（类似单线程模拟扩展宿主）。通信方式换成 postMessage，但对上层代码来说区别不大，仍然走 RPC 框架。

-   **辅助进程**：
    

-   **Shared Process**：VSCode有一个共享进程，是一个后台Node进程，不直接与UI对应，但提供共享服务。例如 Settings Sync、Crash Reporter、SSH代理等，目的是让多个窗口共用某些资源且避免影响主进程。渲染进程通过 IPC 与共享进程通信。共享进程通常在启动后一段时间延迟启动，不一定立即出现。
-   **Utility Process**：引入于 Sandbox 改造，把以前在渲染执行的一些耗时操作（如 Ripgrep 搜索）移到 Utility Process（Electron新特性）中 。Utility process类似shared，但更轻量，可以有多个，通常用于文件搜索、Git索引等密集型任务。
-   **GPU进程**：这是Electron/Chromium内部的，不由VSCode控制。负责GPU加速页面绘制，遇到显卡或驱动问题时GPU进程崩溃会影响界面，需要fallback软件渲染。
-   **Crashpad进程**：用于崩溃报告，在Windows/macOS跑着，不影响功能。

桌面VSCode进程模型：**主进程**启动**多个渲染进程窗口**和**一个扩展主机进程**（加上一些后台辅助进程），通过**IPC通信**协同完成IDE功能 。多窗口时，共享一个主进程和扩展宿主，每窗口一个渲染。

在**远程开发**场景下，架构更复杂：UI相关进程仍在本地，但扩展主机会在远程服务器上运行，通信通过socket隧道；文件服务也在远程。VSCode通过制定**server**部分实现，把扩展主机和部分服务放远程，这又是另一个主题。对于本地二次开发，重点关注本地架构即可。

### 6.2 服务调用流（从 UI 到数据处理的调用链）

理解VSCode架构的最后一块，我们描述一个典型的用户操作如何在系统内部流转。以**打开文件并编辑**这样一个常见场景为例：

![](vscode-%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97/v2-18e2fc544cf4c6c83bcb96acc20be847_1440w.jpg)

用户视角流程

1.  **用户操作**：用户在资源管理器（侧边栏）双击了一个文件 `test.py`。此刻：
    

-   Explorer侧边栏UI捕获到双击事件，调用注册的命令 `revealInEditor` 或类似命令去打开文件。实际上Explorer通过资源管理器视图的代码，直接调用了 `IEditorService.openEditor`，传入包含 URI 为 `test.py` 的输入。
-   （有时也可以是用户Ctrl+P搜索文件名回车，这走QuickOpen->EditorService.openEditor，同样的终点）

2\. **EditorService 打开文件**：

-   EditorService收到 openEditor 请求:

-   创建一个 `EditorInput` 对象对应 `test.py`。首先通过 `EditorResolverService` 检查是否有特殊处理（如自定义编辑器/二进制文件等）。这里为普通文本，则采用 TextResourceEditorInput。
-   EditorService决定在哪个 EditorGroup 打开。假设当前只有一个Group，则选它。如果文件已在某Tab打开过，且未关闭，EditorService可能检测到已有 EditorInput 实例缓存，选择 reuse 或 reveal 而不是新建。
-   调用 EditorGroupService.activeGroup.openEditor(EditorInput, options)。options由Explorer传入，比如 preview 模式（单击预览，双击固定打开）。

-   EditorGroupView 处理 openEditor:

-   如果传入editor已打开（group里有相同resource的tab），则切换到它并结束流程。
-   否则，需要创建新的 EditorPane 来显示:

-   通过 EditorResolver 找 EditorPane类型，这里是文本文件，默认为 TextFileEditor。
-   TextFileEditor extends EditorPane. 如果Group里之前没有实例，可以 instantiationService.createInstance(TextFileEditor).
-   EditorInput.resolve(): EditorPane.setInput中，会先调用 input.resolve() 获取真正内容。TextResourceEditorInput 的 resolve 方法利用 TextModelService -> FileService 读取文件内容，创建 TextModel。在resolve完成后返回一个 ITextEditorModel (包含 TextModel)。
-   EditorPane收到 model 后，将 model绑定到 Monaco Editor：TextFileEditor内部持有一个 CodeEditorWidget实例（Monaco editor）。它调用 codeEditor.setModel(textModel) 从而在编辑器UI中显示文件内容。
-   同时，EditorPane应用编辑器配置选项（如TabSize从 ConfigurationService 获取），并注册必要事件（例如监听 textModel 的 change事件以标记dirty，在input上标记）。

-   EditorGroupView 将新 EditorPane 加入它的 Tabs控件，UI上添加一个tab“test.py”。如果是预览状态，会标记斜体。
-   EditorService.openEditor 返回 EditorPane reference 或 undefined (common pattern, not heavily used).

3\. **用户看到文件内容**。现在用户开始编辑，比如插入一些文本：

-   Monaco Editor 在渲染进程处理键入，每次按键变成 EditOperation 作用于 TextModel。TextModel 内记录改动并触发 onDidChangeContent事件。
-   VSCode框架部分（Workbench) 通过 IWorkingCopyService 监听 TextModel 的 dirty 状态。当textModel第一次改动后，它对应的 TextFileEditorInput 就标记为 dirty。UI上tab会出现圆点提示未保存。
-   每次编辑，Monaco也触发 CursorPositionChanged 事件，StatusBar的 CursorPosition element监听此事件更新行列显示。
-   IntelliSense请求：当用户输入 `.` 时，Monaco触发 suggest控制器，如语言服务器已注册提供补全，会通过 ExtensionHost请求补全:

-   触发 ExtHostLanguageFeatures 提供 completionItems。Python语言一般由扩展提供（likely via Pyright or Jedi LS), extension host返回结果，通过 proxy MainThreadCompleionService 交给 Monaco suggest widget 显示。

-   这些联动通过 events和IPC异步处理，不阻塞编辑流畅性。

4\. **用户按Ctrl+S保存文件**：

-   Keybinding Service 捕获 Ctrl+S，发现绑定了 `workbench.action.files.save` 命令。
-   CommandService.executeCommand('workbench.action.files.save', resourceUri) 被调用。文件保存命令实现在 internal command handler:

-   它调用 `ITextFileService.save(uri)` 或如果有dirty editors without Uri maybe uses SaveAll.

-   TextFileService 核心逻辑（在 workbench/services/textfile):

-   找到对应的 TextFileEditorModel (textModel with file backing) via URI.
-   如果配置了保存时自动格式化或删除空格，此时可能会对文本模型应用编辑。
-   使用 FileService 执行写入：调用 FileService.writeFile(uri, updatedContent)。这通过 DiskFileSystemProvider 实际写入磁盘。
-   成功后，TextFileService 标记模型为未修改，触发 onDidSave 事件。

-   Workbench 监听 onDidSave:

-   移除标签上的修改指示器。
-   如果是临时名称为"Untitled-x"的新文件，保存后，EditorInput 会被替换为真实文件输入。
-   扩展主机也通过 ExtHostFileSystemEvent 获取文件保存事件，可能触发 onDidSaveTextDocument（用于格式化保存等扩展）。

5\. **扩展交互**：假设我们有Git扩展或Python扩展：

-   打开文件时，语言扩展看到 openTextDocument，如果语言服务器未启动则可能启动它
-   编辑时，Python 扩展可能通过语言服务器检查代码。检查结果（诊断信息）通过 vscode.languages.createDiagnosticCollection 发送到 VSCode。在主线程中，它被转发到 MarkerService，更新该 URI 的错误/警告标记。Workbench's Problems panel (监听 MarkerService 的面板) 更新以显示新的错误（如果有
-   Git 扩展监控文件变化：保存后，如果在 git 仓库中，它会标记文件为已修改。源代码管理视图会在"更改"下显示该文件。

6\. **用户关闭编辑器**：点击标签上 "X" 关闭按钮:

-   EditorGroupView 对该输入调用 closeEditor。.
-   如果文件已修改且自动保存关闭，VSCode 会提示保存确认（通过 dialogService），除非用户禁用。如果用户选择不保存：
-   extFileService 可能会备份修改的内容（热退出功能），然后释放模型。
-   EditorGroup 关闭 EditorPane，移除标签。
-   如果没有其他标签，可能显示空编辑器标签或欢迎页面。

这个流程串联起 UI事件 -> Service调用 -> Model更新 -> 事件广播 -> UI刷新 的链条。可以看出VSCode遵循典型的MVC思想：

-   **UI (View)** 通过调用服务或命令来执行动作，不直接操作数据。
-   **Service/Model (Model)** 执行业务逻辑和数据更改，通过事件通知变化。
-   **UI/Other (View/Others)** 监听事件更新自己，如状态栏、问题面板根据事件刷新显示。

再换一个例子简略说明**命令执行**和**IPC**：

-   用户按 F5（Run Debug）：

1.  Keybinding键盘绑定触发后调用 -> CommandService.execute 'workbench.action.debug.start'。
2.  DebugService.startDebugging() 被调用，检查当前活动的调试配置(launch.json)。
3.  如果没有调试适配器在运行，DebugService 会启动一个调试适配器进程(如果是由扩展提供则通过扩展主机启动，或者启动一个 Node 进程)。
4.  DebugSession 被初始化，通过 DebugContribution 显示 UI(调试工具栏、侧边面板)。
5.  扩展主机：如果调试适配器是作为扩展实现的(如 Node Debug 扩展)，扩展主机会启动它(可能作为单独进程)。
6.  调试开始运行，用户遇到断点时：

-   调试适配器(在扩展主机或独立进程中)通过 DAP 发送 StoppedEvent。
-   扩展主机(如果在进程中)通过 DebugSession 连接(使用 IPC)转发到主进程。
-   渲染进程中的 DebugService 接收事件，更新调试状态，触发 onDidStop。
-   调试面板 UI 刷新显示调用堆栈，变量视图通过 DebugService -> DebugAdapter(通过扩展主机调用)获取变量。

整个调试流程涉及主进程/渲染进程/扩展进程之间的 IPC 事件和请求通信。

通过这些例子，我们看到 VSCode内部各层之间的调用大多遵循**服务接口**或**命令**路径，而不同进程之间使用**消息通信**。这样设计带来的好处是：

-   增加功能时，只要实现新的服务或命令，然后UI通过调用它们即可，减少修改UI层代码的需求。
-   进程隔离保证错误局限在模块，不轻易崩溃整个应用。
-   开发者调试时，可以在服务边界、事件触发点进行逐步检查，比较清晰。

## 最后

总结VSCode架构特点：

-   广泛使用 TypeScript 接口和抽象层，方便二次开发者寻找扩展点。
-   核心功能通过 Contribution 注册，意味着**增删功能模块很方便**。我们可以基于VSCode构建定制IDE，添加我们需要的模块，剔除无用模块（通过不import相应contribution）。
-   强大的扩展API背后，其实也是核心各部分暴露出的契约，如果有必要，也能在内核层面利用这些契约扩展能力（正如前文cases所示）。

———结———

相关文档（多年前的）

-   [初探 vscode （一） | 混沌福王](https://link.zhihu.com/?target=https%3A//imwangfu.com/2022/01/vscode-intro-1.html)
-   [vscode 解析--如何维护海量模块依赖关系(一)|混沌福王](https://link.zhihu.com/?target=https%3A//imwangfu.com/2022/05/vscode-di1.html)
-   [vscode 解析--如何维护海量模块依赖关系(二)|混沌福王](https://link.zhihu.com/?target=https%3A//imwangfu.com/2022/05/vscode-di2.html)
