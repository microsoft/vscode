/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../../base/common/network.js';
import { compare } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { Command } from '../../../../../editor/common/languages.js';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidget, IChatWidgetService, IQuickChatService } from '../chat.js';
import { isQuickChat } from '../chatWidget.js';
import { ChatContextAttachments } from '../contrib/chatContextAttachments.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { CONTEXT_CHAT_LOCATION, CONTEXT_IN_CHAT_INPUT } from '../../common/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';
import { ChatRequestAgentPart } from '../../common/chatParserTypes.js';
import { IChatVariablesService } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { AnythingQuickAccessProvider } from '../../../search/browser/anythingQuickAccess.js';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { isImage } from '../chatImagePaste.js';
import { hash } from '../../../../../base/common/hash.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileAction);
	registerAction2(AttachSelectionAction);
}

export type IChatContextQuickPickItem = IFileQuickPickItem | IDynamicVariableQuickPickItem | IStaticVariableQuickPickItem | IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickAccessQuickPickItem | IToolQuickPickItem | IImageQuickPickItem;

export interface IFileQuickPickItem extends IQuickPickItem {
	kind: 'file';
	id: string;
	name: string;
	value: URI;
	isDynamic: true;
	resource: URI;
}

export interface IImageQuickPickItem extends IQuickPickItem {
	kind: 'image';
	id: string;
	name: string;
	value: Uint8Array;
	isDynamic: true;
	resource: URI;
}

export interface IDynamicVariableQuickPickItem extends IQuickPickItem {
	kind: 'dynamic';
	id: string;
	name?: string;
	value: unknown;
	isDynamic: true;

	icon?: ThemeIcon;
	command?: Command;
}

export interface IToolQuickPickItem extends IQuickPickItem {
	kind: 'tool';
	id: string;
	name?: string;
	icon?: ThemeIcon;
}

export interface IStaticVariableQuickPickItem extends IQuickPickItem {
	kind: 'static';
	id: string;
	name: string;
	value: unknown;
	isDynamic?: false;

	icon?: ThemeIcon;
}

export interface IQuickAccessQuickPickItem extends IQuickPickItem {
	kind: 'quickaccess';
	id: string;
	name: string;
	value: string;

	prefix: string;
}

class AttachFileAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachFile';

	constructor() {
		super({
			id: AttachFileAction.ID,
			title: localize2('workbench.action.chat.attachFile.label', "Add File to Chat"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ActiveEditorContext.isEqualTo('workbench.editors.files.textFileEditor'),
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'attach',
				order: 1,
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IChatVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
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
			precondition: ActiveEditorContext.isEqualTo('workbench.editors.files.textFileEditor'),
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'attach',
				order: 2,
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
				variablesService.attachContext('file', { uri: activeUri, range: selection }, ChatAgentLocation.Panel);
			}
		}
	}
}

class AttachContextAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachContext';

	// used to enable/disable the keybinding and defined menu containment
	private static _cdt = ContextKeyExpr.or(
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Editor), ContextKeyExpr.equals('config.chat.experimental.variables.editor', true)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Notebook), ContextKeyExpr.equals('config.chat.experimental.variables.notebook', true)),
		ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Terminal), ContextKeyExpr.equals('config.chat.experimental.variables.terminal', true)),
	);

	constructor() {
		super({
			id: AttachContextAction.ID,
			title: localize2('workbench.action.chat.attachContext.label', "Attach Context"),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			precondition: AttachContextAction._cdt,
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					when: AttachContextAction._cdt,
					id: MenuId.ChatInput,
					group: 'navigation',
					order: 2
				},
			]
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

	private async _attachContext(widget: IChatWidget, commandService: ICommandService, clipboardService: IClipboardService, ...picks: IChatContextQuickPickItem[]) {
		const toAttach: IChatRequestVariableEntry[] = [];
		for (const pick of picks) {
			if (pick && typeof pick === 'object' && 'command' in pick && pick.command) {
				// Dynamic variable with a followup command
				const selection = await commandService.executeCommand(pick.command.id, ...(pick.command.arguments ?? []));
				if (!selection) {
					// User made no selection, skip this variable
					continue;
				}
				toAttach.push({
					...pick,
					isDynamic: pick.isDynamic,
					value: pick.value,
					name: `${typeof pick.value === 'string' && pick.value.startsWith('#') ? pick.value.slice(1) : ''}${selection}`,
					// Apply the original icon with the new name
					fullName: selection
				});
			} else if ('symbol' in pick && pick.symbol) {
				// Symbol
				toAttach.push({
					...pick,
					id: this._getFileContextId(pick.symbol.location),
					value: pick.symbol.location,
					fullName: pick.label,
					name: pick.symbol.name,
					isDynamic: true
				});
			} else if (pick && typeof pick === 'object' && 'resource' in pick && pick.resource) {
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
					// #file variable
					toAttach.push({
						...pick,
						id: this._getFileContextId({ resource: pick.resource }),
						value: pick.resource,
						name: pick.label,
						isFile: true,
						isDynamic: true
					});
				}
			} else if ('symbolName' in pick && pick.uri && pick.range) {
				// Symbol
				toAttach.push({
					...pick,
					range: undefined,
					id: this._getFileContextId({ uri: pick.uri, range: pick.range.decoration }),
					value: { uri: pick.uri, range: pick.range.decoration },
					fullName: pick.label,
					name: pick.symbolName!,
					isDynamic: true
				});
			} else if ('kind' in pick && pick.kind === 'tool') {
				toAttach.push({
					id: pick.id,
					name: pick.label,
					fullName: pick.label,
					value: undefined,
					icon: pick.icon,
					isTool: true
				});
			} else if ('kind' in pick && pick.kind === 'image') {
				const fileBuffer = await clipboardService.readImage();
				toAttach.push({
					id: hash(fileBuffer).toString(),
					name: localize('pastedImage', 'Pasted Image'),
					fullName: localize('pastedImage', 'Pasted Image'),
					value: fileBuffer,
					isDynamic: true,
					isImage: true
				});
			} else {
				// All other dynamic variables and static variables
				toAttach.push({
					...pick,
					range: undefined,
					id: pick.id ?? '',
					value: 'value' in pick ? pick.value : undefined,
					fullName: pick.label,
					name: 'name' in pick && typeof pick.name === 'string' ? pick.name : pick.label,
					icon: 'icon' in pick && ThemeIcon.isThemeIcon(pick.icon) ? pick.icon : undefined
				});
			}
		}

		widget.getContrib<ChatContextAttachments>(ChatContextAttachments.ID)?.setContext(false, ...toAttach);
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
		const configurationService = accessor.get(IConfigurationService);
		const context: { widget?: IChatWidget } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const imageData = await clipboardService.readImage();

		const usedAgent = widget.parsedInput.parts.find(p => p instanceof ChatRequestAgentPart);
		const slowSupported = usedAgent ? usedAgent.agent.metadata.supportsSlowVariables : true;
		const quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] = [];
		for (const variable of chatVariablesService.getVariables(widget.location)) {
			if (variable.fullName && (!variable.isSlow || slowSupported)) {
				quickPickItems.push({
					label: variable.fullName,
					name: variable.name,
					id: variable.id,
					iconClass: variable.icon ? ThemeIcon.asClassName(variable.icon) : undefined,
					icon: variable.icon
				});
			}
		}

		if (isImage(imageData) && configurationService.getValue<boolean>('chat.experimental.imageAttachments')) {
			quickPickItems.push({
				id: hash(imageData).toString(),
				kind: 'image',
				label: localize('imageFromClipboard', 'Image from Clipboard'),
				iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
			});
		}

		if (widget.viewModel?.sessionId) {
			const agentPart = widget.parsedInput.parts.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
			if (agentPart) {
				const completions = await chatAgentService.getAgentCompletionItems(agentPart.agent.id, '', CancellationToken.None);
				for (const variable of completions) {
					if (variable.fullName) {
						quickPickItems.push({
							label: variable.fullName,
							id: variable.id,
							command: variable.command,
							icon: variable.icon,
							iconClass: variable.icon ? ThemeIcon.asClassName(variable.icon) : undefined,
							value: variable.value,
							isDynamic: true,
							name: variable.name
						});
					}
				}
			}
		}

		if (!usedAgent || usedAgent.agent.supportsToolReferences) {
			for (const tool of languageModelToolsService.getTools()) {
				if (tool.canBeInvokedManually) {
					const item: IToolQuickPickItem = {
						kind: 'tool',
						label: tool.displayName ?? tool.name ?? '',
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
		}

		quickPickItems.push({
			label: localize('chatContext.symbol', 'Symbol...'),
			icon: ThemeIcon.fromId(Codicon.symbolField.id),
			iconClass: ThemeIcon.asClassName(Codicon.symbolField),
			prefix: SymbolsQuickAccessProvider.PREFIX
		});

		if (widget.location === ChatAgentLocation.Notebook) {
			quickPickItems.push({
				kind: 'dynamic',
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
		}), '', clipboardService);
	}

	private _show(quickInputService: IQuickInputService, commandService: ICommandService, widget: IChatWidget, quickChatService: IQuickChatService, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[], query: string = '', clipboardService?: IClipboardService) {

		quickInputService.quickAccess.show(query, {
			enabledProviderPrefixes: [
				AnythingQuickAccessProvider.PREFIX,
				SymbolsQuickAccessProvider.PREFIX,
				AbstractGotoSymbolQuickAccessProvider.PREFIX
			],
			placeholder: localize('chatContext.attach.placeholder', 'Search attachments'),
			providerOptions: <AnythingQuickAccessProviderRunOptions>{
				handleAccept: (item: IChatContextQuickPickItem) => {
					if ('prefix' in item) {
						this._show(quickInputService, commandService, widget, quickChatService, quickPickItems, item.prefix);
					} else {
						if (!clipboardService) {
							return;
						}
						this._attachContext(widget, commandService, clipboardService, item);
						if (isQuickChat(widget)) {
							quickChatService.open();
						}
					}
				},
				additionPicks: quickPickItems,
				filter: (item: IChatContextQuickPickItem) => {
					// Avoid attaching the same context twice
					const attachedContext = widget.getContrib<ChatContextAttachments>(ChatContextAttachments.ID)?.getContext() ?? new Set();

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
			}
		});

	}
}
