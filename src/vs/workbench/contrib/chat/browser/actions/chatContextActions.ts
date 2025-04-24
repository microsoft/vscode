/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isElectron } from '../../../../../base/common/platform.js';
import { basename, dirname, extUri } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { WithUriValue } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { Command, SymbolKinds } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPickItem, IQuickPickItemWithResource, IQuickPickSeparator, QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ActiveEditorContext, TextCompareEditorActiveContext } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { VIEW_ID as SEARCH_VIEW_ID } from '../../../../services/search/common/search.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { FileEditorInput } from '../../../files/browser/editors/fileEditorInput.js';
import { TEXT_FILE_EDITOR_ID } from '../../../files/common/files.js';
import { NotebookEditorInput } from '../../../notebook/common/notebookEditorInput.js';
import { AnythingQuickAccessProvider } from '../../../search/browser/anythingQuickAccess.js';
import { isSearchTreeFileMatch, isSearchTreeMatch } from '../../../search/browser/searchTreeModel/searchTreeCommon.js';
import { SearchView } from '../../../search/browser/searchView.js';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { SearchContext } from '../../../search/common/constants.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData, OmittedState } from '../../common/chatModel.js';
import { ChatRequestAgentPart } from '../../common/chatParserTypes.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IToolData } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService, IQuickChatService, showChatView } from '../chat.js';
import { imageToHash, isImage } from '../chatPasteProviders.js';
import { isQuickChat } from '../chatWidget.js';
import { createFilesAndFolderQuickPick } from '../contrib/chatDynamicVariables.js';
import { convertBufferToScreenshotVariable, ScreenshotVariableId } from '../contrib/screenshot.js';
import { resizeImage } from '../imageUtils.js';
import { INSTRUCTIONS_COMMAND_ID } from '../promptSyntax/contributions/attachInstructionsCommand.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { runAttachInstructionsAction, registerPromptActions } from './promptActions/index.js';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileToChatAction);
	registerAction2(AttachFolderToChatAction);
	registerAction2(AttachSelectionToChatAction);
	registerAction2(AttachSearchResultAction);
}

/**
 * We fill the quickpick with these types, and enable some quick access providers
 */
type IAttachmentQuickPickItem = ICommandVariableQuickPickItem | IQuickAccessQuickPickItem
	| IToolsQuickPickItem | IToolQuickPickItem
	| IImageQuickPickItem | IOpenEditorsQuickPickItem | ISearchResultsQuickPickItem
	| IScreenShotQuickPickItem | IRelatedFilesQuickPickItem | IInstructionsQuickPickItem
	| IFolderQuickPickItem | IFolderResultQuickPickItem
	| IDiagnosticsQuickPickItem | IDiagnosticsQuickPickItemWithFilter;

function isIAttachmentQuickPickItem(obj: unknown): obj is IAttachmentQuickPickItem {
	return (
		typeof obj === 'object'
		&& obj !== null
		&& typeof (<IAttachmentQuickPickItem>obj).kind === 'string'
	);
}

const attachmentsOrdinals: (IAttachmentQuickPickItem['kind'])[] = [
	// bottom-most
	'tools',
	'screenshot',
	'image',
	'quickaccess',
	'diagnostic',
	'instructions',
	'folder',
	'open-editors',
	// top-most
];

/**
 * These are the types that we can get out of the quick pick
 */
type IChatContextQuickPickItem = IAttachmentQuickPickItem | IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickPickItemWithResource;

function isIGotoSymbolQuickPickItem(obj: unknown): obj is IGotoSymbolQuickPickItem {
	return (
		typeof obj === 'object'
		&& typeof (obj as IGotoSymbolQuickPickItem).symbolName === 'string'
		&& !!(obj as IGotoSymbolQuickPickItem).uri
		&& !!(obj as IGotoSymbolQuickPickItem).range);
}

function isISymbolQuickPickItem(obj: unknown): obj is ISymbolQuickPickItem {
	return (
		typeof obj === 'object'
		&& typeof (obj as ISymbolQuickPickItem).symbol === 'object'
		&& !!(obj as ISymbolQuickPickItem).symbol);
}

