/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ChatViewId } from '../chat.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

abstract class ConfigAgentActionImpl extends Action2 {
	public override async run(accessor: ServicesAccessor): Promise<void> {
		const instaService = accessor.get(IInstantiationService);
		const openerService = accessor.get(IOpenerService);
		const pickers = instaService.createInstance(PromptFilePickers);
		const placeholder = localize('configure.agent.prompts.placeholder', "Select the custom agents to open and configure visibility in the agent picker");

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.agent, optionEdit: false, optionVisibility: true });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}
	}
}

// Separate action `Configure Custom Agents` link in the agent picker.

const PICKER_CONFIGURE_AGENTS_ACTION_ID = 'workbench.action.chat.picker.customagents';

function createPickerConfigureAgentsActionConfig(disabled: boolean) {
	const config = {
		id: disabled ? PICKER_CONFIGURE_AGENTS_ACTION_ID + '.disabled' : PICKER_CONFIGURE_AGENTS_ACTION_ID,
		title: localize2('select-agent', "Configure Custom Agents..."),
		tooltip: disabled ? localize('managedByOrganization', "Managed by your organization") : undefined,
		icon: disabled ? Codicon.lock : undefined,
		category: CHAT_CATEGORY,
		f1: false,
		precondition: disabled ? ContextKeyExpr.false() : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate(),
		menu: {
			id: MenuId.ChatModePicker,
			when: disabled ? ChatContextKeys.Modes.agentModeDisabledByPolicy : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate(),
		},
	};
	return config;
}

class PickerConfigAgentAction extends ConfigAgentActionImpl { constructor() { super(createPickerConfigureAgentsActionConfig(false)); } }
class PickerConfigAgentActionDisabled extends ConfigAgentActionImpl { constructor() { super(createPickerConfigureAgentsActionConfig(true)); } }

/**
 * Action ID for the `Configure Custom Agents` action.
 */
const CONFIGURE_AGENTS_ACTION_ID = 'workbench.action.chat.configure.customagents';

function createManageAgentsActionConfig(disabled: boolean) {
	const base = {
		id: disabled ? CONFIGURE_AGENTS_ACTION_ID + '.disabled' : CONFIGURE_AGENTS_ACTION_ID,
		title: localize2('configure-agents', "Configure Custom Agents..."),
		shortTitle: localize('configure-agents.short', "Custom Agents"),
		icon: disabled ? Codicon.lock : Codicon.bookmark,
		f1: !disabled,
		precondition: disabled ? ContextKeyExpr.false() : ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.Modes.agentModeDisabledByPolicy.negate()),
		category: CHAT_CATEGORY,
		menu: [
			{
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.equals('view', ChatViewId),
					disabled ? ChatContextKeys.Modes.agentModeDisabledByPolicy : ChatContextKeys.Modes.agentModeDisabledByPolicy.negate()
				),
				order: 10,
				group: '0_level'
			}
		]
	};
	return disabled ? { ...base, tooltip: localize('managedByOrganization', "Managed by your organization") } : base;
}
class ManageAgentsAction extends ConfigAgentActionImpl { constructor() { super(createManageAgentsActionConfig(false)); } }
class ManageAgentsActionDisabled extends ConfigAgentActionImpl { constructor() { super(createManageAgentsActionConfig(true)); } }


/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export function registerAgentActions(): void {
	registerAction2(ManageAgentsAction);
	registerAction2(ManageAgentsActionDisabled);
	registerAction2(PickerConfigAgentAction);
	registerAction2(PickerConfigAgentActionDisabled);
}
