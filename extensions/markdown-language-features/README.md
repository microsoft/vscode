# Language Features for Markdown files

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

See [Markdown in Visual Studio Code](https://code.visualstudio.com/docs/languages/markdown) to learn about the features of this extension.

### Rich editor RPC

The rich editor uses a private point-to-point `@vscode/hubrpc` connection between
the extension host and webview. Shared runtime-validated interfaces in
`src/preview/markdownEditorProtocol.ts` define document edits, commands, comments,
diff markers, highlighting, rich links, and embedded-editor routing. No global
Hub or capability service is required.

The interfaces use `zod/mini` to retain runtime validation and schema hashing
without bundling Zod's full API and locale tables. HubRPC and Zod are development
dependencies: the desktop extension, browser extension, and rich-editor builds
bundle the runtime code they use.

Embedded web-editor support is loaded on demand when a fenced block is rendered
and code-block providers are registered. Until loading completes, blocks use
their normal rendering. Provider updates and completed loading refresh the
blocks; the adapter still owns provider selection. Load failures are reported
through the existing code-block diagnostics and can be retried by reopening the
editor.

The `TextDocument` remains authoritative: local edits use the existing epoch
queue and `WorkspaceEdit`, external changes replace the renderer mirror, and
history commands drain accepted edits before invoking host undo/redo. Each
webview generation has its own secret-authenticated transport and connection;
reload/disposal closes pending requests and detaches listeners. Nested code
block editors do not receive this secret and keep their separately sandboxed
protocols; only their opaque host-transport payloads cross named RPC methods.

### Rich editor rename

In an editable Markdown rich editor, put the caret on a target supported by an
installed rename provider and press **F2**, or run
**Markdown Editor: Rename Symbol**. Enter applies the provider's workspace edit,
including references in other files; Escape cancels. The widget suspends the rich
editor's native text input while focused and restores focus when dismissed.
The exact range returned by the prepare-rename provider stays highlighted while
the widget is open, without changing the document selection. This subtle
highlight stays visible while the editor's painted caret is hidden; the native
input caret remains visible. Provider error messages are preserved verbatim.

Rename uses `vscode.prepareRename` and `vscode.executeDocumentRenameProvider`
against the existing authoritative document. The host drains accepted edits and
maps renderer offsets through line/character positions, including CRLF documents.
Prepared sessions are invalidated by cancellation, reload, or disposal, and
document versions are checked again before applying provider results. Provider
errors and rejected workspace edits are displayed rather than treated as success.
Cancellation prevents application until the workspace edit has been dispatched;
an edit already being applied is undone through the normal undo command.

### Rich editor diagnostics and completion

Diagnostics from all registered collections are rendered using the code editor's
squiggle geometry and severity theme colors. Hints use its three-dot marker.
Document and diagnostic changes refresh the overlays; hovering a marked range
shows a themed, selectable hover with the message, source, and code. Diagnostic
code links open through the host. The hover stays open while the pointer is
inside it and dismisses on Escape, scrolling, or document changes. It does not
yet include related-information navigation, quick fixes, or general language
provider hovers. Other extensions can publish diagnostics
without any rich-editor-specific API.

**Pull-diagnostics follow-up:** the currently installed `vscode-languageclient`
9.x does not treat custom-editor tabs as visible. The built-in Markdown validator
therefore does not request diagnostics for a rich-editor-only tab, even with
`markdown.validate.enabled` enabled. Opening the same document in a text-editor
tab in the same window allows the client to publish diagnostics, which the rich
editor can then display. Other pull-based providers likewise need a client that
recognizes custom tabs.

Upgrade the Markdown extension to `vscode-languageclient` 10.1.2 or later, whose
visibility tracking includes `TabInputCustom`, and validate both desktop and
browser language features. Until that follow-up, this integration displays
published diagnostic collections but does not add a separate Markdown-only
pull loop or duplicate the validator.

Press **Ctrl+Space**, or run **Markdown Editor: Trigger Suggest**, to query the
existing completion providers. Typing also requests suggestions when
`editor.quickSuggestions.other` is enabled. The isolated observable widget uses
VS Code's symbol icons, selected-row details, matched-prefix highlighting,
editor font, and suggestion theme colors. Arrow keys navigate, Enter/Tab accept,
and Escape cancels; focus stays in the editor. The popup flips above the caret
when needed and limits its list height to the available viewport.

The host uses `vscode.executeCompletionItemProvider` against the same
authoritative document and applies the primary and additional edits together
through `WorkspaceEdit`. Follow-up commands are executed, including routing
`editor.action.triggerSuggest` back to the rich editor. Epoch/version checks
discard stale results; invalid/overlapping edits and provider failures are shown
explicitly. A command failure after insertion is reported as a partial success,
not as though the insertion failed.

This first integration supports ordinary text completions and case-insensitive
prefix filtering. Snippet items are explicitly marked unsupported and never
inserted literally; snippet sessions, fuzzy ranking, commit characters, and the
documentation-details pane are not implemented. The public VS Code API cannot
resolve a retained completion item: accepting re-queries and resolves the list
through the chosen index, then verifies the effective item identity before
applying it. Providers with unstable lists may require requesting suggestions
again.

### Rich editor image paste

Paste clipboard images into an editable, saved Markdown document with
**Ctrl+V** (**Cmd+V** on macOS) or a native paste action.
**Ctrl+Shift+V** (**Cmd+Shift+V** on macOS) pastes plain text instead.
Image creation and Markdown insertion share one workspace edit and undo/redo.
The existing Markdown media-paste implementation supplies filenames, relative
links, collision handling, and the `markdown.copyFiles.destination` and
`markdown.copyFiles.overwriteBehavior` settings. `editor.pasteAs.enabled`
controls image paste; disabling it does not disable ordinary text paste.

Clipboard image bytes cross the typed editor bridge; the host chooses the
destination and applies edits to the authoritative document. Multiple images
are supported. In desktop webviews, paste first captures a native paste event
through a temporary editable target, preserving file clipboard images and
filenames that the async Clipboard API may omit. Hosts without native paste
support use the async Clipboard API instead; unsupported formats are reported.
Unsaved documents, stale edits, denied clipboard access, and
workspace-edit failures display an error rather than silently dropping images.
The provider's default alt text is inserted without starting a snippet session.

**Architecture limitation:** image paste bypasses VS Code's registered
`DocumentPasteEditProvider` pipeline. It directly calls the built-in Markdown
extension's `ResourcePasteOrDropProvider.createEditForMediaFiles` helper, which
is also used by the code editor's Markdown paste provider. This is local
extension implementation code, **not a Markdown LSP request**. The resulting
file creation and text insertion still use the extension API's
`workspace.applyEdit`.

Consequently, third-party paste providers, provider selection/yielding, and
the code editor's "Paste As..." flow are not exercised. Full paste-provider
parity requires a workbench bridge to that pipeline; there is currently no
public execute-paste-provider API.
