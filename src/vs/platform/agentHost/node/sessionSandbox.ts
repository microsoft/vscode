/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import { AgentSandboxEnabledValue, normalizeSandboxFileSystemPath } from '../../sandbox/common/settings.js';
import { SandboxSettingsResolutionHelper } from '../../sandbox/common/sandboxSettingsResolutionHelper.js';
import { platformSessionSchema } from '../common/agentHostSchema.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema, type ISandboxConfigValue } from '../common/sandboxConfigSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentChatConfigurationTarget, IAgentConfigurationService } from './agentConfigurationService.js';
import type { ISessionSandboxPolicy } from '../common/meta/agentSandboxPolicyMeta.js';

export type { ISessionSandboxPolicy } from '../common/meta/agentSandboxPolicyMeta.js';

/**
 * Resolves a chat's sandbox settings for the executing Agent Host, independently
 * of the client's OS or configuration source: the chat's own selection over the
 * session's, within the session's policy floor.
 */
export function getSessionSandboxConfig(configuration: IAgentConfigurationService, target: IAgentChatConfigurationTarget, platform: NodeJS.Platform = process.platform): ISandboxConfigValue {
	const sandbox = {
		...configuration.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox),
		...getSessionSandboxOverrides(configuration, target),
	};
	const policy = configuration.getSessionSandboxPolicy(target.session);
	const addCurrentWorkingDirectory = SandboxSettingsResolutionHelper.resolveAllowAccess(
		sandbox[AgentHostSandboxKey.AddCurrentWorkingDirectory],
		policy?.addCurrentWorkingDirectory,
	);
	if (addCurrentWorkingDirectory !== undefined) {
		sandbox[AgentHostSandboxKey.AddCurrentWorkingDirectory] = addCurrentWorkingDirectory;
	}
	if (sandbox.allowedNetworkDomains !== undefined || sandbox.deniedNetworkDomains !== undefined
		|| policy?.allowedHosts !== undefined || policy?.blockedHosts !== undefined) {
		const hosts = SandboxSettingsResolutionHelper.resolveNetworkHosts(
			sandbox.allowedNetworkDomains, sandbox.deniedNetworkDomains,
			policy?.allowedHosts, policy?.blockedHosts,
		);
		sandbox.allowedNetworkDomains = hosts.allowedHosts;
		sandbox.deniedNetworkDomains = hosts.blockedHosts;
	}
	if (sandbox[AgentHostSandboxKey.UserConfiguredPaths] !== undefined || policy?.readwritePaths !== undefined
		|| policy?.readonlyPaths !== undefined || policy?.deniedPaths !== undefined) {
		sandbox[AgentHostSandboxKey.UserConfiguredPaths] = SandboxSettingsResolutionHelper.resolveFileSystemPaths(
			sandbox[AgentHostSandboxKey.UserConfiguredPaths],
			policy && {
				readwritePaths: policy.readwritePaths ? [...policy.readwritePaths] : undefined,
				readonlyPaths: policy.readonlyPaths ? [...policy.readonlyPaths] : undefined,
				deniedPaths: policy.deniedPaths ? [...policy.deniedPaths] : undefined,
			},
		);
	}
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

/** Resolves a chat's toggle overrides without changing global settings. */
export function getSessionSandboxOverrides(configuration: IAgentConfigurationService, target: IAgentChatConfigurationTarget): Pick<ISandboxConfigValue, AgentHostSandboxKey.Enabled | AgentHostSandboxKey.AllowUnsandboxedCommands | AgentHostSandboxKey.AllowNetwork | AgentHostSandboxKey.AllowLocalNetwork | AgentHostSandboxKey.AllowDevToolAccess | AgentHostSandboxKey.SandboxMcpServers | AgentHostSandboxKey.SandboxLspServers | AgentHostSandboxKey.AuthenticateGit | AgentHostSandboxKey.AuthenticateGh> {
	const policy = configuration.getSessionSandboxPolicy(target.session);
	const enabled = resolveSandboxEnabled(configuration.getChatConfigValues(target)?.[SessionConfigKey.SandboxEnabled], policy, configuration.getChatSandboxEnabled(target));
	const allowUnsandboxedCommands = SandboxSettingsResolutionHelper.resolveAllowBypass(undefined, policy?.allowBypass, policy?.enabled);
	const allowNetwork = SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, policy?.allowOutbound);
	const allowLocalNetwork = SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, policy?.allowLocalNetwork);
	const allowDevToolAccess = SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, policy?.allowDevToolAccess);
	const sandboxMcpServers = SandboxSettingsResolutionHelper.resolveSandboxServers(undefined, policy?.sandboxMcpServers);
	const sandboxLspServers = SandboxSettingsResolutionHelper.resolveSandboxServers(undefined, policy?.sandboxLspServers);
	const authenticateGit = SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, policy?.authenticateGit);
	const authenticateGh = SandboxSettingsResolutionHelper.resolveAllowAccess(undefined, policy?.authenticateGh);
	return {
		...(enabled !== undefined ? {
			[AgentHostSandboxKey.Enabled]: enabled,
		} : {}),
		...(allowUnsandboxedCommands !== undefined ? { [AgentHostSandboxKey.AllowUnsandboxedCommands]: allowUnsandboxedCommands } : {}),
		...(allowNetwork !== undefined ? { [AgentHostSandboxKey.AllowNetwork]: allowNetwork } : {}),
		...(allowLocalNetwork !== undefined ? { [AgentHostSandboxKey.AllowLocalNetwork]: allowLocalNetwork } : {}),
		...(allowDevToolAccess !== undefined ? { [AgentHostSandboxKey.AllowDevToolAccess]: allowDevToolAccess } : {}),
		...(sandboxMcpServers !== undefined ? { [AgentHostSandboxKey.SandboxMcpServers]: sandboxMcpServers } : {}),
		...(sandboxLspServers !== undefined ? { [AgentHostSandboxKey.SandboxLspServers]: sandboxLspServers } : {}),
		...(authenticateGit !== undefined ? { [AgentHostSandboxKey.AuthenticateGit]: authenticateGit } : {}),
		...(authenticateGh !== undefined ? { [AgentHostSandboxKey.AuthenticateGh]: authenticateGh } : {}),
	};
}

/**
 * Resolves sandbox enablement from a selection (`default`, `on`, `off`), the
 * session's policy floor and the last successfully applied enablement: an
 * applied disable within a policy that allows bypass stays authorized.
 */
export function resolveSandboxEnabled(rawSelection: unknown, policy: ISessionSandboxPolicy | undefined, appliedEnabled: boolean | undefined): AgentSandboxEnabledValue | undefined {
	const selection = platformSessionSchema.validate(SessionConfigKey.SandboxEnabled, rawSelection) ? rawSelection : undefined;
	const authorizedDisable = policy?.allowBypass === true && appliedEnabled === false;
	const localEnabled = selection === 'on' ? AgentSandboxEnabledValue.On
		: selection === 'off' ? AgentSandboxEnabledValue.Off
			: policy?.enabled ? AgentSandboxEnabledValue.On : undefined;
	return SandboxSettingsResolutionHelper.resolveEnabled(localEnabled, policy?.enabled && !authorizedDisable);
}
