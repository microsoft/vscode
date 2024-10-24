/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isElectron } from '../../../../../base/common/platform.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { Command } from '../../../../../editor/common/languages.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPickItem, IQuickPickItemWithResource, IQuickPickSeparator, QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { VIEW_ID as SEARCH_VIEW_ID } from '../../../../services/search/common/search.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { FileEditorInput } from '../../../files/browser/editors/fileEditorInput.js';
import { AnythingQuickAccessProvider } from '../../../search/browser/anythingQuickAccess.js';
import { SearchView } from '../../../search/browser/searchView.js';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { SearchContext } from '../../../search/common/constants.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_LOCATION, CONTEXT_IN_CHAT_INPUT } from '../../common/chatContextKeys.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';
import { ChatRequestAgentPart } from '../../common/chatParserTypes.js';
import { IChatVariableData, IChatVariablesService } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService, IQuickChatService, showChatView } from '../chat.js';
import { imageToHash, isImage } from '../chatPasteProviders.js';
import { isQuickChat } from '../chatWidget.js';
import { convertBufferToScreenshotVariable, ScreenshotVariableId } from '../contrib/screenshot.js';
import { CHAT_CATEGORY } from './chatActions.js';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileAction);
	registerAction2(AttachSelectionAction);
}

/**
 * We fill the quickpick with these types, and enable some quick access providers
 */
type IAttachmentQuickPickItem = ICommandVariableQuickPickItem | IQuickAccessQuickPickItem | IToolQuickPickItem | IImageQuickPickItem | IVariableQuickPickItem | IOpenEditorsQuickPickItem | ISearchResultsQuickPickItem | IScreenShotQuickPickItem;

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
	isDynamic: true;

	icon?: ThemeIcon;
}

interface IToolQuickPickItem extends IQuickPickItem {
	kind: 'tool';
	id: string;
	name?: string;
	icon?: ThemeIcon;
}

interface IVariableQuickPickItem extends IQuickPickItem {
	kind: 'variable';
	variable: IChatVariableData;
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

class AttachFileAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachFile';

	constructor() {
		super({
			id: AttachFileAction.ID,
			title: localize2('workbench.action.chat.attachFile.label', "Add File to Chat"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_ENABLED, ActiveEditorContext.isEqualTo('workbench.editors.files.textFileEditor')),
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_chat',
				order: 10,
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			(await showChatView(accessor.get(IViewsService)))?.focusInput();
			variablesService.attachContext('file', activeUri, ChatAgentLocation.Panel);
		}
	}
}

class AttachSelectionAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachSelection';

	constructor() {
		super({
			id: AttachSelectionAction.ID,
			title: localize2('workbench.action.chat.attachSelection.label', "Add Selection to Chat"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_ENABLED, ActiveEditorContext.isEqualTo('workbench.editors.files.textFileEditor')),
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_chat',
				order: 11,
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeEditor = textEditorService.activeTextEditorControl;
		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			const selection = activeEditor?.getSelection();
			if (selection) {
				(await showChatView(accessor.get(IViewsService)))?.focusInput();
				variablesService.attachContext('file', { uri: activeUri, range: selection }, ChatAgentLocation.Panel);
			}
		}
	}
}

export class AttachContextAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachContext';

