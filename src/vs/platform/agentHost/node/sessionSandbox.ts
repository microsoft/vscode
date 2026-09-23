/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AgentSandboxEnabledValue } from '../../sandbox/common/settings.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { platformSessionSchema } from '../common/agentHostSchema.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../common/sandboxConfigSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';

/** A projection of the runtime's resolved sandbox floor, never a policy parser. */
export interface ISessionSandboxPolicy {
	readonly enabled: boolean;
	readonly allowBypass?: boolean;
}

/** Resolves the owning session's enablement and bypass overrides without global settings. */
export function getSessionSandboxOverrides(configuration: IAgentConfigurationService, session: string): Pick<ISandboxConfigValue, AgentHostSandboxKey.Enabled | AgentHostSandboxKey.WindowsEnabled | AgentHostSandboxKey.AllowUnsandboxedCommands> {
	session = resolveAgentHostSession(URI.parse(session)).toString();
	const raw = configuration.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled];
	const selection = platformSessionSchema.validate(SessionConfigKey.SandboxEnabled, raw) ? raw : undefined;
	const policy = configuration.getSessionSandboxPolicy(session);
	const enabled = policy?.enabled && !policy.allowBypass ? AgentSandboxEnabledValue.On
		: selection === 'on' ? AgentSandboxEnabledValue.On
			: selection === 'off' ? AgentSandboxEnabledValue.Off
				: policy?.enabled ? AgentSandboxEnabledValue.On : undefined;
	const allowUnsandboxedCommands = policy?.enabled ? policy.allowBypass === true : policy?.allowBypass === false ? false : undefined;
	return {
		...(enabled !== undefined ? {
			[AgentHostSandboxKey.Enabled]: enabled,
			[AgentHostSandboxKey.WindowsEnabled]: enabled,
		} : {}),
		...(allowUnsandboxedCommands !== undefined ? { [AgentHostSandboxKey.AllowUnsandboxedCommands]: allowUnsandboxedCommands } : {}),
	};
}