function isIQuickPickItemWithResource(obj: unknown): obj is IQuickPickItemWithResource {
	return (
		typeof obj === 'object'
		&& typeof (obj as IQuickPickItemWithResource).resource === 'object'
		&& URI.isUri((obj as IQuickPickItemWithResource).resource));
}


interface IToolsQuickPickItem extends IQuickPickItem {
	kind: 'tools';
	id: string;
	label: string;
}

interface IRelatedFilesQuickPickItem extends IQuickPickItem {
	kind: 'related-files';
	id: string;
	label: string;
}

interface IFolderQuickPickItem extends IQuickPickItem {
	kind: 'folder';
	id: string;
	label: string;
}

interface IFolderResultQuickPickItem extends IQuickPickItem {
	kind: 'folder-search-result';
	id: string;
	resource: URI;
}

interface IImageQuickPickItem extends IQuickPickItem {
	kind: 'image';
	id: string;
}

interface ICommandVariableQuickPickItem extends IQuickPickItem {
	kind: 'command';
	id: string;
	command: Command;
	name?: string;
	value: unknown;
	icon?: ThemeIcon;
}

interface IToolQuickPickItem extends IQuickPickItem {
	kind: 'tool';
	id: string;
	name?: string;
	icon?: ThemeIcon;
	tool: IToolData;
}

interface IQuickAccessQuickPickItem extends IQuickPickItem {
	kind: 'quickaccess';
	id: string;
	prefix: string;
}

interface IOpenEditorsQuickPickItem extends IQuickPickItem {
	kind: 'open-editors';
	id: 'open-editors';
	icon?: ThemeIcon;
}

interface ISearchResultsQuickPickItem extends IQuickPickItem {
	kind: 'search-results';
	id: string;
	icon?: ThemeIcon;
}

interface IScreenShotQuickPickItem extends IQuickPickItem {
	kind: 'screenshot';
	id: string;
	icon?: ThemeIcon;
}

interface IDiagnosticsQuickPickItem extends IQuickPickItem {
	kind: 'diagnostic';
	id: string;
	icon?: ThemeIcon;
}

interface IDiagnosticsQuickPickItemWithFilter extends IQuickPickItem {
	kind: 'diagnostic-filter';
	id: string;
	filter: IDiagnosticVariableEntryFilterData;
	icon?: ThemeIcon;
}

/**
 * Quick pick item for instructions attachment.
 */
const INSTRUCTION_PICK_ID = 'instructions';
interface IInstructionsQuickPickItem extends IQuickPickItem {
	/**
	 * The ID of the quick pick item.
	 */
	id: typeof INSTRUCTION_PICK_ID;

	/**
	 * Unique kind identifier of the instructions attachment.
	 */
	kind: typeof INSTRUCTION_PICK_ID;

	/**
	 * Keybinding of the command.
	 */
	keybinding?: ResolvedKeybinding;
}

abstract class AttachResourceAction extends Action2 {
	getResources(accessor: ServicesAccessor, ...args: any[]): URI[] {
		const editorService = accessor.get(IEditorService);

		const contexts = Array.isArray(args[1]) ? args[1] : [args[0]];
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
}

class AttachFileToChatAction extends AttachResourceAction {

	static readonly ID = 'workbench.action.chat.attachFile';

