/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../../base/common/arrays.js';
import { DeferredPromise, isThenable } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPickItem, IQuickPickItemWithResource, QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { resolveCommandsContext } from '../../../../browser/parts/editor/editorCommandsContext.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, isEditorCommandsContext, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExplorerFolderContext } from '../../../files/common/files.js';
import { CTX_INLINE_CHAT_V2_ENABLED } from '../../../inlineChat/common/inlineChat.js';
import { AnythingQuickAccessProvider } from '../../../search/browser/anythingQuickAccess.js';
import { isSearchTreeFileMatch, isSearchTreeMatch } from '../../../search/browser/searchTreeModel/searchTreeCommon.js';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { SearchContext } from '../../../search/common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry, OmittedState } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, isSupportedChatFileScheme } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService, IQuickChatService } from '../chat.js';
import { IChatContextPickerItem, IChatContextPickService, IChatContextValueItem, isChatContextPickerPickItem } from '../attachments/chatContextPickService.js';
import { isQuickChat } from '../widget/chatWidget.js';
import { resizeImage } from '../chatImageUtils.js';
import { registerPromptActions } from '../promptSyntax/promptFileActions.js';
import { CHAT_CATEGORY } from './chatActions.js';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileToChatAction);
	registerAction2(AttachFolderToChatAction);
	registerAction2(AttachSelectionToChatAction);
	registerAction2(AttachSearchResultAction);
	registerPromptActions();
}

async function withChatView(accessor: ServicesAccessor): Promise<IChatWidget | undefined> {
	const chatWidgetService = accessor.get(IChatWidgetService);

	const lastFocusedWidget = chatWidgetService.lastFocusedWidget;
	if (!lastFocusedWidget || lastFocusedWidget.location === ChatAgentLocation.Chat) {
		return chatWidgetService.revealWidget(); // only show chat view if we either have no chat view or its located in view container
	}
	return lastFocusedWidget;
}

abstract class AttachResourceAction extends Action2 {

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const instaService = accessor.get(IInstantiationService);
		const widget = await instaService.invokeFunction(withChatView);
		if (!widget) {
			return;
		}
		return instaService.invokeFunction(this.runWithWidget.bind(this), widget, ...args);
	}

	abstract runWithWidget(accessor: ServicesAccessor, widget: IChatWidget, ...args: unknown[]): Promise<void>;

	protected _getResources(accessor: ServicesAccessor, ...args: unknown[]): URI[] {
		const editorService = accessor.get(IEditorService);

		const contexts = isEditorCommandsContext(args[1]) ? this._getEditorResources(accessor, args) : Array.isArray(args[1]) ? args[1] : [args[0]];
		const files = [];
		for (const context of contexts) {
			let uri;
			if (URI.isUri(context)) {
				uri = context;
			} else if (isSearchTreeFileMatch(context)) {
				uri = context.resource;
			} else if (isSearchTreeMatch(context)) {
				uri = context.parent().resource;
			} else if (!context && editorService.activeTextEditorControl) {
				uri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			}

			if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
				files.push(uri);
			}
		}

		return files;
	}

	private _getEditorResources(accessor: ServicesAccessor, ...args: unknown[]): URI[] {
		const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));

		return resolvedContext.groupedEditors
			.flatMap(groupedEditor => groupedEditor.editors)
			.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
			.filter(uri => uri !== undefined);
	}
}

class AttachFileToChatAction extends AttachResourceAction {

	static readonly ID = 'workbench.action.chat.attachFile';

