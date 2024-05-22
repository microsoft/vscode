/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Command } from 'vs/editor/common/languages';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatContextAttachments } from 'vs/workbench/contrib/chat/browser/contrib/chatContextAttachments';
import { SelectAndInsertFileAction } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_LOCATION, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatRequestAgentPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { AnythingQuickAccessProvider } from 'vs/workbench/contrib/search/browser/anythingQuickAccess';

export function registerChatContextActions() {
	registerAction2(AttachContextAction);
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
					when: CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel),
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
				},
				{
					when: CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel),
					id: MenuId.ChatExecute,
					group: 'navigation',
				},
			]
		});
	}

	private async _attachContext(widget: IChatWidget, commandService: ICommandService, ...picks: any[]) {
		const toAttach = [];
		for (const pick of picks) {
			if (pick && typeof pick === 'object' && 'command' in pick) {
				const selection = await commandService.executeCommand(pick.command.id, ...(pick.command.arguments ?? []));
				if (selection) {
					const qualifiedName = `${typeof pick.value === 'string' && pick.value.startsWith('#') ? pick.value.slice(1) : ''}${selection}`;

					toAttach.push({ ...pick, isDynamic: pick.isDynamic, value: pick.value, name: qualifiedName, fullName: `$(${pick.icon.id}) ${selection}` });
				}
			} else if (pick && typeof pick === 'object' && 'resource' in pick) {
				toAttach.push({ ...pick, value: pick.resource, name: pick.label, id: pick.resource.toString(), isDynamic: true });
			} else {
				toAttach.push({ ...pick, fullName: pick.label, name: 'name' in pick && typeof pick.name === 'string' ? pick.name : pick.label, icon: 'icon' in pick && ThemeIcon.isThemeIcon(pick.icon) ? pick.icon : undefined });
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
		const quickPickItems: (QuickPickItem & { isDynamic?: boolean; name?: string; icon?: ThemeIcon; command?: Command; value?: unknown })[] = [];
		for (const variable of chatVariablesService.getVariables()) {
			if (variable.fullName && (!variable.isSlow || slowSupported)) {
				quickPickItems.push({ label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`, name: variable.name, id: variable.id, icon: variable.icon });
			}
		}

		if (widget.viewModel?.sessionId) {
			const agentPart = widget.parsedInput.parts.find((part): part is ChatRequestAgentPart => part instanceof ChatRequestAgentPart);
			if (agentPart) {
				const completions = await chatAgentService.getAgentCompletionItems(agentPart.agent.id, '', CancellationToken.None);
				for (const variable of completions) {
					if (variable.fullName) {
						quickPickItems.push({ label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`, id: variable.id, command: variable.command, icon: variable.icon, value: variable.value, isDynamic: true });
					}
				}
			}

		}

		if (chatVariablesService.hasVariable(SelectAndInsertFileAction.Name)) {
			quickPickItems.push(SelectAndInsertFileAction.Item, { type: 'separator' });
		}

		quickInputService.quickAccess.show('', {
			enabledProviderPrefixes: [AnythingQuickAccessProvider.PREFIX],
			placeholder: localize('chatContext.attach.placeholder', 'Search attachments'),
			providerOptions: <AnythingQuickAccessProviderRunOptions>{
				handleAccept: (item: IQuickPickItem) => {
					this._attachContext(widget, commandService, item);
				},
				additionPicks: quickPickItems,
				includeSymbols: false,
				filter: (item) => {
					if (item && typeof item === 'object' && 'resource' in item && URI.isUri(item.resource)) {
						return [Schemas.file, Schemas.vscodeRemote].includes(item.resource.scheme);
					}
					return true;
				}
			}
		});

	}
}