	constructor() {
		super({
			id: AttachFileToChatAction.ID,
			title: localize2('workbench.action.chat.attachFile.label', "Add File to Chat"),
			category: CHAT_CATEGORY,
			f1: false,
			menu: [{
				id: MenuId.SearchContext,
				group: 'z_chat',
				order: 1,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TextCompareEditorActiveContext), SearchContext.SearchResultHeaderFocused.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const files = this.getResources(accessor, ...args);
		if (!files.length) {
			return;
		}
		const widget = await showChatView(viewsService);
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
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const viewsService = accessor.get(IViewsService);

		const folders = this.getResources(accessor, ...args);
		if (!folders.length) {
			return;
		}
		const widget = await showChatView(viewsService);
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
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const viewsService = accessor.get(IViewsService);

		const widget = await showChatView(viewsService);
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
		const widget = await showChatView(accessor.get(IViewsService));

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

export class AttachContextAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.attachContext',
			title: localize2('workbench.action.chat.attachContext.label.2', "Add Context..."),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel)),
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			},
			menu: {
				when: ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation',
				order: 3
			},
		});
	}

	private _getFileContextId(item: { resource: URI } | { uri: URI; range: IRange }) {
		if ('resource' in item) {
			return item.resource.toString();
		}

		return item.uri.toString() + (item.range.startLineNumber !== item.range.endLineNumber ?
			`:${item.range.startLineNumber}-${item.range.endLineNumber}` :
			`:${item.range.startLineNumber}`);
	}

	private async _attachContext(accessor: ServicesAccessor, widget: IChatWidget, isInBackground?: boolean, ...picks: IChatContextQuickPickItem[]) {
		const commandService = accessor.get(ICommandService);
		const clipboardService = accessor.get(IClipboardService);
		const editorService = accessor.get(IEditorService);
		const labelService = accessor.get(ILabelService);
		const viewsService = accessor.get(IViewsService);
		const chatEditingService = accessor.get(IChatEditingService);
		const hostService = accessor.get(IHostService);
		const fileService = accessor.get(IFileService);
		const textModelService = accessor.get(ITextModelService);
		const quickInputService = accessor.get(IQuickInputService);

		const toAttach: IChatRequestVariableEntry[] = [];
		for (const pick of picks) {

			if (isIAttachmentQuickPickItem(pick)) {
				if (pick.kind === 'folder-search-result') {
					toAttach.push({
						kind: 'directory',
						id: pick.id,
						value: pick.resource,
						name: basename(pick.resource),
					});
				} else if (pick.kind === 'diagnostic-filter') {
					toAttach.push({
						id: pick.id,
						name: pick.label,
						value: pick.filter,
						kind: 'diagnostic',
						icon: pick.icon,
						...pick.filter,
					});

				} else if (pick.kind === 'open-editors') {
					for (const editor of editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput || e instanceof NotebookEditorInput)) {
						const uri = editor instanceof DiffEditorInput ? editor.modified.resource : editor.resource;
						if (uri) {
							toAttach.push({
								kind: 'file',
								id: this._getFileContextId({ resource: uri }),
								value: uri,
								name: labelService.getUriBasenameLabel(uri),
							});
						}
					}
				} else if (pick.kind === 'search-results') {
					const searchView = viewsService.getViewWithId(SEARCH_VIEW_ID) as SearchView;
					for (const result of searchView.model.searchResult.matches()) {
						toAttach.push({
							kind: 'file',
							id: this._getFileContextId({ resource: result.resource }),
							value: result.resource,
							name: labelService.getUriBasenameLabel(result.resource),
						});
					}
				} else if (pick.kind === 'related-files') {
					// Get all provider results and show them in a second tier picker
					const chatSessionId = widget.viewModel?.sessionId;
					if (!chatSessionId || !chatEditingService) {
						continue;
					}
					const relatedFiles = await chatEditingService.getRelatedFiles(chatSessionId, widget.getInput(), widget.attachmentModel.fileAttachments, CancellationToken.None);
					if (!relatedFiles) {
						continue;
					}
					const attachments = widget.attachmentModel.getAttachmentIDs();
					const itemsPromise = chatEditingService.getRelatedFiles(chatSessionId, widget.getInput(), widget.attachmentModel.fileAttachments, CancellationToken.None)
						.then((files) => (files ?? []).reduce<(WithUriValue<IQuickPickItem> | IQuickPickSeparator)[]>((acc, cur) => {
							acc.push({ type: 'separator', label: cur.group });
							for (const file of cur.files) {
								acc.push({
									type: 'item',
									label: labelService.getUriBasenameLabel(file.uri),
									description: labelService.getUriLabel(dirname(file.uri), { relative: true }),
									value: file.uri,
									disabled: attachments.has(this._getFileContextId({ resource: file.uri })),
									picked: true
								});
							}
							return acc;
						}, []));
					const selectedFiles = await quickInputService.pick(itemsPromise, { placeHolder: localize('relatedFiles', 'Add related files to your working set'), canPickMany: true });
					for (const file of selectedFiles ?? []) {
						toAttach.push({
							kind: 'file',
							id: this._getFileContextId({ resource: file.value }),
							value: file.value,
							name: file.label,
							omittedState: OmittedState.NotOmitted
						});
					}
				} else if (pick.kind === 'screenshot') {
					const blob = await hostService.getScreenshot();
					if (blob) {
						toAttach.push(convertBufferToScreenshotVariable(blob));
					}
				} else if (pick.kind === 'command') {
					// Dynamic variable with a followup command
					const selection = await commandService.executeCommand(pick.command.id, ...(pick.command.arguments ?? []));
					if (!selection) {
						// User made no selection, skip this variable
						continue;
					}
					toAttach.push({
						...pick,
						value: pick.value,
						name: `${typeof pick.value === 'string' && pick.value.startsWith('#') ? pick.value.slice(1) : ''}${selection}`,
						// Apply the original icon with the new name
						fullName: selection
					});
				} else if (pick.kind === 'tool') {
					toAttach.push({
						id: pick.id,
						name: pick.tool.displayName,
						fullName: pick.tool.displayName,
						value: undefined,
						icon: pick.icon,
						kind: 'tool'
					});
				} else if (pick.kind === 'image') {
					const fileBuffer = await clipboardService.readImage();
					toAttach.push({
						id: await imageToHash(fileBuffer),
						name: localize('pastedImage', 'Pasted Image'),
						fullName: localize('pastedImage', 'Pasted Image'),
						value: fileBuffer,
						kind: 'image',
					});
				}
			} else if (isISymbolQuickPickItem(pick) && pick.symbol) {
				// Workspace symbol
				toAttach.push({
					kind: 'symbol',
					id: this._getFileContextId(pick.symbol.location),
					value: pick.symbol.location,
					symbolKind: pick.symbol.kind,
					icon: SymbolKinds.toIcon(pick.symbol.kind),
					fullName: pick.label,
					name: pick.symbol.name,
				});
			} else if (isIQuickPickItemWithResource(pick) && pick.resource) {
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
						id: this._getFileContextId({ resource: pick.resource }),
						value: pick.resource,
						name: pick.label,
						omittedState
					});
				}
			} else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
				toAttach.push({
					kind: 'generic',
					id: this._getFileContextId({ uri: pick.uri, range: pick.range.decoration }),
					value: { uri: pick.uri, range: pick.range.decoration },
					fullName: pick.label,
					name: pick.symbolName!,
				});
			}
		}

		widget.attachmentModel.addContext(...toAttach);
		if (!isInBackground) {
			// Set focus back into the input once the user is done attaching items
			// so that the user can start typing their message
			widget.focusInput();
		}
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatAgentService = accessor.get(IChatAgentService);
		const widgetService = accessor.get(IChatWidgetService);
		const clipboardService = accessor.get(IClipboardService);
		const editorService = accessor.get(IEditorService);
		const contextKeyService = accessor.get(IContextKeyService);
		const extensionService = accessor.get(IExtensionService);
		const instantiationService = accessor.get(IInstantiationService);
		const keybindingService = accessor.get(IKeybindingService);
		const chatEditingService = accessor.get(IChatEditingService);

		const context: { widget?: IChatWidget; placeholder?: string } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const quickPickItems: IAttachmentQuickPickItem[] = [];
		if (extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData'))) {
			const imageData = await clipboardService.readImage();
			if (isImage(imageData)) {
				quickPickItems.push({
					kind: 'image',
					id: await imageToHash(imageData),
					label: localize('imageFromClipboard', 'Image from Clipboard'),
					iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
				});
			}

			quickPickItems.push({
				kind: 'screenshot',
				id: ScreenshotVariableId,
				icon: ThemeIcon.fromId(Codicon.deviceCamera.id),
				iconClass: ThemeIcon.asClassName(Codicon.deviceCamera),
				label: (isElectron
					? localize('chatContext.attachScreenshot.labelElectron.Window', 'Screenshot Window')
					: localize('chatContext.attachScreenshot.labelWeb', 'Screenshot')),
			});
		}

		if (widget.viewModel?.sessionId) {
			const agentPart = widget.parsedInput.parts.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
			if (agentPart) {
				const completions = await chatAgentService.getAgentCompletionItems(agentPart.agent.id, '', CancellationToken.None);
				for (const variable of completions) {
					if (variable.fullName && variable.command) {
						quickPickItems.push({
							kind: 'command',
							label: variable.fullName,
							id: variable.id,
							command: variable.command,
							icon: variable.icon,
							iconClass: variable.icon ? ThemeIcon.asClassName(variable.icon) : undefined,
							value: variable.value,
							name: variable.name
						});
					} else {
						// Currently there's nothing that falls into this category
					}
				}
			}
		}

		quickPickItems.push({
			kind: 'tools',
			label: localize('chatContext.tools', 'Tools...'),
			iconClass: ThemeIcon.asClassName(Codicon.tools),
			id: 'tools',
		});

		quickPickItems.push({
			kind: 'quickaccess',
			label: localize('chatContext.symbol', 'Symbols...'),
			iconClass: ThemeIcon.asClassName(Codicon.symbolField),
			prefix: SymbolsQuickAccessProvider.PREFIX,
			id: 'symbol'
		});

		quickPickItems.push({
			kind: 'folder',
			label: localize('chatContext.folder', 'Files & Folders...'),
			iconClass: ThemeIcon.asClassName(Codicon.folder),
			id: 'folder',
		});

		quickPickItems.push({
			kind: 'diagnostic',
			label: localize('chatContext.diagnstic', 'Problems...'),
			iconClass: ThemeIcon.asClassName(Codicon.error),
			id: 'diagnostic'
		});

		if (widget.location === ChatAgentLocation.Notebook) {
			quickPickItems.push({
				kind: 'command',
				id: 'chatContext.notebook.kernelVariable',
				icon: ThemeIcon.fromId(Codicon.serverEnvironment.id),
				iconClass: ThemeIcon.asClassName(Codicon.serverEnvironment),
				value: 'kernelVariable',
				label: localize('chatContext.notebook.kernelVariable', 'Kernel Variable...'),
				command: {
					id: 'notebook.chat.selectAndInsertKernelVariable',
					title: localize('chatContext.notebook.selectkernelVariable', 'Select and Insert Kernel Variable'),
					arguments: [{ widget, range: undefined }]
				}
			});
		}

		if (chatEditingService?.hasRelatedFilesProviders() && (widget.getInput() || widget.attachmentModel.fileAttachments.length > 0)) {
			quickPickItems.push({
				kind: 'related-files',
				id: 'related-files',
				label: localize('chatContext.relatedFiles', 'Related Files'),
				iconClass: ThemeIcon.asClassName(Codicon.sparkle),
			});
		}
		if (editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput).length > 0) {
			quickPickItems.push({
				kind: 'open-editors',
				id: 'open-editors',
				label: localize('chatContext.editors', 'Open Editors'),
				iconClass: ThemeIcon.asClassName(Codicon.files),
			});
		}
		if (SearchContext.HasSearchResults.getValue(contextKeyService)) {
			quickPickItems.push({
				kind: 'search-results',
				id: 'search-results',
				label: localize('chatContext.searchResults', 'Search Results'),
				iconClass: ThemeIcon.asClassName(Codicon.search),
			});
		}

		// if the `reusable prompts` feature is enabled, add
		// the appropriate attachment type to the list
		if (widget.attachmentModel.promptInstructions.featureEnabled) {
			const keybinding = keybindingService.lookupKeybinding(INSTRUCTIONS_COMMAND_ID, contextKeyService);

			quickPickItems.push({
				id: INSTRUCTION_PICK_ID,
				kind: INSTRUCTION_PICK_ID,
				label: localize('chatContext.attach.instructions.label', 'Instructions...'),
				iconClass: ThemeIcon.asClassName(Codicon.bookmark),
				keybinding,
			});
		}

		quickPickItems.sort((a, b) => {
			let result = attachmentsOrdinals.indexOf(b.kind) - attachmentsOrdinals.indexOf(a.kind);
			if (result === 0) {
				result = a.label.localeCompare(b.label);
			}
			return result;
		});

		instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, '', context?.placeholder);
	}

	private async _showDiagnosticsPick(instantiationService: IInstantiationService, onBackgroundAccept: (item: IChatContextQuickPickItem[]) => void): Promise<IDiagnosticsQuickPickItemWithFilter | undefined> {
		const convert = (item: IDiagnosticVariableEntryFilterData): IDiagnosticsQuickPickItemWithFilter => ({
			kind: 'diagnostic-filter',
			id: IDiagnosticVariableEntryFilterData.id(item),
			label: IDiagnosticVariableEntryFilterData.label(item),
			icon: IDiagnosticVariableEntryFilterData.icon,
			filter: item,
		});

		const filter = await instantiationService.invokeFunction(createMarkersQuickPick, items => onBackgroundAccept(items.map(convert)));
		return filter && convert(filter);
	}

	private _show(accessor: ServicesAccessor, widget: IChatWidget, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] | undefined, query: string = '', placeholder?: string) {
		const quickInputService = accessor.get(IQuickInputService);
		const quickChatService = accessor.get(IQuickChatService);
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		const instantiationService = accessor.get(IInstantiationService);

		const attach = (isBackgroundAccept: boolean, ...items: IChatContextQuickPickItem[]) => {
			instantiationService.invokeFunction(this._attachContext.bind(this), widget, isBackgroundAccept, ...items);
		};

		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			additionPicks: quickPickItems,
			handleAccept: async (inputItem: IChatContextQuickPickItem, isBackgroundAccept: boolean) => {
				let item: IChatContextQuickPickItem | undefined = inputItem;

				if (isIAttachmentQuickPickItem(item)) {

					if (item.kind === 'quickaccess') {
						instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, item.prefix, placeholder);
						return;
					} else if (item.kind === 'instructions') {
						runAttachInstructionsAction(commandService, { widget });
						return;
					}

					if (item.kind === 'folder') {
						item = await this._showFolders(instantiationService);
					} else if (item.kind === 'diagnostic') {
						item = await this._showDiagnosticsPick(instantiationService, i => attach(true, ...i));
					} else if (item.kind === 'tools') {
						item = await instantiationService.invokeFunction(showToolsPick, widget);
					}
					if (!item) {
						// restart picker when sub-picker didn't return anything
						instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, '', placeholder);
						return;
					}

				}
				attach(isBackgroundAccept, item);
				if (isQuickChat(widget)) {
					quickChatService.open();
				}

			},
			filter: (item: IChatContextQuickPickItem | IQuickPickSeparator) => {
				// Avoid attaching the same context twice
				const attachedContext = widget.attachmentModel.getAttachmentIDs();

				if (isIAttachmentQuickPickItem(item) && item.kind === 'open-editors') {
					for (const editor of editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput)) {
						// There is an open editor that hasn't yet been attached to the chat
						if (editor.resource && !attachedContext.has(this._getFileContextId({ resource: editor.resource }))) {
							return true;
						}
					}
					return false;
				}

				if ('kind' in item && item.kind === 'image') {
					return !attachedContext.has(item.id);
				}

				if ('symbol' in item && item.symbol) {
					return !attachedContext.has(this._getFileContextId(item.symbol.location));
				}

				if (item && typeof item === 'object' && 'resource' in item && URI.isUri(item.resource)) {
					return [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(item.resource.scheme)
						&& !attachedContext.has(this._getFileContextId({ resource: item.resource })); // Hack because Typescript doesn't narrow this type correctly
				}

				if (item && typeof item === 'object' && 'uri' in item && item.uri && item.range) {
					return !attachedContext.has(this._getFileContextId({ uri: item.uri, range: item.range.decoration }));
				}

				if (!('command' in item) && item.id) {
					return !attachedContext.has(item.id);
				}

				// Don't filter out dynamic variables which show secondary data (temporary)
				return true;
			}
		};
		quickInputService.quickAccess.show(query, {
			enabledProviderPrefixes: [
				AnythingQuickAccessProvider.PREFIX,
				SymbolsQuickAccessProvider.PREFIX,
				AbstractGotoSymbolQuickAccessProvider.PREFIX
			],
			placeholder: placeholder ?? localize('chatContext.attach.placeholder', 'Search attachments'),
			providerOptions,
		});
	}

	private async _showFolders(instantiationService: IInstantiationService): Promise<IFolderResultQuickPickItem | undefined> {
		const folder = await instantiationService.invokeFunction(createFilesAndFolderQuickPick);
		if (!folder) {
			return undefined;
		}

		return {
			kind: 'folder-search-result',
			id: folder.toString(),
			label: basename(folder),
			resource: folder,
		};
	}
}

