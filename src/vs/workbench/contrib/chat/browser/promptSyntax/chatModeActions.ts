/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../aiCustomization/aiCustomizationManagement.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

abstract class ConfigAgentActionImpl extends Action2 {
	public override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
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
