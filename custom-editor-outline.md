# Custom Editor Outline API

> **Proposed API** — requires `"enabledApiProposals": ["customEditorOutline"]` in your extension's `package.json`.
>
> Implements [vscode#97095](https://github.com/microsoft/vscode/issues/97095).

## What Was Done (VS Code Side)

A full proposed extension API was added so that extensions providing **Custom Editors** can also populate the **Outline view**, **Breadcrumbs**, and **Go to Symbol** quick-pick with their own tree of items — with support for active element tracking, reveal-on-click, context menus, and inline toolbar buttons.

All provider methods and events are scoped per document URI, so multiple editors of the same view type can be open simultaneously (e.g. split view) with independent outlines.

### Architecture Overview

```
┌──────────────────────┐          ┌─────────────────────────────┐
│   Extension Host     │          │   Main Thread (renderer)    │
│                      │   RPC    │                             │
│ ExtHostCustomEditor  │◄────────►│ MainThreadCustomEditor      │
│   Outline            │          │   Outline                   │
│                      │          │         │                   │
│ Your extension calls │          │         ▼                   │
│ registerCustomEditor │          │ ICustomEditorOutline        │
│ OutlineProvider(...) │          │   ProviderService           │
│                      │          │   (routes by viewType+URI)  │
└──────────────────────┘          │         │                   │
                                  │         ▼                   │
                                  │ CustomEditorExtensionOutline│
                                  │   (IOutline<> per editor)   │
                                  │         │                   │
                                  │         ▼                   │
                                  │   Outline Pane / Breadcrumbs│
                                  └─────────────────────────────┘
```

### Files Created / Modified

| File | Purpose |
|------|---------|
| `src/vscode-dts/vscode.proposed.customEditorOutline.d.ts` | Proposed API types (`CustomEditorOutlineItem`, `CustomEditorOutlineProvider`, `window.registerCustomEditorOutlineProvider`) |
| `src/vs/workbench/api/common/extHost.protocol.ts` | Protocol shapes (`MainThreadCustomEditorOutlineShape`, `ExtHostCustomEditorOutlineShape`, `ICustomEditorOutlineItemDto`) and proxy identifiers |
| `src/vs/workbench/api/common/extHostCustomEditorOutline.ts` | Extension host implementation — converts items to DTOs and forwards to main thread |
| `src/vs/workbench/api/browser/mainThreadCustomEditorOutline.ts` | Main thread handler — manages provider service, registers singleton |
| `src/vs/workbench/contrib/customEditor/common/customEditorOutlineService.ts` | `ICustomEditorOutlineProviderService` interface and `ICustomEditorOutlineItemDto` DTO type |
| `src/vs/workbench/contrib/customEditor/browser/customEditorOutline.ts` | `IOutline` implementation with custom tree renderer, context key binding, toolbar, and the `IOutlineCreator` |
| `src/vs/workbench/api/common/extHost.api.impl.ts` | Wired `registerCustomEditorOutlineProvider` onto the `window` namespace |
| `src/vs/platform/extensions/common/extensionsApiProposals.ts` | Registered the `customEditorOutline` proposal name |
| `src/vs/platform/actions/common/actions.ts` | Added `MenuId.CustomEditorOutlineActionMenu` (toolbar) and `MenuId.CustomEditorOutlineContext` (right-click) |
| `src/vs/workbench/services/actions/common/menusExtensionPoint.ts` | Registered `customEditor/outline/toolbar` and `customEditor/outline/context` as extension menu contribution points |
| `src/vs/workbench/services/outline/browser/outline.ts` | Added `contextMenuId` and `getContextKeyOverlay` to `IOutlineListConfig` |
| `src/vs/workbench/contrib/outline/browser/outlinePane.ts` | Added right-click context menu support with context key overlay |
| `src/vs/workbench/contrib/customEditor/browser/customEditor.contribution.ts` | Added import to register the outline creator |
| `src/vs/workbench/api/browser/extensionHost.contribution.ts` | Added import for `mainThreadCustomEditorOutline` |

---

## How to Use It in Your Extension

### 1. Enable the Proposed API

In your extension's `package.json`, add:

```json
{
  "enabledApiProposals": ["customEditorOutline"]
}
```

### 2. Register the Outline Provider

Call `vscode.window.registerCustomEditorOutlineProvider(viewType, provider)` where `viewType` matches your custom editor's `viewType` from `package.json`.

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const outlineProvider = new MyOutlineProvider();

  context.subscriptions.push(
    vscode.window.registerCustomEditorOutlineProvider(
      'myExtension.myCustomEditor',   // must match your customEditors viewType
      outlineProvider,
    )
  );
}
```

### 3. Implement `CustomEditorOutlineProvider`

One provider is registered per `viewType`, but all methods receive a `Uri` so the provider can manage state for multiple open documents independently.

```typescript
class MyOutlineProvider implements vscode.CustomEditorOutlineProvider {

