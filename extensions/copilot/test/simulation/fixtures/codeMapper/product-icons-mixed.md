---
# DO NOT TOUCH — Managed by doc writer
ContentId: 109a10fc-2d64-44b6-98ce-b8375d245776
DateApproved: 03/05/2025

# Summarize the whole topic in less than 300 characters for SEO purpose
MetaDescription: Reference of all product icons by id
---

# Product Icon Reference

Visual Studio Code contains a set of built-in icons that are used in views and the editor, but can also be used in hovers, the status bar, and by extensions. These icons are **product icons** as opposed to **file icons**, which are used next to file names throughout the UI.

The product icons that ship with VS Code are contained in the [Codicon icon font](https://github.com/microsoft/vscode-codicons) and form the **default** product icon theme. Extensions can provide new [Product Icon Themes](/api/extension-guides/product-icon-theme) to redefine these icons and give VS Code a new appearance.

In order to allow this, all product icons are identified by an ID. The icon identifier is what's used in UI components in labels (`$(pencil)`), in the API as `ThemeIcon` and in contributions when icons are needed.

The association of icon identifier to an actual icon font glyph happens the product icon theme.

## Icons in labels

Icons can be used in Markdown labels in hovers, in the  [StatusBarItem](/api/references/vscode-api#StatusBarItem) text and [QuickPickItem](/api/references/vscode-api#QuickPickItem) label API. The syntax for adding an icon in Markdown is `$(iconIdentifier)`:

```ts
$(alert);
```

You can also embed text and use multiple icons:

```ts
$(eye) $(heart) $(mark-github) GitHub
```

To place a literal `${...}` text inside a label, escape the `$` with a backslash:

```ts
\$(eye)
```

## Animation

You can apply a spinning animation to the following icons by appending `~spin` to the icon name:

- `sync`
- `loading`
- `gear`

```ts
$(sync~spin)
```

## Icon contribution point

The icon contribution point allow extensions to define additional icons by ID, along with a default icon. The icon ID can then be used by the extension (or any other extensions that depend on the extension) in labels (`$(iconId)`) or at all places where a `ThemeIcon` can be used (`new ThemeIcon("iconId")`).

```json
"contributes": {
  "icons": {
        "distro-ubuntu": {
            "description": "Ubuntu icon",
            "default": {
                "fontPath": "./distroicons.woff",
                "fontCharacter": "\\E001"
            }
        },
        "distro-fedora": {
            "description": "Ubuntu icon",
            "default": {
                "fontPath": "./distroicons.woff",
                "fontCharacter": "\\E002"
            }
        }
    }
}
```

Product icon themes can redefine the icon (if they know about the icon ID).

## Icon Listing

Below is a listing of the built-in product icons by identifier.

The ID of the icon identifies the location where the icon is used. The default codicon ID describes which icon from the codicon library is used by default, and the preview shows what that icon looks like.

[Product Icon Themes](/api/extension-guides/product-icon-theme) can replace each icon individually, as well as all icons from the codicon library.

<div id="codicon-listing">

| preview     | identifier                        | default codicon ID                | description
| ----------- | --------------------------------- | --------------------------------- | --------------------------------- |
|<i class="codicon codicon-account"></i>|accounts-view-bar-icon|account|Accounts icon in the view bar.|
|<i class="codicon codicon-activate-breakpoints"></i>|breakpoints-activate|activate-breakpoints|Icon for the activate action in the breakpoints view.|
|<i class="codicon codicon-close-all"></i>|breakpoints-remove-all|close-all|Icon for the Remove All action in the breakpoints view.|
|<i class="codicon codicon-debug-alt"></i>|breakpoints-view-icon|debug-alt|View icon of the breakpoints view.|
|<i class="codicon codicon-call-incoming"></i>|callhierarchy-incoming|call-incoming|Icon for incoming calls in the call hierarchy view.|
|<i class="codicon codicon-call-outgoing"></i>|callhierarchy-outgoing|call-outgoing|Icon for outgoing calls in the call hierarchy view.|
|<i class="codicon codicon-debug-alt"></i>|callstack-view-icon|debug-alt|View icon of the call stack view.|
|<i class="codicon codicon-bug"></i>|callstack-view-session|bug|Icon for the session icon in the call stack view.|
|<i class="codicon codicon-comment-discussion"></i>|chat-editor-label-icon|comment-discussion|Icon of the chat editor label.|
|<i class="codicon codicon-comment-discussion"></i>|comments-view-icon|comment-discussion|View icon of the comments view.|
|<i class="codicon codicon-debug-breakpoint"></i>|debug-breakpoint|debug-breakpoint|Icon for breakpoints.|
|<i class="codicon codicon-debug-breakpoint-conditional"></i>|debug-breakpoint-conditional|debug-breakpoint-conditional|Icon for conditional breakpoints.|
|<i class="codicon codicon-debug-breakpoint-conditional-disabled"></i>|debug-breakpoint-conditional-disabled|debug-breakpoint-conditional-disabled|Icon for disabled conditional breakpoints.|
|<i class="codicon codicon-debug-breakpoint-conditional-unverified"></i>|debug-breakpoint-conditional-unverified|debug-breakpoint-conditional-unverified|Icon for unverified conditional breakpoints.|
|<i class="codicon codicon-debug-breakpoint-data"></i>|debug-breakpoint-data|debug-breakpoint-data|Icon for data breakpoints.|
|<i class="codicon codicon-debug-breakpoint-data-disabled"></i>|debug-breakpoint-data-disabled|debug-breakpoint-data-disabled|Icon for disabled data breakpoints.|
|<i class="codicon codicon-debug-breakpoint-data-unverified"></i>|debug-breakpoint-data-unverified|debug-breakpoint-data-unverified|Icon for unverified data breakpoints.|
|<i class="codicon codicon-debug-breakpoint-disabled"></i>|debug-breakpoint-disabled|debug-breakpoint-disabled|Icon for disabled breakpoints.|
|<i class="codicon codicon-debug-breakpoint-function"></i>|debug-breakpoint-function|debug-breakpoint-function|Icon for function breakpoints.|
|<i class="codicon codicon-debug-breakpoint-function-disabled"></i>|debug-breakpoint-function-disabled|debug-breakpoint-function-disabled|Icon for disabled function breakpoints.|
|<i class="codicon codicon-debug-breakpoint-function-unverified"></i>|debug-breakpoint-function-unverified|debug-breakpoint-function-unverified|Icon for unverified function breakpoints.|
|<i class="codicon codicon-debug-breakpoint-log"></i>|debug-breakpoint-log|debug-breakpoint-log|Icon for log breakpoints.|
|<i class="codicon codicon-debug-breakpoint-log-disabled"></i>|debug-breakpoint-log-disabled|debug-breakpoint-log-disabled|Icon for disabled log breakpoint.|
|<i class="codicon codicon-debug-breakpoint-log-unverified"></i>|debug-breakpoint-log-unverified|debug-breakpoint-log-unverified|Icon for unverified log breakpoints.|
|<i class="codicon codicon-debug-breakpoint-unsupported"></i>|debug-breakpoint-unsupported|debug-breakpoint-unsupported|Icon for unsupported breakpoints.|
|<i class="codicon codicon-debug-breakpoint-unverified"></i>|debug-breakpoint-unverified|debug-breakpoint-unverified|Icon for unverified breakpoints.|
|<i class="codicon codicon-collapse-all"></i>|debug-collapse-all|collapse-all|Icon for the collapse all action in the debug views.|
|<i class="codicon codicon-gear"></i>|debug-configure|gear|Icon for the debug configure action.|
|<i class="codicon codicon-debug-console"></i>|debug-console|debug-console|Icon for the debug console open action.|
|<i class="codicon codicon-clear-all"></i>|debug-console-clear-all|clear-all|Icon for the clear all action in the debug console.|
|<i class="codicon codicon-arrow-small-right"></i>|debug-console-evaluation-input|arrow-small-right|Icon for the debug evaluation input marker.|
|<i class="codicon codicon-chevron-right"></i>|debug-console-evaluation-prompt|chevron-right|Icon for the debug evaluation prompt.|
|<i class="codicon codicon-debug-console"></i>|debug-console-view-icon|debug-console|View icon of the debug console view.|
|<i class="codicon codicon-debug-continue"></i>|debug-continue|debug-continue|Icon for the debug continue action.|
|<i class="codicon codicon-debug-disconnect"></i>|debug-disconnect|debug-disconnect|Icon for the debug disconnect action.|
|<i class="codicon codicon-gripper"></i>|debug-gripper|gripper|Icon for the debug bar gripper.|
|<i class="codicon codicon-debug-hint"></i>|debug-hint|debug-hint|Icon for breakpoint hints shown on hover in editor glyph margin.|
|<i class="codicon codicon-debug-pause"></i>|debug-pause|debug-pause|Icon for the debug pause action.|
|<i class="codicon codicon-debug-restart"></i>|debug-restart|debug-restart|Icon for the debug restart action.|
|<i class="codicon codicon-debug-restart-frame"></i>|debug-restart-frame|debug-restart-frame|Icon for the debug restart frame action.|
|<i class="codicon codicon-debug-reverse-continue"></i>|debug-reverse-continue|debug-reverse-continue|Icon for the debug reverse continue action.|
|<i class="codicon codicon-debug-stackframe"></i>|debug-stackframe|debug-stackframe|Icon for a stackframe shown in the editor glyph margin.|
|<i class="codicon codicon-debug-stackframe-focused"></i>|debug-stackframe-focused|debug-stackframe-focused|Icon for a focused stackframe  shown in the editor glyph margin.|
|<i class="codicon codicon-debug-start"></i>|debug-start|debug-start|Icon for the debug start action.|
|<i class="codicon codicon-debug-step-back"></i>|debug-step-back|debug-step-back|Icon for the debug step back action.|
|<i class="codicon codicon-debug-step-into"></i>|debug-step-into|debug-step-into|Icon for the debug step into action.|
|<i class="codicon codicon-debug-step-out"></i>|debug-step-out|debug-step-out|Icon for the debug step out action.|
|<i class="codicon codicon-debug-step-over"></i>|debug-step-over|debug-step-over|Icon for the debug step over action.|
|<i class="codicon codicon-debug-stop"></i>|debug-stop|debug-stop|Icon for the debug stop action.|
|<i class="codicon codicon-window"></i>|default-view-icon|window|Default view icon.|
|<i class="codicon codicon-arrow-down"></i>|diff-editor-next-change|arrow-down|Icon for the next change action in the diff editor.|
|<i class="codicon codicon-arrow-up"></i>|diff-editor-previous-change|arrow-up|Icon for the previous change action in the diff editor.|
|<i class="codicon codicon-whitespace"></i>|diff-editor-toggle-whitespace|whitespace|Icon for the toggle whitespace action in the diff editor.|
|<i class="codicon codicon-add"></i>|diff-insert|add|Line decoration for inserts in the diff editor.|
|<i class="codicon codicon-remove"></i>|diff-remove|remove|Line decoration for removals in the diff editor.|
|<i class="codicon codicon-close"></i>|diff-review-close|close|Icon for 'Close' in diff review.|
|<i class="codicon codicon-add"></i>|diff-review-insert|add|Icon for 'Insert' in diff review.|
|<i class="codicon codicon-remove"></i>|diff-review-remove|remove|Icon for 'Remove' in diff review.|
|<i class="codicon codicon-debug"></i>|disassembly-editor-label-icon|debug|Icon of the disassembly editor label.|
|<i class="codicon codicon-files"></i>|explorer-view-icon|files|View icon of the explorer view.|
|<i class="codicon codicon-clear-all"></i>|extensions-clear-search-results|clear-all|Icon for the 'Clear Search Result' action in the extensions view.|
|<i class="codicon codicon-pencil"></i>|extensions-configure-recommended|pencil|Icon for the 'Configure Recommended Extensions' action in the extensions view.|
|<i class="codicon codicon-extensions"></i>|extensions-editor-label-icon|extensions|Icon of the extension editor label.|
|<i class="codicon codicon-filter"></i>|extensions-filter|filter|Icon for the 'Filter' action in the extensions view.|
|<i class="codicon codicon-info"></i>|extensions-info-message|info|Icon shown with an info message in the extensions editor.|
|<i class="codicon codicon-cloud-download"></i>|extensions-install-count|cloud-download|Icon shown along with the install count in the extensions view and editor.|
|<i class="codicon codicon-cloud-download"></i>|extensions-install-local-in-remote|cloud-download|Icon for the 'Install Local Extension in Remote' action in the extensions view.|
|<i class="codicon codicon-cloud-download"></i>|extensions-install-workspace-recommended|cloud-download|Icon for the 'Install Workspace Recommended Extensions' action in the extensions view.|
|<i class="codicon codicon-gear"></i>|extensions-manage|gear|Icon for the 'Manage' action in the extensions view.|
|<i class="codicon codicon-star"></i>|extensions-rating|star|Icon shown along with the rating in the extensions view and editor.|
|<i class="codicon codicon-refresh"></i>|extensions-refresh|refresh|Icon for the 'Refresh' action in the extensions view.|
|<i class="codicon codicon-remote"></i>|extensions-remote|remote|Icon to indicate that an extension is remote in the extensions view and editor.|
|<i class="codicon codicon-star-empty"></i>|extensions-star-empty|star-empty|Empty star icon used for the rating in the extensions editor.|
|<i class="codicon codicon-star-full"></i>|extensions-star-full|star-full|Full star icon used for the rating in the extensions editor.|
|<i class="codicon codicon-star-half"></i>|extensions-star-half|star-half|Half star icon used for the rating in the extensions editor.|
|<i class="codicon codicon-sync"></i>|extensions-sync-enabled|sync|Icon to indicate that an extension is synced.|
|<i class="codicon codicon-sync-ignored"></i>|extensions-sync-ignored|sync-ignored|Icon to indicate that an extension is ignored when syncing.|
|<i class="codicon codicon-extensions"></i>|extensions-view-icon|extensions|View icon of the extensions view.|
|<i class="codicon codicon-warning"></i>|extensions-warning-message|warning|Icon shown with a warning message in the extensions editor.|
|<i class="codicon codicon-chevron-right"></i>|find-collapsed|chevron-right|Icon to indicate that the editor find widget is collapsed.|
|<i class="codicon codicon-chevron-down"></i>|find-expanded|chevron-down|Icon to indicate that the editor find widget is expanded.|
|<i class="codicon codicon-arrow-down"></i>|find-next-match|arrow-down|Icon for 'Find Next' in the editor find widget.|
|<i class="codicon codicon-arrow-up"></i>|find-previous-match|arrow-up|Icon for 'Find Previous' in the editor find widget.|
|<i class="codicon codicon-replace"></i>|find-replace|replace|Icon for 'Replace' in the editor find widget.|
|<i class="codicon codicon-replace-all"></i>|find-replace-all|replace-all|Icon for 'Replace All' in the editor find widget.|
|<i class="codicon codicon-selection"></i>|find-selection|selection|Icon for 'Find in Selection' in the editor find widget.|
|<i class="codicon codicon-chevron-right"></i>|folding-collapsed|chevron-right|Icon for collapsed ranges in the editor glyph margin.|
|<i class="codicon codicon-chevron-down"></i>|folding-expanded|chevron-down|Icon for expanded ranges in the editor glyph margin.|
|<i class="codicon codicon-lightbulb"></i>|getting-started-beginner|lightbulb|Icon used for the beginner category of getting started|
|<i class="codicon codicon-github"></i>|getting-started-codespaces|github|Icon used for the codespaces category of getting started|
|<i class="codicon codicon-pass-filled"></i>|getting-started-item-checked|pass-filled|Used to represent getting started items which have been completed|
|<i class="codicon codicon-circle-large-outline"></i>|getting-started-item-unchecked|circle-large-outline|Used to represent getting started items which have not been completed|
|<i class="codicon codicon-heart"></i>|getting-started-setup|heart|Icon used for the setup category of getting started|
|<i class="codicon codicon-arrow-down"></i>|goto-next-location|arrow-down|Icon for goto next editor location.|
|<i class="codicon codicon-arrow-up"></i>|goto-previous-location|arrow-up|Icon for goto previous editor location.|
|<i class="codicon codicon-add"></i>|keybindings-add|add|Icon for the add action in the keybinding UI.|
|<i class="codicon codicon-edit"></i>|keybindings-edit|edit|Icon for the edit action in the keybinding UI.|
|<i class="codicon codicon-keyboard"></i>|keybindings-editor-label-icon|keyboard|Icon of the keybindings editor label.|
|<i class="codicon codicon-record-keys"></i>|keybindings-record-keys|record-keys|Icon for the 'record keys' action in the keybinding UI.|
|<i class="codicon codicon-sort-precedence"></i>|keybindings-sort|sort-precedence|Icon for the 'sort by precedence' toggle in the keybinding UI.|
|<i class="codicon codicon-debug-alt"></i>|loaded-scripts-view-icon|debug-alt|View icon of the loaded scripts view.|
|<i class="codicon codicon-chevron-down"></i>|marker-navigation-next|chevron-down|Icon for goto next marker.|
|<i class="codicon codicon-chevron-up"></i>|marker-navigation-previous|chevron-up|Icon for goto previous marker.|
|<i class="codicon codicon-filter"></i>|markers-view-filter|filter|Icon for the filter configuration in the markers view.|
|<i class="codicon codicon-warning"></i>|markers-view-icon|warning|View icon of the markers view.|
|<i class="codicon codicon-chevron-down"></i>|markers-view-multi-line-collapsed|chevron-down|Icon indicating that multiple lines are collapsed in the markers view.|
|<i class="codicon codicon-chevron-up"></i>|markers-view-multi-line-expanded|chevron-up|Icon indicating that multiple lines are shown in the markers view.|
|<i class="codicon codicon-diff-multiple"></i>|multi-diff-editor-label-icon|diff-multiple|Icon of the multi diff editor label.|
|<i class="codicon codicon-clear-all"></i>|notebook-clear|clear-all|Icon to clear cell outputs in notebook editors.|
|<i class="codicon codicon-chevron-right"></i>|notebook-collapsed|chevron-right|Icon to annotate a collapsed section in notebook editors.|
|<i class="codicon codicon-trash"></i>|notebook-delete-cell|trash|Icon to delete a cell in notebook editors.|
|<i class="codicon codicon-pencil"></i>|notebook-edit|pencil|Icon to edit a cell in notebook editors.|
|<i class="codicon codicon-play"></i>|notebook-execute|play|Icon to execute in notebook editors.|
|<i class="codicon codicon-run-all"></i>|notebook-execute-all|run-all|Icon to execute all cells in notebook editors.|
|<i class="codicon codicon-chevron-down"></i>|notebook-expanded|chevron-down|Icon to annotate an expanded section in notebook editors.|
|<i class="codicon codicon-settings-gear"></i>|notebook-kernel-configure|settings-gear|Configure icon in kernel configuration widget in notebook editors.|
|<i class="codicon codicon-server-environment"></i>|notebook-kernel-select|server-environment|Configure icon to select a kernel in notebook editors.|
|<i class="codicon codicon-code"></i>|notebook-mimetype|code|Icon for a mime type in notebook editors.|
|<i class="codicon codicon-arrow-down"></i>|notebook-move-down|arrow-down|Icon to move down a cell in notebook editors.|
|<i class="codicon codicon-arrow-up"></i>|notebook-move-up|arrow-up|Icon to move up a cell in notebook editors.|
|<i class="codicon codicon-file-code"></i>|notebook-open-as-text|file-code|Icon to open the notebook in a text editor.|
|<i class="codicon codicon-preview"></i>|notebook-render-output|preview|Icon to render output in diff editor.|
|<i class="codicon codicon-discard"></i>|notebook-revert|discard|Icon to revert in notebook editors.|
|<i class="codicon codicon-split-vertical"></i>|notebook-split-cell|split-vertical|Icon to split a cell in notebook editors.|
|<i class="codicon codicon-error"></i>|notebook-state-error|error|Icon to indicate an error state in notebook editors.|
|<i class="codicon codicon-check"></i>|notebook-state-success|check|Icon to indicate a success state in notebook editors.|
|<i class="codicon codicon-primitive-square"></i>|notebook-stop|primitive-square|Icon to stop an execution in notebook editors.|
|<i class="codicon codicon-check"></i>|notebook-stop-edit|check|Icon to stop editing a cell in notebook editors.|
|<i class="codicon codicon-unfold"></i>|notebook-unfold|unfold|Icon to unfold a cell in notebook editors.|
|<i class="codicon codicon-close"></i>|notifications-clear|close|Icon for the clear action in notifications.|
|<i class="codicon codicon-clear-all"></i>|notifications-clear-all|clear-all|Icon for the clear all action in notifications.|
|<i class="codicon codicon-chevron-down"></i>|notifications-collapse|chevron-down|Icon for the collapse action in notifications.|
|<i class="codicon codicon-gear"></i>|notifications-configure|gear|Icon for the configure action in notifications.|
|<i class="codicon codicon-chevron-up"></i>|notifications-expand|chevron-up|Icon for the expand action in notifications.|
|<i class="codicon codicon-chevron-down"></i>|notifications-hide|chevron-down|Icon for the hide action in notifications.|
|<i class="codicon codicon-book"></i>|open-editors-view-icon|book|View icon of the open editors view.|
|<i class="codicon codicon-symbol-class"></i>|outline-view-icon|symbol-class|View icon of the outline view.|
|<i class="codicon codicon-output"></i>|output-view-icon|output|View icon of the output view.|
|<i class="codicon codicon-close"></i>|panel-close|close|Icon to close a panel.|
|<i class="codicon codicon-chevron-up"></i>|panel-maximize|chevron-up|Icon to maximize a panel.|
|<i class="codicon codicon-chevron-down"></i>|panel-restore|chevron-down|Icon to restore a panel.|
|<i class="codicon codicon-chevron-down"></i>|parameter-hints-next|chevron-down|Icon for show next parameter hint.|
|<i class="codicon codicon-chevron-up"></i>|parameter-hints-previous|chevron-up|Icon for show previous parameter hint.|
|<i class="codicon codicon-plus"></i>|ports-forward-icon|plus|Icon for the forward action.|
|<i class="codicon codicon-globe"></i>|ports-open-browser-icon|globe|Icon for the open browser action.|
|<i class="codicon codicon-x"></i>|ports-stop-forward-icon|x|Icon for the stop forwarding action.|
|<i class="codicon codicon-plug"></i>|ports-view-icon|plug|View icon of the remote ports view.|
|<i class="codicon codicon-clear-all"></i>|preferences-clear-input|clear-all|Icon for clear input in the settings and keybinding UI.|
|<i class="codicon codicon-go-to-file"></i>|preferences-open-settings|go-to-file|Icon for open settings commands.|
|<i class="codicon codicon-lock"></i>|private-ports-view-icon|lock|Icon representing a private remote port.|
|<i class="codicon codicon-eye"></i>|public-ports-view-icon|eye|Icon representing a public remote port.|
|<i class="codicon codicon-lightbulb"></i>|refactor-preview-view-icon|lightbulb|View icon of the refactor preview view.|
|<i class="codicon codicon-book"></i>|remote-explorer-documentation|book|Documentation icon in the remote explorer view.|
|<i class="codicon codicon-twitter"></i>|remote-explorer-feedback|twitter|Feedback icon in the remote explorer view.|
|<i class="codicon codicon-star"></i>|remote-explorer-get-started|star|Getting started icon in the remote explorer view.|
|<i class="codicon codicon-comment"></i>|remote-explorer-report-issues|comment|Report issue icon in the remote explorer view.|
|<i class="codicon codicon-issues"></i>|remote-explorer-review-issues|issues|Review issue icon in the remote explorer view.|
|<i class="codicon codicon-remote-explorer"></i>|remote-explorer-view-icon|remote-explorer|View icon of the remote explorer view.|
|<i class="codicon codicon-chevron-up"></i>|review-comment-collapse|chevron-up|Icon to collapse a review comment.|
|<i class="codicon codicon-debug-alt"></i>|run-view-icon|debug-alt|View icon of the Run and Debug view.|
|<i class="codicon codicon-extensions"></i>|runtime-extensions-editor-label-icon|extensions|Icon of the runtime extensions editor label.|
|<i class="codicon codicon-clear-all"></i>|search-clear-results|clear-all|Icon for clear results in the search view.|
|<i class="codicon codicon-collapse-all"></i>|search-collapse-results|collapse-all|Icon for collapse results in the search view.|
|<i class="codicon codicon-ellipsis"></i>|search-details|ellipsis|Icon to make search details visible.|
|<i class="codicon codicon-search"></i>|search-editor-label-icon|search|Icon of the search editor label.|
|<i class="codicon codicon-expand-all"></i>|search-expand-results|expand-all|Icon for expand results in the search view.|
|<i class="codicon codicon-chevron-right"></i>|search-hide-replace|chevron-right|Icon to collapse the replace section in the search view.|
|<i class="codicon codicon-new-file"></i>|search-new-editor|new-file|Icon for the action to open a new search editor.|
|<i class="codicon codicon-refresh"></i>|search-refresh|refresh|Icon for refresh in the search view.|
|<i class="codicon codicon-close"></i>|search-remove|close|Icon to remove a search result.|
|<i class="codicon codicon-replace"></i>|search-replace|replace|Icon for replace in the search view.|
|<i class="codicon codicon-replace-all"></i>|search-replace-all|replace-all|Icon for replace all in the search view.|
|<i class="codicon codicon-list-selection"></i>|search-show-context|list-selection|Icon for toggle the context in the search editor.|
|<i class="codicon codicon-chevron-down"></i>|search-show-replace|chevron-down|Icon to expand the replace section in the search view.|
|<i class="codicon codicon-search-stop"></i>|search-stop|search-stop|Icon for stop in the search view.|
|<i class="codicon codicon-search"></i>|search-view-icon|search|View icon of the search view.|
|<i class="codicon codicon-add"></i>|settings-add|add|Icon for the add action in the Settings UI.|
|<i class="codicon codicon-discard"></i>|settings-discard|discard|Icon for the discard action in the Settings UI.|
|<i class="codicon codicon-edit"></i>|settings-edit|edit|Icon for the edit action in the Settings UI.|
|<i class="codicon codicon-settings"></i>|settings-editor-label-icon|settings|Icon of the settings editor label.|
|<i class="codicon codicon-triangle-down"></i>|settings-folder-dropdown|triangle-down|Icon for the folder dropdown button in the split JSON Settings editor.|
|<i class="codicon codicon-chevron-right"></i>|settings-group-collapsed|chevron-right|Icon for a collapsed section in the split JSON Settings editor.|
|<i class="codicon codicon-chevron-down"></i>|settings-group-expanded|chevron-down|Icon for an expanded section in the split JSON Settings editor.|
|<i class="codicon codicon-gear"></i>|settings-more-action|gear|Icon for the 'more actions' action in the Settings UI.|
|<i class="codicon codicon-close"></i>|settings-remove|close|Icon for the remove action in the Settings UI.|
|<i class="codicon codicon-sync"></i>|settings-sync-view-icon|sync|View icon of the Settings Sync view.|
|<i class="codicon codicon-settings-gear"></i>|settings-view-bar-icon|settings-gear|Settings icon in the view bar.|
|<i class="codicon codicon-source-control"></i>|source-control-view-icon|source-control|View icon of the Source Control view.|
|<i class="codicon codicon-chevron-right"></i>|suggest-more-info|chevron-right|Icon for more information in the suggest widget.|
|<i class="codicon codicon-gear"></i>|tasks-list-configure|gear|Configuration icon in the tasks selection list.|
|<i class="codicon codicon-close"></i>|tasks-remove|close|Icon for remove in the tasks selection list.|
|<i class="codicon codicon-trash"></i>|terminal-kill|trash|Icon for killing a terminal instance.|
|<i class="codicon codicon-add"></i>|terminal-new|add|Icon for creating a new terminal instance.|
|<i class="codicon codicon-gear"></i>|terminal-rename|gear|Icon for rename in the terminal quick menu.|
|<i class="codicon codicon-terminal"></i>|terminal-view-icon|terminal|View icon of the terminal view.|
|<i class="codicon codicon-beaker"></i>|test-view-icon|beaker|View icon of the test view.|
|<i class="codicon codicon-close"></i>|testing-cancel-icon|close|Icon to cancel ongoing test runs.|
|<i class="codicon codicon-debug-alt"></i>|testing-debug-icon|debug-alt|Icon of the "debug test" action.|
|<i class="codicon codicon-warning"></i>|testing-error-icon|warning|Icon shown for tests that have an error.|
|<i class="codicon codicon-close"></i>|testing-failed-icon|close|Icon shown for tests that failed.|
|<i class="codicon codicon-pass"></i>|testing-passed-icon|pass|Icon shown for tests that passed.|
|<i class="codicon codicon-watch"></i>|testing-queued-icon|watch|Icon shown for tests that are queued.|
|<i class="codicon codicon-run-all"></i>|testing-run-all-icon|run-all|Icon of the "run all tests" action.|
|<i class="codicon codicon-run"></i>|testing-run-icon|run|Icon of the "run test" action.|
|<i class="codicon codicon-list-tree"></i>|testing-show-as-list-icon|list-tree|Icon shown when the test explorer is disabled as a tree.|
|<i class="codicon codicon-debug-step-over"></i>|testing-skipped-icon|debug-step-over|Icon shown for tests that are skipped.|
|<i class="codicon codicon-circle-outline"></i>|testing-unset-icon|circle-outline|Icon shown for tests that are in an unset state.|
|<i class="codicon codicon-history"></i>|timeline-open|history|Icon for the open timeline action.|
|<i class="codicon codicon-pin"></i>|timeline-pin|pin|Icon for the pin timeline action.|
|<i class="codicon codicon-refresh"></i>|timeline-refresh|refresh|Icon for the refresh timeline action.|
|<i class="codicon codicon-pinned"></i>|timeline-unpin|pinned|Icon for the unpin timeline action.|
|<i class="codicon codicon-history"></i>|timeline-view-icon|history|View icon of the timeline view.|
|<i class="codicon codicon-debug-alt"></i>|variables-view-icon|debug-alt|View icon of the variables view.|
|<i class="codicon codicon-chevron-right"></i>|view-pane-container-collapsed|chevron-right|Icon for a collapsed view pane container.|
|<i class="codicon codicon-chevron-down"></i>|view-pane-container-expanded|chevron-down|Icon for an expanded view pane container.|
|<i class="codicon codicon-add"></i>|watch-expressions-add|add|Icon for the add action in the watch view.|
|<i class="codicon codicon-add"></i>|watch-expressions-add-function-breakpoint|add|Icon for the add function breakpoint action in the watch view.|
|<i class="codicon codicon-close-all"></i>|watch-expressions-remove-all|close-all|Icon for the Remove All action in the watch view.|
|<i class="codicon codicon-debug-alt"></i>|watch-view-icon|debug-alt|View icon of the watch view.|
|<i class="codicon codicon-close"></i>|widget-close|close|Icon for the close action in widgets.|
|<i class="codicon codicon-shield"></i>|workspace-trust-editor-label-icon|shield|Icon of the workspace trust editor label.|

The Codicon library contains all the icons used in VS Code views, as well as a set of useful icons.

VS Code extensions can use these icons in labels, views, and trees.

| preview     | identifier
| ----------- | --------------------------------- |
|<i class="codicon codicon-account"></i>|account|
|<i class="codicon codicon-activate-breakpoints"></i>|activate-breakpoints|
|<i class="codicon codicon-add"></i>|add|
|<i class="codicon codicon-alert"></i>|alert|
|<i class="codicon codicon-archive"></i>|archive|
|<i class="codicon codicon-array"></i>|array|
|<i class="codicon codicon-arrow-both"></i>|arrow-both|
|<i class="codicon codicon-arrow-circle-down"></i>|arrow-circle-down|
|<i class="codicon codicon-arrow-circle-left"></i>|arrow-circle-left|
|<i class="codicon codicon-arrow-circle-right"></i>|arrow-circle-right|
|<i class="codicon codicon-arrow-circle-up"></i>|arrow-circle-up|
|<i class="codicon codicon-arrow-down"></i>|arrow-down|
|<i class="codicon codicon-arrow-left"></i>|arrow-left|
|<i class="codicon codicon-arrow-right"></i>|arrow-right|
|<i class="codicon codicon-arrow-small-down"></i>|arrow-small-down|
|<i class="codicon codicon-arrow-small-left"></i>|arrow-small-left|
|<i class="codicon codicon-arrow-small-right"></i>|arrow-small-right|
|<i class="codicon codicon-arrow-small-up"></i>|arrow-small-up|
|<i class="codicon codicon-arrow-swap"></i>|arrow-swap|
|<i class="codicon codicon-arrow-up"></i>|arrow-up|
|<i class="codicon codicon-azure-devops"></i>|azure-devops|
|<i class="codicon codicon-azure"></i>|azure|
|<i class="codicon codicon-beaker-stop"></i>|beaker-stop|
|<i class="codicon codicon-beaker"></i>|beaker|
|<i class="codicon codicon-bell"></i>|bell|
|<i class="codicon codicon-bell-dot"></i>|bell-dot|
|<i class="codicon codicon-bell-slash"></i>|bell-slash|
|<i class="codicon codicon-bell-slash-dot"></i>|bell-slash-dot|
|<i class="codicon codicon-bold"></i>|bold|
|<i class="codicon codicon-book"></i>|book|
|<i class="codicon codicon-bookmark"></i>|bookmark|
|<i class="codicon codicon-bracket-dot"></i>|bracket-dot|
|<i class="codicon codicon-bracket-error"></i>|bracket-error|
|<i class="codicon codicon-bracket"></i>|bracket|
|<i class="codicon codicon-briefcase"></i>|briefcase|
|<i class="codicon codicon-broadcast"></i>|broadcast|
|<i class="codicon codicon-browser"></i>|browser|
|<i class="codicon codicon-bug"></i>|bug|
|<i class="codicon codicon-calendar"></i>|calendar|
|<i class="codicon codicon-call-incoming"></i>|call-incoming|
|<i class="codicon codicon-call-outgoing"></i>|call-outgoing|
|<i class="codicon codicon-case-sensitive"></i>|case-sensitive|
|<i class="codicon codicon-check"></i>|check|
|<i class="codicon codicon-check-all"></i>|check-all|
|<i class="codicon codicon-checklist"></i>|checklist|
|<i class="codicon codicon-chevron-down"></i>|chevron-down|
|<i class="codicon codicon-chevron-left"></i>|chevron-left|
|<i class="codicon codicon-chevron-right"></i>|chevron-right|
|<i class="codicon codicon-chevron-up"></i>|chevron-up|
|<i class="codicon codicon-chip"></i>|chip|
|<i class="codicon codicon-chrome-close"></i>|chrome-close|
|<i class="codicon codicon-chrome-maximize"></i>|chrome-maximize|
|<i class="codicon codicon-chrome-minimize"></i>|chrome-minimize|
|<i class="codicon codicon-chrome-restore"></i>|chrome-restore|
|<i class="codicon codicon-circle-filled"></i>|circle-filled|
|<i class="codicon codicon-circle-large-filled"></i>|circle-large-filled|
|<i class="codicon codicon-circle-large-outline"></i>|circle-large-outline|
|<i class="codicon codicon-circle-outline"></i>|circle-outline|
|<i class="codicon codicon-circle-slash"></i>|circle-slash|
|<i class="codicon codicon-circuit-board"></i>|circuit-board|
|<i class="codicon codicon-clear-all"></i>|clear-all|
|<i class="codicon codicon-clippy"></i>|clippy|
|<i class="codicon codicon-clock"></i>|clock|
|<i class="codicon codicon-clone"></i>|clone|
|<i class="codicon codicon-close"></i>|close|
|<i class="codicon codicon-close-all"></i>|close-all|
|<i class="codicon codicon-close-dirty"></i>|close-dirty|
|<i class="codicon codicon-cloud"></i>|cloud|
|<i class="codicon codicon-cloud-download"></i>|cloud-download|
|<i class="codicon codicon-cloud-upload"></i>|cloud-upload|
|<i class="codicon codicon-code"></i>|code|
|<i class="codicon codicon-coffee"></i>|coffee|
|<i class="codicon codicon-collapse-all"></i>|collapse-all|
|<i class="codicon codicon-color-mode"></i>|color-mode|
|<i class="codicon codicon-combine"></i>|combine|
|<i class="codicon codicon-comment"></i>|comment|
|<i class="codicon codicon-comment-add"></i>|comment-add|
|<i class="codicon codicon-comment-discussion"></i>|comment-discussion|
|<i class="codicon codicon-comment-draft"></i>|comment-draft|
|<i class="codicon codicon-comment-unresolved"></i>|comment-unresolved|
|<i class="codicon codicon-compare-changes"></i>|compare-changes|
|<i class="codicon codicon-compass-active"></i>|compass-active|
|<i class="codicon codicon-compass-dot"></i>|compass-dot|
|<i class="codicon codicon-compass"></i>|compass|
|<i class="codicon codicon-console"></i>|console|
|<i class="codicon codicon-copilot"></i>|copilot|
|<i class="codicon codicon-copy"></i>|copy|
|<i class="codicon codicon-credit-card"></i>|credit-card|
|<i class="codicon codicon-dash"></i>|dash|
|<i class="codicon codicon-dashboard"></i>|dashboard|
|<i class="codicon codicon-database"></i>|database|
|<i class="codicon codicon-debug-all"></i>|debug-all|
|<i class="codicon codicon-debug"></i>|debug|
|<i class="codicon codicon-debug-alt"></i>|debug-alt|
|<i class="codicon codicon-debug-alt-small"></i>|debug-alt-small|
|<i class="codicon codicon-debug-breakpoint"></i>|debug-breakpoint|
|<i class="codicon codicon-debug-breakpoint-conditional"></i>|debug-breakpoint-conditional|
|<i class="codicon codicon-debug-breakpoint-conditional-disabled"></i>|debug-breakpoint-conditional-disabled|
|<i class="codicon codicon-debug-breakpoint-conditional-unverified"></i>|debug-breakpoint-conditional-unverified|
|<i class="codicon codicon-debug-breakpoint-data"></i>|debug-breakpoint-data|
|<i class="codicon codicon-debug-breakpoint-data-disabled"></i>|debug-breakpoint-data-disabled|
|<i class="codicon codicon-debug-breakpoint-data-unverified"></i>|debug-breakpoint-data-unverified|
|<i class="codicon codicon-debug-breakpoint-disabled"></i>|debug-breakpoint-disabled|
|<i class="codicon codicon-debug-breakpoint-function"></i>|debug-breakpoint-function|
|<i class="codicon codicon-debug-breakpoint-function-disabled"></i>|debug-breakpoint-function-disabled|
|<i class="codicon codicon-debug-breakpoint-function-unverified"></i>|debug-breakpoint-function-unverified|
|<i class="codicon codicon-debug-breakpoint-log"></i>|debug-breakpoint-log|
|<i class="codicon codicon-debug-breakpoint-log-disabled"></i>|debug-breakpoint-log-disabled|
|<i class="codicon codicon-debug-breakpoint-log-unverified"></i>|debug-breakpoint-log-unverified|
|<i class="codicon codicon-debug-breakpoint-unsupported"></i>|debug-breakpoint-unsupported|
|<i class="codicon codicon-debug-breakpoint-unverified"></i>|debug-breakpoint-unverified|
|<i class="codicon codicon-debug-console"></i>|debug-console|
|<i class="codicon codicon-debug-continue-small"></i>|debug-continue-small|
|<i class="codicon codicon-debug-continue"></i>|debug-continue|
|<i class="codicon codicon-debug-coverage"></i>|debug-coverage|
|<i class="codicon codicon-debug-disconnect"></i>|debug-disconnect|
|<i class="codicon codicon-debug-hint"></i>|debug-hint|
|<i class="codicon codicon-debug-line-by-line"></i>|debug-line-by-line|
|<i class="codicon codicon-debug-pause"></i>|debug-pause|
|<i class="codicon codicon-debug-rerun"></i>|debug-rerun|
|<i class="codicon codicon-debug-restart"></i>|debug-restart|
|<i class="codicon codicon-debug-restart-frame"></i>|debug-restart-frame|
|<i class="codicon codicon-debug-reverse-continue"></i>|debug-reverse-continue|
|<i class="codicon codicon-debug-stackframe"></i>|debug-stackframe|
|<i class="codicon codicon-debug-stackframe-active"></i>|debug-stackframe-active|
|<i class="codicon codicon-debug-stackframe-dot"></i>|debug-stackframe-dot|
|<i class="codicon codicon-debug-stackframe-focused"></i>|debug-stackframe-focused|
|<i class="codicon codicon-debug-start"></i>|debug-start|
|<i class="codicon codicon-debug-step-back"></i>|debug-step-back|
|<i class="codicon codicon-debug-step-into"></i>|debug-step-into|
|<i class="codicon codicon-debug-step-out"></i>|debug-step-out|
|<i class="codicon codicon-debug-step-over"></i>|debug-step-over|
|<i class="codicon codicon-debug-stop"></i>|debug-stop|
|<i class="codicon codicon-desktop-download"></i>|desktop-download|
|<i class="codicon codicon-device-camera"></i>|device-camera|
|<i class="codicon codicon-device-camera-video"></i>|device-camera-video|
|<i class="codicon codicon-device-desktop"></i>|device-desktop|
|<i class="codicon codicon-device-mobile"></i>|device-mobile|
|<i class="codicon codicon-diff"></i>|diff|
|<i class="codicon codicon-diff-added"></i>|diff-added|
|<i class="codicon codicon-diff-ignored"></i>|diff-ignored|
|<i class="codicon codicon-diff-modified"></i>|diff-modified|
|<i class="codicon codicon-diff-removed"></i>|diff-removed|
|<i class="codicon codicon-diff-renamed"></i>|diff-renamed|
|<i class="codicon codicon-discard"></i>|discard|
|<i class="codicon codicon-edit"></i>|edit|
|<i class="codicon codicon-editor-layout"></i>|editor-layout|
|<i class="codicon codicon-ellipsis"></i>|ellipsis|
|<i class="codicon codicon-empty-window"></i>|empty-window|
|<i class="codicon codicon-error-small"></i>|error-small|
|<i class="codicon codicon-error"></i>|error|
|<i class="codicon codicon-exclude"></i>|exclude|
|<i class="codicon codicon-expand-all"></i>|expand-all|
|<i class="codicon codicon-export"></i>|export|
|<i class="codicon codicon-extensions"></i>|extensions|
|<i class="codicon codicon-eye"></i>|eye|
|<i class="codicon codicon-eye-closed"></i>|eye-closed|
|<i class="codicon codicon-eye-unwatch"></i>|eye-unwatch|
|<i class="codicon codicon-eye-watch"></i>|eye-watch|
|<i class="codicon codicon-feedback"></i>|feedback|
|<i class="codicon codicon-file"></i>|file|
|<i class="codicon codicon-file-add"></i>|file-add|
|<i class="codicon codicon-file-binary"></i>|file-binary|
|<i class="codicon codicon-file-code"></i>|file-code|
|<i class="codicon codicon-file-directory"></i>|file-directory|
|<i class="codicon codicon-file-directory-create"></i>|file-directory-create|
|<i class="codicon codicon-file-media"></i>|file-media|
|<i class="codicon codicon-file-pdf"></i>|file-pdf|
|<i class="codicon codicon-file-submodule"></i>|file-submodule|
|<i class="codicon codicon-file-symlink-directory"></i>|file-symlink-directory|
|<i class="codicon codicon-file-symlink-file"></i>|file-symlink-file|
|<i class="codicon codicon-file-text"></i>|file-text|
|<i class="codicon codicon-file-zip"></i>|file-zip|
|<i class="codicon codicon-files"></i>|files|
|<i class="codicon codicon-filter-filled"></i>|filter-filled|
|<i class="codicon codicon-filter"></i>|filter|
|<i class="codicon codicon-flame"></i>|flame|
|<i class="codicon codicon-fold"></i>|fold|
|<i class="codicon codicon-fold-down"></i>|fold-down|
|<i class="codicon codicon-fold-up"></i>|fold-up|
|<i class="codicon codicon-folder"></i>|folder|
|<i class="codicon codicon-folder-active"></i>|folder-active|
|<i class="codicon codicon-folder-library"></i>|folder-library|
|<i class="codicon codicon-folder-opened"></i>|folder-opened|
|<i class="codicon codicon-game"></i>|game|
|<i class="codicon codicon-gather"></i>|gather|
|<i class="codicon codicon-gear"></i>|gear|
|<i class="codicon codicon-gift"></i>|gift|
|<i class="codicon codicon-gist"></i>|gist|
|<i class="codicon codicon-gist-fork"></i>|gist-fork|
|<i class="codicon codicon-gist-new"></i>|gist-new|
|<i class="codicon codicon-gist-private"></i>|gist-private|
|<i class="codicon codicon-gist-secret"></i>|gist-secret|
|<i class="codicon codicon-git-branch"></i>|git-branch|
|<i class="codicon codicon-git-branch-create"></i>|git-branch-create|
|<i class="codicon codicon-git-branch-delete"></i>|git-branch-delete|
|<i class="codicon codicon-git-commit"></i>|git-commit|
|<i class="codicon codicon-git-compare"></i>|git-compare|
|<i class="codicon codicon-git-fetch"></i>|git-fetch|
|<i class="codicon codicon-git-fork-private"></i>|git-fork-private|
|<i class="codicon codicon-git-merge"></i>|git-merge|
|<i class="codicon codicon-git-pull-request"></i>|git-pull-request|
|<i class="codicon codicon-git-pull-request-abandoned"></i>|git-pull-request-abandoned|
|<i class="codicon codicon-git-pull-request-closed"></i>|git-pull-request-closed|
|<i class="codicon codicon-git-pull-request-create"></i>|git-pull-request-create|
|<i class="codicon codicon-git-pull-request-draft"></i>|git-pull-request-draft|
|<i class="codicon codicon-git-pull-request-new-changes"></i>|git-pull-request-new-changes|
|<i class="codicon codicon-git-pull-request-go-to-changes"></i>|git-pull-request-go-to-changes|
|<i class="codicon codicon-github"></i>|github|
|<i class="codicon codicon-github-action"></i>|github-action|
|<i class="codicon codicon-github-alt"></i>|github-alt|
|<i class="codicon codicon-github-inverted"></i>|github-inverted|
|<i class="codicon codicon-globe"></i>|globe|
|<i class="codicon codicon-go-to-file"></i>|go-to-file|
|<i class="codicon codicon-grabber"></i>|grabber|
|<i class="codicon codicon-graph"></i>|graph|
|<i class="codicon codicon-graph-left"></i>|graph-left|
|<i class="codicon codicon-graph-line"></i>|graph-line|
|<i class="codicon codicon-graph-scatter"></i>|graph-scatter|
|<i class="codicon codicon-gripper"></i>|gripper|
|<i class="codicon codicon-group-by-ref-type"></i>|group-by-ref-type|
|<i class="codicon codicon-heart"></i>|heart|
|<i class="codicon codicon-history"></i>|history|
|<i class="codicon codicon-home"></i>|home|
|<i class="codicon codicon-horizontal-rule"></i>|horizontal-rule|
|<i class="codicon codicon-hubot"></i>|hubot|
|<i class="codicon codicon-inbox"></i>|inbox|
|<i class="codicon codicon-indent"></i>|indent|
|<i class="codicon codicon-info"></i>|info|
|<i class="codicon codicon-insert"></i>|insert|
|<i class="codicon codicon-inspect"></i>|inspect|
|<i class="codicon codicon-issue-closed"></i>|issue-closed|
|<i class="codicon codicon-issue-draft"></i>|issue-draft|
|<i class="codicon codicon-issue-opened"></i>|issue-opened|
|<i class="codicon codicon-issue-reopened"></i>|issue-reopened|
|<i class="codicon codicon-issues"></i>|issues|
|<i class="codicon codicon-italic"></i>|italic|
|<i class="codicon codicon-jersey"></i>|jersey|
|<i class="codicon codicon-json"></i>|json|
|<i class="codicon codicon-kebab-horizontal"></i>|kebab-horizontal|
|<i class="codicon codicon-kebab-vertical"></i>|kebab-vertical|
|<i class="codicon codicon-key"></i>|key|
|<i class="codicon codicon-keyboard"></i>|keyboard|
|<i class="codicon codicon-law"></i>|law|
|<i class="codicon codicon-layers-active"></i>|layers-active|
|<i class="codicon codicon-layers-dot"></i>|layers-dot|
|<i class="codicon codicon-layers"></i>|layers|
|<i class="codicon codicon-layout-activitybar-left"></i>|layout-activitybar-left|
|<i class="codicon codicon-layout-activitybar-right"></i>|layout-activitybar-right|
|<i class="codicon codicon-layout-centered"></i>|layout-centered|
|<i class="codicon codicon-layout-menubar"></i>|layout-menubar|
|<i class="codicon codicon-layout-panel-center"></i>|layout-panel-center|
|<i class="codicon codicon-layout-panel-justify"></i>|layout-panel-justify|
|<i class="codicon codicon-layout-panel-left"></i>|layout-panel-left|
|<i class="codicon codicon-layout-panel-right"></i>|layout-panel-right|
|<i class="codicon codicon-layout-panel"></i>|layout-panel|
|<i class="codicon codicon-layout-sidebar-left"></i>|layout-sidebar-left|
|<i class="codicon codicon-layout-sidebar-right"></i>|layout-sidebar-right|
|<i class="codicon codicon-layout-statusbar"></i>|layout-statusbar|
|<i class="codicon codicon-layout"></i>|layout|
|<i class="codicon codicon-library"></i>|library|
|<i class="codicon codicon-light-bulb"></i>|light-bulb|
|<i class="codicon codicon-lightbulb"></i>|lightbulb|
|<i class="codicon codicon-lightbulb-autofix"></i>|lightbulb-autofix|
|<i class="codicon codicon-link"></i>|link|
|<i class="codicon codicon-link-external"></i>|link-external|
|<i class="codicon codicon-list-filter"></i>|list-filter|
|<i class="codicon codicon-list-flat"></i>|list-flat|
|<i class="codicon codicon-list-ordered"></i>|list-ordered|
|<i class="codicon codicon-list-selection"></i>|list-selection|
|<i class="codicon codicon-list-tree"></i>|list-tree|
|<i class="codicon codicon-list-unordered"></i>|list-unordered|
|<i class="codicon codicon-live-share"></i>|live-share|
|<i class="codicon codicon-loading"></i>|loading|
|<i class="codicon codicon-location"></i>|location|
|<i class="codicon codicon-lock-small"></i>|lock-small|
|<i class="codicon codicon-lock"></i>|lock|
|<i class="codicon codicon-log-in"></i>|log-in|
|<i class="codicon codicon-log-out"></i>|log-out|
|<i class="codicon codicon-logo-github"></i>|logo-github|
|<i class="codicon codicon-magnet"></i>|magnet|
|<i class="codicon codicon-mail"></i>|mail|
|<i class="codicon codicon-mail-read"></i>|mail-read|
|<i class="codicon codicon-mail-reply"></i>|mail-reply|
|<i class="codicon codicon-mark-github"></i>|mark-github|
|<i class="codicon codicon-markdown"></i>|markdown|
|<i class="codicon codicon-megaphone"></i>|megaphone|
|<i class="codicon codicon-mention"></i>|mention|
|<i class="codicon codicon-menu"></i>|menu|
|<i class="codicon codicon-merge"></i>|merge|
|<i class="codicon codicon-mic"></i>|mic|
|<i class="codicon codicon-mic-filled"></i>|mic-filled|
|<i class="codicon codicon-microscope"></i>|microscope|
|<i class="codicon codicon-milestone"></i>|milestone|
|<i class="codicon codicon-mirror"></i>|mirror|
|<i class="codicon codicon-mirror-private"></i>|mirror-private|
|<i class="codicon codicon-mirror-public"></i>|mirror-public|
|<i class="codicon codicon-more"></i>|more|
|<i class="codicon codicon-mortar-board"></i>|mortar-board|
|<i class="codicon codicon-move"></i>|move|
|<i class="codicon codicon-multiple-windows"></i>|multiple-windows|
|<i class="codicon codicon-music"></i>|music|
|<i class="codicon codicon-mute"></i>|mute|
|<i class="codicon codicon-new-file"></i>|new-file|
|<i class="codicon codicon-new-folder"></i>|new-folder|
|<i class="codicon codicon-newline"></i>|newline|
|<i class="codicon codicon-no-newline"></i>|no-newline|
|<i class="codicon codicon-note"></i>|note|
|<i class="codicon codicon-notebook"></i>|notebook|
|<i class="codicon codicon-notebook-template"></i>|notebook-template|
|<i class="codicon codicon-octoface"></i>|octoface|
|<i class="codicon codicon-open-preview"></i>|open-preview|
|<i class="codicon codicon-organization"></i>|organization|
|<i class="codicon codicon-organization-filled"></i>|organization-filled|
|<i class="codicon codicon-organization-outline"></i>|organization-outline|
|<i class="codicon codicon-output"></i>|output|
|<i class="codicon codicon-package"></i>|package|
|<i class="codicon codicon-paintcan"></i>|paintcan|
|<i class="codicon codicon-pass"></i>|pass|
|<i class="codicon codicon-pass-filled"></i>|pass-filled|
|<i class="codicon codicon-pencil"></i>|pencil|
|<i class="codicon codicon-person"></i>|person|
|<i class="codicon codicon-person-add"></i>|person-add|
|<i class="codicon codicon-person-filled"></i>|person-filled|
|<i class="codicon codicon-person-follow"></i>|person-follow|
|<i class="codicon codicon-person-outline"></i>|person-outline|
|<i class="codicon codicon-pie-chart"></i>|pie-chart|
|<i class="codicon codicon-piano"></i>|piano|
|<i class="codicon codicon-pin"></i>|pin|
|<i class="codicon codicon-pinned"></i>|pinned|
|<i class="codicon codicon-pinned-dirty"></i>|pinned-dirty|
|<i class="codicon codicon-play"></i>|play|
|<i class="codicon codicon-play-circle"></i>|play-circle|
|<i class="codicon codicon-plug"></i>|plug|
|<i class="codicon codicon-plus"></i>|plus|
|<i class="codicon codicon-preserve-case"></i>|preserve-case|
|<i class="codicon codicon-preview"></i>|preview|
|<i class="codicon codicon-primitive-dot"></i>|primitive-dot|
|<i class="codicon codicon-primitive-square"></i>|primitive-square|
|<i class="codicon codicon-project"></i>|project|
|<i class="codicon codicon-pulse"></i>|pulse|
|<i class="codicon codicon-question"></i>|question|
|<i class="codicon codicon-quote"></i>|quote|
|<i class="codicon codicon-radio-tower"></i>|radio-tower|
|<i class="codicon codicon-reactions"></i>|reactions|
|<i class="codicon codicon-record"></i>|record|
|<i class="codicon codicon-record-keys"></i>|record-keys|
|<i class="codicon codicon-record-small"></i>|record-small|
|<i class="codicon codicon-redo"></i>|redo|
|<i class="codicon codicon-references"></i>|references|
|<i class="codicon codicon-refresh"></i>|refresh|
|<i class="codicon codicon-regex"></i>|regex|
|<i class="codicon codicon-remote"></i>|remote|
|<i class="codicon codicon-remote-explorer"></i>|remote-explorer|
|<i class="codicon codicon-remove"></i>|remove|
|<i class="codicon codicon-remove-close"></i>|remove-close|
|<i class="codicon codicon-repl"></i>|repl|
|<i class="codicon codicon-replace"></i>|replace|
|<i class="codicon codicon-replace-all"></i>|replace-all|
|<i class="codicon codicon-reply"></i>|reply|
|<i class="codicon codicon-repo"></i>|repo|
|<i class="codicon codicon-repo-clone"></i>|repo-clone|
|<i class="codicon codicon-repo-create"></i>|repo-create|
|<i class="codicon codicon-repo-delete"></i>|repo-delete|
|<i class="codicon codicon-repo-force-push"></i>|repo-force-push|
|<i class="codicon codicon-repo-forked"></i>|repo-forked|
|<i class="codicon codicon-repo-pull"></i>|repo-pull|
|<i class="codicon codicon-repo-push"></i>|repo-push|
|<i class="codicon codicon-repo-sync"></i>|repo-sync|
|<i class="codicon codicon-report"></i>|report|
|<i class="codicon codicon-request-changes"></i>|request-changes|
|<i class="codicon codicon-rocket"></i>|rocket|
|<i class="codicon codicon-root-folder"></i>|root-folder|
|<i class="codicon codicon-root-folder-opened"></i>|root-folder-opened|
|<i class="codicon codicon-rss"></i>|rss|
|<i class="codicon codicon-ruby"></i>|ruby|
|<i class="codicon codicon-run"></i>|run|
|<i class="codicon codicon-run-all"></i>|run-all|
|<i class="codicon codicon-run-above"></i>|run-above|
|<i class="codicon codicon-run-below"></i>|run-below|
|<i class="codicon codicon-run-errors"></i>|run-errors|
|<i class="codicon codicon-save"></i>|save|
|<i class="codicon codicon-save-all"></i>|save-all|
|<i class="codicon codicon-save-as"></i>|save-as|
|<i class="codicon codicon-screen-full"></i>|screen-full|
|<i class="codicon codicon-screen-normal"></i>|screen-normal|
|<i class="codicon codicon-search"></i>|search|
|<i class="codicon codicon-search-save"></i>|search-save|
|<i class="codicon codicon-search-stop"></i>|search-stop|
|<i class="codicon codicon-search-fuzzy"></i>|search-fuzzy|
|<i class="codicon codicon-selection"></i>|selection|
|<i class="codicon codicon-send"></i>|send|
|<i class="codicon codicon-server"></i>|server|
|<i class="codicon codicon-server-environment"></i>|server-environment|
|<i class="codicon codicon-server-process"></i>|server-process|
|<i class="codicon codicon-settings"></i>|settings|
|<i class="codicon codicon-settings-gear"></i>|settings-gear|
|<i class="codicon codicon-shield"></i>|shield|
|<i class="codicon codicon-sign-in"></i>|sign-in|
|<i class="codicon codicon-sign-out"></i>|sign-out|
|<i class="codicon codicon-smiley"></i>|smiley|
|<i class="codicon codicon-snake"></i>|snake|
|<i class="codicon codicon-sparkle"></i>|sparkle|
|<i class="codicon codicon-sort-precedence"></i>|sort-precedence|
|<i class="codicon codicon-source-control"></i>|source-control|
|<i class="codicon codicon-split-horizontal"></i>|split-horizontal|
|<i class="codicon codicon-split-vertical"></i>|split-vertical|
|<i class="codicon codicon-squirrel"></i>|squirrel|
|<i class="codicon codicon-star"></i>|star|
|<i class="codicon codicon-star-add"></i>|star-add|
|<i class="codicon codicon-star-delete"></i>|star-delete|
|<i class="codicon codicon-star-empty"></i>|star-empty|
|<i class="codicon codicon-star-full"></i>|star-full|
|<i class="codicon codicon-star-half"></i>|star-half|
|<i class="codicon codicon-stop"></i>|stop|
|<i class="codicon codicon-stop-circle"></i>|stop-circle|
|<i class="codicon codicon-symbol-array"></i>|symbol-array|
|<i class="codicon codicon-symbol-boolean"></i>|symbol-boolean|
|<i class="codicon codicon-symbol-class"></i>|symbol-class|
|<i class="codicon codicon-symbol-color"></i>|symbol-color|
|<i class="codicon codicon-symbol-constant"></i>|symbol-constant|
|<i class="codicon codicon-symbol-constructor"></i>|symbol-constructor|
|<i class="codicon codicon-symbol-enum"></i>|symbol-enum|
|<i class="codicon codicon-symbol-enum-member"></i>|symbol-enum-member|
|<i class="codicon codicon-symbol-event"></i>|symbol-event|
|<i class="codicon codicon-symbol-field"></i>|symbol-field|
|<i class="codicon codicon-symbol-file"></i>|symbol-file|
|<i class="codicon codicon-symbol-folder"></i>|symbol-folder|
|<i class="codicon codicon-symbol-function"></i>|symbol-function|
|<i class="codicon codicon-symbol-interface"></i>|symbol-interface|
|<i class="codicon codicon-symbol-key"></i>|symbol-key|
|<i class="codicon codicon-symbol-keyword"></i>|symbol-keyword|
|<i class="codicon codicon-symbol-method"></i>|symbol-method|
|<i class="codicon codicon-symbol-misc"></i>|symbol-misc|
|<i class="codicon codicon-symbol-module"></i>|symbol-module|
|<i class="codicon codicon-symbol-namespace"></i>|symbol-namespace|
|<i class="codicon codicon-symbol-null"></i>|symbol-null|
|<i class="codicon codicon-symbol-number"></i>|symbol-number|
|<i class="codicon codicon-symbol-numeric"></i>|symbol-numeric|
|<i class="codicon codicon-symbol-object"></i>|symbol-object|
|<i class="codicon codicon-symbol-operator"></i>|symbol-operator|
|<i class="codicon codicon-symbol-package"></i>|symbol-package|
|<i class="codicon codicon-symbol-parameter"></i>|symbol-parameter|
|<i class="codicon codicon-symbol-property"></i>|symbol-property|
|<i class="codicon codicon-symbol-reference"></i>|symbol-reference|
|<i class="codicon codicon-symbol-ruler"></i>|symbol-ruler|
|<i class="codicon codicon-symbol-snippet"></i>|symbol-snippet|
|<i class="codicon codicon-symbol-string"></i>|symbol-string|
|<i class="codicon codicon-symbol-struct"></i>|symbol-struct|
|<i class="codicon codicon-symbol-structure"></i>|symbol-structure|
|<i class="codicon codicon-symbol-text"></i>|symbol-text|
|<i class="codicon codicon-symbol-type-parameter"></i>|symbol-type-parameter|
|<i class="codicon codicon-symbol-unit"></i>|symbol-unit|
|<i class="codicon codicon-symbol-value"></i>|symbol-value|
|<i class="codicon codicon-symbol-variable"></i>|symbol-variable|
|<i class="codicon codicon-sync"></i>|sync|
|<i class="codicon codicon-sync-ignored"></i>|sync-ignored|
|<i class="codicon codicon-tag-add"></i>|tag-add|
|<i class="codicon codicon-tag-remove"></i>|tag-remove|
|<i class="codicon codicon-tag"></i>|tag|
|<i class="codicon codicon-target"></i>|target|
|<i class="codicon codicon-tasklist"></i>|tasklist|
|<i class="codicon codicon-telescope"></i>|telescope|
|<i class="codicon codicon-terminal-bash"></i>|terminal-bash|
|<i class="codicon codicon-terminal-cmd"></i>|terminal-cmd|
|<i class="codicon codicon-terminal-debian"></i>|terminal-debian|
|<i class="codicon codicon-terminal-linux"></i>|terminal-linux|
|<i class="codicon codicon-terminal-powershell"></i>|terminal-powershell|
|<i class="codicon codicon-terminal-tmux"></i>|terminal-tmux|
|<i class="codicon codicon-terminal-ubuntu"></i>|terminal-ubuntu|
|<i class="codicon codicon-terminal"></i>|terminal|
|<i class="codicon codicon-text-size"></i>|text-size|
|<i class="codicon codicon-three-bars"></i>|three-bars|
|<i class="codicon codicon-thumbsdown"></i>|thumbsdown|
|<i class="codicon codicon-thumbsdown-filled"></i>|thumbsdown-filled|
|<i class="codicon codicon-thumbsup"></i>|thumbsup|
|<i class="codicon codicon-thumbsup-filled"></i>|thumbsup-filled|
|<i class="codicon codicon-tools"></i>|tools|
|<i class="codicon codicon-trash"></i>|trash|
|<i class="codicon codicon-trashcan"></i>|trashcan|
|<i class="codicon codicon-triangle-down"></i>|triangle-down|
|<i class="codicon codicon-triangle-left"></i>|triangle-left|
|<i class="codicon codicon-triangle-right"></i>|triangle-right|
|<i class="codicon codicon-triangle-up"></i>|triangle-up|
|<i class="codicon codicon-twitter"></i>|twitter|
|<i class="codicon codicon-type-hierarchy-sub"></i>|type-hierarchy|
|<i class="codicon codicon-type-hierarchy-sub"></i>|type-hierarchy-sub|
|<i class="codicon codicon-type-hierarchy-super"></i>|type-hierarchy-super|
|<i class="codicon codicon-unfold"></i>|unfold|
|<i class="codicon codicon-ungroup-by-ref-type"></i>|ungroup-by-ref-type|
|<i class="codicon codicon-unlock"></i>|unlock|
|<i class="codicon codicon-unmute"></i>|unmute|
|<i class="codicon codicon-unverified"></i>|unverified|
|<i class="codicon codicon-variable"></i>|variable|
|<i class="codicon codicon-verified-filled"></i>|verified-filled|
|<i class="codicon codicon-verified"></i>|verified|
|<i class="codicon codicon-versions"></i>|versions|
|<i class="codicon codicon-vm"></i>|vm|
|<i class="codicon codicon-vm-active"></i>|vm-active|
|<i class="codicon codicon-vm-connect"></i>|vm-connect|
|<i class="codicon codicon-vm-outline"></i>|vm-outline|
|<i class="codicon codicon-vm-running"></i>|vm-running|
|<i class="codicon codicon-vr"></i>|vr|
|<i class="codicon codicon-warning"></i>|warning|
|<i class="codicon codicon-watch"></i>|watch|
|<i class="codicon codicon-whitespace"></i>|whitespace|
|<i class="codicon codicon-whole-word"></i>|whole-word|
|<i class="codicon codicon-window"></i>|window|
|<i class="codicon codicon-word-wrap"></i>|word-wrap|
|<i class="codicon codicon-workspace-trusted"></i>|workspace-trusted|
|<i class="codicon codicon-workspace-unknown"></i>|workspace-unknown|
|<i class="codicon codicon-workspace-untrusted"></i>|workspace-untrusted|
|<i class="codicon codicon-wrench"></i>|wrench|
|<i class="codicon codicon-wrench-subaction"></i>|wrench-subaction|
|<i class="codicon codicon-x"></i>|x|
|<i class="codicon codicon-zap"></i>|zap|
|<i class="codicon codicon-zoom-in"></i>|zoom-in|
|<i class="codicon codicon-zoom-out"></i>|zoom-out|
</div>