async function createMarkersQuickPick(accessor: ServicesAccessor, onBackgroundAccept?: (item: IDiagnosticVariableEntryFilterData[]) => void): Promise<IDiagnosticVariableEntryFilterData | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const markerService = accessor.get(IMarkerService);
	const labelService = accessor.get(ILabelService);

	const markers = markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
	const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));

	const severities = new Set<MarkerSeverity>();
	type MarkerPickItem = IQuickPickItem & { resource?: URI; entry: IDiagnosticVariableEntryFilterData };
	const items: (MarkerPickItem | IQuickPickSeparator)[] = [];

	let pickCount = 0;
	for (const group of grouped) {
		const resource = group[0].resource;

		items.push({ type: 'separator', label: labelService.getUriLabel(resource, { relative: true }) });
		for (const marker of group) {
			pickCount++;
			severities.add(marker.severity);
			items.push({
				type: 'item',
				resource: marker.resource,
				label: marker.message,
				description: localize('markers.panel.at.ln.col.number', "[Ln {0}, Col {1}]", '' + marker.startLineNumber, '' + marker.startColumn),
				entry: IDiagnosticVariableEntryFilterData.fromMarker(marker),
			});
		}
	}

	items.unshift({ type: 'item', label: localize('markers.panel.allErrors', 'All Problems'), entry: { filterSeverity: MarkerSeverity.Info } });

	const store = new DisposableStore();
	const quickPick = store.add(quickInputService.createQuickPick<MarkerPickItem>({ useSeparators: true }));
	quickPick.canAcceptInBackground = !onBackgroundAccept;
	quickPick.placeholder = localize('pickAProblem', 'Pick a problem to attach...');
	quickPick.items = items;

	return new Promise<IDiagnosticVariableEntryFilterData | undefined>(resolve => {
		store.add(quickPick.onDidHide(() => resolve(undefined)));
		store.add(quickPick.onDidAccept(ev => {
			if (ev.inBackground) {
				onBackgroundAccept?.(quickPick.selectedItems.map(i => i.entry));
			} else {
				resolve(quickPick.selectedItems[0]?.entry);
				quickPick.dispose();
			}
		}));
		quickPick.show();
	}).finally(() => store.dispose());
}

