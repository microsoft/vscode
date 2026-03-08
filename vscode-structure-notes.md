# VS Code Structure Notes - Nexora IDE

## Overview
This document contains findings from studying the VS Code fork structure for Nexora IDE development.

---

## Folder Structure

```
D:\Semesters\FYP\vscode\
?
??? src/                          # CORE SOURCE CODE
?   ??? vs/                       # Main VS Code source
?       ??? base/                 # Base utilities, UI components
?       ??? platform/             # Platform services (file, storage, etc.)
?       ??? editor/               # Monaco editor (the text editor)
?       ??? workbench/            # ? THE MAIN UI - WHERE WE'LL WORK
?       ?   ??? browser/          # Browser-specific workbench
?       ?   ??? contrib/          # ? Built-in features (terminal, debug, etc.)
?       ?   ??? services/         # Workbench services
?       ?   ??? api/              # Extension API implementation
?       ??? code/                 # Electron main process
?
??? extensions/                   # ? BUILT-IN EXTENSIONS
?   ??? git/                      # Git integration
?   ??? typescript-language-features/
?   ??? markdown-language-features/
?   ??? ...                       # Study these as examples
?
??? product.json                  # ? BRANDING - name, icons, etc.
??? package.json                  # Dependencies & metadata
??? build/                        # Build scripts
??? resources/                    # Icons, images
```

---

## Key Directories Explained

### `src/vs/workbench/` - The Main UI
This is where Nexora's custom UI will be built:
- **`browser/`** - Core workbench UI components
- **`contrib/`** - Built-in features (each feature has its own folder)
- **`services/`** - Business logic and state management
- **`api/`** - Extension API implementation

### `src/vs/workbench/browser/parts/`
UI layout components:
- **`activitybar/`** - Left sidebar icons (Explorer, Search, etc.)
- **`sidebar/`** - Sidebar panels content
- **`editor/`** - Editor area management
- **`panel/`** - Bottom panel (Terminal, Problems, etc.)
- **`statusbar/`** - Bottom status bar

### `src/vs/workbench/contrib/`
Examples of built-in features:
- **`files/`** - File explorer implementation
- **`search/`** - Search panel
- **`terminal/`** - Integrated terminal
- **`scm/`** - Source control
- **`debug/`** - Debugger

Each follows the pattern:
1. `*.contribution.ts` - Registers the feature
2. `*View.ts` or `*Viewlet.ts` - UI component
3. `*Service.ts` - Business logic

---

## Key Files for Nexora Development

| File | Purpose | Nexora Usage |
|------|---------|--------------|
| `product.json` | Product branding (name, icons, URLs) | Already updated with "UAIOS/Nexora" branding |
| `package.json` | Dependencies and metadata | Updated with Nexora team info |
| `src/vs/workbench/browser/workbench.ts` | Main workbench entry point | Study to understand UI initialization |
| `src/vs/workbench/contrib/*/` | Built-in feature examples | Templates for custom features |
| `extensions/*/package.json` | Extension manifests | Learn contribution points |

---

## How to Add Custom Features to Nexora

### 1. Add a New Activity Bar Icon
- Navigate to: `src/vs/workbench/browser/parts/activitybar/`
- Register in contribution file

### 2. Add a New Sidebar Panel
- Create folder in: `src/vs/workbench/contrib/nexora-*`
- Implement:
  - `nexora*.contribution.ts` - Registration
  - `nexora*View.ts` - UI component
  - `nexora*Service.ts` - Business logic

### 3. Register Custom UI
- Use `Registry.as()` to register viewlets, panels, commands
- Use `registerSingleton()` for services
- Use `MenuRegistry` for menu items

---

## Extension API for Nexora

### Available APIs We'll Use

| API | What It Does | Nexora Feature |
|-----|-------------|----------------|
| `vscode.window` | Windows, editors, panels | Chat Panel UI |
| `vscode.workspace` | Files, folders, settings | Project context |
| `vscode.commands` | Register/execute commands | AI orchestration commands |
| `vscode.webview` | Custom HTML/JS panels | Rich workflow UI |
| `vscode.TreeView` | Tree-based views | Platform Browser |
| `vscode.languages` | Language features | Code intelligence |
| `vscode.debug` | Debugger API | Debugging workflows |
| `vscode.tasks` | Task execution | Agent task execution |
| `vscode.extensions` | Extension management | Plugin ecosystem |
| `vscode.env` | Environment info | Platform detection |

---

