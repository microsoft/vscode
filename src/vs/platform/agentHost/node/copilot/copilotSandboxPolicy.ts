/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import { isStringArray } from '../../../../base/common/types.js';
import { browserChatToolReferenceNames } from '../../../browserView/common/browserChatToolReferenceNames.js';
import type { ILogService } from '../../../log/common/log.js';
import { ISandboxNetworkRestrictions, SandboxSettingsResolutionHelper } from '../../../sandbox/common/sandboxSettingsResolutionHelper.js';
import type { IAgentConfigurationService } from '../agentConfigurationService.js';
import { getSessionSandboxConfig, type ISessionSandboxPolicy } from '../sessionSandbox.js';

/** Resolves session network restrictions only for Copilot's integrated-browser client tools. */
export function getCopilotBrowserSandboxNetworkRestrictions(configuration: IAgentConfigurationService, session: string, clientToolName: string): ISandboxNetworkRestrictions | undefined {
	if (clientToolName !== 'list_browser_pages' && !browserChatToolReferenceNames.some(name => name === clientToolName)) {
		return undefined;
	}
	const sandbox = getSessionSandboxConfig(configuration, session);
	const network = SandboxSettingsResolutionHelper.getNetworkRestrictions(sandbox.enabled, sandbox.allowNetwork);
	return {
		sandboxEnabled: network.sandboxEnabled,
		allowNetwork: network.allowNetwork,
		allowedDomains: sandbox.allowedNetworkDomains ?? [],
		deniedDomains: sandbox.deniedNetworkDomains ?? [],
	};
}

/** Projects the runtime-resolved sandbox floor into session policy for host configuration updates. */
export function projectCopilotSandboxPolicy(data: Extract<SessionEvent, { type: 'session.managed_settings_resolved' }>['data'], sessionId: string, logService: ILogService): ISessionSandboxPolicy {
	const settings = data.settings;
	const sandboxValue = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.sandbox : undefined;
	const sandbox = sandboxValue && typeof sandboxValue === 'object' && !Array.isArray(sandboxValue) ? sandboxValue : undefined;
	const authValue = sandbox?.auth;
	const auth = authValue && typeof authValue === 'object' && !Array.isArray(authValue) ? authValue : undefined;
	const userPolicyValue = sandbox?.userPolicy;
	const userPolicy = userPolicyValue && typeof userPolicyValue === 'object' && !Array.isArray(userPolicyValue) ? userPolicyValue : undefined;
	const networkValue = userPolicy?.network;
	const network = networkValue && typeof networkValue === 'object' && !Array.isArray(networkValue) ? networkValue : undefined;
	const filesystemValue = userPolicy?.filesystem;
	const filesystem = filesystemValue && typeof filesystemValue === 'object' && !Array.isArray(filesystemValue) ? filesystemValue : undefined;
	const failClosed = data.failClosed || data.sandboxEnabledByUndeterminedPolicy === true;
	const sandboxFailClosed = data.sandboxEnabledByUndeterminedPolicy ?? (data.failClosed && sandbox?.enabled !== true);
	if (failClosed) {
		logService.warn(`[Copilot:${sessionId}] Sandbox policy fail-closed: source=${data.source}, failClosed=${data.failClosed}, sandboxEnabledByUndeterminedPolicy=${data.sandboxEnabledByUndeterminedPolicy === true}; forcing enabled=true, allowBypass=false`);
	}
	for (const key of ['allowedHosts', 'blockedHosts'] as const) {
		if (network?.[key] !== undefined && !isStringArray(network[key])) {
			logService.error(`[Copilot:${sessionId}] Invalid resolved sandbox network policy: ${key} must be a string array`);
			throw new Error(`Invalid resolved sandbox network policy: ${key} must be a string array`);
		}
		for (const key of ['readwritePaths', 'readonlyPaths', 'deniedPaths'] as const) {
			if (filesystem?.[key] !== undefined && !isStringArray(filesystem[key])) {
				logService.error(`[Copilot:${sessionId}] Invalid resolved sandbox filesystem policy: ${key} must be a string array`);
				throw new Error(`Invalid resolved sandbox filesystem policy: ${key} must be a string array`);
			}
		}
	}
	return {
		enabled: failClosed || sandbox?.enabled === true,
		allowBypass: failClosed ? false : typeof sandbox?.allowBypass === 'boolean' ? sandbox.allowBypass : undefined,
		...(typeof network?.allowOutbound === 'boolean' ? { allowOutbound: network.allowOutbound } : {}),
		...(typeof network?.allowLocalNetwork === 'boolean' ? { allowLocalNetwork: network.allowLocalNetwork } : {}),
		...(isStringArray(network?.allowedHosts) ? { allowedHosts: [...network.allowedHosts] } : {}),
		...(isStringArray(network?.blockedHosts) ? { blockedHosts: [...network.blockedHosts] } : {}),
		...(isStringArray(filesystem?.readwritePaths) ? { readwritePaths: [...filesystem.readwritePaths] } : {}),
		...(isStringArray(filesystem?.readonlyPaths) ? { readonlyPaths: [...filesystem.readonlyPaths] } : {}),
		...(isStringArray(filesystem?.deniedPaths) ? { deniedPaths: [...filesystem.deniedPaths] } : {}),
		...(typeof sandbox?.allowDevToolAccess === 'boolean' ? { allowDevToolAccess: sandbox.allowDevToolAccess } : {}),
		...(typeof sandbox?.addCurrentWorkingDirectory === 'boolean' ? { addCurrentWorkingDirectory: sandbox.addCurrentWorkingDirectory } : {}),
		...(typeof sandbox?.sandboxMcpServers === 'boolean' ? { sandboxMcpServers: sandbox.sandboxMcpServers } : {}),
		...(typeof sandbox?.sandboxLspServers === 'boolean' ? { sandboxLspServers: sandbox.sandboxLspServers } : {}),
		...(typeof auth?.git === 'boolean' ? { authenticateGit: auth.git } : {}),
		...(typeof auth?.gh === 'boolean' ? { authenticateGh: auth.gh } : {}),
		...(sandboxFailClosed ? { failClosed: true } : {}),
	};
}
