/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';

export const AGENT_HOST_DISABLE_HOOK_WARNINGS_COMMAND_ID = 'workbench.action.chat.disableHookWarnings';

/** Like the chat tip's Disable tips action, turns hook warnings off and shows the setting so the user can turn them back on. */
registerAction2(class DisableHookWarningsAction extends Action2 {
	constructor() {
		super({
			id: AGENT_HOST_DISABLE_HOOK_WARNINGS_COMMAND_ID,
			title: localize2('agentHost.disableHookWarnings', "Disable Hook Warnings"),
			f1: false,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const commandService = accessor.get(ICommandService);

		// Write where the value comes from, so a workspace or remote value does not keep warnings on.
		const { workspaceValue, userRemoteValue } = configurationService.inspect<boolean>(ChatConfiguration.HooksShowWarnings);
		const target = workspaceValue !== undefined ? ConfigurationTarget.WORKSPACE : userRemoteValue !== undefined ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER;
		await configurationService.updateValue(ChatConfiguration.HooksShowWarnings, false, target);
		await commandService.executeCommand('workbench.action.openSettings', ChatConfiguration.HooksShowWarnings);
	}
});