  // --- Events (scoped per document URI) ---

  private readonly _onDidChangeOutline = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChangeOutline = this._onDidChangeOutline.event;

  private readonly _onDidChangeActiveItem = new vscode.EventEmitter<{ uri: vscode.Uri; itemId: string | undefined }>();
  readonly onDidChangeActiveItem = this._onDidChangeActiveItem.event;

  // --- Per-document state ---

  private readonly _state = new Map<string, {
    items: vscode.CustomEditorOutlineItem[];
    webview: vscode.Webview;
  }>();

  // --- Provider methods ---

  provideOutline(uri: vscode.Uri, token: vscode.CancellationToken): vscode.CustomEditorOutlineItem[] {
    return this._state.get(uri.toString())?.items ?? [];
  }

  revealItem(uri: vscode.Uri, itemId: string): void {
    // Called when the user clicks an outline node.
    // Post a message to the correct webview to scroll to / select the element.
    this._state.get(uri.toString())?.webview?.postMessage({
      type: 'revealElement',
      id: itemId,
    });
  }

  // --- Methods you call from your editor provider ---

  /** Call from resolveCustomTextEditor to register a webview for a document */
  setWebview(uri: vscode.Uri, webview: vscode.Webview): void {
    const existing = this._state.get(uri.toString());
    if (existing) {
      existing.webview = webview;
    } else {
      this._state.set(uri.toString(), { items: [], webview });
    }
  }

  /** Call when a document's editor is disposed */
  removeDocument(uri: vscode.Uri): void {
    this._state.delete(uri.toString());
  }

  /** Call when the document structure changes */
  updateStructure(uri: vscode.Uri, items: vscode.CustomEditorOutlineItem[]): void {
    const state = this._state.get(uri.toString());
    if (state) {
      state.items = items;
    }
    this._onDidChangeOutline.fire(uri);   // triggers a refresh for this document's outline
  }

  /** Call when the user selects/focuses a different element in the webview */
  setActiveElement(uri: vscode.Uri, itemId: string | undefined): void {
    this._onDidChangeActiveItem.fire({ uri, itemId });   // highlights the item in the Outline
  }
}
```

### 4. Build Outline Items

Each `CustomEditorOutlineItem` has:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | ✅ | Unique identifier. Used for active tracking and reveal. |
| `label` | `string` | ✅ | Display text in the outline tree. |
| `detail` | `string` | | Secondary text shown after the label. |
| `tooltip` | `string` | | Tooltip on hover. |
| `icon` | `ThemeIcon` | | Icon, e.g. `new vscode.ThemeIcon('symbol-class')`. |
| `contextValue` | `string` | | Used for menu `when` clauses (bound to `customEditorOutlineItem`). |
| `children` | `CustomEditorOutlineItem[]` | | Nested child items to form a tree. |

Example:

```typescript
const items: vscode.CustomEditorOutlineItem[] = [
  {
    id: 'page-1',
    label: 'Page 1',
    icon: new vscode.ThemeIcon('file'),
    contextValue: 'page',
    children: [
      {
        id: 'button-1',
        label: 'Submit Button',
        icon: new vscode.ThemeIcon('symbol-event'),
        contextValue: 'element',
      },
      {
        id: 'textbox-1',
        label: 'Name Input',
        icon: new vscode.ThemeIcon('symbol-field'),
        contextValue: 'element',
      },
    ],
  },
];
```

### 5. Connect Your Webview

Pass the document URI when calling outline provider methods from your custom editor:

```typescript
// In your CustomTextEditorProvider.resolveCustomTextEditor():
const uri = document.uri;

outlineProvider.setWebview(uri, webviewPanel.webview);

webviewPanel.webview.onDidReceiveMessage(message => {
  switch (message.type) {
    case 'structureChanged':
      outlineProvider.updateStructure(uri, message.items);
      break;
    case 'selectionChanged':
      outlineProvider.setActiveElement(uri, message.elementId);
      break;
  }
});

