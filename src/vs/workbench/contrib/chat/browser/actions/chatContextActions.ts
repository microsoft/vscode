/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isElectron } from '../../../../../base/common/platform.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { WithUriValue } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { Command } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
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
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from '../../common/chatModel.js';
import { ChatRequestAgentPart } from '../../common/chatParserTypes.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService, IQuickChatService, showChatView, showEditsView } from '../chat.js';
import { imageToHash, isImage } from '../chatPasteProviders.js';
import { isQuickChat } from '../chatWidget.js';
import { createFolderQuickPick, createMarkersQuickPick } from '../contrib/chatDynamicVariables.js';
import { convertBufferToScreenshotVariable, ScreenshotVariableId } from '../contrib/screenshot.js';
import { resizeImage } from '../imageUtils.js';
import { COMMAND_ID as USE_PROMPT_COMMAND_ID } from '../promptSyntax/contributions/usePromptCommand.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { ATTACH_PROMPT_ACTION_ID, AttachPromptAction, IChatAttachPromptActionOptions } from './chatAttachPromptAction/chatAttachPromptAction.js';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileToChatAction);
	registerAction2(AttachFolderToChatAction);
	registerAction2(AttachSelectionToChatAction);
	registerAction2(AttachFileToEditingSessionAction);
	registerAction2(AttachFolderToEditingSessionAction);
	registerAction2(AttachSelectionToEditingSessionAction);
}

/**
 * We fill the quickpick with these types, and enable some quick access providers
 */
type IAttachmentQuickPickItem = ICommandVariableQuickPickItem | IQuickAccessQuickPickItem | IToolQuickPickItem |
	IImageQuickPickItem | IOpenEditorsQuickPickItem | ISearchResultsQuickPickItem |
	IScreenShotQuickPickItem | IRelatedFilesQuickPickItem | IReusablePromptQuickPickItem | IFolderQuickPickItem | IDiagnosticsQuickPickItem;

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

function isIFolderSearchResultQuickPickItem(obj: unknown): obj is IFolderResultQuickPickItem {
	return (
		typeof obj === 'object'
		&& (obj as IFolderResultQuickPickItem).kind === 'folder-search-result');
}

function isIDiagnosticsQuickPickItemWithFilter(obj: unknown): obj is IDiagnosticsQuickPickItemWithFilter {
	return (
		typeof obj === 'object'
		&& (obj as IDiagnosticsQuickPickItemWithFilter).kind === 'diagnostic-filter');
}

function isIQuickPickItemWithResource(obj: unknown): obj is IQuickPickItemWithResource {
	return (
		typeof obj === 'object'
		&& typeof (obj as IQuickPickItemWithResource).resource === 'object'
		&& URI.isUri((obj as IQuickPickItemWithResource).resource));
}

function isIOpenEditorsQuickPickItem(obj: unknown): obj is IOpenEditorsQuickPickItem {
	return (
		typeof obj === 'object'
		&& (obj as IOpenEditorsQuickPickItem).id === 'open-editors');
}

function isISearchResultsQuickPickItem(obj: unknown): obj is ISearchResultsQuickPickItem {
	return (
		typeof obj === 'object'
		&& (obj as ISearchResultsQuickPickItem).kind === 'search-results');
}

function isScreenshotQuickPickItem(obj: unknown): obj is IScreenShotQuickPickItem {
	return (
		typeof obj === 'object'
		&& (obj as IScreenShotQuickPickItem).kind === 'screenshot');
}

function isRelatedFileQuickPickItem(obj: unknown): obj is IRelatedFilesQuickPickItem {
	return (
		typeof obj === 'object'
		&& (obj as IRelatedFilesQuickPickItem).kind === 'related-files'
	);
}

/**
 * Checks is a provided object is a prompt instructions quick pick item.
 */
