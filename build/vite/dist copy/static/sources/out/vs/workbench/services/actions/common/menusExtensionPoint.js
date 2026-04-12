/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import * as resources from '../../../../base/common/resources.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { index } from '../../../../base/common/arrays.js';
import { isProposedApiEnabled } from '../../extensions/common/extensions.js';
import { Extensions as ExtensionFeaturesExtensions } from '../../extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { platform } from '../../../../base/common/process.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
const apiMenus = [
    {
        key: 'commandPalette',
        id: MenuId.CommandPalette,
        description: localize('menus.commandPalette', "The Command Palette"),
        supportsSubmenus: false
    },
    {
        key: 'touchBar',
        id: MenuId.TouchBarContext,
        description: localize('menus.touchBar', "The touch bar (macOS only)"),
        supportsSubmenus: false
    },
    {
        key: 'editor/title',
        id: MenuId.EditorTitle,
        description: localize('menus.editorTitle', "The editor title menu")
    },
    {
        key: 'modalEditor/editorTitle',
        id: MenuId.ModalEditorEditorTitle,
        description: localize('menus.modalEditorEditorTitle', "The editor title menu in the modal editor")
    },
    {
        key: 'editor/title/run',
        id: MenuId.EditorTitleRun,
        description: localize('menus.editorTitleRun', "Run submenu inside the editor title menu")
    },
    {
        key: 'editor/context',
        id: MenuId.EditorContext,
        description: localize('menus.editorContext', "The editor context menu")
    },
    {
        key: 'editor/context/copy',
        id: MenuId.EditorContextCopy,
        description: localize('menus.editorContextCopyAs', "'Copy as' submenu in the editor context menu")
    },
    {
        key: 'editor/context/share',
        id: MenuId.EditorContextShare,
        description: localize('menus.editorContextShare', "'Share' submenu in the editor context menu"),
        proposed: 'contribShareMenu'
    },
    {
        key: 'explorer/context',
        id: MenuId.ExplorerContext,
        description: localize('menus.explorerContext', "The file explorer context menu")
    },
    {
        key: 'explorer/context/share',
        id: MenuId.ExplorerContextShare,
        description: localize('menus.explorerContextShare', "'Share' submenu in the file explorer context menu"),
        proposed: 'contribShareMenu'
    },
    {
        key: 'editor/title/context',
        id: MenuId.EditorTitleContext,
        description: localize('menus.editorTabContext', "The editor tabs context menu")
    },
    {
        key: 'editor/title/context/share',
        id: MenuId.EditorTitleContextShare,
        description: localize('menus.editorTitleContextShare', "'Share' submenu inside the editor title context menu"),
        proposed: 'contribShareMenu'
    },
    {
        key: 'debug/callstack/context',
        id: MenuId.DebugCallStackContext,
        description: localize('menus.debugCallstackContext', "The debug callstack view context menu")
    },
    {
        key: 'debug/variables/context',
        id: MenuId.DebugVariablesContext,
        description: localize('menus.debugVariablesContext', "The debug variables view context menu")
    },
    {
        key: 'debug/watch/context',
        id: MenuId.DebugWatchContext,
        description: localize('menus.debugWatchContext', "The debug watch view context menu")
    },
    {
        key: 'debug/toolBar',
        id: MenuId.DebugToolBar,
        description: localize('menus.debugToolBar', "The debug toolbar menu")
    },
    {
        key: 'debug/createConfiguration',
        id: MenuId.DebugCreateConfiguration,
        proposed: 'contribDebugCreateConfiguration',
        description: localize('menus.debugCreateConfiguation', "The debug create configuration menu")
    },
    {
        key: 'notebook/variables/context',
        id: MenuId.NotebookVariablesContext,
        description: localize('menus.notebookVariablesContext', "The notebook variables view context menu")
    },
    {
        key: 'menuBar/home',
        id: MenuId.MenubarHomeMenu,
        description: localize('menus.home', "The home indicator context menu (web only)"),
        proposed: 'contribMenuBarHome',
        supportsSubmenus: false
    },
    {
        key: 'menuBar/edit/copy',
        id: MenuId.MenubarCopy,
        description: localize('menus.opy', "'Copy as' submenu in the top level Edit menu")
    },
    {
        key: 'scm/title',
        id: MenuId.SCMTitle,
        description: localize('menus.scmTitle', "The Source Control title menu")
    },
    {
        key: 'scm/sourceControl',
        id: MenuId.SCMSourceControl,
        description: localize('menus.scmSourceControl', "The Source Control menu")
    },
    {
        key: 'scm/repositories/title',
        id: MenuId.SCMSourceControlTitle,
        description: localize('menus.scmSourceControlTitle', "The Source Control Repositories title menu"),
        proposed: 'contribSourceControlTitleMenu'
    },
    {
        key: 'scm/repository',
        id: MenuId.SCMSourceControlInline,
        description: localize('menus.scmSourceControlInline', "The Source Control repository menu"),
    },
    {
        key: 'scm/resourceState/context',
        id: MenuId.SCMResourceContext,
        description: localize('menus.resourceStateContext', "The Source Control resource state context menu")
    },
    {
        key: 'scm/resourceFolder/context',
        id: MenuId.SCMResourceFolderContext,
        description: localize('menus.resourceFolderContext', "The Source Control resource folder context menu")
    },
    {
        key: 'scm/resourceGroup/context',
        id: MenuId.SCMResourceGroupContext,
        description: localize('menus.resourceGroupContext', "The Source Control resource group context menu")
    },
    {
        key: 'scm/change/title',
        id: MenuId.SCMChangeContext,
        description: localize('menus.changeTitle', "The Source Control inline change menu")
    },
    {
        key: 'scm/inputBox',
        id: MenuId.SCMInputBox,
        description: localize('menus.input', "The Source Control input box menu"),
        proposed: 'contribSourceControlInputBoxMenu'
    },
    {
        key: 'scm/history/title',
        id: MenuId.SCMHistoryTitle,
        description: localize('menus.scmHistoryTitle', "The Source Control History title menu"),
        proposed: 'contribSourceControlHistoryTitleMenu'
    },
    {
        key: 'scm/historyItem/context',
        id: MenuId.SCMHistoryItemContext,
        description: localize('menus.historyItemContext', "The Source Control history item context menu"),
        proposed: 'contribSourceControlHistoryItemMenu'
    },
    {
        key: 'scm/historyItemRef/context',
        id: MenuId.SCMHistoryItemRefContext,
        description: localize('menus.historyItemRefContext', "The Source Control history item reference context menu"),
        proposed: 'contribSourceControlHistoryItemMenu'
    },
    {
        key: 'scm/artifactGroup/context',
        id: MenuId.SCMArtifactGroupContext,
        description: localize('menus.artifactGroupContext', "The Source Control artifact group context menu"),
        proposed: 'contribSourceControlArtifactGroupMenu'
    },
    {
        key: 'scm/artifact/context',
        id: MenuId.SCMArtifactContext,
        description: localize('menus.artifactContext', "The Source Control artifact context menu"),
        proposed: 'contribSourceControlArtifactMenu'
    },
    {
        key: 'statusBar/remoteIndicator',
        id: MenuId.StatusBarRemoteIndicatorMenu,
        description: localize('menus.statusBarRemoteIndicator', "The remote indicator menu in the status bar"),
        supportsSubmenus: false
    },
    {
        key: 'terminal/context',
        id: MenuId.TerminalInstanceContext,
        description: localize('menus.terminalContext', "The terminal context menu")
    },
    {
        key: 'terminal/title/context',
        id: MenuId.TerminalTabContext,
        description: localize('menus.terminalTabContext', "The terminal tabs context menu")
    },
    {
        key: 'view/title',
        id: MenuId.ViewTitle,
        description: localize('view.viewTitle', "The contributed view title menu")
    },
    {
        key: 'viewContainer/title',
        id: MenuId.ViewContainerTitle,
        description: localize('view.containerTitle', "The contributed view container title menu"),
        proposed: 'contribViewContainerTitle'
    },
    {
        key: 'view/item/context',
        id: MenuId.ViewItemContext,
        description: localize('view.itemContext', "The contributed view item context menu")
    },
    {
        key: 'comments/comment/editorActions',
        id: MenuId.CommentEditorActions,
        description: localize('commentThread.editorActions', "The contributed comment editor actions"),
        proposed: 'contribCommentEditorActionsMenu'
    },
    {
        key: 'comments/commentThread/title',
        id: MenuId.CommentThreadTitle,
        description: localize('commentThread.title', "The contributed comment thread title menu")
    },
    {
        key: 'comments/commentThread/context',
        id: MenuId.CommentThreadActions,
        description: localize('commentThread.actions', "The contributed comment thread context menu, rendered as buttons below the comment editor"),
        supportsSubmenus: false
    },
    {
        key: 'comments/commentThread/additionalActions',
        id: MenuId.CommentThreadAdditionalActions,
        description: localize('commentThread.actions', "The contributed comment thread context menu, rendered as buttons below the comment editor"),
        supportsSubmenus: true,
        proposed: 'contribCommentThreadAdditionalMenu'
    },
    {
        key: 'comments/commentThread/title/context',
        id: MenuId.CommentThreadTitleContext,
        description: localize('commentThread.titleContext', "The contributed comment thread title's peek context menu, rendered as a right click menu on the comment thread's peek title."),
        proposed: 'contribCommentPeekContext'
    },
    {
        key: 'comments/comment/title',
        id: MenuId.CommentTitle,
        description: localize('comment.title', "The contributed comment title menu")
    },
    {
        key: 'comments/comment/context',
        id: MenuId.CommentActions,
        description: localize('comment.actions', "The contributed comment context menu, rendered as buttons below the comment editor"),
        supportsSubmenus: false
    },
    {
        key: 'comments/commentThread/comment/context',
        id: MenuId.CommentThreadCommentContext,
        description: localize('comment.commentContext', "The contributed comment context menu, rendered as a right click menu on the an individual comment in the comment thread's peek view."),
        proposed: 'contribCommentPeekContext'
    },
    {
        key: 'commentsView/commentThread/context',
        id: MenuId.CommentsViewThreadActions,
        description: localize('commentsView.threadActions', "The contributed comment thread context menu in the comments view"),
        proposed: 'contribCommentsViewThreadMenus'
    },
    {
        key: 'notebook/toolbar',
        id: MenuId.NotebookToolbar,
        description: localize('notebook.toolbar', "The contributed notebook toolbar menu")
    },
    {
        key: 'notebook/kernelSource',
        id: MenuId.NotebookKernelSource,
        description: localize('notebook.kernelSource', "The contributed notebook kernel sources menu"),
        proposed: 'notebookKernelSource'
    },
    {
        key: 'notebook/cell/title',
        id: MenuId.NotebookCellTitle,
        description: localize('notebook.cell.title', "The contributed notebook cell title menu")
    },
    {
        key: 'notebook/cell/execute',
        id: MenuId.NotebookCellExecute,
        description: localize('notebook.cell.execute', "The contributed notebook cell execution menu")
    },
    {
        key: 'interactive/toolbar',
        id: MenuId.InteractiveToolbar,
        description: localize('interactive.toolbar', "The contributed interactive toolbar menu"),
    },
    {
        key: 'interactive/cell/title',
        id: MenuId.InteractiveCellTitle,
        description: localize('interactive.cell.title', "The contributed interactive cell title menu"),
    },
    {
        key: 'issue/reporter',
        id: MenuId.IssueReporter,
        description: localize('issue.reporter', "The contributed issue reporter menu")
    },
    {
        key: 'testing/item/context',
        id: MenuId.TestItem,
        description: localize('testing.item.context', "The contributed test item menu"),
    },
    {
        key: 'testing/item/gutter',
        id: MenuId.TestItemGutter,
        description: localize('testing.item.gutter.title', "The menu for a gutter decoration for a test item"),
    },
    {
        key: 'testing/profiles/context',
        id: MenuId.TestProfilesContext,
        description: localize('testing.profiles.context.title', "The menu for configuring testing profiles."),
    },
    {
        key: 'testing/item/result',
        id: MenuId.TestPeekElement,
        description: localize('testing.item.result.title', "The menu for an item in the Test Results view or peek."),
    },
    {
        key: 'testing/message/context',
        id: MenuId.TestMessageContext,
        description: localize('testing.message.context.title', "A prominent button overlaying editor content where the message is displayed"),
    },
    {
        key: 'testing/message/content',
        id: MenuId.TestMessageContent,
        description: localize('testing.message.content.title', "Context menu for the message in the results tree"),
    },
    {
        key: 'extension/context',
        id: MenuId.ExtensionContext,
        description: localize('menus.extensionContext', "The extension context menu")
    },
    {
        key: 'timeline/title',
        id: MenuId.TimelineTitle,
        description: localize('view.timelineTitle', "The Timeline view title menu")
    },
    {
        key: 'timeline/item/context',
        id: MenuId.TimelineItemContext,
        description: localize('view.timelineContext', "The Timeline view item context menu")
    },
    {
        key: 'ports/item/context',
        id: MenuId.TunnelContext,
        description: localize('view.tunnelContext', "The Ports view item context menu")
    },
    {
        key: 'ports/item/origin/inline',
        id: MenuId.TunnelOriginInline,
        description: localize('view.tunnelOriginInline', "The Ports view item origin inline menu")
    },
    {
        key: 'ports/item/port/inline',
        id: MenuId.TunnelPortInline,
        description: localize('view.tunnelPortInline', "The Ports view item port inline menu")
    },
    {
        key: 'file/newFile',
        id: MenuId.NewFile,
        description: localize('file.newFile', "The 'New File...' quick pick, shown on welcome page and File menu."),
        supportsSubmenus: false,
    },
    {
        key: 'webview/context',
        id: MenuId.WebviewContext,
        description: localize('webview.context', "The webview context menu")
    },
    {
        key: 'file/share',
        id: MenuId.MenubarShare,
        description: localize('menus.share', "Share submenu shown in the top level File menu."),
        proposed: 'contribShareMenu'
    },
    {
        key: 'editor/inlineCompletions/actions',
        id: MenuId.InlineCompletionsActions,
        description: localize('inlineCompletions.actions', "The actions shown when hovering on an inline completion"),
        supportsSubmenus: false,
        proposed: 'inlineCompletionsAdditions'
    },
    {
        key: 'editor/content',
        id: MenuId.EditorContent,
        description: localize('merge.toolbar', "The prominent button in an editor, overlays its content"),
        proposed: 'contribEditorContentMenu'
    },
    {
        key: 'editor/lineNumber/context',
        id: MenuId.EditorLineNumberContext,
        description: localize('editorLineNumberContext', "The contributed editor line number context menu")
    },
    {
        key: 'mergeEditor/result/title',
        id: MenuId.MergeInputResultToolbar,
        description: localize('menus.mergeEditorResult', "The result toolbar of the merge editor"),
        proposed: 'contribMergeEditorMenus'
    },
    {
        key: 'multiDiffEditor/content',
        id: MenuId.MultiDiffEditorContent,
        description: localize('menus.multiDiffEditorContent', "A prominent button overlaying the multi diff editor"),
        proposed: 'contribEditorContentMenu'
    },
    {
        key: 'multiDiffEditor/resource/title',
        id: MenuId.MultiDiffEditorFileToolbar,
        description: localize('menus.multiDiffEditorResource', "The resource toolbar in the multi diff editor"),
        proposed: 'contribMultiDiffEditorMenus'
    },
    {
        key: 'diffEditor/gutter/hunk',
        id: MenuId.DiffEditorHunkToolbar,
        description: localize('menus.diffEditorGutterToolBarMenus', "The gutter toolbar in the diff editor"),
        proposed: 'contribDiffEditorGutterToolBarMenus'
    },
    {
        key: 'diffEditor/gutter/selection',
        id: MenuId.DiffEditorSelectionToolbar,
        description: localize('menus.diffEditorGutterToolBarMenus', "The gutter toolbar in the diff editor"),
        proposed: 'contribDiffEditorGutterToolBarMenus'
    },
    {
        key: 'searchPanel/aiResults/commands',
        id: MenuId.SearchActionMenu,
        description: localize('searchPanel.aiResultsCommands', "The commands that will contribute to the menu rendered as buttons next to the AI search title"),
    },
    {
        key: 'editor/context/chat',
        id: MenuId.ChatTextEditorMenu,
        description: localize('menus.chatTextEditor', "The Chat submenu in the text editor context menu."),
        supportsSubmenus: false,
        proposed: 'chatParticipantPrivate'
    },
    {
        key: 'chat/input/editing/sessionToolbar',
        id: MenuId.ChatEditingSessionChangesToolbar,
        description: localize('menus.chatEditingSessionChangesToolbar', "The Chat Editing widget toolbar menu for session changes."),
        proposed: 'chatSessionsProvider'
    },
    {
        key: 'chat/input/editing/sessionApplyActions',
        id: MenuId.ChatEditingSessionApplySubmenu,
        description: localize('menus.chatEditingSessionApplySubmenu', "Submenu for apply actions in the Chat Editing session changes toolbar."),
        proposed: 'chatSessionsProvider'
    },
    {
        key: 'chat/input/editing/sessionTitleToolbar',
        id: MenuId.ChatEditingSessionTitleToolbar,
        description: localize('menus.chatEditingSessionTitleToolbar', "The Chat Editing widget toolbar menu for session title."),
        proposed: 'chatSessionsProvider'
    },
    {
        key: 'chat/input/editing/sessionChangeToolbar',
        id: MenuId.ChatEditingSessionChangeToolbar,
        description: localize('menus.chatEditingSessionChangeToolbar', "The Chat Editing widget toolbar menu for session changes."),
        proposed: 'chatSessionsProvider'
    },
    {
        // TODO: rename this to something like: `chatSessions/item/inline`
        key: 'chat/chatSessions',
        id: MenuId.AgentSessionsContext,
        description: localize('menus.chatSessions', "The Chat Sessions menu."),
        supportsSubmenus: false,
        proposed: 'chatSessionsProvider'
    },
    {
        key: 'chatSessions/newSession',
        id: MenuId.AgentSessionsCreateSubMenu,
        description: localize('menus.chatSessionsNewSession', "Menu for new chat sessions."),
        supportsSubmenus: false,
        proposed: 'chatSessionsProvider'
    },
    {
        key: 'chat/multiDiff/context',
        id: MenuId.ChatMultiDiffContext,
        description: localize('menus.chatMultiDiffContext', "The Chat Multi-Diff context menu."),
        supportsSubmenus: false,
        proposed: 'chatSessionsProvider',
    },
    {
        key: 'chat/customizations/create',
        id: MenuId.for('AICustomizationManagementCreate'),
        description: localize('menus.chatCustomizationsCreate', "The create button in the Chat Customizations management editor."),
        supportsSubmenus: false,
        proposed: 'chatSessionCustomizationProvider',
    },
    {
        key: 'chat/editor/inlineGutter',
        id: MenuId.ChatEditorInlineMenu,
        description: localize('menus.chatEditorInlineGutter', "The inline gutter menu in the chat editor."),
        supportsSubmenus: false,
        proposed: 'contribChatEditorInlineGutterMenu',
    },
    {
        key: 'chat/contextUsage/actions',
        id: MenuId.ChatContextUsageActions,
        description: localize('menus.chatContextUsageActions', "Actions in the chat context usage details popup."),
        proposed: 'chatParticipantAdditions'
    },
    {
        key: 'chat/newSession',
        id: MenuId.ChatNewMenu,
        description: localize('menus.chatNewSession', "The Chat new session menu."),
        proposed: 'chatSessionsProvider'
    },
];
var schema;
(function (schema) {
    // --- menus, submenus contribution point
    function isMenuItem(item) {
        return typeof item.command === 'string';
    }
    schema.isMenuItem = isMenuItem;
    function isValidMenuItem(item, collector) {
        if (typeof item.command !== 'string') {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
            return false;
        }
        if (item.alt && typeof item.alt !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'alt'));
            return false;
        }
        if (item.when && typeof item.when !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
            return false;
        }
        if (item.group && typeof item.group !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'group'));
            return false;
        }
        return true;
    }
    schema.isValidMenuItem = isValidMenuItem;
    function isValidSubmenuItem(item, collector) {
        if (typeof item.submenu !== 'string') {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'submenu'));
            return false;
        }
        if (item.when && typeof item.when !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
            return false;
        }
        if (item.group && typeof item.group !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'group'));
            return false;
        }
        return true;
    }
    schema.isValidSubmenuItem = isValidSubmenuItem;
    function isValidItems(items, collector) {
        if (!Array.isArray(items)) {
            collector.error(localize('requirearray', "submenu items must be an array"));
            return false;
        }
        for (const item of items) {
            if (isMenuItem(item)) {
                if (!isValidMenuItem(item, collector)) {
                    return false;
                }
            }
            else {
                if (!isValidSubmenuItem(item, collector)) {
                    return false;
                }
            }
        }
        return true;
    }
    schema.isValidItems = isValidItems;
    function isValidSubmenu(submenu, collector) {
        if (typeof submenu !== 'object') {
            collector.error(localize('require', "submenu items must be an object"));
            return false;
        }
        if (typeof submenu.id !== 'string') {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'id'));
            return false;
        }
        if (typeof submenu.label !== 'string') {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'label'));
            return false;
        }
        return true;
    }
    schema.isValidSubmenu = isValidSubmenu;
    const menuItem = {
        type: 'object',
        required: ['command'],
        properties: {
            command: {
                description: localize('vscode.extension.contributes.menuItem.command', 'Identifier of the command to execute. The command must be declared in the \'commands\'-section'),
                type: 'string'
            },
            alt: {
                description: localize('vscode.extension.contributes.menuItem.alt', 'Identifier of an alternative command to execute. The command must be declared in the \'commands\'-section'),
                type: 'string'
            },
            when: {
                description: localize('vscode.extension.contributes.menuItem.when', 'Condition which must be true to show this item'),
                type: 'string'
            },
            group: {
                description: localize('vscode.extension.contributes.menuItem.group', 'Group into which this item belongs'),
                type: 'string'
            }
        }
    };
    const submenuItem = {
        type: 'object',
        required: ['submenu'],
        properties: {
            submenu: {
                description: localize('vscode.extension.contributes.menuItem.submenu', 'Identifier of the submenu to display in this item.'),
                type: 'string'
            },
            when: {
                description: localize('vscode.extension.contributes.menuItem.when', 'Condition which must be true to show this item'),
                type: 'string'
            },
            group: {
                description: localize('vscode.extension.contributes.menuItem.group', 'Group into which this item belongs'),
                type: 'string'
            }
        }
    };
    const submenu = {
        type: 'object',
        required: ['id', 'label'],
        properties: {
            id: {
                description: localize('vscode.extension.contributes.submenu.id', 'Identifier of the menu to display as a submenu.'),
                type: 'string'
            },
            label: {
                description: localize('vscode.extension.contributes.submenu.label', 'The label of the menu item which leads to this submenu.'),
                type: 'string'
            },
            icon: {
                description: localize({ key: 'vscode.extension.contributes.submenu.icon', comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the submenu in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
                anyOf: [{
                        type: 'string'
                    },
                    {
                        type: 'object',
                        properties: {
                            light: {
                                description: localize('vscode.extension.contributes.submenu.icon.light', 'Icon path when a light theme is used'),
                                type: 'string'
                            },
                            dark: {
                                description: localize('vscode.extension.contributes.submenu.icon.dark', 'Icon path when a dark theme is used'),
                                type: 'string'
                            }
                        }
                    }]
            }
        }
    };
    schema.menusContribution = {
        description: localize('vscode.extension.contributes.menus', "Contributes menu items to the editor"),
        type: 'object',
        properties: index(apiMenus, menu => menu.key, menu => ({
            markdownDescription: menu.proposed ? localize('proposed', "Proposed API, requires `enabledApiProposal: [\"{0}\"]` - {1}", menu.proposed, menu.description) : menu.description,
            type: 'array',
            items: menu.supportsSubmenus === false ? menuItem : { oneOf: [menuItem, submenuItem] }
        })),
        additionalProperties: {
            description: 'Submenu',
            type: 'array',
            items: { oneOf: [menuItem, submenuItem] }
        }
    };
    schema.submenusContribution = {
        description: localize('vscode.extension.contributes.submenus', "Contributes submenu items to the editor"),
        type: 'array',
        items: submenu
    };
    function isValidCommand(command, collector) {
        if (!command) {
            collector.error(localize('nonempty', "expected non-empty value."));
            return false;
        }
        if (isFalsyOrWhitespace(command.command)) {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
            return false;
        }
        if (!isValidLocalizedString(command.title, collector, 'title')) {
            return false;
        }
        if (command.shortTitle && !isValidLocalizedString(command.shortTitle, collector, 'shortTitle')) {
            return false;
        }
        if (command.enablement && typeof command.enablement !== 'string') {
            collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'precondition'));
            return false;
        }
        if (command.category && !isValidLocalizedString(command.category, collector, 'category')) {
            return false;
        }
        if (!isValidIcon(command.icon, collector)) {
            return false;
        }
        return true;
    }
    schema.isValidCommand = isValidCommand;
    function isValidIcon(icon, collector) {
        if (typeof icon === 'undefined') {
            return true;
        }
        if (typeof icon === 'string') {
            return true;
        }
        else if (typeof icon.dark === 'string' && typeof icon.light === 'string') {
            return true;
        }
        collector.error(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
        return false;
    }
    function isValidLocalizedString(localized, collector, propertyName) {
        if (typeof localized === 'undefined') {
            collector.error(localize('requireStringOrObject', "property `{0}` is mandatory and must be of type `string` or `object`", propertyName));
            return false;
        }
        else if (typeof localized === 'string' && isFalsyOrWhitespace(localized)) {
            collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", propertyName));
            return false;
        }
        else if (typeof localized !== 'string' && (isFalsyOrWhitespace(localized.original) || isFalsyOrWhitespace(localized.value))) {
            collector.error(localize('requirestrings', "properties `{0}` and `{1}` are mandatory and must be of type `string`", `${propertyName}.value`, `${propertyName}.original`));
            return false;
        }
        return true;
    }
    const commandType = {
        type: 'object',
        required: ['command', 'title'],
        properties: {
            command: {
                description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
                type: 'string'
            },
            title: {
                description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI'),
                type: 'string'
            },
            shortTitle: {
                markdownDescription: localize('vscode.extension.contributes.commandType.shortTitle', '(Optional) Short title by which the command is represented in the UI. Menus pick either `title` or `shortTitle` depending on the context in which they show commands.'),
                type: 'string'
            },
            category: {
                description: localize('vscode.extension.contributes.commandType.category', '(Optional) Category string by which the command is grouped in the UI'),
                type: 'string'
            },
            enablement: {
                description: localize('vscode.extension.contributes.commandType.precondition', '(Optional) Condition which must be true to enable the command in the UI (menu and keybindings). Does not prevent executing the command by other means, like the `executeCommand`-api.'),
                type: 'string'
            },
            icon: {
                description: localize({ key: 'vscode.extension.contributes.commandType.icon', comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the command in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
                anyOf: [{
                        type: 'string'
                    },
                    {
                        type: 'object',
                        properties: {
                            light: {
                                description: localize('vscode.extension.contributes.commandType.icon.light', 'Icon path when a light theme is used'),
                                type: 'string'
                            },
                            dark: {
                                description: localize('vscode.extension.contributes.commandType.icon.dark', 'Icon path when a dark theme is used'),
                                type: 'string'
                            }
                        }
                    }]
            }
        }
    };
    schema.commandsContribution = {
        description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
        oneOf: [
            commandType,
            {
                type: 'array',
                items: commandType
            }
        ]
    };
})(schema || (schema = {}));
const _commandRegistrations = new DisposableStore();
export const commandsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'commands',
    jsonSchema: schema.commandsContribution,
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            if (contrib.command) {
                yield `onCommand:${contrib.command}`;
            }
        }
    }
});
commandsExtensionPoint.setHandler(extensions => {
    function handleCommand(userFriendlyCommand, extension) {
        if (!schema.isValidCommand(userFriendlyCommand, extension.collector)) {
            return;
        }
        const { icon, enablement, category, title, shortTitle, command } = userFriendlyCommand;
        let absoluteIcon;
        if (icon) {
            if (typeof icon === 'string') {
                absoluteIcon = ThemeIcon.fromString(icon) ?? { dark: resources.joinPath(extension.description.extensionLocation, icon), light: resources.joinPath(extension.description.extensionLocation, icon) };
            }
            else {
                absoluteIcon = {
                    dark: resources.joinPath(extension.description.extensionLocation, icon.dark),
                    light: resources.joinPath(extension.description.extensionLocation, icon.light)
                };
            }
        }
        const existingCmd = MenuRegistry.getCommand(command);
        if (existingCmd) {
            if (existingCmd.source) {
                extension.collector.info(localize('dup1', "Command `{0}` already registered by {1} ({2})", userFriendlyCommand.command, existingCmd.source.title, existingCmd.source.id));
            }
            else {
                extension.collector.info(localize('dup0', "Command `{0}` already registered", userFriendlyCommand.command));
            }
        }
        _commandRegistrations.add(MenuRegistry.addCommand({
            id: command,
            title,
            source: { id: extension.description.identifier.value, title: extension.description.displayName ?? extension.description.name },
            shortTitle,
            tooltip: title,
            category,
            precondition: ContextKeyExpr.deserialize(enablement),
            icon: absoluteIcon
        }));
    }
    // remove all previous command registrations
    _commandRegistrations.clear();
    for (const extension of extensions) {
        const { value } = extension;
        if (Array.isArray(value)) {
            for (const command of value) {
                handleCommand(command, extension);
            }
        }
        else {
            handleCommand(value, extension);
        }
    }
});
const _submenus = new Map();
const submenusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'submenus',
    jsonSchema: schema.submenusContribution
});
submenusExtensionPoint.setHandler(extensions => {
    _submenus.clear();
    for (const extension of extensions) {
        const { value, collector } = extension;
        for (const [, submenuInfo] of Object.entries(value)) {
            if (!schema.isValidSubmenu(submenuInfo, collector)) {
                continue;
            }
            if (!submenuInfo.id) {
                collector.warn(localize('submenuId.invalid.id', "`{0}` is not a valid submenu identifier", submenuInfo.id));
                continue;
            }
            if (_submenus.has(submenuInfo.id)) {
                collector.info(localize('submenuId.duplicate.id', "The `{0}` submenu was already previously registered.", submenuInfo.id));
                continue;
            }
            if (!submenuInfo.label) {
                collector.warn(localize('submenuId.invalid.label', "`{0}` is not a valid submenu label", submenuInfo.label));
                continue;
            }
            let absoluteIcon;
            if (submenuInfo.icon) {
                if (typeof submenuInfo.icon === 'string') {
                    absoluteIcon = ThemeIcon.fromString(submenuInfo.icon) || { dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon) };
                }
                else {
                    absoluteIcon = {
                        dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.dark),
                        light: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.light)
                    };
                }
            }
            const item = {
                id: MenuId.for(`api:${submenuInfo.id}`),
                label: submenuInfo.label,
                icon: absoluteIcon
            };
            _submenus.set(submenuInfo.id, item);
        }
    }
});
const _apiMenusByKey = new Map(apiMenus.map(menu => ([menu.key, menu])));
const _menuRegistrations = new DisposableStore();
const _submenuMenuItems = new Map();
const menusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'menus',
    jsonSchema: schema.menusContribution,
    deps: [submenusExtensionPoint]
});
menusExtensionPoint.setHandler(extensions => {
    // remove all previous menu registrations
    _menuRegistrations.clear();
    _submenuMenuItems.clear();
    for (const extension of extensions) {
        const { value, collector } = extension;
        for (const entry of Object.entries(value)) {
            if (!schema.isValidItems(entry[1], collector)) {
                continue;
            }
            let menu = _apiMenusByKey.get(entry[0]);
            if (!menu) {
                const submenu = _submenus.get(entry[0]);
                if (submenu) {
                    menu = {
                        key: entry[0],
                        id: submenu.id,
                        description: ''
                    };
                }
            }
            if (!menu) {
                continue;
            }
            if (menu.proposed && !isProposedApiEnabled(extension.description, menu.proposed)) {
                collector.error(localize('proposedAPI.invalid', "{0} is a proposed menu identifier. It requires 'package.json#enabledApiProposals: [\"{1}\"]' and is only available when running out of dev or with the following command line switch: --enable-proposed-api {2}", entry[0], menu.proposed, extension.description.identifier.value));
                continue;
            }
            for (const menuItem of entry[1]) {
                let item;
                if (schema.isMenuItem(menuItem)) {
                    const command = MenuRegistry.getCommand(menuItem.command);
                    const alt = menuItem.alt && MenuRegistry.getCommand(menuItem.alt) || undefined;
                    if (!command) {
                        collector.error(localize('missing.command', "Menu item references a command `{0}` which is not defined in the 'commands' section.", menuItem.command));
                        continue;
                    }
                    if (menuItem.alt && !alt) {
                        collector.warn(localize('missing.altCommand', "Menu item references an alt-command `{0}` which is not defined in the 'commands' section.", menuItem.alt));
                    }
                    if (menuItem.command === menuItem.alt) {
                        collector.info(localize('dupe.command', "Menu item references the same command as default and alt-command"));
                    }
                    item = { command, alt, group: undefined, order: undefined, when: undefined };
                }
                else {
                    if (menu.supportsSubmenus === false) {
                        collector.error(localize('unsupported.submenureference', "Menu item references a submenu for a menu which doesn't have submenu support."));
                        continue;
                    }
                    const submenu = _submenus.get(menuItem.submenu);
                    if (!submenu) {
                        collector.error(localize('missing.submenu', "Menu item references a submenu `{0}` which is not defined in the 'submenus' section.", menuItem.submenu));
                        continue;
                    }
                    let submenuRegistrations = _submenuMenuItems.get(menu.id.id);
                    if (!submenuRegistrations) {
                        submenuRegistrations = new Set();
                        _submenuMenuItems.set(menu.id.id, submenuRegistrations);
                    }
                    if (submenuRegistrations.has(submenu.id.id)) {
                        collector.warn(localize('submenuItem.duplicate', "The `{0}` submenu was already contributed to the `{1}` menu.", menuItem.submenu, entry[0]));
                        continue;
                    }
                    submenuRegistrations.add(submenu.id.id);
                    item = { submenu: submenu.id, icon: submenu.icon, title: submenu.label, group: undefined, order: undefined, when: undefined };
                }
                if (menuItem.group) {
                    const idx = menuItem.group.lastIndexOf('@');
                    if (idx > 0) {
                        item.group = menuItem.group.substr(0, idx);
                        item.order = Number(menuItem.group.substr(idx + 1)) || undefined;
                    }
                    else {
                        item.group = menuItem.group;
                    }
                }
                if (menu.id === MenuId.ViewContainerTitle && !menuItem.when?.includes('viewContainer == workbench.view.debug')) {
                    // Not a perfect check but enough to communicate that this proposed extension point is currently only for the debug view container
                    collector.error(localize('viewContainerTitle.when', "The {0} menu contribution must check {1} in its {2} clause.", '`viewContainer/title`', '`viewContainer == workbench.view.debug`', '"when"'));
                    continue;
                }
                item.when = ContextKeyExpr.deserialize(menuItem.when);
                _menuRegistrations.add(MenuRegistry.appendMenuItem(menu.id, item));
            }
        }
    }
});
let CommandsTableRenderer = class CommandsTableRenderer extends Disposable {
    constructor(_keybindingService) {
        super();
        this._keybindingService = _keybindingService;
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.commands;
    }
    render(manifest) {
        const rawCommands = manifest.contributes?.commands || [];
        const commands = rawCommands.map(c => ({
            id: c.command,
            title: c.title,
            keybindings: [],
            menus: []
        }));
        const byId = index(commands, c => c.id);
        const menus = manifest.contributes?.menus || {};
        // Add to commandPalette array any commands not explicitly contributed to it
        const implicitlyOnCommandPalette = index(commands, c => c.id);
        if (menus['commandPalette']) {
            for (const command of menus['commandPalette']) {
                delete implicitlyOnCommandPalette[command.command];
            }
        }
        if (Object.keys(implicitlyOnCommandPalette).length) {
            if (!menus['commandPalette']) {
                menus['commandPalette'] = [];
            }
            for (const command in implicitlyOnCommandPalette) {
                menus['commandPalette'].push({ command });
            }
        }
        for (const context in menus) {
            for (const menu of menus[context]) {
                // This typically happens for the commandPalette context
                if (menu.when === 'false') {
                    continue;
                }
                if (menu.command) {
                    let command = byId[menu.command];
                    if (command) {
                        if (!command.menus.includes(context)) {
                            command.menus.push(context);
                        }
                    }
                    else {
                        command = { id: menu.command, title: '', keybindings: [], menus: [context] };
                        byId[command.id] = command;
                        commands.push(command);
                    }
                }
            }
        }
        const rawKeybindings = manifest.contributes?.keybindings ? (Array.isArray(manifest.contributes.keybindings) ? manifest.contributes.keybindings : [manifest.contributes.keybindings]) : [];
        rawKeybindings.forEach(rawKeybinding => {
            const keybinding = this.resolveKeybinding(rawKeybinding);
            if (!keybinding) {
                return;
            }
            let command = byId[rawKeybinding.command];
            if (command) {
                command.keybindings.push(keybinding);
            }
            else {
                command = { id: rawKeybinding.command, title: '', keybindings: [keybinding], menus: [] };
                byId[command.id] = command;
                commands.push(command);
            }
        });
        if (!commands.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('command name', "ID"),
            localize('command title', "Title"),
            localize('keyboard shortcuts', "Keyboard Shortcuts"),
            localize('menuContexts', "Menu Contexts")
        ];
        const rows = commands.sort((a, b) => a.id.localeCompare(b.id))
            .map(command => {
            return [
                new MarkdownString().appendMarkdown(`\`${command.id}\``),
                typeof command.title === 'string' ? command.title : command.title.value,
                command.keybindings,
                new MarkdownString().appendMarkdown(`${command.menus.sort((a, b) => a.localeCompare(b)).map(menu => `\`${menu}\``).join('&nbsp;')}`),
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
    resolveKeybinding(rawKeyBinding) {
        let key;
        switch (platform) {
            case 'win32':
                key = rawKeyBinding.win;
                break;
            case 'linux':
                key = rawKeyBinding.linux;
                break;
            case 'darwin':
                key = rawKeyBinding.mac;
                break;
        }
        return this._keybindingService.resolveUserBinding(key ?? rawKeyBinding.key)[0];
    }
};
CommandsTableRenderer = __decorate([
    __param(0, IKeybindingService)
], CommandsTableRenderer);
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'commands',
    label: localize('commands', "Commands"),
    access: {
        canToggle: false,
    },
    renderer: new SyncDescriptor(CommandsTableRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudXNFeHRlbnNpb25Qb2ludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hY3Rpb25zL2NvbW1vbi9tZW51c0V4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RSxPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBa0Qsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNuSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQTJCLE1BQU0sZ0RBQWdELENBQUM7QUFFL0csT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdFLE9BQU8sRUFBbUcsVUFBVSxJQUFJLDJCQUEyQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFbk4sT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBVzFGLE1BQU0sUUFBUSxHQUFlO0lBQzVCO1FBQ0MsR0FBRyxFQUFFLGdCQUFnQjtRQUNyQixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7UUFDekIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQztRQUNwRSxnQkFBZ0IsRUFBRSxLQUFLO0tBQ3ZCO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsVUFBVTtRQUNmLEVBQUUsRUFBRSxNQUFNLENBQUMsZUFBZTtRQUMxQixXQUFXLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDRCQUE0QixDQUFDO1FBQ3JFLGdCQUFnQixFQUFFLEtBQUs7S0FDdkI7SUFDRDtRQUNDLEdBQUcsRUFBRSxjQUFjO1FBQ25CLEVBQUUsRUFBRSxNQUFNLENBQUMsV0FBVztRQUN0QixXQUFXLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHVCQUF1QixDQUFDO0tBQ25FO0lBQ0Q7UUFDQyxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLEVBQUUsRUFBRSxNQUFNLENBQUMsc0JBQXNCO1FBQ2pDLFdBQVcsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsMkNBQTJDLENBQUM7S0FDbEc7SUFDRDtRQUNDLEdBQUcsRUFBRSxrQkFBa0I7UUFDdkIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO1FBQ3pCLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsMENBQTBDLENBQUM7S0FDekY7SUFDRDtRQUNDLEdBQUcsRUFBRSxnQkFBZ0I7UUFDckIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO1FBQ3hCLFdBQVcsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUseUJBQXlCLENBQUM7S0FDdkU7SUFDRDtRQUNDLEdBQUcsRUFBRSxxQkFBcUI7UUFDMUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7UUFDNUIsV0FBVyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSw4Q0FBOEMsQ0FBQztLQUNsRztJQUNEO1FBQ0MsR0FBRyxFQUFFLHNCQUFzQjtRQUMzQixFQUFFLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtRQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDRDQUE0QyxDQUFDO1FBQy9GLFFBQVEsRUFBRSxrQkFBa0I7S0FDNUI7SUFDRDtRQUNDLEdBQUcsRUFBRSxrQkFBa0I7UUFDdkIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO1FBQzFCLFdBQVcsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsZ0NBQWdDLENBQUM7S0FDaEY7SUFDRDtRQUNDLEdBQUcsRUFBRSx3QkFBd0I7UUFDN0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxvQkFBb0I7UUFDL0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxtREFBbUQsQ0FBQztRQUN4RyxRQUFRLEVBQUUsa0JBQWtCO0tBQzVCO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsc0JBQXNCO1FBQzNCLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO1FBQzdCLFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsOEJBQThCLENBQUM7S0FDL0U7SUFDRDtRQUNDLEdBQUcsRUFBRSw0QkFBNEI7UUFDakMsRUFBRSxFQUFFLE1BQU0sQ0FBQyx1QkFBdUI7UUFDbEMsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxzREFBc0QsQ0FBQztRQUM5RyxRQUFRLEVBQUUsa0JBQWtCO0tBQzVCO0lBQ0Q7UUFDQyxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO1FBQ2hDLFdBQVcsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsdUNBQXVDLENBQUM7S0FDN0Y7SUFDRDtRQUNDLEdBQUcsRUFBRSx5QkFBeUI7UUFDOUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxxQkFBcUI7UUFDaEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx1Q0FBdUMsQ0FBQztLQUM3RjtJQUNEO1FBQ0MsR0FBRyxFQUFFLHFCQUFxQjtRQUMxQixFQUFFLEVBQUUsTUFBTSxDQUFDLGlCQUFpQjtRQUM1QixXQUFXLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLG1DQUFtQyxDQUFDO0tBQ3JGO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZUFBZTtRQUNwQixFQUFFLEVBQUUsTUFBTSxDQUFDLFlBQVk7UUFDdkIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSx3QkFBd0IsQ0FBQztLQUNyRTtJQUNEO1FBQ0MsR0FBRyxFQUFFLDJCQUEyQjtRQUNoQyxFQUFFLEVBQUUsTUFBTSxDQUFDLHdCQUF3QjtRQUNuQyxRQUFRLEVBQUUsaUNBQWlDO1FBQzNDLFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUscUNBQXFDLENBQUM7S0FDN0Y7SUFDRDtRQUNDLEdBQUcsRUFBRSw0QkFBNEI7UUFDakMsRUFBRSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0I7UUFDbkMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSwwQ0FBMEMsQ0FBQztLQUNuRztJQUNEO1FBQ0MsR0FBRyxFQUFFLGNBQWM7UUFDbkIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO1FBQzFCLFdBQVcsRUFBRSxRQUFRLENBQUMsWUFBWSxFQUFFLDRDQUE0QyxDQUFDO1FBQ2pGLFFBQVEsRUFBRSxvQkFBb0I7UUFDOUIsZ0JBQWdCLEVBQUUsS0FBSztLQUN2QjtJQUNEO1FBQ0MsR0FBRyxFQUFFLG1CQUFtQjtRQUN4QixFQUFFLEVBQUUsTUFBTSxDQUFDLFdBQVc7UUFDdEIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsOENBQThDLENBQUM7S0FDbEY7SUFDRDtRQUNDLEdBQUcsRUFBRSxXQUFXO1FBQ2hCLEVBQUUsRUFBRSxNQUFNLENBQUMsUUFBUTtRQUNuQixXQUFXLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLCtCQUErQixDQUFDO0tBQ3hFO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsbUJBQW1CO1FBQ3hCLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO1FBQzNCLFdBQVcsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUseUJBQXlCLENBQUM7S0FDMUU7SUFDRDtRQUNDLEdBQUcsRUFBRSx3QkFBd0I7UUFDN0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxxQkFBcUI7UUFDaEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSw0Q0FBNEMsQ0FBQztRQUNsRyxRQUFRLEVBQUUsK0JBQStCO0tBQ3pDO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0JBQWdCO1FBQ3JCLEVBQUUsRUFBRSxNQUFNLENBQUMsc0JBQXNCO1FBQ2pDLFdBQVcsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsb0NBQW9DLENBQUM7S0FDM0Y7SUFDRDtRQUNDLEdBQUcsRUFBRSwyQkFBMkI7UUFDaEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxnREFBZ0QsQ0FBQztLQUNyRztJQUNEO1FBQ0MsR0FBRyxFQUFFLDRCQUE0QjtRQUNqQyxFQUFFLEVBQUUsTUFBTSxDQUFDLHdCQUF3QjtRQUNuQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLGlEQUFpRCxDQUFDO0tBQ3ZHO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsMkJBQTJCO1FBQ2hDLEVBQUUsRUFBRSxNQUFNLENBQUMsdUJBQXVCO1FBQ2xDLFdBQVcsRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsZ0RBQWdELENBQUM7S0FDckc7SUFDRDtRQUNDLEdBQUcsRUFBRSxrQkFBa0I7UUFDdkIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7UUFDM0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSx1Q0FBdUMsQ0FBQztLQUNuRjtJQUNEO1FBQ0MsR0FBRyxFQUFFLGNBQWM7UUFDbkIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXO1FBQ3RCLFdBQVcsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLG1DQUFtQyxDQUFDO1FBQ3pFLFFBQVEsRUFBRSxrQ0FBa0M7S0FDNUM7SUFDRDtRQUNDLEdBQUcsRUFBRSxtQkFBbUI7UUFDeEIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO1FBQzFCLFdBQVcsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsdUNBQXVDLENBQUM7UUFDdkYsUUFBUSxFQUFFLHNDQUFzQztLQUNoRDtJQUNEO1FBQ0MsR0FBRyxFQUFFLHlCQUF5QjtRQUM5QixFQUFFLEVBQUUsTUFBTSxDQUFDLHFCQUFxQjtRQUNoQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDhDQUE4QyxDQUFDO1FBQ2pHLFFBQVEsRUFBRSxxQ0FBcUM7S0FDL0M7SUFDRDtRQUNDLEdBQUcsRUFBRSw0QkFBNEI7UUFDakMsRUFBRSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0I7UUFDbkMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx3REFBd0QsQ0FBQztRQUM5RyxRQUFRLEVBQUUscUNBQXFDO0tBQy9DO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsMkJBQTJCO1FBQ2hDLEVBQUUsRUFBRSxNQUFNLENBQUMsdUJBQXVCO1FBQ2xDLFdBQVcsRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsZ0RBQWdELENBQUM7UUFDckcsUUFBUSxFQUFFLHVDQUF1QztLQUNqRDtJQUNEO1FBQ0MsR0FBRyxFQUFFLHNCQUFzQjtRQUMzQixFQUFFLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtRQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDBDQUEwQyxDQUFDO1FBQzFGLFFBQVEsRUFBRSxrQ0FBa0M7S0FDNUM7SUFDRDtRQUNDLEdBQUcsRUFBRSwyQkFBMkI7UUFDaEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyw0QkFBNEI7UUFDdkMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSw2Q0FBNkMsQ0FBQztRQUN0RyxnQkFBZ0IsRUFBRSxLQUFLO0tBQ3ZCO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsa0JBQWtCO1FBQ3ZCLEVBQUUsRUFBRSxNQUFNLENBQUMsdUJBQXVCO1FBQ2xDLFdBQVcsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsMkJBQTJCLENBQUM7S0FDM0U7SUFDRDtRQUNDLEdBQUcsRUFBRSx3QkFBd0I7UUFDN0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxnQ0FBZ0MsQ0FBQztLQUNuRjtJQUNEO1FBQ0MsR0FBRyxFQUFFLFlBQVk7UUFDakIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTO1FBQ3BCLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsaUNBQWlDLENBQUM7S0FDMUU7SUFDRDtRQUNDLEdBQUcsRUFBRSxxQkFBcUI7UUFDMUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSwyQ0FBMkMsQ0FBQztRQUN6RixRQUFRLEVBQUUsMkJBQTJCO0tBQ3JDO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsbUJBQW1CO1FBQ3hCLEVBQUUsRUFBRSxNQUFNLENBQUMsZUFBZTtRQUMxQixXQUFXLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHdDQUF3QyxDQUFDO0tBQ25GO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0NBQWdDO1FBQ3JDLEVBQUUsRUFBRSxNQUFNLENBQUMsb0JBQW9CO1FBQy9CLFdBQVcsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsd0NBQXdDLENBQUM7UUFDOUYsUUFBUSxFQUFFLGlDQUFpQztLQUMzQztJQUNEO1FBQ0MsR0FBRyxFQUFFLDhCQUE4QjtRQUNuQyxFQUFFLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtRQUM3QixXQUFXLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLDJDQUEyQyxDQUFDO0tBQ3pGO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0NBQWdDO1FBQ3JDLEVBQUUsRUFBRSxNQUFNLENBQUMsb0JBQW9CO1FBQy9CLFdBQVcsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsMkZBQTJGLENBQUM7UUFDM0ksZ0JBQWdCLEVBQUUsS0FBSztLQUN2QjtJQUNEO1FBQ0MsR0FBRyxFQUFFLDBDQUEwQztRQUMvQyxFQUFFLEVBQUUsTUFBTSxDQUFDLDhCQUE4QjtRQUN6QyxXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDJGQUEyRixDQUFDO1FBQzNJLGdCQUFnQixFQUFFLElBQUk7UUFDdEIsUUFBUSxFQUFFLG9DQUFvQztLQUM5QztJQUNEO1FBQ0MsR0FBRyxFQUFFLHNDQUFzQztRQUMzQyxFQUFFLEVBQUUsTUFBTSxDQUFDLHlCQUF5QjtRQUNwQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLDhIQUE4SCxDQUFDO1FBQ25MLFFBQVEsRUFBRSwyQkFBMkI7S0FDckM7SUFDRDtRQUNDLEdBQUcsRUFBRSx3QkFBd0I7UUFDN0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxZQUFZO1FBQ3ZCLFdBQVcsRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLG9DQUFvQyxDQUFDO0tBQzVFO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsMEJBQTBCO1FBQy9CLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztRQUN6QixXQUFXLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG9GQUFvRixDQUFDO1FBQzlILGdCQUFnQixFQUFFLEtBQUs7S0FDdkI7SUFDRDtRQUNDLEdBQUcsRUFBRSx3Q0FBd0M7UUFDN0MsRUFBRSxFQUFFLE1BQU0sQ0FBQywyQkFBMkI7UUFDdEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxzSUFBc0ksQ0FBQztRQUN2TCxRQUFRLEVBQUUsMkJBQTJCO0tBQ3JDO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsb0NBQW9DO1FBQ3pDLEVBQUUsRUFBRSxNQUFNLENBQUMseUJBQXlCO1FBQ3BDLFdBQVcsRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsa0VBQWtFLENBQUM7UUFDdkgsUUFBUSxFQUFFLGdDQUFnQztLQUMxQztJQUNEO1FBQ0MsR0FBRyxFQUFFLGtCQUFrQjtRQUN2QixFQUFFLEVBQUUsTUFBTSxDQUFDLGVBQWU7UUFDMUIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSx1Q0FBdUMsQ0FBQztLQUNsRjtJQUNEO1FBQ0MsR0FBRyxFQUFFLHVCQUF1QjtRQUM1QixFQUFFLEVBQUUsTUFBTSxDQUFDLG9CQUFvQjtRQUMvQixXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDhDQUE4QyxDQUFDO1FBQzlGLFFBQVEsRUFBRSxzQkFBc0I7S0FDaEM7SUFDRDtRQUNDLEdBQUcsRUFBRSxxQkFBcUI7UUFDMUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7UUFDNUIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSwwQ0FBMEMsQ0FBQztLQUN4RjtJQUNEO1FBQ0MsR0FBRyxFQUFFLHVCQUF1QjtRQUM1QixFQUFFLEVBQUUsTUFBTSxDQUFDLG1CQUFtQjtRQUM5QixXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDhDQUE4QyxDQUFDO0tBQzlGO0lBQ0Q7UUFDQyxHQUFHLEVBQUUscUJBQXFCO1FBQzFCLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO1FBQzdCLFdBQVcsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsMENBQTBDLENBQUM7S0FDeEY7SUFDRDtRQUNDLEdBQUcsRUFBRSx3QkFBd0I7UUFDN0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxvQkFBb0I7UUFDL0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSw2Q0FBNkMsQ0FBQztLQUM5RjtJQUNEO1FBQ0MsR0FBRyxFQUFFLGdCQUFnQjtRQUNyQixFQUFFLEVBQUUsTUFBTSxDQUFDLGFBQWE7UUFDeEIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxxQ0FBcUMsQ0FBQztLQUM5RTtJQUNEO1FBQ0MsR0FBRyxFQUFFLHNCQUFzQjtRQUMzQixFQUFFLEVBQUUsTUFBTSxDQUFDLFFBQVE7UUFDbkIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxnQ0FBZ0MsQ0FBQztLQUMvRTtJQUNEO1FBQ0MsR0FBRyxFQUFFLHFCQUFxQjtRQUMxQixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7UUFDekIsV0FBVyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxrREFBa0QsQ0FBQztLQUN0RztJQUNEO1FBQ0MsR0FBRyxFQUFFLDBCQUEwQjtRQUMvQixFQUFFLEVBQUUsTUFBTSxDQUFDLG1CQUFtQjtRQUM5QixXQUFXLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLDRDQUE0QyxDQUFDO0tBQ3JHO0lBQ0Q7UUFDQyxHQUFHLEVBQUUscUJBQXFCO1FBQzFCLEVBQUUsRUFBRSxNQUFNLENBQUMsZUFBZTtRQUMxQixXQUFXLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLHdEQUF3RCxDQUFDO0tBQzVHO0lBQ0Q7UUFDQyxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLEVBQUUsRUFBRSxNQUFNLENBQUMsa0JBQWtCO1FBQzdCLFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsNkVBQTZFLENBQUM7S0FDckk7SUFDRDtRQUNDLEdBQUcsRUFBRSx5QkFBeUI7UUFDOUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxrREFBa0QsQ0FBQztLQUMxRztJQUNEO1FBQ0MsR0FBRyxFQUFFLG1CQUFtQjtRQUN4QixFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtRQUMzQixXQUFXLEVBQUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDRCQUE0QixDQUFDO0tBQzdFO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0JBQWdCO1FBQ3JCLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTtRQUN4QixXQUFXLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDhCQUE4QixDQUFDO0tBQzNFO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsdUJBQXVCO1FBQzVCLEVBQUUsRUFBRSxNQUFNLENBQUMsbUJBQW1CO1FBQzlCLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUscUNBQXFDLENBQUM7S0FDcEY7SUFDRDtRQUNDLEdBQUcsRUFBRSxvQkFBb0I7UUFDekIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO1FBQ3hCLFdBQVcsRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsa0NBQWtDLENBQUM7S0FDL0U7SUFDRDtRQUNDLEdBQUcsRUFBRSwwQkFBMEI7UUFDL0IsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSx3Q0FBd0MsQ0FBQztLQUMxRjtJQUNEO1FBQ0MsR0FBRyxFQUFFLHdCQUF3QjtRQUM3QixFQUFFLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtRQUMzQixXQUFXLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLHNDQUFzQyxDQUFDO0tBQ3RGO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsY0FBYztRQUNuQixFQUFFLEVBQUUsTUFBTSxDQUFDLE9BQU87UUFDbEIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsb0VBQW9FLENBQUM7UUFDM0csZ0JBQWdCLEVBQUUsS0FBSztLQUN2QjtJQUNEO1FBQ0MsR0FBRyxFQUFFLGlCQUFpQjtRQUN0QixFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7UUFDekIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSwwQkFBMEIsQ0FBQztLQUNwRTtJQUNEO1FBQ0MsR0FBRyxFQUFFLFlBQVk7UUFDakIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxZQUFZO1FBQ3ZCLFdBQVcsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLGlEQUFpRCxDQUFDO1FBQ3ZGLFFBQVEsRUFBRSxrQkFBa0I7S0FDNUI7SUFDRDtRQUNDLEdBQUcsRUFBRSxrQ0FBa0M7UUFDdkMsRUFBRSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0I7UUFDbkMsV0FBVyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSx5REFBeUQsQ0FBQztRQUM3RyxnQkFBZ0IsRUFBRSxLQUFLO1FBQ3ZCLFFBQVEsRUFBRSw0QkFBNEI7S0FDdEM7SUFDRDtRQUNDLEdBQUcsRUFBRSxnQkFBZ0I7UUFDckIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO1FBQ3hCLFdBQVcsRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLHlEQUF5RCxDQUFDO1FBQ2pHLFFBQVEsRUFBRSwwQkFBMEI7S0FDcEM7SUFDRDtRQUNDLEdBQUcsRUFBRSwyQkFBMkI7UUFDaEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyx1QkFBdUI7UUFDbEMsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxpREFBaUQsQ0FBQztLQUNuRztJQUNEO1FBQ0MsR0FBRyxFQUFFLDBCQUEwQjtRQUMvQixFQUFFLEVBQUUsTUFBTSxDQUFDLHVCQUF1QjtRQUNsQyxXQUFXLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLHdDQUF3QyxDQUFDO1FBQzFGLFFBQVEsRUFBRSx5QkFBeUI7S0FDbkM7SUFDRDtRQUNDLEdBQUcsRUFBRSx5QkFBeUI7UUFDOUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxzQkFBc0I7UUFDakMsV0FBVyxFQUFFLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxxREFBcUQsQ0FBQztRQUM1RyxRQUFRLEVBQUUsMEJBQTBCO0tBQ3BDO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0NBQWdDO1FBQ3JDLEVBQUUsRUFBRSxNQUFNLENBQUMsMEJBQTBCO1FBQ3JDLFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsK0NBQStDLENBQUM7UUFDdkcsUUFBUSxFQUFFLDZCQUE2QjtLQUN2QztJQUNEO1FBQ0MsR0FBRyxFQUFFLHdCQUF3QjtRQUM3QixFQUFFLEVBQUUsTUFBTSxDQUFDLHFCQUFxQjtRQUNoQyxXQUFXLEVBQUUsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLHVDQUF1QyxDQUFDO1FBQ3BHLFFBQVEsRUFBRSxxQ0FBcUM7S0FDL0M7SUFDRDtRQUNDLEdBQUcsRUFBRSw2QkFBNkI7UUFDbEMsRUFBRSxFQUFFLE1BQU0sQ0FBQywwQkFBMEI7UUFDckMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSx1Q0FBdUMsQ0FBQztRQUNwRyxRQUFRLEVBQUUscUNBQXFDO0tBQy9DO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsZ0NBQWdDO1FBQ3JDLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO1FBQzNCLFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsK0ZBQStGLENBQUM7S0FDdko7SUFDRDtRQUNDLEdBQUcsRUFBRSxxQkFBcUI7UUFDMUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0IsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxtREFBbUQsQ0FBQztRQUNsRyxnQkFBZ0IsRUFBRSxLQUFLO1FBQ3ZCLFFBQVEsRUFBRSx3QkFBd0I7S0FDbEM7SUFDRDtRQUNDLEdBQUcsRUFBRSxtQ0FBbUM7UUFDeEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQ0FBZ0M7UUFDM0MsV0FBVyxFQUFFLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSwyREFBMkQsQ0FBQztRQUM1SCxRQUFRLEVBQUUsc0JBQXNCO0tBQ2hDO0lBQ0Q7UUFDQyxHQUFHLEVBQUUsd0NBQXdDO1FBQzdDLEVBQUUsRUFBRSxNQUFNLENBQUMsOEJBQThCO1FBQ3pDLFdBQVcsRUFBRSxRQUFRLENBQUMsc0NBQXNDLEVBQUUsd0VBQXdFLENBQUM7UUFDdkksUUFBUSxFQUFFLHNCQUFzQjtLQUNoQztJQUNEO1FBQ0MsR0FBRyxFQUFFLHdDQUF3QztRQUM3QyxFQUFFLEVBQUUsTUFBTSxDQUFDLDhCQUE4QjtRQUN6QyxXQUFXLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLHlEQUF5RCxDQUFDO1FBQ3hILFFBQVEsRUFBRSxzQkFBc0I7S0FDaEM7SUFDRDtRQUNDLEdBQUcsRUFBRSx5Q0FBeUM7UUFDOUMsRUFBRSxFQUFFLE1BQU0sQ0FBQywrQkFBK0I7UUFDMUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSwyREFBMkQsQ0FBQztRQUMzSCxRQUFRLEVBQUUsc0JBQXNCO0tBQ2hDO0lBQ0Q7UUFDQyxrRUFBa0U7UUFDbEUsR0FBRyxFQUFFLG1CQUFtQjtRQUN4QixFQUFFLEVBQUUsTUFBTSxDQUFDLG9CQUFvQjtRQUMvQixXQUFXLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHlCQUF5QixDQUFDO1FBQ3RFLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsUUFBUSxFQUFFLHNCQUFzQjtLQUNoQztJQUNEO1FBQ0MsR0FBRyxFQUFFLHlCQUF5QjtRQUM5QixFQUFFLEVBQUUsTUFBTSxDQUFDLDBCQUEwQjtRQUNyQyxXQUFXLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDZCQUE2QixDQUFDO1FBQ3BGLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsUUFBUSxFQUFFLHNCQUFzQjtLQUNoQztJQUNEO1FBQ0MsR0FBRyxFQUFFLHdCQUF3QjtRQUM3QixFQUFFLEVBQUUsTUFBTSxDQUFDLG9CQUFvQjtRQUMvQixXQUFXLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLG1DQUFtQyxDQUFDO1FBQ3hGLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsUUFBUSxFQUFFLHNCQUFzQjtLQUNoQztJQUNEO1FBQ0MsR0FBRyxFQUFFLDRCQUE0QjtRQUNqQyxFQUFFLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztRQUNqRCxXQUFXLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLGlFQUFpRSxDQUFDO1FBQzFILGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsUUFBUSxFQUFFLGtDQUFrQztLQUM1QztJQUNEO1FBQ0MsR0FBRyxFQUFFLDBCQUEwQjtRQUMvQixFQUFFLEVBQUUsTUFBTSxDQUFDLG9CQUFvQjtRQUMvQixXQUFXLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDRDQUE0QyxDQUFDO1FBQ25HLGdCQUFnQixFQUFFLEtBQUs7UUFDdkIsUUFBUSxFQUFFLG1DQUFtQztLQUM3QztJQUNEO1FBQ0MsR0FBRyxFQUFFLDJCQUEyQjtRQUNoQyxFQUFFLEVBQUUsTUFBTSxDQUFDLHVCQUF1QjtRQUNsQyxXQUFXLEVBQUUsUUFBUSxDQUFDLCtCQUErQixFQUFFLGtEQUFrRCxDQUFDO1FBQzFHLFFBQVEsRUFBRSwwQkFBMEI7S0FDcEM7SUFDRDtRQUNDLEdBQUcsRUFBRSxpQkFBaUI7UUFDdEIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXO1FBQ3RCLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsNEJBQTRCLENBQUM7UUFDM0UsUUFBUSxFQUFFLHNCQUFzQjtLQUNoQztDQUNELENBQUM7QUFFRixJQUFVLE1BQU0sQ0FzVWY7QUF0VUQsV0FBVSxNQUFNO0lBRWYseUNBQXlDO0lBcUJ6QyxTQUFnQixVQUFVLENBQUMsSUFBc0Q7UUFDaEYsT0FBTyxPQUFRLElBQThCLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQztJQUNwRSxDQUFDO0lBRmUsaUJBQVUsYUFFekIsQ0FBQTtJQUVELFNBQWdCLGVBQWUsQ0FBQyxJQUEyQixFQUFFLFNBQW9DO1FBQ2hHLElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSwwREFBMEQsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ2xILE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLEdBQUcsSUFBSSxPQUFPLElBQUksQ0FBQyxHQUFHLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDOUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDM0csT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNoRCxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsMkRBQTJELEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUM1RyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2xELFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSwyREFBMkQsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzdHLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQW5CZSxzQkFBZSxrQkFtQjlCLENBQUE7SUFFRCxTQUFnQixrQkFBa0IsQ0FBQyxJQUE4QixFQUFFLFNBQW9DO1FBQ3RHLElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSwwREFBMEQsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ2xILE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEQsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDNUcsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNsRCxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsMkRBQTJELEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM3RyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFmZSx5QkFBa0IscUJBZWpDLENBQUE7SUFFRCxTQUFnQixZQUFZLENBQUMsS0FBMkQsRUFBRSxTQUFvQztRQUM3SCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNCLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7WUFDNUUsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMxQixJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDO29CQUN2QyxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztvQkFDMUMsT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBbkJlLG1CQUFZLGVBbUIzQixDQUFBO0lBRUQsU0FBZ0IsY0FBYyxDQUFDLE9BQTZCLEVBQUUsU0FBb0M7UUFDakcsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsaUNBQWlDLENBQUMsQ0FBQyxDQUFDO1lBQ3hFLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELElBQUksT0FBTyxPQUFPLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3BDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSwwREFBMEQsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzdHLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksT0FBTyxPQUFPLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3ZDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSwwREFBMEQsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2hILE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQWhCZSxxQkFBYyxpQkFnQjdCLENBQUE7SUFFRCxNQUFNLFFBQVEsR0FBZ0I7UUFDN0IsSUFBSSxFQUFFLFFBQVE7UUFDZCxRQUFRLEVBQUUsQ0FBQyxTQUFTLENBQUM7UUFDckIsVUFBVSxFQUFFO1lBQ1gsT0FBTyxFQUFFO2dCQUNSLFdBQVcsRUFBRSxRQUFRLENBQUMsK0NBQStDLEVBQUUsZ0dBQWdHLENBQUM7Z0JBQ3hLLElBQUksRUFBRSxRQUFRO2FBQ2Q7WUFDRCxHQUFHLEVBQUU7Z0JBQ0osV0FBVyxFQUFFLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSwyR0FBMkcsQ0FBQztnQkFDL0ssSUFBSSxFQUFFLFFBQVE7YUFDZDtZQUNELElBQUksRUFBRTtnQkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLGdEQUFnRCxDQUFDO2dCQUNySCxJQUFJLEVBQUUsUUFBUTthQUNkO1lBQ0QsS0FBSyxFQUFFO2dCQUNOLFdBQVcsRUFBRSxRQUFRLENBQUMsNkNBQTZDLEVBQUUsb0NBQW9DLENBQUM7Z0JBQzFHLElBQUksRUFBRSxRQUFRO2FBQ2Q7U0FDRDtLQUNELENBQUM7SUFFRixNQUFNLFdBQVcsR0FBZ0I7UUFDaEMsSUFBSSxFQUFFLFFBQVE7UUFDZCxRQUFRLEVBQUUsQ0FBQyxTQUFTLENBQUM7UUFDckIsVUFBVSxFQUFFO1lBQ1gsT0FBTyxFQUFFO2dCQUNSLFdBQVcsRUFBRSxRQUFRLENBQUMsK0NBQStDLEVBQUUsb0RBQW9ELENBQUM7Z0JBQzVILElBQUksRUFBRSxRQUFRO2FBQ2Q7WUFDRCxJQUFJLEVBQUU7Z0JBQ0wsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0Q0FBNEMsRUFBRSxnREFBZ0QsQ0FBQztnQkFDckgsSUFBSSxFQUFFLFFBQVE7YUFDZDtZQUNELEtBQUssRUFBRTtnQkFDTixXQUFXLEVBQUUsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLG9DQUFvQyxDQUFDO2dCQUMxRyxJQUFJLEVBQUUsUUFBUTthQUNkO1NBQ0Q7S0FDRCxDQUFDO0lBRUYsTUFBTSxPQUFPLEdBQWdCO1FBQzVCLElBQUksRUFBRSxRQUFRO1FBQ2QsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQztRQUN6QixVQUFVLEVBQUU7WUFDWCxFQUFFLEVBQUU7Z0JBQ0gsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxpREFBaUQsQ0FBQztnQkFDbkgsSUFBSSxFQUFFLFFBQVE7YUFDZDtZQUNELEtBQUssRUFBRTtnQkFDTixXQUFXLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLHlEQUF5RCxDQUFDO2dCQUM5SCxJQUFJLEVBQUUsUUFBUTthQUNkO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLFdBQVcsRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsMkNBQTJDLEVBQUUsT0FBTyxFQUFFLENBQUMsdUVBQXVFLENBQUMsRUFBRSxFQUFFLHdMQUF3TCxDQUFDO2dCQUN6VixLQUFLLEVBQUUsQ0FBQzt3QkFDUCxJQUFJLEVBQUUsUUFBUTtxQkFDZDtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxVQUFVLEVBQUU7NEJBQ1gsS0FBSyxFQUFFO2dDQUNOLFdBQVcsRUFBRSxRQUFRLENBQUMsaURBQWlELEVBQUUsc0NBQXNDLENBQUM7Z0NBQ2hILElBQUksRUFBRSxRQUFROzZCQUNkOzRCQUNELElBQUksRUFBRTtnQ0FDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLGdEQUFnRCxFQUFFLHFDQUFxQyxDQUFDO2dDQUM5RyxJQUFJLEVBQUUsUUFBUTs2QkFDZDt5QkFDRDtxQkFDRCxDQUFDO2FBQ0Y7U0FDRDtLQUNELENBQUM7SUFFVyx3QkFBaUIsR0FBZ0I7UUFDN0MsV0FBVyxFQUFFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxzQ0FBc0MsQ0FBQztRQUNuRyxJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEQsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSw4REFBOEQsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVc7WUFDN0ssSUFBSSxFQUFFLE9BQU87WUFDYixLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFBRTtTQUN0RixDQUFDLENBQUM7UUFDSCxvQkFBb0IsRUFBRTtZQUNyQixXQUFXLEVBQUUsU0FBUztZQUN0QixJQUFJLEVBQUUsT0FBTztZQUNiLEtBQUssRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFBRTtTQUN6QztLQUNELENBQUM7SUFFVywyQkFBb0IsR0FBZ0I7UUFDaEQsV0FBVyxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSx5Q0FBeUMsQ0FBQztRQUN6RyxJQUFJLEVBQUUsT0FBTztRQUNiLEtBQUssRUFBRSxPQUFPO0tBQ2QsQ0FBQztJQWVGLFNBQWdCLGNBQWMsQ0FBQyxPQUE2QixFQUFFLFNBQW9DO1FBQ2pHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7WUFDbkUsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsMERBQTBELEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNsSCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNoRSxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxVQUFVLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ2hHLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksT0FBTyxDQUFDLFVBQVUsSUFBSSxPQUFPLE9BQU8sQ0FBQyxVQUFVLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDbEUsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDcEgsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsUUFBUSxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUMxRixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUMzQyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUExQmUscUJBQWMsaUJBMEI3QixDQUFBO0lBRUQsU0FBUyxXQUFXLENBQUMsSUFBbUMsRUFBRSxTQUFvQztRQUM3RixJQUFJLE9BQU8sSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDOUIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1RSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsNkZBQTZGLENBQUMsQ0FBQyxDQUFDO1FBQ3BJLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELFNBQVMsc0JBQXNCLENBQUMsU0FBb0MsRUFBRSxTQUFvQyxFQUFFLFlBQW9CO1FBQy9ILElBQUksT0FBTyxTQUFTLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdEMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsc0VBQXNFLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUN6SSxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7YUFBTSxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsSUFBSSxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzVFLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSwwREFBMEQsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQ3JILE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQzthQUFNLElBQUksT0FBTyxTQUFTLEtBQUssUUFBUSxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDL0gsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsdUVBQXVFLEVBQUUsR0FBRyxZQUFZLFFBQVEsRUFBRSxHQUFHLFlBQVksV0FBVyxDQUFDLENBQUMsQ0FBQztZQUMxSyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNLFdBQVcsR0FBZ0I7UUFDaEMsSUFBSSxFQUFFLFFBQVE7UUFDZCxRQUFRLEVBQUUsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDO1FBQzlCLFVBQVUsRUFBRTtZQUNYLE9BQU8sRUFBRTtnQkFDUixXQUFXLEVBQUUsUUFBUSxDQUFDLGtEQUFrRCxFQUFFLHNDQUFzQyxDQUFDO2dCQUNqSCxJQUFJLEVBQUUsUUFBUTthQUNkO1lBQ0QsS0FBSyxFQUFFO2dCQUNOLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0RBQWdELEVBQUUscURBQXFELENBQUM7Z0JBQzlILElBQUksRUFBRSxRQUFRO2FBQ2Q7WUFDRCxVQUFVLEVBQUU7Z0JBQ1gsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHFEQUFxRCxFQUFFLHVLQUF1SyxDQUFDO2dCQUM3UCxJQUFJLEVBQUUsUUFBUTthQUNkO1lBQ0QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxRQUFRLENBQUMsbURBQW1ELEVBQUUsc0VBQXNFLENBQUM7Z0JBQ2xKLElBQUksRUFBRSxRQUFRO2FBQ2Q7WUFDRCxVQUFVLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLFFBQVEsQ0FBQyx1REFBdUQsRUFBRSx1TEFBdUwsQ0FBQztnQkFDdlEsSUFBSSxFQUFFLFFBQVE7YUFDZDtZQUNELElBQUksRUFBRTtnQkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLCtDQUErQyxFQUFFLE9BQU8sRUFBRSxDQUFDLHVFQUF1RSxDQUFDLEVBQUUsRUFBRSx3TEFBd0wsQ0FBQztnQkFDN1YsS0FBSyxFQUFFLENBQUM7d0JBQ1AsSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLFFBQVE7d0JBQ2QsVUFBVSxFQUFFOzRCQUNYLEtBQUssRUFBRTtnQ0FDTixXQUFXLEVBQUUsUUFBUSxDQUFDLHFEQUFxRCxFQUFFLHNDQUFzQyxDQUFDO2dDQUNwSCxJQUFJLEVBQUUsUUFBUTs2QkFDZDs0QkFDRCxJQUFJLEVBQUU7Z0NBQ0wsV0FBVyxFQUFFLFFBQVEsQ0FBQyxvREFBb0QsRUFBRSxxQ0FBcUMsQ0FBQztnQ0FDbEgsSUFBSSxFQUFFLFFBQVE7NkJBQ2Q7eUJBQ0Q7cUJBQ0QsQ0FBQzthQUNGO1NBQ0Q7S0FDRCxDQUFDO0lBRVcsMkJBQW9CLEdBQWdCO1FBQ2hELFdBQVcsRUFBRSxRQUFRLENBQUMsdUNBQXVDLEVBQUUsOENBQThDLENBQUM7UUFDOUcsS0FBSyxFQUFFO1lBQ04sV0FBVztZQUNYO2dCQUNDLElBQUksRUFBRSxPQUFPO2dCQUNiLEtBQUssRUFBRSxXQUFXO2FBQ2xCO1NBQ0Q7S0FDRCxDQUFDO0FBQ0gsQ0FBQyxFQXRVUyxNQUFNLEtBQU4sTUFBTSxRQXNVZjtBQUVELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztBQUVwRCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBOEQ7SUFDNUksY0FBYyxFQUFFLFVBQVU7SUFDMUIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxvQkFBb0I7SUFDdkMseUJBQXlCLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBZ0Q7UUFDckYsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDckIsTUFBTSxhQUFhLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEVBQUU7SUFFOUMsU0FBUyxhQUFhLENBQUMsbUJBQWdELEVBQUUsU0FBdUM7UUFFL0csSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDdEUsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQztRQUV2RixJQUFJLFlBQWdFLENBQUM7UUFDckUsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzlCLFlBQVksR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxFQUFFLENBQUM7WUFFcE0sQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFlBQVksR0FBRztvQkFDZCxJQUFJLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7b0JBQzVFLEtBQUssRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQztpQkFDOUUsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyRCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLElBQUksV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUN4QixTQUFTLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLCtDQUErQyxFQUFFLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0ssQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsa0NBQWtDLEVBQUUsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM3RyxDQUFDO1FBQ0YsQ0FBQztRQUNELHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDO1lBQ2pELEVBQUUsRUFBRSxPQUFPO1lBQ1gsS0FBSztZQUNMLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsV0FBVyxJQUFJLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFO1lBQzlILFVBQVU7WUFDVixPQUFPLEVBQUUsS0FBSztZQUNkLFFBQVE7WUFDUixZQUFZLEVBQUUsY0FBYyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUM7WUFDcEQsSUFBSSxFQUFFLFlBQVk7U0FDbEIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsNENBQTRDO0lBQzVDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBRTlCLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7UUFDcEMsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLFNBQVMsQ0FBQztRQUM1QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUM3QixhQUFhLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLGFBQWEsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDLENBQUMsQ0FBQztBQVFILE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxFQUE4QixDQUFDO0FBRXhELE1BQU0sc0JBQXNCLEdBQUcsa0JBQWtCLENBQUMsc0JBQXNCLENBQWdDO0lBQ3ZHLGNBQWMsRUFBRSxVQUFVO0lBQzFCLFVBQVUsRUFBRSxNQUFNLENBQUMsb0JBQW9CO0NBQ3ZDLENBQUMsQ0FBQztBQUVILHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRTtJQUU5QyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFFbEIsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNwQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxHQUFHLFNBQVMsQ0FBQztRQUV2QyxLQUFLLE1BQU0sQ0FBQyxFQUFFLFdBQVcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUVyRCxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztnQkFDcEQsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNyQixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx5Q0FBeUMsRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDNUcsU0FBUztZQUNWLENBQUM7WUFDRCxJQUFJLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLHNEQUFzRCxFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMzSCxTQUFTO1lBQ1YsQ0FBQztZQUNELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hCLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLG9DQUFvQyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUM3RyxTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksWUFBZ0UsQ0FBQztZQUNyRSxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxPQUFPLFdBQVcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzFDLFlBQVksR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ2xKLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxZQUFZLEdBQUc7d0JBQ2QsSUFBSSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQzt3QkFDeEYsS0FBSyxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztxQkFDMUYsQ0FBQztnQkFDSCxDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sSUFBSSxHQUF1QjtnQkFDaEMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZDLEtBQUssRUFBRSxXQUFXLENBQUMsS0FBSztnQkFDeEIsSUFBSSxFQUFFLFlBQVk7YUFDbEIsQ0FBQztZQUVGLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyQyxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDO0FBRUgsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztBQUNqRCxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxFQUFzRCxDQUFDO0FBRXhGLE1BQU0sbUJBQW1CLEdBQUcsa0JBQWtCLENBQUMsc0JBQXNCLENBQXdGO0lBQzVKLGNBQWMsRUFBRSxPQUFPO0lBQ3ZCLFVBQVUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO0lBQ3BDLElBQUksRUFBRSxDQUFDLHNCQUFzQixDQUFDO0NBQzlCLENBQUMsQ0FBQztBQUVILG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRTtJQUUzQyx5Q0FBeUM7SUFDekMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDM0IsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFFMUIsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNwQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxHQUFHLFNBQVMsQ0FBQztRQUV2QyxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztnQkFDL0MsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLElBQUksR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWCxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUV4QyxJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNiLElBQUksR0FBRzt3QkFDTixHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDYixFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUU7d0JBQ2QsV0FBVyxFQUFFLEVBQUU7cUJBQ2YsQ0FBQztnQkFDSCxDQUFDO1lBQ0YsQ0FBQztZQUVELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWCxTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xGLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGlOQUFpTixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ3JVLFNBQVM7WUFDVixDQUFDO1lBRUQsS0FBSyxNQUFNLFFBQVEsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxJQUE4QixDQUFDO2dCQUVuQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzFELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLElBQUksWUFBWSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksU0FBUyxDQUFDO29CQUUvRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ2QsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsc0ZBQXNGLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ3ZKLFNBQVM7b0JBQ1YsQ0FBQztvQkFDRCxJQUFJLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQzt3QkFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsMkZBQTJGLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzNKLENBQUM7b0JBQ0QsSUFBSSxRQUFRLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQzt3QkFDdkMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGtFQUFrRSxDQUFDLENBQUMsQ0FBQztvQkFDOUcsQ0FBQztvQkFFRCxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQzlFLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsS0FBSyxLQUFLLEVBQUUsQ0FBQzt3QkFDckMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsK0VBQStFLENBQUMsQ0FBQyxDQUFDO3dCQUMzSSxTQUFTO29CQUNWLENBQUM7b0JBRUQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBRWhELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQzt3QkFDZCxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxzRkFBc0YsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDdkosU0FBUztvQkFDVixDQUFDO29CQUVELElBQUksb0JBQW9CLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBRTdELElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO3dCQUMzQixvQkFBb0IsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO3dCQUNqQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztvQkFDekQsQ0FBQztvQkFFRCxJQUFJLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7d0JBQzdDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDhEQUE4RCxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDOUksU0FBUztvQkFDVixDQUFDO29CQUVELG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUV4QyxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDO2dCQUMvSCxDQUFDO2dCQUVELElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNwQixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDNUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQ2IsSUFBSSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7d0JBQzNDLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQztvQkFDbEUsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLElBQUksQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztvQkFDN0IsQ0FBQztnQkFDRixDQUFDO2dCQUVELElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxNQUFNLENBQUMsa0JBQWtCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2hILGtJQUFrSTtvQkFDbEksU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsNkRBQTZELEVBQUUsdUJBQXVCLEVBQUUseUNBQXlDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDbE0sU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksQ0FBQyxJQUFJLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNwRSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDLENBQUMsQ0FBQztBQUVILElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsVUFBVTtJQUk3QyxZQUNxQixrQkFBdUQ7UUFDeEUsS0FBSyxFQUFFLENBQUM7UUFEMEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUhuRSxTQUFJLEdBQUcsT0FBTyxDQUFDO0lBSVgsQ0FBQztJQUVkLFlBQVksQ0FBQyxRQUE0QjtRQUN4QyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQztJQUN6QyxDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQTRCO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUN6RCxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0QyxFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU87WUFDYixLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7WUFDZCxXQUFXLEVBQUUsRUFBMEI7WUFDdkMsS0FBSyxFQUFFLEVBQWM7U0FDckIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXhDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUVoRCw0RUFBNEU7UUFDNUUsTUFBTSwwQkFBMEIsR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlELElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUM3QixLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7Z0JBQy9DLE9BQU8sMEJBQTBCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BELENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7Z0JBQzlCLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUM5QixDQUFDO1lBQ0QsS0FBSyxNQUFNLE9BQU8sSUFBSSwwQkFBMEIsRUFBRSxDQUFDO2dCQUNsRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDO1FBRUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUM3QixLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUVuQyx3REFBd0Q7Z0JBQ3hELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztvQkFDM0IsU0FBUztnQkFDVixDQUFDO2dCQUNELElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNsQixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUNqQyxJQUFJLE9BQU8sRUFBRSxDQUFDO3dCQUNiLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDOzRCQUN0QyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDN0IsQ0FBQztvQkFDRixDQUFDO3lCQUFNLENBQUM7d0JBQ1AsT0FBTyxHQUFHLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7d0JBQzdFLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDO3dCQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN4QixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFFMUwsY0FBYyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRTtZQUN0QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFFekQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNqQixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFMUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN0QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxHQUFHLEVBQUUsRUFBRSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ3pGLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDO2dCQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdEIsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNoRSxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUc7WUFDZixRQUFRLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQztZQUM5QixRQUFRLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQztZQUNsQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsb0JBQW9CLENBQUM7WUFDcEQsUUFBUSxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7U0FDekMsQ0FBQztRQUVGLE1BQU0sSUFBSSxHQUFpQixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQzFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNkLE9BQU87Z0JBQ04sSUFBSSxjQUFjLEVBQUUsQ0FBQyxjQUFjLENBQUMsS0FBSyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUM7Z0JBQ3hELE9BQU8sT0FBTyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSztnQkFDdkUsT0FBTyxDQUFDLFdBQVc7Z0JBQ25CLElBQUksY0FBYyxFQUFFLENBQUMsY0FBYyxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2FBQ3BJLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU87WUFDTixJQUFJLEVBQUU7Z0JBQ0wsT0FBTztnQkFDUCxJQUFJO2FBQ0o7WUFDRCxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNsQixDQUFDO0lBQ0gsQ0FBQztJQUVPLGlCQUFpQixDQUFDLGFBQTBCO1FBQ25ELElBQUksR0FBdUIsQ0FBQztRQUU1QixRQUFRLFFBQVEsRUFBRSxDQUFDO1lBQ2xCLEtBQUssT0FBTztnQkFBRSxHQUFHLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQztnQkFBQyxNQUFNO1lBQzdDLEtBQUssT0FBTztnQkFBRSxHQUFHLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQztnQkFBQyxNQUFNO1lBQy9DLEtBQUssUUFBUTtnQkFBRSxHQUFHLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQztnQkFBQyxNQUFNO1FBQy9DLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7Q0FFRCxDQUFBO0FBOUhLLHFCQUFxQjtJQUt4QixXQUFBLGtCQUFrQixDQUFBO0dBTGYscUJBQXFCLENBOEgxQjtBQUVELFFBQVEsQ0FBQyxFQUFFLENBQTZCLDJCQUEyQixDQUFDLHlCQUF5QixDQUFDLENBQUMsd0JBQXdCLENBQUM7SUFDdkgsRUFBRSxFQUFFLFVBQVU7SUFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7SUFDdkMsTUFBTSxFQUFFO1FBQ1AsU0FBUyxFQUFFLEtBQUs7S0FDaEI7SUFDRCxRQUFRLEVBQUUsSUFBSSxjQUFjLENBQUMscUJBQXFCLENBQUM7Q0FDbkQsQ0FBQyxDQUFDIn0=