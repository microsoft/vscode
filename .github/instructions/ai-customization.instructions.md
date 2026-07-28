---
description: Architecture documentation for VS Code AI Customization view. Use when working in `src/vs/workbench/contrib/chat/browser/aiCustomization`
applyTo: 'src/vs/workbench/contrib/chat/browser/aiCustomization/**'
---

# AI Customization View

The AI Customization view provides a unified view for discovering and managing AI customization 'artifacts' (customizations that augment LLM prompts or behavior).

Examples of these include: Custom Agents, Skills, Instructions, and Prompts. It surfaces prompt files that are typically hidden in `.github/` folders, user data directories, workspace settings, or exposed via extensions.

## Overview

The view displays a hierarchical tree structure:

```
AI Customization (View Container)
└── AI Customization (Tree View)
    ├── Custom Agents (.agent.md files)
    │   ├── Workspace
    │   │   └── agent files...
    │   ├── User
    │   │   └── agent files...
    │   └── Extensions
    │       └── agent files...
    ├── Skills (SKILL.md files)
    │   └── (same storage structure)
    ├── Instructions (.instructions.md files)
    │   └── (same storage structure)
    └── Prompts (.prompt.md files)
        └── (same storage structure)
```

**Key Features:**
- 3-level tree hierarchy: Category → Storage Group → Files
- Auto-expands category nodes on initial load and refresh to show storage groups
- Symbol-based root element for type safety
- Double-click to open files in editor
- Context menu support with Open and Run Prompt actions
- Toolbar actions: New dropdown, Refresh, Collapse All
- Skill names parsed from frontmatter with fallback to folder name
- Responsive to IPromptsService change events

## File Structure

All files are located in `src/vs/workbench/contrib/chat/browser/aiCustomization/`:

```
aiCustomization/
├── aiCustomization.ts              # Constants, IDs, and MenuIds
├── aiCustomization.contribution.ts # View registration and actions
├── aiCustomizationViews.ts         # Tree view pane implementation
├── aiCustomizationIcons.ts         # Icon registrations
└── media/
    └── aiCustomization.css         # Styling
```

## Key Constants (aiCustomization.ts)

- `AI_CUSTOMIZATION_VIEWLET_ID`: View container ID for sidebar
- `AI_CUSTOMIZATION_VIEW_ID`: Unified tree view ID
- `AI_CUSTOMIZATION_STORAGE_ID`: State persistence key
- `AICustomizationItemMenuId`: Context menu ID
- `AICustomizationNewMenuId`: New item submenu ID

## View Registration (aiCustomization.contribution.ts)

### View Container

Register sidebar container with:
- ViewPaneContainer with `mergeViewWithContainerWhenSingleView: true`
- Keyboard shortcut: Cmd+Shift+I
- Location: Sidebar
- Visibility: `when: ChatContextKeys.enabled` (respects AI disable setting)

### View Descriptor

Register single unified tree view:
- Constructor: `AICustomizationViewPane`
- Toggleable and moveable
- Gated by `ChatContextKeys.enabled`

### Welcome Content

Shows markdown links to create new items when tree is empty.

## Toolbar Actions

**New Item Dropdown** - Submenu in view title:
- Add icon in navigation group
- Submenu contains: New Agent, New Skill, New Instructions, New Prompt
- Each opens PromptFilePickers to guide user through creation

**Refresh** - ViewAction that calls `view.refresh()`

**Collapse All** - ViewAction that calls `view.collapseAll()`

All actions use `ViewAction<AICustomizationViewPane>` pattern and are gated by `when: view === AI_CUSTOMIZATION_VIEW_ID`.

## Tree View Implementation (aiCustomizationViews.ts)

### Tree Item Types

Discriminated union with `type` field:

**ROOT_ELEMENT** - Symbol marker for type-safe root

**IAICustomizationTypeItem** (`type: 'category'`)
- Represents: Custom Agents, Skills, Instructions, Prompts
- Contains: label, promptType, icon