function isPromptInstructionsQuickPickItem(obj: unknown): obj is IReusablePromptQuickPickItem {
	if (!obj || typeof obj !== 'object') {
		return false;
	}

	return ('kind' in obj && obj.kind === 'reusable-prompt');
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
 * Quick pick item for reusable prompt attachment.
 */
const REUSABLE_PROMPT_PICK_ID = 'reusable-prompt';
interface IReusablePromptQuickPickItem extends IQuickPickItem {
	/**
	 * The ID of the quick pick item.
	 */
	id: typeof REUSABLE_PROMPT_PICK_ID;

	/**
	 * Unique kind identifier of the reusable prompt attachment.
	 */
	kind: typeof REUSABLE_PROMPT_PICK_ID;

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
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TextCompareEditorActiveContext)),
			menu: [{
				id: MenuId.SearchContext,
				group: 'z_chat',
				order: 1
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const files = this.getResources(accessor, ...args);

		if (files.length) {
			(await showChatView(accessor.get(IViewsService)))?.focusInput();
			for (const file of files) {
				variablesService.attachContext('file', file, ChatAgentLocation.Panel);
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
		const variablesService = accessor.get(IChatVariablesService);
		const folders = this.getResources(accessor, ...args);

		if (folders.length) {
			(await showChatView(accessor.get(IViewsService)))?.focusInput();
			for (const folder of folders) {
				variablesService.attachContext('folder', folder, ChatAgentLocation.Panel);
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
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TextCompareEditorActiveContext)),
			menu: [{
				id: MenuId.SearchContext,
				group: 'z_chat',
				order: 2
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const editorService = accessor.get(IEditorService);
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
						variablesService.attachContext('file', context, ChatAgentLocation.Panel);
					}
				}
			}
			// Add the root files for all of the ones that didn't have a match
			for (const uri of uris) {
				const [resource, range] = uri;
				if (!range) {
					variablesService.attachContext('file', { uri: resource }, ChatAgentLocation.Panel);
				}
			}
		} else {
			const activeEditor = editorService.activeTextEditorControl;
			const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (editorService.activeTextEditorControl && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
				const selection = activeEditor?.getSelection();
				if (selection) {
					(await showChatView(accessor.get(IViewsService)))?.focusInput();
					const range = selection.isEmpty() ? new Range(selection.startLineNumber, 1, selection.startLineNumber + 1, 1) : selection;
					variablesService.attachContext('file', { uri: activeUri, range }, ChatAgentLocation.Panel);
				}
			}
		}
	}
}

class AttachFileToEditingSessionAction extends AttachResourceAction {

	static readonly ID = 'workbench.action.edits.attachFile';

