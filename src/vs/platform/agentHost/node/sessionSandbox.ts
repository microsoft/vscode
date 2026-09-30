/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { AgentSandboxEnabledValue, normalizeSandboxFileSystemPath } from '../../sandbox/common/settings.js';
import { SandboxSettingsResolutionHelper } from '../../sandbox/common/sandboxSettingsResolutionHelper.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { platformSessionSchema } from '../common/agentHostSchema.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema, type ISandboxConfigValue } from '../common/sandboxConfigSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentConfigurationService } from './agentConfigurationService.js';

export type { ISessionSandboxPolicy } from '../common/meta/agentSandboxPolicyMeta.js';

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

/** Resolves the owning session's toggle overrides without changing global settings. */
export function getSessionSandboxOverrides(configuration: IAgentConfigurationService, session: string): Pick<ISandboxConfigValue, AgentHostSandboxKey.Enabled | AgentHostSandboxKey.WindowsEnabled | AgentHostSandboxKey.AllowUnsandboxedCommands | AgentHostSandboxKey.AllowNetwork> {
	session = resolveAgentHostSession(URI.parse(session)).toString();
	const raw = configuration.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled];
	const selection = platformSessionSchema.validate(SessionConfigKey.SandboxEnabled, raw) ? raw : undefined;
	const policy = configuration.getSessionSandboxPolicy(session);
	const authorizedDisable = policy?.allowBypass === true && configuration.getSessionSandboxEnabled(session) === false;
	const localEnabled = selection === 'on' ? AgentSandboxEnabledValue.On
		: selection === 'off' ? AgentSandboxEnabledValue.Off
			: policy?.enabled ? AgentSandboxEnabledValue.On : undefined;
	const enabled = SandboxSettingsResolutionHelper.resolveEnabled(localEnabled, policy?.enabled && !authorizedDisable);
	const allowUnsandboxedCommands = SandboxSettingsResolutionHelper.resolveAllowBypass(undefined, policy?.allowBypass, policy?.enabled);
	const allowNetwork = SandboxSettingsResolutionHelper.resolveAllowOutbound(undefined, policy?.allowOutbound);
	return {
		...(enabled !== undefined ? {
			[AgentHostSandboxKey.Enabled]: enabled,
			[AgentHostSandboxKey.WindowsEnabled]: enabled,
		} : {}),
		...(allowUnsandboxedCommands !== undefined ? { [AgentHostSandboxKey.AllowUnsandboxedCommands]: allowUnsandboxedCommands } : {}),
		...(allowNetwork !== undefined ? { [AgentHostSandboxKey.AllowNetwork]: allowNetwork } : {}),
	};
}