**IAICustomizationGroupItem** (`type: 'group'`)
- Represents: Workspace, User, Extensions
- Contains: label, storage, promptType, icon

**IAICustomizationFileItem** (`type: 'file'`)
- Represents: Individual prompt files
- Contains: uri, name, description, storage, promptType

### Data Source

`UnifiedAICustomizationDataSource` implements `IAsyncDataSource`:

**getChildren logic:**
- ROOT → 4 categories (agent, skill, instructions, prompt)
- category → storage groups (workspace, user, extensions) that have items
- group → files from `promptsService.listPromptFilesForStorage()` or `findAgentSkills()`

**Skills special handling:** Uses `findAgentSkills()` to get names from frontmatter instead of filenames

### Tree Renderers

Three specialized renderers for category/group/file items:
- **Category**: Icon + bold label
- **Group**: Uppercase label with descriptionForeground color
- **File**: Icon + name with tooltip

### View Pane

`AICustomizationViewPane extends ViewPane`:

**Injected services:**
- IPromptsService - data source
- IEditorService - open files
- IMenuService - context menus

**Initialization:**
1. Subscribe to `onDidChangeCustomAgents` and `onDidChangeSlashCommands` events
2. Create WorkbenchAsyncDataTree with 3 renderers and data source
3. Register handlers: `onDidOpen` (double-click) → open file, `onContextMenu` → show menu
4. Set input to ROOT_ELEMENT and auto-expand categories

**Auto-expansion:**
- After setInput, iterate root children and expand each category
- Reveals storage groups without user interaction
- Applied on both initial load and refresh

**Public API:**
- `refresh()` - Reload tree and re-expand categories
- `collapseAll()` - Collapse all nodes
- `expandAll()` - Expand all nodes

## Context Menu Actions

Menu ID: `AICustomizationItemMenuId`

**Actions:**
- **Open** - Opens file in editor using IEditorService
- **Run Prompt** - Only for prompt files, invokes chat with prompt

**URI handling:** Actions must handle both URI objects and serialized strings
- Check `URI.isUri(context)` first
- Parse string variants with `URI.parse()`

**Context passing:**
- Serialize context as `{ uri: string, name: string, promptType: PromptsType }`
- Use `shouldForwardArgs: true` in getMenuActions
- Only show context menu for file items (not categories/groups)

## Icons (aiCustomizationIcons.ts)

Themed icons using `registerIcon(id, codicon, label)`:

**View/Types:**
- aiCustomizationViewIcon - Codicon.sparkle
- agentIcon - Codicon.copilot
- skillIcon - Codicon.lightbulb
- instructionsIcon - Codicon.book
- promptIcon - Codicon.bookmark

**Storage:**
- workspaceIcon - Codicon.folder
- userIcon - Codicon.account
- extensionIcon - Codicon.extensions

## Styling (media/aiCustomization.css)

**Layout:** Full height view and tree container

**Tree items:** Flex layout with 16px icon + text, ellipsis overflow

**Categories:** Bold font-weight

**Groups:** Uppercase, small font (11px), letter-spacing, descriptionForeground color

## Integration Points

**IPromptsService:**
- `listPromptFilesForStorage(type, storage)` - Get files for a type/storage combo
- `findAgentSkills()` - Get skills with names parsed from frontmatter
- `onDidChangeCustomAgents` - Refresh on agent changes
- `onDidChangeSlashCommands` - Refresh on command changes

**PromptsType enum:** `instructions | prompt | agent | skill`

**PromptsStorage enum:** `local` (workspace) | `user` | `extension`

**AI Feature Gating:** View gated by `ChatContextKeys.enabled` (respects `chat.disableAIFeatures` setting)

**Registration:** Import `./aiCustomization/aiCustomization.contribution.js` in `chat.contribution.ts`

---

*Update this file when making architectural changes to the AI Customization view.*