	constructor() {
		super({
			id: AttachFileToEditingSessionAction.ID,
			title: localize2('workbench.action.edits.attachFile.label', "Add File to {0}", 'Copilot Edits'),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TextCompareEditorActiveContext)),
			menu: [{
				id: MenuId.SearchContext,
				group: 'z_chat',
				order: 2
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const files = this.getResources(accessor, ...args);

		if (files.length) {
			(await showEditsView(accessor.get(IViewsService)))?.focusInput();
			for (const file of files) {
				variablesService.attachContext('file', file, ChatAgentLocation.EditingSession);
			}
		}
	}
}

class AttachFolderToEditingSessionAction extends AttachResourceAction {

	static readonly ID = 'workbench.action.edits.attachFolder';

	constructor() {
		super({
			id: AttachFolderToEditingSessionAction.ID,
			title: localize2('workbench.action.edits.attachFolder.label', "Add Folder to {0}", 'Copilot Edits'),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const folders = this.getResources(accessor, ...args);

		if (folders.length) {
			(await showEditsView(accessor.get(IViewsService)))?.focusInput();
			for (const folder of folders) {
				variablesService.attachContext('folder', folder, ChatAgentLocation.EditingSession);
			}
		}
	}
}

class AttachSelectionToEditingSessionAction extends Action2 {

	static readonly ID = 'workbench.action.edits.attachSelection';

	constructor() {
		super({
			id: AttachSelectionToEditingSessionAction.ID,
			title: localize2('workbench.action.edits.attachSelection.label', "Add Selection to {0}", 'Copilot Edits'),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TextCompareEditorActiveContext))
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const editorService = accessor.get(IEditorService);

		const activeEditor = editorService.activeTextEditorControl;
		const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (editorService.activeTextEditorControl && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			const selection = activeEditor?.getSelection();
			if (selection) {
				(await showEditsView(accessor.get(IViewsService)))?.focusInput();
				const range = selection.isEmpty() ? new Range(selection.startLineNumber, 1, selection.startLineNumber + 1, 1) : selection;
				variablesService.attachContext('file', { uri: activeUri, range }, ChatAgentLocation.EditingSession);
			}
		}
	}
}

export class AttachContextAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachContext';

	// used to enable/disable the keybinding and defined menu containment
	protected static _cdt = ContextKeyExpr.or(
		ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel)),
		ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Editor)),
		ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Notebook)),
		ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Terminal)),
	);

	constructor(desc: Readonly<IAction2Options> = {
		id: AttachContextAction.ID,
		title: localize2('workbench.action.chat.attachContext.label', "Attach Context"),
		icon: Codicon.attach,
		category: CHAT_CATEGORY,
		precondition: ContextKeyExpr.or(AttachContextAction._cdt, ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession))),
		keybinding: {
			when: ContextKeyExpr.and(ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession), ChatContextKeys.inChatInput),
			primary: KeyMod.CtrlCmd | KeyCode.Slash,
			weight: KeybindingWeight.EditorContrib
		},
		menu: [
			{
				when: ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 2
			},
			{
				when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel).negate(), AttachContextAction._cdt),
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 1
			},
		]
	}) {
		super(desc);
	}

	private _getFileContextId(item: { resource: URI } | { uri: URI; range: IRange }) {
		if ('resource' in item) {
			return item.resource.toString();
		}

		return item.uri.toString() + (item.range.startLineNumber !== item.range.endLineNumber ?
			`:${item.range.startLineNumber}-${item.range.endLineNumber}` :
			`:${item.range.startLineNumber}`);
	}

	private async _attachContext(widget: IChatWidget, quickInputService: IQuickInputService, commandService: ICommandService, clipboardService: IClipboardService, editorService: IEditorService, labelService: ILabelService, viewsService: IViewsService, chatEditingService: IChatEditingService | undefined, hostService: IHostService, fileService: IFileService, textModelService: ITextModelService, isInBackground?: boolean, ...picks: IChatContextQuickPickItem[]) {
		const toAttach: IChatRequestVariableEntry[] = [];
		for (const pick of picks) {
			if (isISymbolQuickPickItem(pick) && pick.symbol) {
				// Workspace symbol
				toAttach.push({
					kind: 'symbol',
					id: this._getFileContextId(pick.symbol.location),
					value: pick.symbol.location,
					symbolKind: pick.symbol.kind,
					fullName: pick.label,
					name: pick.symbol.name,
				});
			} else if (isIFolderSearchResultQuickPickItem(pick)) {
				const folder = pick.resource;
				toAttach.push({
					id: pick.id,
					value: folder,
					name: basename(folder),
					isFile: false,
					isDirectory: true,
				});
			} else if (isIDiagnosticsQuickPickItemWithFilter(pick)) {
				toAttach.push({
					id: pick.id,
					name: pick.label,
					value: pick.filter,
					kind: 'diagnostic',
					icon: pick.icon,
					...pick.filter,
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
							isImage: true
						});
					}
				} else {
					let isOmitted = false;
					try {
						const createdModel = await textModelService.createModelReference(pick.resource);
						createdModel.dispose();
					} catch {
						isOmitted = true;
					}

					toAttach.push({
						id: this._getFileContextId({ resource: pick.resource }),
						value: pick.resource,
						name: pick.label,
						isFile: true,
						isOmitted
					});
				}
			} else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
				toAttach.push({
					range: undefined,
					id: this._getFileContextId({ uri: pick.uri, range: pick.range.decoration }),
					value: { uri: pick.uri, range: pick.range.decoration },
					fullName: pick.label,
					name: pick.symbolName!,
				});
			} else if (isIOpenEditorsQuickPickItem(pick)) {
				for (const editor of editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput || e instanceof NotebookEditorInput)) {
					const uri = editor instanceof DiffEditorInput ? editor.modified.resource : editor.resource;
					if (uri) {
						toAttach.push({
							id: this._getFileContextId({ resource: uri }),
							value: uri,
							name: labelService.getUriBasenameLabel(uri),
							isFile: true,
						});
					}
				}
			} else if (isISearchResultsQuickPickItem(pick)) {
				const searchView = viewsService.getViewWithId(SEARCH_VIEW_ID) as SearchView;
				for (const result of searchView.model.searchResult.matches()) {
					toAttach.push({
						id: this._getFileContextId({ resource: result.resource }),
						value: result.resource,
						name: labelService.getUriBasenameLabel(result.resource),
						isFile: true,
					});
				}
			} else if (isRelatedFileQuickPickItem(pick)) {
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
						id: this._getFileContextId({ resource: file.value }),
						value: file.value,
						name: file.label,
						isFile: true,
						isOmitted: false
					});
				}
			} else if (isScreenshotQuickPickItem(pick)) {
				const blob = await hostService.getScreenshot();
				if (blob) {
					toAttach.push(convertBufferToScreenshotVariable(blob));
				}
			} else if (isPromptInstructionsQuickPickItem(pick)) {
				const options: IChatAttachPromptActionOptions = { widget, viewsService };
				await commandService.executeCommand(ATTACH_PROMPT_ACTION_ID, options);
			} else {
				// Anything else is an attachment
				const attachmentPick = pick as IAttachmentQuickPickItem;
				if (attachmentPick.kind === 'command') {
					// Dynamic variable with a followup command
					const selection = await commandService.executeCommand(attachmentPick.command.id, ...(attachmentPick.command.arguments ?? []));
					if (!selection) {
						// User made no selection, skip this variable
						continue;
					}
					toAttach.push({
						...attachmentPick,
						value: attachmentPick.value,
						name: `${typeof attachmentPick.value === 'string' && attachmentPick.value.startsWith('#') ? attachmentPick.value.slice(1) : ''}${selection}`,
						// Apply the original icon with the new name
						fullName: selection
					});
				} else if (attachmentPick.kind === 'tool') {
					toAttach.push({
						id: attachmentPick.id,
						name: attachmentPick.label,
						fullName: attachmentPick.label,
						value: undefined,
						icon: attachmentPick.icon,
						isTool: true
					});
				} else if (attachmentPick.kind === 'image') {
					const fileBuffer = await clipboardService.readImage();
					toAttach.push({
						id: await imageToHash(fileBuffer),
						name: localize('pastedImage', 'Pasted Image'),
						fullName: localize('pastedImage', 'Pasted Image'),
						value: fileBuffer,
						isImage: true
					});
				}
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
		const quickInputService = accessor.get(IQuickInputService);
		const chatAgentService = accessor.get(IChatAgentService);
		const commandService = accessor.get(ICommandService);
		const widgetService = accessor.get(IChatWidgetService);
		const languageModelToolsService = accessor.get(ILanguageModelToolsService);
		const quickChatService = accessor.get(IQuickChatService);
		const clipboardService = accessor.get(IClipboardService);
		const editorService = accessor.get(IEditorService);
		const labelService = accessor.get(ILabelService);
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		const hostService = accessor.get(IHostService);
		const extensionService = accessor.get(IExtensionService);
		const fileService = accessor.get(IFileService);
		const textModelService = accessor.get(ITextModelService);
		const instantiationService = accessor.get(IInstantiationService);
		const keybindingService = accessor.get(IKeybindingService);

		const context: { widget?: IChatWidget; showFilesOnly?: boolean; placeholder?: string } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		const chatEditingService = widget.location === ChatAgentLocation.EditingSession ? accessor.get(IChatEditingService) : undefined;

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

		for (const tool of languageModelToolsService.getTools()) {
			if (tool.canBeReferencedInPrompt) {
				const item: IToolQuickPickItem = {
					kind: 'tool',
					label: tool.displayName ?? '',
					id: tool.id,
					icon: ThemeIcon.isThemeIcon(tool.icon) ? tool.icon : undefined // TODO need to support icon path?
				};
				if (ThemeIcon.isThemeIcon(tool.icon)) {
					item.iconClass = ThemeIcon.asClassName(tool.icon);
				} else if (tool.icon) {
					item.iconPath = tool.icon;
				}

				quickPickItems.push(item);
			}
		}

		quickPickItems.push({
			kind: 'quickaccess',
			label: localize('chatContext.symbol', 'Symbol...'),
			iconClass: ThemeIcon.asClassName(Codicon.symbolField),
			prefix: SymbolsQuickAccessProvider.PREFIX,
			id: 'symbol'
		});

		quickPickItems.push({
			kind: 'folder',
			label: localize('chatContext.folder', 'Folder...'),
			iconClass: ThemeIcon.asClassName(Codicon.folder),
			id: 'folder',
		});

		quickPickItems.push({
			kind: 'diagnostic',
			label: localize('chatContext.diagnstic', 'Problem...'),
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

		if (context?.showFilesOnly) {
			if (chatEditingService?.hasRelatedFilesProviders() && (widget.getInput() || widget.attachmentModel.fileAttachments.length > 0)) {
				quickPickItems.unshift({
					kind: 'related-files',
					id: 'related-files',
					label: localize('chatContext.relatedFiles', 'Related Files'),
					iconClass: ThemeIcon.asClassName(Codicon.sparkle),
				});
			}
			if (editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput).length > 0) {
				quickPickItems.unshift({
					kind: 'open-editors',
					id: 'open-editors',
					label: localize('chatContext.editors', 'Open Editors'),
					iconClass: ThemeIcon.asClassName(Codicon.files),
				});
			}
			if (SearchContext.HasSearchResults.getValue(contextKeyService)) {
				quickPickItems.unshift({
					kind: 'search-results',
					id: 'search-results',
					label: localize('chatContext.searchResults', 'Search Results'),
					iconClass: ThemeIcon.asClassName(Codicon.search),
				});
			}
		}

		// if the `reusable prompts` feature is enabled, add
		// the appropriate attachment type to the list
		if (widget.attachmentModel.promptInstructions.featureEnabled) {
			const keybinding = keybindingService.lookupKeybinding(USE_PROMPT_COMMAND_ID, contextKeyService);

			quickPickItems.push({
				id: REUSABLE_PROMPT_PICK_ID,
				kind: REUSABLE_PROMPT_PICK_ID,
				label: localize('chatContext.attach.prompt.label', 'Prompt...'),
				iconClass: ThemeIcon.asClassName(Codicon.bookmark),
				keybinding,
			});
		}

		function extractTextFromIconLabel(label: string | undefined): string {
			if (!label) {
				return '';
			}
			const match = label.match(/\$\([^\)]+\)\s*(.+)/);
			return match ? match[1] : label;
		}

		this._show(quickInputService, commandService, widget, quickChatService, quickPickItems.sort(function (a, b) {

			if (a.kind === 'open-editors') { return -1; }
			if (b.kind === 'open-editors') { return 1; }

			const first = extractTextFromIconLabel(a.label).toUpperCase();
			const second = extractTextFromIconLabel(b.label).toUpperCase();

			return compare(first, second);
		}), clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, fileService, textModelService, instantiationService, '', context?.placeholder);
	}

	private async _showDiagnosticsPick(instantiationService: IInstantiationService, onBackgroundAccept: (item: IChatContextQuickPickItem[]) => void): Promise<IDiagnosticsQuickPickItemWithFilter | undefined> {
		const convert = (item: IDiagnosticVariableEntryFilterData): IDiagnosticsQuickPickItemWithFilter => ({
			kind: 'diagnostic-filter',
			id: IDiagnosticVariableEntryFilterData.id(item),
			label: IDiagnosticVariableEntryFilterData.label(item),
			icon: IDiagnosticVariableEntryFilterData.icon,
			filter: item,
		});

		const filter = await instantiationService.invokeFunction(accessor =>
			createMarkersQuickPick(accessor, 'problem', items => onBackgroundAccept(items.map(convert))));
		return filter && convert(filter);
	}

	private _show(quickInputService: IQuickInputService, commandService: ICommandService, widget: IChatWidget, quickChatService: IQuickChatService, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] | undefined, clipboardService: IClipboardService, editorService: IEditorService, labelService: ILabelService, viewsService: IViewsService, chatEditingService: IChatEditingService | undefined, hostService: IHostService, fileService: IFileService, textModelService: ITextModelService, instantiationService: IInstantiationService, query: string = '', placeholder?: string) {
		const attach = (isBackgroundAccept: boolean, ...items: IChatContextQuickPickItem[]) => {
			this._attachContext(widget, quickInputService, commandService, clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, fileService, textModelService, isBackgroundAccept, ...items);
		};

		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			handleAccept: async (inputItem: IChatContextQuickPickItem, isBackgroundAccept: boolean) => {
				let item: IChatContextQuickPickItem | undefined = inputItem;
				if ('kind' in item && item.kind === 'folder') {
					item = await this._showFolders(instantiationService);
				} else if ('kind' in item && item.kind === 'diagnostic') {
					item = await this._showDiagnosticsPick(instantiationService, i => attach(true, ...i));
				}

				if (!item) {
					this._show(quickInputService, commandService, widget, quickChatService, quickPickItems, clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, fileService, textModelService, instantiationService, '', placeholder);
					return;
				}

				if ('prefix' in item) {
					this._show(quickInputService, commandService, widget, quickChatService, quickPickItems, clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, fileService, textModelService, instantiationService, item.prefix, placeholder);
				} else {
					if (!clipboardService) {
						return;
					}
					attach(isBackgroundAccept, item);
					if (isQuickChat(widget)) {
						quickChatService.open();
					}
				}
			},
			additionPicks: quickPickItems,
			filter: (item: IChatContextQuickPickItem | IQuickPickSeparator) => {
				// Avoid attaching the same context twice
				const attachedContext = widget.attachmentModel.getAttachmentIDs();

				if (isIOpenEditorsQuickPickItem(item)) {
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
		const folder = await instantiationService.invokeFunction(accessor => createFolderQuickPick(accessor));
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

registerAction2(class AttachFilesAction extends AttachContextAction {
	constructor() {
		super({
			id: 'workbench.action.chat.editing.attachContext',
			title: localize2('workbench.action.chat.editing.attachContext.label', "Add Context to Copilot Edits"),
			shortTitle: localize2('workbench.action.chat.editing.attachContext.shortLabel', "Add Context..."),
			f1: false,
			category: CHAT_CATEGORY,
			menu: { id: MenuId.ChatInputAttachmentToolbar, group: 'navigation' },
			icon: Codicon.attach,
			precondition: ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession),
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession)),
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const context = args[0];
		const attachFilesContext = { ...context, showFilesOnly: true };
		return super.run(accessor, attachFilesContext);
	}
});

registerAction2(AttachPromptAction);
