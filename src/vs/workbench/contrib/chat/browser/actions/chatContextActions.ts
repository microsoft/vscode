/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickInputService, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { SelectAndInsertFileAction } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_LOCATION, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
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

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const chatVariablesService = accessor.get(IChatVariablesService);
		const widgetService = accessor.get(IChatWidgetService);

		const quickPickItems: (QuickPickItem & { name?: string; icon?: ThemeIcon })[] = [];
		for (const variable of chatVariablesService.getVariables()) {
			if (variable.fullName) {
				quickPickItems.push({ label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`, name: variable.name, id: variable.id, icon: variable.icon });
			}
		}

		if (chatVariablesService.hasVariable(SelectAndInsertFileAction.Name)) {
			quickPickItems.push(SelectAndInsertFileAction.Item, { type: 'separator' });
		}

		const picks = await quickInputService.quickAccess.pick('', {
			enabledProviderPrefixes: [AnythingQuickAccessProvider.PREFIX],
			placeholder: localize('chatContext.attach.placeholder', 'Search attachments'),
			providerOptions: <AnythingQuickAccessProviderRunOptions>{
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

		if (picks?.length) {
			const context: { widget?: IChatWidget } | undefined = args[0];

			const widget = context?.widget ?? widgetService.lastFocusedWidget;
			widget?.attachContext(...picks.map((p) => ({
				fullName: p.label,
				icon: 'icon' in p && ThemeIcon.isThemeIcon(p.icon) ? p.icon : undefined,
				name: 'name' in p && typeof p.name === 'string' ? p.name : p.label,
				value: 'resource' in p && URI.isUri(p.resource) ? p.resource : undefined,
				id: 'id' in p && typeof p.id === 'string' ? p.id :
					'resource' in p && URI.isUri(p.resource) ? `${SelectAndInsertFileAction.Name}:${p.resource.toString()}` : ''
			})));
		}
	}
}
