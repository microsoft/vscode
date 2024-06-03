/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { IRange } from 'vs/editor/common/core/range';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Command } from 'vs/editor/common/languages';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from 'vs/editor/contrib/quickAccess/browser/gotoSymbolQuickAccess';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatContextAttachments } from 'vs/workbench/contrib/chat/browser/contrib/chatContextAttachments';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_LOCATION, CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_QUICK_CHAT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatRequestVariableEntry } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestAgentPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { AnythingQuickAccessProvider } from 'vs/workbench/contrib/search/browser/anythingQuickAccess';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
}

export type IChatContextQuickPickItem = IFileQuickPickItem | IDynamicVariableQuickPickItem | IStaticVariableQuickPickItem | IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickAccessQuickPickItem;

export interface IFileQuickPickItem extends IQuickPickItem {
	kind: 'file';
	id: string;
	name: string;
	value: URI;
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

class AttachContextAction extends Action2 {

	static readonly ID = 'workbench.action.chat.attachContext';

	constructor() {
		super({
			id: AttachContextAction.ID,
			title: localize2('workbench.action.chat.attachContext.label', "Attach Context"),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel), CONTEXT_IN_QUICK_CHAT.isEqualTo(false)),
					id: MenuId.ChatExecute,
					group: 'navigation',
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

	private async _attachContext(widget: IChatWidget, commandService: ICommandService, ...picks: IChatContextQuickPickItem[]) {
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
					fullName: `${pick.icon ? `$(${pick.icon.id}) ` : ''}${selection}`
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
				// #file variable
				toAttach.push({
					...pick,
					id: this._getFileContextId({ resource: pick.resource }),
					value: pick.resource,
					name: pick.label,
					isFile: true,
					isDynamic: true
				});
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
		const context: { widget?: IChatWidget } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const usedAgent = widget.parsedInput.parts.find(p => p instanceof ChatRequestAgentPart);
		const slowSupported = usedAgent ? usedAgent.agent.metadata.supportsSlowVariables : true;
		const quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] = [];
		for (const variable of chatVariablesService.getVariables()) {
			if (variable.fullName && (!variable.isSlow || slowSupported)) {
				quickPickItems.push({
					label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`,
					name: variable.name,
					id: variable.id,
					icon: variable.icon
				});
			}
		}

		if (widget.viewModel?.sessionId) {
			const agentPart = widget.parsedInput.parts.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
			if (agentPart) {
				const completions = await chatAgentService.getAgentCompletionItems(agentPart.agent.id, '', CancellationToken.None);
				for (const variable of completions) {
					if (variable.fullName) {
						quickPickItems.push({
							label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`,
							id: variable.id,
							command: variable.command,
							icon: variable.icon,
							value: variable.value,
							isDynamic: true,
							name: variable.name
						});
					}
				}
			}

		}

		quickPickItems.push({
			label: localize('chatContext.symbol', '{0} Symbol...', `$(${Codicon.symbolField.id})`),
			icon: ThemeIcon.fromId(Codicon.symbolField.id),
			prefix: SymbolsQuickAccessProvider.PREFIX
		});

		this._show(quickInputService, commandService, widget, quickPickItems);
	}

	private _show(quickInputService: IQuickInputService, commandService: ICommandService, widget: IChatWidget, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[], query: string = '') {
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
						this._show(quickInputService, commandService, widget, quickPickItems, item.prefix);
					} else {
						this._attachContext(widget, commandService, item);
					}
				},
				additionPicks: quickPickItems,
				filter: (item: IChatContextQuickPickItem) => {
					// Avoid attaching the same context twice
					const attachedContext = widget.getContrib<ChatContextAttachments>(ChatContextAttachments.ID)?.getContext() ?? new Set();

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