## Built-in Extension Examples Studied

### Simple Extension: `extensions/markdown-basics/`
- Language registration
- Syntax highlighting (TextMate grammars)
- Minimal `package.json` structure

### Complex Extension: `extensions/git/`
- Custom sidebar panels (`contributes.views`)
- Multiple commands (`contributes.commands`)
- Activation events
- Service architecture

**Key Takeaway:** Git extension structure is the best template for Nexora's agent orchestration extension.

---

## Contribution Points (from package.json)

Extensions can contribute:
- `languages` - New programming languages
- `grammars` - Syntax highlighting
- `snippets` - Code snippets
- `commands` - Command palette commands
- `views` - Custom sidebar/panel views
- `viewsContainers` - New activity bar sections
- `keybindings` - Keyboard shortcuts
- `menus` - Context menu items
- `configuration` - Settings

---

## Week 2 Preparation: Nexora Extension Architecture

### Planned Extensions for Nexora

| Extension | Purpose | Priority |
|-----------|---------|----------|
| `nexora-chat` | AI Chat Panel | Week 2 |
| `nexora-platform-browser` | Platform registry UI | Week 2 |
| `nexora-orchestrator` | Workflow orchestration | Week 3 |
| `nexora-mcp` | MCP protocol integration | Week 4 |

### Key Files for Extension Development

```
extensions/nexora-chat/           # Week 2 target
├── package.json                  # Extension manifest
├── src/
│   ├── extension.ts              # Entry point
│   ├── chatPanel.ts              # Webview-based chat UI
│   └── services/
│       └── aiService.ts          # LLM communication
```

### Webview API for Rich UI

For the Chat Panel and Platform Browser, we'll use VS Code's Webview API:

```typescript
// Create a webview panel
const panel = vscode.window.createWebviewPanel(
  'nexoraChat',           // Panel ID
  'Nexora Chat',          // Title
  vscode.ViewColumn.One,  // Position
  {
    enableScripts: true,  // Allow JavaScript
    localResourceRoots: [extensionUri]
  }
);

// Set HTML content
panel.webview.html = getWebviewContent();

// Handle messages from webview
panel.webview.onDidReceiveMessage(message => {
  if (message.command === 'sendMessage') {
    // Handle AI chat message
  }
});
```

---

## Development Workflow Summary

1. **Terminal 1:** `yarn watch` (continuous compilation)
2. **Terminal 2:** `.\scripts\code.bat` (launch Nexora)
3. **Edit code** → Wait for recompile → `Ctrl+Shift+P` → "Reload Window"
4. **Debug extensions:** Use "Launch Extension" config in `.vscode/launch.json`

---

## Git Branch Strategy

- `main` - Stable releases
- `Week1-Atif` - Week 1 setup (current)
- `week-2-chat-panel` - Chat panel development
- `week-2-platform-browser` - Platform browser development

---

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Webview API Guide](https://code.visualstudio.com/api/extension-guides/webview)
- [Source Code Organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- `themes` - Color themes
- `icons` - Icon themes

**For Nexora:** Focus on `views`, `viewsContainers`, `commands`, and `webview` for AI chat/orchestration UI.

---

## Development Workflow

### Terminal 1: Watch Mode (Auto-compile)
```powershell
cd D:\Semesters\FYP\vscode
npm run watch
```
Keeps running in background, recompiles on file changes.

### Terminal 2: Run Nexora IDE
```powershell
cd D:\Semesters\FYP\vscode
.\scripts\code.bat
```
After making changes, reload window (Ctrl+Shift+P ? "Reload Window") instead of restarting.

---

## Next Steps for Week 2

1. **Create Nexora Chat Panel**
   - Location: `src/vs/workbench/contrib/nexoraChat/`
   - Contribution: Custom webview panel

2. **Create Platform Browser**
   - Location: `src/vs/workbench/contrib/nexoraPlatforms/`
   - Contribution: TreeView in sidebar

3. **Add Activity Bar Icon**
   - Register in: `src/vs/workbench/browser/parts/activitybar/`
   - Icon: Custom Nexora logo

4. **Extension Host Integration**
   - Connect to backend orchestration system
   - MCP protocol integration

---

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Source Organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [How to Contribute to VS Code](https://github.com/microsoft/vscode/wiki/How-to-Contribute)

---

**Document Created:** Week 1 - Day 1-2  
**Last Updated:** [Current Date]  
**Team:** Muhammad Atif & Talha Asif
