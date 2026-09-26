/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { AgentSandboxEnabledValue, normalizeSandboxFileSystemPath } from '../../sandbox/common/settings.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { platformSessionSchema } from '../common/agentHostSchema.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema, type ISandboxConfigValue } from '../common/sandboxConfigSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';

/** A projection of the runtime's resolved sandbox floor, never a policy parser. */
export interface ISessionSandboxPolicy {
	readonly enabled: boolean;
	readonly allowBypass?: boolean;
}

/** Resolves sandbox settings for the executing Agent Host, independently of the client's OS or configuration source. */
export function getSessionSandboxConfig(configuration: IAgentConfigurationService, session: string, platform: NodeJS.Platform = process.platform): ISandboxConfigValue {
	const sandbox = {
		...configuration.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox),
		...getSessionSandboxOverrides(configuration, session),
	};
	const fileSystemKey = platform === 'win32' ? AgentHostSandboxKey.WindowsFileSystem
		: platform === 'darwin' ? AgentHostSandboxKey.MacFileSystem : AgentHostSandboxKey.LinuxFileSystem;
	const fileSystem = sandbox[fileSystemKey];
	if (fileSystem) {
		const os = platform === 'win32' ? OperatingSystem.Windows : platform === 'darwin' ? OperatingSystem.Macintosh : OperatingSystem.Linux;
		const normalized = { ...fileSystem };
		for (const key of ['allowRead', 'allowWrite', 'denyRead', 'denyWrite'] as const) {
			if (fileSystem[key]) {
				normalized[key] = fileSystem[key].map(path => normalizeSandboxFileSystemPath(path, os));
			}
		}
		sandbox[fileSystemKey] = normalized;
	}
	return sandbox;
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
