/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asArray } from '../../../../../base/common/arrays.js';
import { DeferredPromise, isThenable } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { AbstractGotoSymbolQuickAccessProvider } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { resolveCommandsContext } from '../../../../browser/parts/editor/editorCommandsContext.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, isEditorCommandsContext, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExplorerFolderContext } from '../../../files/common/files.js';
import { CTX_INLINE_CHAT_V2_ENABLED } from '../../../inlineChat/common/inlineChat.js';
import { AnythingQuickAccessProvider } from '../../../search/browser/anythingQuickAccess.js';
import { isSearchTreeFileMatch, isSearchTreeMatch } from '../../../search/browser/searchTreeModel/searchTreeCommon.js';
import { SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { SearchContext } from '../../../search/common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, isSupportedChatFileScheme } from '../../common/constants.js';
import { IChatWidgetService, IQuickChatService } from '../chat.js';
import { IChatContextPickService, isChatContextPickerPickItem } from '../attachments/chatContextPickService.js';
import { isQuickChat } from '../widget/chatWidget.js';
import { resizeImage } from '../chatImageUtils.js';
import { registerPromptActions } from '../promptSyntax/promptFileActions.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { registerCreatePluginAction } from './createPluginAction.js';
export function registerChatContextActions() {
    registerAction2(AttachContextAction);
    registerAction2(AttachFileToChatAction);
    registerAction2(AttachFolderToChatAction);
    registerAction2(AttachSelectionToChatAction);
    registerAction2(AttachSearchResultAction);
    registerAction2(AttachPinnedEditorsToChatAction);
    registerPromptActions();
    registerCreatePluginAction();
}
async function withChatView(accessor) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const lastFocusedWidget = chatWidgetService.lastFocusedWidget;
    if (!lastFocusedWidget || lastFocusedWidget.location === ChatAgentLocation.Chat) {
        return chatWidgetService.revealWidget(); // only show chat view if we either have no chat view or its located in view container
    }
    return lastFocusedWidget;
}
class AttachResourceAction extends Action2 {
    async run(accessor, ...args) {
        const instaService = accessor.get(IInstantiationService);
        const widget = await instaService.invokeFunction(withChatView);
        if (!widget) {
            return;
        }
        return instaService.invokeFunction(this.runWithWidget.bind(this), widget, ...args);
    }
    _getResources(accessor, ...args) {
        const editorService = accessor.get(IEditorService);
        const contexts = isEditorCommandsContext(args[1]) ? this._getEditorResources(accessor, args) : Array.isArray(args[1]) ? args[1] : [args[0]];
        const files = [];
        for (const context of contexts) {
            let uri;
            if (URI.isUri(context)) {
                uri = context;
            }
            else if (isSearchTreeFileMatch(context)) {
                uri = context.resource;
            }
            else if (isSearchTreeMatch(context)) {
                uri = context.parent().resource;
            }
            else if (!context && editorService.activeTextEditorControl) {
                uri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
            }
            if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
                files.push(uri);
            }
        }
        return files;
    }
    _getEditorResources(accessor, ...args) {
        const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
        return resolvedContext.groupedEditors
            .flatMap(groupedEditor => groupedEditor.editors)
            .map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
            .filter(uri => uri !== undefined);
    }
}
class AttachFileToChatAction extends AttachResourceAction {
    static { this.ID = 'workbench.action.chat.attachFile'; }
    constructor() {
        super({
            id: AttachFileToChatAction.ID,
            title: localize2('workbench.action.chat.attachFile.label', "Add File to Chat"),
            category: CHAT_CATEGORY,
            icon: Codicon.attach,
            precondition: ChatContextKeys.enabled,
            f1: true,
            menu: [{
                    id: MenuId.SearchContext,
                    group: 'z_chat',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, SearchContext.FileMatchOrMatchFocusKey, SearchContext.SearchResultHeaderFocused.negate()),
                }, {
                    id: MenuId.ExplorerContext,
                    group: '5_chat',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ExplorerFolderContext.negate(), ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))),
                }, {
                    id: MenuId.EditorTitleContext,
                    group: '2_chat',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))),
                }, {
                    id: MenuId.EditorContext,
                    group: '1_chat',
                    order: 2,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate(), ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote), ResourceContextKey.Scheme.isEqualTo(Schemas.untitled), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)))
                }, {
                    id: MenuId.InlineChatEditorAffordance,
                    group: '0_chat',
                    order: 3,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
                }, {
                    id: MenuId.ChatEditorInlineMenu,
                    group: '0_chat',
                    order: 3,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
                }]
        });
    }
    async runWithWidget(accessor, widget, ...args) {
        const files = this._getResources(accessor, ...args);
        if (!files.length) {
            return;
        }
        if (widget) {
            widget.focusInput();
            for (const file of files) {
                widget.attachmentModel.addFile(file);
            }
        }
    }
}
class AttachFolderToChatAction extends AttachResourceAction {
    static { this.ID = 'workbench.action.chat.attachFolder'; }
    constructor() {
        super({
            id: AttachFolderToChatAction.ID,
            title: localize2('workbench.action.chat.attachFolder.label', "Add Folder to Chat"),
            category: CHAT_CATEGORY,
            f1: false,
            menu: {
                id: MenuId.ExplorerContext,
                group: '5_chat',
                order: 1,
                when: ContextKeyExpr.and(ChatContextKeys.enabled, ExplorerFolderContext, ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)))
            }
        });
    }
    async runWithWidget(accessor, widget, ...args) {
        const folders = this._getResources(accessor, ...args);
        if (!folders.length) {
            return;
        }
        if (widget) {
            widget.focusInput();
            for (const folder of folders) {
                widget.attachmentModel.addFolder(folder);
            }
        }
    }
}
class AttachPinnedEditorsToChatAction extends Action2 {
    static { this.ID = 'workbench.action.chat.attachPinnedEditors'; }
    constructor() {
        super({
            id: AttachPinnedEditorsToChatAction.ID,
            title: localize2('workbench.action.chat.attachPinnedEditors.label', "Add Pinned Editors to Chat"),
            category: CHAT_CATEGORY,
            precondition: ChatContextKeys.enabled,
            f1: true,
        });
    }
    async run(accessor) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const instaService = accessor.get(IInstantiationService);
        const widget = await instaService.invokeFunction(withChatView);
        if (!widget) {
            return;
        }
        const files = [];
        for (const group of editorGroupsService.groups) {
            for (const editor of group.editors) {
                if (group.isPinned(editor)) {
                    const uri = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
                    if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
                        files.push(uri);
                    }
                }
            }
        }
        if (!files.length) {
            return;
        }
        widget.focusInput();
        for (const file of files) {
            widget.attachmentModel.addFile(file);
        }
    }
}
class AttachSelectionToChatAction extends Action2 {
    static { this.ID = 'workbench.action.chat.attachSelection'; }
    constructor() {
        super({
            id: AttachSelectionToChatAction.ID,
            title: localize2('workbench.action.chat.attachSelection.label', "Add Selection to Chat"),
            category: CHAT_CATEGORY,
            icon: Codicon.attach,
            f1: true,
            precondition: ChatContextKeys.enabled,
            menu: [{
                    id: MenuId.EditorContext,
                    group: '1_chat',
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection, ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote), ResourceContextKey.Scheme.isEqualTo(Schemas.untitled), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)))
                }, {
                    id: MenuId.InlineChatEditorAffordance,
                    group: '0_chat',
                    order: 2,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
                }, {
                    id: MenuId.ChatEditorInlineMenu,
                    group: '0_chat',
                    order: 2,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
                }]
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async run(accessor, ...args) {
        const editorService = accessor.get(IEditorService);
        const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
        if (!widget) {
            return;
        }
        const [_, matches] = args;
        // If we have search matches, it means this is coming from the search widget
        if (matches && matches.length > 0) {
            const uris = new Map();
            for (const match of matches) {
                if (isSearchTreeFileMatch(match)) {
                    uris.set(match.resource, undefined);
                }
                else {
                    const context = { uri: match._parent.resource, range: match._range };
                    const range = uris.get(context.uri);
                    if (!range ||
                        range.startLineNumber !== context.range.startLineNumber && range.endLineNumber !== context.range.endLineNumber) {
                        uris.set(context.uri, context.range);
                        widget.attachmentModel.addFile(context.uri, context.range);
                    }
                }
            }
            // Add the root files for all of the ones that didn't have a match
            for (const uri of uris) {
                const [resource, range] = uri;
                if (!range) {
                    widget.attachmentModel.addFile(resource);
                }
            }
        }
        else {
            const activeEditor = editorService.activeTextEditorControl;
            const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (activeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
                const selection = activeEditor.getSelection();
                if (selection) {
                    widget.focusInput();
                    const range = selection.isEmpty() ? new Range(selection.startLineNumber, 1, selection.startLineNumber + 1, 1) : selection;
                    widget.attachmentModel.addFile(activeUri, range);
                }
            }
        }
    }
}
export class AttachSearchResultAction extends Action2 {
    static { this.Name = 'searchResults'; }
    constructor() {
        super({
            id: 'workbench.action.chat.insertSearchResults',
            title: localize2('chat.insertSearchResults', 'Add Search Results to Chat'),
            category: CHAT_CATEGORY,
            f1: false,
            menu: [{
                    id: MenuId.SearchContext,
                    group: 'z_chat',
                    order: 3,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, SearchContext.SearchResultHeaderFocused),
                }]
        });
    }
    async run(accessor) {
        const logService = accessor.get(ILogService);
        const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
        if (!widget) {
            logService.trace('InsertSearchResultAction: no chat view available');
            return;
        }
        const editor = widget.inputEditor;
        const originalRange = editor.getSelection() ?? editor.getModel()?.getFullModelRange().collapseToEnd();
        if (!originalRange) {
            logService.trace('InsertSearchResultAction: no selection');
            return;
        }
        let insertText = `#${AttachSearchResultAction.Name}`;
        const varRange = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.startLineNumber + insertText.length);
        // check character before the start of the range. If it's not a space, add a space
        const model = editor.getModel();
        if (model && model.getValueInRange(new Range(originalRange.startLineNumber, originalRange.startColumn - 1, originalRange.startLineNumber, originalRange.startColumn)) !== ' ') {
            insertText = ' ' + insertText;
        }
        const success = editor.executeEdits('chatInsertSearch', [{ range: varRange, text: insertText + ' ' }]);
        if (!success) {
            logService.trace(`InsertSearchResultAction: failed to insert "${insertText}"`);
            return;
        }
    }
}
function isIContextPickItemItem(obj) {
    return (isObject(obj)
        && typeof obj.kind === 'string'
        && obj.kind === 'contextPick');
}
function isIGotoSymbolQuickPickItem(obj) {
    return (isObject(obj)
        && typeof obj.symbolName === 'string'
        && !!obj.uri
        && !!obj.range);
}
function isIQuickPickItemWithResource(obj) {
    return (isObject(obj)
        && URI.isUri(obj.resource));
}
export class AttachContextAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.attachContext',
            title: localize2('workbench.action.chat.attachContext.label.2', "Add Context..."),
            icon: Codicon.add,
            category: CHAT_CATEGORY,
            keybinding: {
                when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menu: [{
                    when: ContextKeyExpr.and(ChatContextKeys.inQuickChat.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.agentSupportsAttachments)),
                    id: MenuId.ChatInput,
                    group: 'navigation',
                    order: -1
                }, {
                    when: ContextKeyExpr.and(ChatContextKeys.inQuickChat.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditorInline), CTX_INLINE_CHAT_V2_ENABLED, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.agentSupportsAttachments)),
                    id: MenuId.ChatInput,
                    group: 'navigation',
                    order: 2
                }, {
                    when: ContextKeyExpr.and(ChatContextKeys.inQuickChat, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.agentSupportsAttachments)),
                    id: MenuId.ChatExecute,
                    group: 'navigation',
                    order: -1
                }],
        });
    }
    async run(accessor, ...args) {
        const instantiationService = accessor.get(IInstantiationService);
        const widgetService = accessor.get(IChatWidgetService);
        const contextKeyService = accessor.get(IContextKeyService);
        const keybindingService = accessor.get(IKeybindingService);
        const contextPickService = accessor.get(IChatContextPickService);
        const context = args[0];
        const widget = context?.widget ?? widgetService.lastFocusedWidget;
        if (!widget) {
            return;
        }
        const quickPickItems = [];
        for (const item of contextPickService.items) {
            if (item.isEnabled && !await item.isEnabled(widget)) {
                continue;
            }
            quickPickItems.push({
                kind: 'contextPick',
                item,
                label: item.label,
                iconClass: ThemeIcon.asClassName(item.icon),
                keybinding: item.commandId ? keybindingService.lookupKeybinding(item.commandId, contextKeyService) : undefined,
            });
        }
        instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, context?.placeholder);
    }
    _show(accessor, widget, additionPicks, placeholder) {
        const quickInputService = accessor.get(IQuickInputService);
        const quickChatService = accessor.get(IQuickChatService);
        const instantiationService = accessor.get(IInstantiationService);
        const commandService = accessor.get(ICommandService);
        const providerOptions = {
            filter: (pick) => {
                if (isIQuickPickItemWithResource(pick) && pick.resource) {
                    return instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, pick.resource.scheme));
                }
                return true;
            },
            additionPicks,
            handleAccept: async (item, isBackgroundAccept) => {
                if (isIContextPickItemItem(item)) {
                    let isDone = true;
                    if (item.item.type === 'valuePick') {
                        this._handleContextPick(item.item, widget);
                    }
                    else if (item.item.type === 'pickerPick') {
                        isDone = await this._handleContextPickerItem(quickInputService, commandService, item.item, widget);
                    }
                    if (!isDone) {
                        // restart picker when sub-picker didn't return anything
                        instantiationService.invokeFunction(this._show.bind(this), widget, additionPicks, placeholder);
                        return;
                    }
                }
                else {
                    instantiationService.invokeFunction(this._handleQPPick.bind(this), widget, isBackgroundAccept, item);
                }
                if (isQuickChat(widget)) {
                    quickChatService.open();
                }
            }
        };
        quickInputService.quickAccess.show('', {
            enabledProviderPrefixes: [
                AnythingQuickAccessProvider.PREFIX,
                SymbolsQuickAccessProvider.PREFIX,
                AbstractGotoSymbolQuickAccessProvider.PREFIX
            ],
            placeholder: placeholder ?? localize('chatContext.attach.placeholder', 'Search attachments'),
            providerOptions,
        });
    }
    async _handleQPPick(accessor, widget, isInBackground, pick) {
        const fileService = accessor.get(IFileService);
        const textModelService = accessor.get(ITextModelService);
        const toAttach = [];
        if (isIQuickPickItemWithResource(pick) && pick.resource) {
            if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(pick.resource.path)) {
                // checks if the file is an image
                if (URI.isUri(pick.resource)) {
                    // read the image and attach a new file context.
                    const readFile = await fileService.readFile(pick.resource);
                    const resizedImage = await resizeImage(readFile.value.buffer);
                    toAttach.push({
                        id: pick.resource.toString(),
                        name: pick.label,
                        fullName: pick.label,
                        value: resizedImage,
                        kind: 'image',
                        references: [{ reference: pick.resource, kind: 'reference' }]
                    });
                }
            }
            else {
                let omittedState = 0 /* OmittedState.NotOmitted */;
                try {
                    const createdModel = await textModelService.createModelReference(pick.resource);
                    createdModel.dispose();
                }
                catch {
                    omittedState = 2 /* OmittedState.Full */;
                }
                toAttach.push({
                    kind: 'file',
                    id: pick.resource.toString(),
                    value: pick.resource,
                    name: pick.label,
                    omittedState
                });
            }
        }
        else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
            toAttach.push({
                kind: 'generic',
                id: JSON.stringify({ uri: pick.uri, range: pick.range.decoration }),
                value: { uri: pick.uri, range: pick.range.decoration },
                fullName: pick.label,
                name: pick.symbolName,
            });
        }
        widget.attachmentModel.addContext(...toAttach);
        if (!isInBackground) {
            // Set focus back into the input once the user is done attaching items
            // so that the user can start typing their message
            widget.focusInput();
        }
    }
    async _handleContextPick(item, widget) {
        const value = await item.asAttachment(widget);
        if (Array.isArray(value)) {
            widget.attachmentModel.addContext(...value);
        }
        else if (value) {
            widget.attachmentModel.addContext(value);
        }
    }
    async _handleContextPickerItem(quickInputService, commandService, item, widget) {
        const pickerConfig = item.asPicker(widget);
        const store = new DisposableStore();
        const goBackItem = {
            label: localize('goBack', 'Go back ↩'),
            alwaysShow: true
        };
        const configureItem = pickerConfig.configure ? {
            label: pickerConfig.configure.label,
            commandId: pickerConfig.configure.commandId,
            alwaysShow: true
        } : undefined;
        const extraPicks = [{ type: 'separator' }];
        if (configureItem) {
            extraPicks.push(configureItem);
        }
        extraPicks.push(goBackItem);
        const qp = store.add(quickInputService.createQuickPick({ useSeparators: true }));
        const cts = new CancellationTokenSource();
        store.add(qp.onDidHide(() => cts.cancel()));
        store.add(toDisposable(() => cts.dispose(true)));
        qp.placeholder = pickerConfig.placeholder;
        qp.matchOnDescription = true;
        qp.matchOnDetail = true;
        // qp.ignoreFocusOut = true;
        qp.canAcceptInBackground = true;
        qp.busy = true;
        qp.show();
        if (isThenable(pickerConfig.picks)) {
            const items = await (pickerConfig.picks.then(value => {
                return [].concat(value, extraPicks);
            }));
            qp.items = items;
            qp.busy = false;
        }
        else {
            const query = observableValue('attachContext.query', qp.value);
            store.add(qp.onDidChangeValue(() => query.set(qp.value, undefined)));
            const picksObservable = pickerConfig.picks(query, cts.token);
            store.add(autorun(reader => {
                const { busy, picks } = picksObservable.read(reader);
                qp.items = [].concat(picks, extraPicks);
                qp.busy = busy;
            }));
        }
        if (cts.token.isCancellationRequested) {
            pickerConfig.dispose?.();
            return true; // picker got hidden already
        }
        const defer = new DeferredPromise();
        const addPromises = [];
        store.add(qp.onDidAccept(async (e) => {
            const noop = 'noop';
            const [selected] = qp.selectedItems;
            if (isChatContextPickerPickItem(selected)) {
                const attachment = selected.asAttachment();
                if (!attachment || attachment === noop) {
                    return;
                }
                if (isThenable(attachment)) {
                    addPromises.push(attachment.then(v => {
                        if (v !== noop) {
                            widget.attachmentModel.addContext(...asArray(v));
                        }
                    }));
                }
                else {
                    widget.attachmentModel.addContext(...asArray(attachment));
                }
            }
            if (selected === goBackItem) {
                if (pickerConfig.goBack?.()) {
                    // Custom goBack handled the navigation, stay in the picker
                    return; // Don't complete, keep picker open
                }
                // Default behavior: go back to main picker
                defer.complete(false);
            }
            if (selected === configureItem) {
                defer.complete(true);
                commandService.executeCommand(configureItem.commandId);
            }
            if (!e.inBackground) {
                defer.complete(true);
            }
        }));
        store.add(qp.onDidHide(() => {
            defer.complete(true);
            pickerConfig.dispose?.();
        }));
        try {
            const result = await defer.p;
            qp.busy = true; // if still visible
            await Promise.all(addPromises);
            return result;
        }
        finally {
            store.dispose();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHRBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdENvbnRleHRBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUscUNBQXFDLEVBQTRCLE1BQU0sNEVBQTRFLENBQUM7QUFDN0osT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFB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