// Clean up when the editor is disposed
webviewPanel.onDidDispose(() => {
  outlineProvider.removeDocument(uri);
});
```

And your webview should listen for reveal requests:

```javascript
// Inside the webview
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'revealElement') {
    const element = document.getElementById(message.id);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectElement(element); // your own selection logic
  }
});
```

### 6. Add Toolbar Buttons and Context Menus

The `contextValue` property on each outline item is bound to the context key `customEditorOutlineItem`. You can use this in `when` clauses to contribute actions to two separate menus:

| Menu ID | Purpose |
|---------|---------|
| `customEditor/outline/toolbar` | Inline icon buttons and "..." overflow menu on each row |
| `customEditor/outline/context` | Right-click context menu on each row |

This separation lets you configure completely different actions for the toolbar and the context menu. The same command can appear in both menus.

#### 6a. Declare Commands

```json
{
  "contributes": {
    "commands": [
      { "command": "myExt.deleteElement",    "title": "Delete",    "icon": "$(trash)" },
      { "command": "myExt.addChild",         "title": "Add Child", "icon": "$(add)" },
      { "command": "myExt.renameElement",    "title": "Rename" },
      { "command": "myExt.duplicateElement", "title": "Duplicate" }
    ]
  }
}
```

#### 6b. Contribute to Menus

Within `customEditor/outline/toolbar`, items in the `inline` group become always-visible icon buttons. Items outside `inline` go into the "..." overflow dropdown.

All items in `customEditor/outline/context` appear in the right-click context menu.

```json
{
  "contributes": {
    "menus": {
      "customEditor/outline/toolbar": [
        {
          "command": "myExt.deleteElement",
          "when": "customEditorOutlineItem == 'element'",
          "group": "inline"
        },
        {
          "command": "myExt.addChild",
          "when": "customEditorOutlineItem == 'container'",
          "group": "inline"
        }
      ],
      "customEditor/outline/context": [
        {
          "command": "myExt.renameElement",
          "when": "customEditorOutlineItem =~ /element|container/"
        },
        {
          "command": "myExt.duplicateElement",
          "when": "customEditorOutlineItem == 'element'"
        },
        {
          "command": "myExt.deleteElement",
          "when": "customEditorOutlineItem == 'element'"
        }
      ]
    }
  }
}
```

#### 6c. Register Command Handlers

```typescript
export function activate(context: vscode.ExtensionContext) {
  // ... register outline provider (see above) ...

  context.subscriptions.push(
    vscode.commands.registerCommand('myExt.deleteElement', () => {
      webviewPanel.webview.postMessage({ type: 'deleteSelected' });
    }),
    vscode.commands.registerCommand('myExt.renameElement', () => {
      webviewPanel.webview.postMessage({ type: 'renameSelected' });
    }),
  );
}
```

#### Where Actions Appear

| Menu ID | `group` value | Appearance |
|---------|---------------|------------|
| `customEditor/outline/toolbar` | `"inline"` | Icon button on the **right side** of the outline row (visible on hover) |
| `customEditor/outline/toolbar` | `"inline@1"`, `"inline@2"` | Inline buttons with explicit ordering |
| `customEditor/outline/toolbar` | *(omitted or other)* | Entry in the **"..." overflow** dropdown |
| `customEditor/outline/context` | *(any)* | Entry in the **right-click context menu** |

---

## Full Minimal Example

### `package.json`

```json
{
  "name": "visual-designer-outline-example",
  "version": "0.0.1",
  "engines": { "vscode": "^1.113.0" },
  "enabledApiProposals": ["customEditorOutline"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "customEditors": [{
      "viewType": "designer.visualEditor",
      "displayName": "Visual Designer",
      "selector": [{ "filenamePattern": "*.design" }]
    }],
    "menus": {
      "customEditor/outline/toolbar": [
        {
          "command": "designer.deleteElement",
          "when": "customEditorOutlineItem == 'widget'",
          "group": "inline"
        }
      ],
      "customEditor/outline/context": [
        {
          "command": "designer.deleteElement",
          "when": "customEditorOutlineItem == 'widget'"
        }
      ]
    },
    "commands": [
      { "command": "designer.deleteElement", "title": "Delete", "icon": "$(trash)" }
    ]
  }
}
```

### `src/extension.ts`

```typescript
import * as vscode from 'vscode';

let outlineProvider: DesignerOutlineProvider;

export function activate(context: vscode.ExtensionContext) {
  outlineProvider = new DesignerOutlineProvider();

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'designer.visualEditor',
      new DesignerEditorProvider(context, outlineProvider),
    ),
    vscode.window.registerCustomEditorOutlineProvider(
      'designer.visualEditor',
      outlineProvider,
    ),
    vscode.commands.registerCommand('designer.deleteElement', () => {
      vscode.window.showInformationMessage('Delete element');
    }),
  );
}

