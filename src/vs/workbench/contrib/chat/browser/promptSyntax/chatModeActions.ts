/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
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

/**
 * Action ID for the `Configure Custom Agents` action.
 */
const CONFIGURE_AGENTS_ACTION_ID = 'workbench.action.chat.configure.customagents';

function createConfigureAgentsActionConfig(disabled: boolean) {
	const agentModeDisabledByPolicy = ChatContextKeys.Modes.agentModeDisabledByPolicy;
	const base = {
		id: disabled ? CONFIGURE_AGENTS_ACTION_ID + '.disabled' : CONFIGURE_AGENTS_ACTION_ID,
		title: localize2('configure-agents', "Configure Custom Agents..."),
		category: CHAT_CATEGORY,
		f1: !disabled,
		precondition: disabled ? ContextKeyExpr.false() : ContextKeyExpr.and(ChatContextKeys.enabled, agentModeDisabledByPolicy.negate()),
		menu: {
			id: MenuId.ChatModePicker,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, disabled ? agentModeDisabledByPolicy : agentModeDisabledByPolicy.negate()),
		},
	};
	return disabled ? { ...base, icon: Codicon.lock, tooltip: localize('managedByOrganization', "Managed by your organization") } : base;
}

class ConfigureAgentsAction extends ConfigAgentActionImpl { constructor() { super(createConfigureAgentsActionConfig(false)); } }
class ConfigureAgentsActionDisabled extends ConfigAgentActionImpl { constructor() { super(createConfigureAgentsActionConfig(true)); } }


/**
 * Helper to register all the `Configure Custom Agents` actions.
 */
export function registerAgentActions(): void {
	registerAction2(ConfigureAgentsAction);
	registerAction2(ConfigureAgentsActionDisabled);
}