	// used to enable/disable the keybinding and defined menu containment
	protected static _cdt = ContextKeyExpr.or(
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Editor)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Notebook)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Terminal)),
	);

	constructor(desc: Readonly<IAction2Options> = {
		id: AttachContextAction.ID,
		title: localize2('workbench.action.chat.attachContext.label', "Attach Context"),
		icon: Codicon.attach,
		category: CHAT_CATEGORY,
		precondition: ContextKeyExpr.or(AttachContextAction._cdt, ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession))),
		keybinding: {
			when: CONTEXT_IN_CHAT_INPUT,
			primary: KeyMod.CtrlCmd | KeyCode.Slash,
			weight: KeybindingWeight.EditorContrib
		},
		menu: [
			{
				when: ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession)), ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel), CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession)), AttachContextAction._cdt)),
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 2
			},
			{
				when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel).negate(), AttachContextAction._cdt),
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

	private async _attachContext(widget: IChatWidget, commandService: ICommandService, clipboardService: IClipboardService, editorService: IEditorService, labelService: ILabelService, viewsService: IViewsService, chatEditingService: IChatEditingService | undefined, hostService: IHostService, isInBackground?: boolean, ...picks: IChatContextQuickPickItem[]) {
		const toAttach: IChatRequestVariableEntry[] = [];
		for (const pick of picks) {
			if (isISymbolQuickPickItem(pick) && pick.symbol) {
				// Workspace symbol
				toAttach.push({
					id: this._getFileContextId(pick.symbol.location),
					value: pick.symbol.location,
					fullName: pick.label,
					name: pick.symbol.name,
					isDynamic: true
				});
			} else if (isIQuickPickItemWithResource(pick) && pick.resource) {
				if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(pick.resource.path)) {
					// checks if the file is an image
					toAttach.push({
						id: pick.resource.toString(),
						name: pick.label,
						fullName: pick.label,
						value: pick.resource,
						isDynamic: true,
						isImage: true
					});
				} else {
					// file attachment
					if (chatEditingService) {
						chatEditingService.currentEditingSessionObs.get()?.addFileToWorkingSet(pick.resource);
					} else {
						toAttach.push({
							id: this._getFileContextId({ resource: pick.resource }),
							value: pick.resource,
							name: pick.label,
							isFile: true,
							isDynamic: true,
						});
					}
				}
			} else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
				toAttach.push({
					range: undefined,
					id: this._getFileContextId({ uri: pick.uri, range: pick.range.decoration }),
					value: { uri: pick.uri, range: pick.range.decoration },
					fullName: pick.label,
					name: pick.symbolName!,
					isDynamic: true
				});
			} else if (isIOpenEditorsQuickPickItem(pick)) {
				for (const editor of editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput)) {
					const uri = editor instanceof DiffEditorInput ? editor.modified.resource : editor.resource;
					if (uri) {
						if (chatEditingService) {
							chatEditingService.currentEditingSessionObs.get()?.addFileToWorkingSet(uri);
						} else {
							toAttach.push({
								id: this._getFileContextId({ resource: uri }),
								value: uri,
								name: labelService.getUriBasenameLabel(uri),
								isFile: true,
								isDynamic: true
							});
						}
					}
				}
			} else if (isISearchResultsQuickPickItem(pick)) {
				const searchView = viewsService.getViewWithId(SEARCH_VIEW_ID) as SearchView;
				for (const result of searchView.model.searchResult.matches()) {
					if (chatEditingService) {
						chatEditingService.currentEditingSessionObs.get()?.addFileToWorkingSet(result.resource);
					} else {
						toAttach.push({
							id: this._getFileContextId({ resource: result.resource }),
							value: result.resource,
							name: labelService.getUriBasenameLabel(result.resource),
							isFile: true,
							isDynamic: true
						});
					}
				}
			} else if (isScreenshotQuickPickItem(pick)) {
				const blob = await hostService.getScreenshot();
				if (blob) {
					toAttach.push(convertBufferToScreenshotVariable(blob));
				}
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
						isDynamic: attachmentPick.isDynamic,
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
						isDynamic: true,
						isImage: true
					});
				} else if (attachmentPick.kind === 'variable') {
					// All other dynamic variables and static variables
					toAttach.push({
						range: undefined,
						id: pick.id ?? '',
						value: undefined,
						fullName: pick.label,
						name: attachmentPick.variable.name,
						icon: attachmentPick.variable.icon
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
		const chatVariablesService = accessor.get(IChatVariablesService);
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

		const context: { widget?: IChatWidget; showFilesOnly?: boolean; placeholder?: string } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		const chatEditingService = widget.location === ChatAgentLocation.EditingSession ? accessor.get(IChatEditingService) : undefined;

		const usedAgent = widget.parsedInput.parts.find(p => p instanceof ChatRequestAgentPart);
		const slowSupported = usedAgent ? usedAgent.agent.metadata.supportsSlowVariables : true;
		const quickPickItems: IAttachmentQuickPickItem[] = [];
		if (!context || !context.showFilesOnly) {
			for (const variable of chatVariablesService.getVariables(widget.location)) {
				if (variable.fullName && (!variable.isSlow || slowSupported)) {
					quickPickItems.push({
						kind: 'variable',
						variable,
						label: variable.fullName,
						id: variable.id,
						iconClass: variable.icon ? ThemeIcon.asClassName(variable.icon) : undefined,
					});
				}
			}

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
								isDynamic: true,
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

			if (widget.location === ChatAgentLocation.Notebook) {
				quickPickItems.push({
					kind: 'command',
					id: 'chatContext.notebook.kernelVariable',
					isDynamic: true,
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
		} else if (context.showFilesOnly) {
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
		}

		function extractTextFromIconLabel(label: string | undefined): string {
			if (!label) {
				return '';
			}
			const match = label.match(/\$\([^\)]+\)\s*(.+)/);
			return match ? match[1] : label;
		}

		this._show(quickInputService, commandService, widget, quickChatService, quickPickItems.sort(function (a, b) {

			const first = extractTextFromIconLabel(a.label).toUpperCase();
			const second = extractTextFromIconLabel(b.label).toUpperCase();

			return compare(first, second);
		}), clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, '', context?.placeholder);
	}

	private _show(quickInputService: IQuickInputService, commandService: ICommandService, widget: IChatWidget, quickChatService: IQuickChatService, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] | undefined, clipboardService: IClipboardService, editorService: IEditorService, labelService: ILabelService, viewsService: IViewsService, chatEditingService: IChatEditingService | undefined, hostService: IHostService, query: string = '', placeholder?: string) {
		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			handleAccept: (item: IChatContextQuickPickItem, isBackgroundAccept: boolean) => {
				if ('prefix' in item) {
					this._show(quickInputService, commandService, widget, quickChatService, quickPickItems, clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, item.prefix, placeholder);
				} else {
					if (!clipboardService) {
						return;
					}
					this._attachContext(widget, commandService, clipboardService, editorService, labelService, viewsService, chatEditingService, hostService, isBackgroundAccept, item);
					if (isQuickChat(widget)) {
						quickChatService.open();
					}
				}
			},
			additionPicks: quickPickItems,
			filter: (item: IChatContextQuickPickItem | IQuickPickSeparator) => {
				// Avoid attaching the same context twice
				const attachedContext = widget.attachmentModel.getAttachmentIDs();
				if (chatEditingService) {
					for (const file of chatEditingService.currentEditingSessionObs.get()?.workingSet.keys() ?? []) {
						attachedContext.add(this._getFileContextId({ resource: file }));
					}
				}

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
					return [Schemas.file, Schemas.vscodeRemote].includes(item.resource.scheme)
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
}

registerAction2(class AttachFilesAction extends AttachContextAction {
	constructor() {
		super({
			id: 'workbench.action.chat.editing.attachFiles',
			title: localize2('workbench.action.chat.editing.attachFiles.label', "Add Files to Working Set"),
			f1: false,
			category: CHAT_CATEGORY,
			precondition: CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession)
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const context = args[0];
		const attachFilesContext = { ...context, showFilesOnly: true, placeholder: localize('chatAttachFiles', 'Search for files to add to your working set') };
		return super.run(accessor, attachFilesContext);
	}
});