async function showToolsPick(accessor: ServicesAccessor, widget: IChatWidget): Promise<IToolQuickPickItem | undefined> {

	const quickPickService = accessor.get(IQuickInputService);


	function classify(tool: IToolData) {
		if (tool.source.type === 'internal' || tool.source.type === 'extension' && !tool.source.isExternalTool) {
			return { ordinal: 1, groupLabel: localize('chatContext.tools.internal', 'Built-In') };
		} else if (tool.source.type === 'mcp') {
			return { ordinal: 2, groupLabel: localize('chatContext.tools.mcp', 'MCP Servers') };
		} else {
			return { ordinal: 3, groupLabel: localize('chatContext.tools.extension', 'Extensions') };
		}
	}

	type Pick = IToolQuickPickItem & { ordinal: number; groupLabel: string };
	const items: Pick[] = [];

	for (const tool of widget.input.selectedToolsModel.tools.get()) {
		if (!tool.canBeReferencedInPrompt) {
			continue;
		}
		const item: Pick = {
			tool,
			...classify(tool),
			kind: 'tool',
			label: tool.toolReferenceName ?? tool.id,
			description: (tool.toolReferenceName ?? tool.id) !== tool.displayName ? tool.displayName : undefined,
			id: tool.id,
		};
		// if (ThemeIcon.isThemeIcon(tool.icon)) {
		// 	item.iconClass = ThemeIcon.asClassName(tool.icon);
		// } else if (tool.icon) {
		// 	item.iconPath = tool.icon;
		// }
		items.push(item);
	}

	items.sort((a, b) => {
		let res = a.ordinal - b.ordinal;
		if (res === 0) {
			res = a.label.localeCompare(b.label);
		}
		return res;
	});

	let lastGroupLabel: string | undefined;
	const picks: (IQuickPickSeparator | Pick)[] = [];


	for (const item of items) {
		if (lastGroupLabel !== item.groupLabel) {
			picks.push({ type: 'separator', label: item.groupLabel });
			lastGroupLabel = item.groupLabel;
		}
		picks.push(item);
	}

	const result = await quickPickService.pick(picks, {
		placeHolder: localize('chatContext.tools.placeholder', 'Select a tool'),
		canPickMany: false
	});

	return result;
}

/**
 * Register all actions related to reusable prompt files.
 */
registerPromptActions();