	constructor() {
		super({
			id: AttachFileToChatAction.ID,
			title: localize2('workbench.action.chat.attachFile.label', "Add File to Chat"),
			category: CHAT_CATEGORY,
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
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ExplorerFolderContext.negate(),
					ContextKeyExpr.or(
						ResourceContextKey.Scheme.isEqualTo(Schemas.file),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
					)
				),
			}, {
				id: MenuId.EditorTitleContext,
				group: '2_chat',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.or(
						ResourceContextKey.Scheme.isEqualTo(Schemas.file),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
					)
				),
			}, {
				id: MenuId.EditorContext,
				group: '1_chat',
				order: 2,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.or(
						ResourceContextKey.Scheme.isEqualTo(Schemas.file),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
						ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
					)
				)
			}]
		});
	}

	override async runWithWidget(accessor: ServicesAccessor, widget: IChatWidget, ...args: unknown[]): Promise<void> {
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

	static readonly ID = 'workbench.action.chat.attachFolder';

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
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ExplorerFolderContext,
					ContextKeyExpr.or(
						ResourceContextKey.Scheme.isEqualTo(Schemas.file),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
					)
				)
			}
		});
	}

	override async runWithWidget(accessor: ServicesAccessor, widget: IChatWidget, ...args: unknown[]): Promise<void> {
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

class AttachSelectionToChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachSelection';

	constructor() {
		super({
			id: AttachSelectionToChatAction.ID,
			title: localize2('workbench.action.chat.attachSelection.label', "Add Selection to Chat"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.EditorContext,
				group: '1_chat',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					EditorContextKeys.hasNonEmptySelection,
					ContextKeyExpr.or(
						ResourceContextKey.Scheme.isEqualTo(Schemas.file),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
						ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
						ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
					)
				)
			}
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
		if (!widget) {
			return;
		}

		const [_, matches] = args;
		// If we have search matches, it means this is coming from the search widget
		if (matches && matches.length > 0) {
			const uris = new Map<URI, Range | undefined>();
			for (const match of matches) {
				if (isSearchTreeFileMatch(match)) {
					uris.set(match.resource, undefined);
				} else {
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
		} else {
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

	private static readonly Name = 'searchResults';

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
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					SearchContext.SearchResultHeaderFocused),
			}]
		});
	}
	async run(accessor: ServicesAccessor) {
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

/** This is our type */
interface IContextPickItemItem extends IQuickPickItem {
	kind: 'contextPick';
	item: IChatContextValueItem | IChatContextPickerItem;
}

/** These are the types we get from "platform QP" */
type IQuickPickServicePickItem = IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickPickItemWithResource;

function isIContextPickItemItem(obj: unknown): obj is IContextPickItemItem {
	return (
		isObject(obj)
		&& typeof (<IContextPickItemItem>obj).kind === 'string'
		&& (<IContextPickItemItem>obj).kind === 'contextPick'
	);
}

function isIGotoSymbolQuickPickItem(obj: unknown): obj is IGotoSymbolQuickPickItem {
	return (
		isObject(obj)
		&& typeof (obj as IGotoSymbolQuickPickItem).symbolName === 'string'
		&& !!(obj as IGotoSymbolQuickPickItem).uri
		&& !!(obj as IGotoSymbolQuickPickItem).range);
}

function isIQuickPickItemWithResource(obj: unknown): obj is IQuickPickItemWithResource {
	return (
		isObject(obj)
		&& URI.isUri((obj as IQuickPickItemWithResource).resource));
}


export class AttachContextAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.attachContext',
			title: localize2('workbench.action.chat.attachContext.label.2', "Add Context..."),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			},
			menu: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditorInline), CTX_INLINE_CHAT_V2_ENABLED)
					),
					ContextKeyExpr.or(
						ChatContextKeys.lockedToCodingAgent.negate(),
						ChatContextKeys.agentSupportsAttachments
					)
				),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation',
				order: 3
			},

		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {

		const instantiationService = accessor.get(IInstantiationService);
		const widgetService = accessor.get(IChatWidgetService);
		const contextKeyService = accessor.get(IContextKeyService);
		const keybindingService = accessor.get(IKeybindingService);
		const contextPickService = accessor.get(IChatContextPickService);

		const context = args[0] as { widget?: IChatWidget; placeholder?: string } | undefined;
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const quickPickItems: IContextPickItemItem[] = [];

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

	private _show(accessor: ServicesAccessor, widget: IChatWidget, additionPicks: IContextPickItemItem[] | undefined, placeholder?: string) {
		const quickInputService = accessor.get(IQuickInputService);
		const quickChatService = accessor.get(IQuickChatService);
		const instantiationService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);

		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			filter: (pick) => {
				if (isIQuickPickItemWithResource(pick) && pick.resource) {
					return instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, pick.resource!.scheme));
				}
				return true;
			},
			additionPicks,
			handleAccept: async (item: IQuickPickServicePickItem | IContextPickItemItem, isBackgroundAccept: boolean) => {

				if (isIContextPickItemItem(item)) {

					let isDone = true;
					if (item.item.type === 'valuePick') {
						this._handleContextPick(item.item, widget);

					} else if (item.item.type === 'pickerPick') {
						isDone = await this._handleContextPickerItem(quickInputService, commandService, item.item, widget);
					}

					if (!isDone) {
						// restart picker when sub-picker didn't return anything
						instantiationService.invokeFunction(this._show.bind(this), widget, additionPicks, placeholder);
						return;
					}

				} else {
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

	private async _handleQPPick(accessor: ServicesAccessor, widget: IChatWidget, isInBackground: boolean, pick: IQuickPickServicePickItem) {
		const fileService = accessor.get(IFileService);
		const textModelService = accessor.get(ITextModelService);

		const toAttach: IChatRequestVariableEntry[] = [];

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
			} else {
				let omittedState = OmittedState.NotOmitted;
				try {
					const createdModel = await textModelService.createModelReference(pick.resource);
					createdModel.dispose();
				} catch {
					omittedState = OmittedState.Full;
				}

				toAttach.push({
					kind: 'file',
					id: pick.resource.toString(),
					value: pick.resource,
					name: pick.label,
					omittedState
				});
			}
		} else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
			toAttach.push({
				kind: 'generic',
				id: JSON.stringify({ uri: pick.uri, range: pick.range.decoration }),
				value: { uri: pick.uri, range: pick.range.decoration },
				fullName: pick.label,
				name: pick.symbolName!,
			});
		}


		widget.attachmentModel.addContext(...toAttach);

		if (!isInBackground) {
			// Set focus back into the input once the user is done attaching items
			// so that the user can start typing their message
			widget.focusInput();
		}
	}

	private async _handleContextPick(item: IChatContextValueItem, widget: IChatWidget) {

		const value = await item.asAttachment(widget);
		if (Array.isArray(value)) {
			widget.attachmentModel.addContext(...value);
		} else if (value) {
			widget.attachmentModel.addContext(value);
		}
	}

	private async _handleContextPickerItem(quickInputService: IQuickInputService, commandService: ICommandService, item: IChatContextPickerItem, widget: IChatWidget): Promise<boolean> {

		const pickerConfig = item.asPicker(widget);

		const store = new DisposableStore();

		const goBackItem: IQuickPickItem = {
			label: localize('goBack', 'Go back ↩'),
			alwaysShow: true
		};
		const configureItem = pickerConfig.configure ? {
			label: pickerConfig.configure.label,
			commandId: pickerConfig.configure.commandId,
			alwaysShow: true
		} : undefined;
		const extraPicks: QuickPickItem[] = [{ type: 'separator' }];
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
				return ([] as QuickPickItem[]).concat(value, extraPicks);
			}));

			qp.items = items;
			qp.busy = false;
		} else {
			const query = observableValue<string>('attachContext.query', qp.value);
			store.add(qp.onDidChangeValue(() => query.set(qp.value, undefined)));

			const picksObservable = pickerConfig.picks(query, cts.token);
			store.add(autorun(reader => {
				const { busy, picks } = picksObservable.read(reader);
				qp.items = ([] as QuickPickItem[]).concat(picks, extraPicks);
				qp.busy = busy;
			}));
		}

		if (cts.token.isCancellationRequested) {
			pickerConfig.dispose?.();
			return true; // picker got hidden already
		}

		const defer = new DeferredPromise<boolean>();
		const addPromises: Promise<void>[] = [];

		store.add(qp.onDidAccept(async e => {
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
				} else {
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
		} finally {
			store.dispose();
		}
	}
}