// ─── Outline Provider ──────────────────────────────────────────

interface DocumentState {
  items: vscode.CustomEditorOutlineItem[];
  webview: vscode.Webview;
}

class DesignerOutlineProvider implements vscode.CustomEditorOutlineProvider {
  private readonly _onDidChangeOutline = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChangeOutline = this._onDidChangeOutline.event;

  private readonly _onDidChangeActiveItem = new vscode.EventEmitter<{ uri: vscode.Uri; itemId: string | undefined }>();
  readonly onDidChangeActiveItem = this._onDidChangeActiveItem.event;

  private readonly _documents = new Map<string, DocumentState>();

  setWebview(uri: vscode.Uri, webview: vscode.Webview): void {
    const key = uri.toString();
    const existing = this._documents.get(key);
    if (existing) {
      existing.webview = webview;
    } else {
      this._documents.set(key, { items: [], webview });
    }
  }

  removeDocument(uri: vscode.Uri): void {
    this._documents.delete(uri.toString());
  }

  updateItems(uri: vscode.Uri, items: vscode.CustomEditorOutlineItem[]): void {
    const state = this._documents.get(uri.toString());
    if (state) {
      state.items = items;
    }
    this._onDidChangeOutline.fire(uri);
  }

  setActive(uri: vscode.Uri, itemId: string | undefined): void {
    this._onDidChangeActiveItem.fire({ uri, itemId });
  }

  provideOutline(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.CustomEditorOutlineItem[] {
    return this._documents.get(uri.toString())?.items ?? [];
  }

  revealItem(uri: vscode.Uri, itemId: string): void {
    this._documents.get(uri.toString())?.webview?.postMessage({ type: 'reveal', id: itemId });
  }
}

// ─── Custom Editor Provider ────────────────────────────────────

class DesignerEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outline: DesignerOutlineProvider,
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const uri = document.uri;
    webviewPanel.webview.options = { enableScripts: true };
    this.outline.setWebview(uri, webviewPanel.webview);

    // Provide some initial outline items
    this.outline.updateItems(uri, [
      {
        id: 'root',
        label: 'Canvas',
        icon: new vscode.ThemeIcon('layout'),
        contextValue: 'canvas',
        children: [
          {
            id: 'btn-1',
            label: 'Button',
            icon: new vscode.ThemeIcon('symbol-event'),
            contextValue: 'widget',
          },
          {
            id: 'input-1',
            label: 'Text Input',
            icon: new vscode.ThemeIcon('symbol-field'),
            contextValue: 'widget',
          },
        ],
      },
    ]);

    // Listen for webview messages
    webviewPanel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'selectionChanged') {
        this.outline.setActive(uri, msg.id);
      }
    });

    // Clean up when the editor is disposed
    webviewPanel.onDidDispose(() => {
      this.outline.removeDocument(uri);
    });

    webviewPanel.webview.html = `<!DOCTYPE html>
      <html><body>
        <h1>Visual Designer</h1>
        <p>This is a placeholder for your visual designer webview.</p>
        <script>
          const vscode = acquireVsCodeApi();
          window.addEventListener('message', e => {
            if (e.data.type === 'reveal') {
              console.log('Reveal element:', e.data.id);
            }
          });
        </script>
      </body></html>`;
  }
}
```

---

## Summary of Features

| Feature | How It Works |
|---------|-------------|
| **Outline tree** | `provideOutline(uri)` returns your items → they appear in the Outline view |
| **Multi-editor support** | Each method receives a `Uri`, so multiple editors of the same type get independent outlines |
| **Active element tracking** | Fire `onDidChangeActiveItem` with `{ uri, itemId }` → that node gets highlighted |
| **Reveal on click** | User clicks outline node → `revealItem(uri, id)` is called → you scroll the correct webview |
| **Breadcrumbs** | Automatically built from the active item's parent chain |
| **Go to Symbol** | Items appear in the Ctrl+Shift+O quick-pick |
| **Inline buttons** | Contribute to `customEditor/outline/toolbar` with `"group": "inline"` |
| **Overflow menu** | Contribute to `customEditor/outline/toolbar` without `inline` group |
| **Context menu** | Contribute to `customEditor/outline/context` |
| **When clauses** | Use `customEditorOutlineItem == 'yourContextValue'` to scope actions |
