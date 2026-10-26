/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { applySandboxPathGrant, type ISandboxPathGrant } from '../../../../../../platform/agentHost/common/sandboxPathGrant.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSandboxSettingId, type IAgentSandboxUserConfiguredPaths } from '../../../../../../platform/sandbox/common/settings.js';

const settingsWrites = new Sequencer();

/** Saves to local user settings, which the sandbox forwarder shares with connected hosts. */
export function saveSandboxPathGrant(configurationService: IConfigurationService, grant: ISandboxPathGrant, isCurrent: () => boolean): Promise<void> {
	return settingsWrites.queue(async () => {
		if (!isCurrent()) {
			return;
		}
		const key = AgentSandboxSettingId.AgentSandboxUserConfiguredPaths;
		const current = configurationService.inspect<IAgentSandboxUserConfiguredPaths>(key).userLocalValue;
		await configurationService.updateValue(key, applySandboxPathGrant(current, grant), ConfigurationTarget.USER_LOCAL);
	});
}
