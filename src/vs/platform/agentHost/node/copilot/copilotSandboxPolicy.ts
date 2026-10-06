/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SandboxConfigSource, SessionEvent } from '@github/copilot-sdk';
import { browserChatToolReferenceNames } from '../../../browserView/common/browserChatToolReferenceNames.js';
import type { ILogService } from '../../../log/common/log.js';
import { ISandboxNetworkRestrictions, SandboxSettingsResolutionHelper } from '../../../sandbox/common/sandboxSettingsResolutionHelper.js';
import { isAgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import type { IAgentConfigurationService } from '../agentConfigurationService.js';
import { getSessionSandboxConfig, getSessionSandboxSelection, type ISessionSandboxPolicy } from '../sessionSandbox.js';

/** Preserves explicit session choices while letting the runtime floor settings-derived preferences. */
export function getCopilotSandboxConfigSource(configuration: IAgentConfigurationService, session: string): SandboxConfigSource {
	const selection = getSessionSandboxSelection(configuration, session);
	if (selection === 'on') {
		return 'session_flag';
	}
	if (selection === 'off') {
		return 'session_disabled';
	}
	const enabled = configuration.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox)?.enabled;
	if (enabled === undefined) {
		return 'never_configured';
	}
	return isAgentSandboxEnabledValue(enabled) ? 'user_enabled' : 'user_disabled';
}

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

function readCopilotManagedDomainBoundary(data: Extract<SessionEvent, { type: 'session.managed_settings_resolved' }>['data']) {
	const settings = data.settings;
	const permissions = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.permissions : undefined;
	return permissions && typeof permissions === 'object' && !Array.isArray(permissions) ? permissions.limitTo : undefined;
}

/** Reads only the runtime's resolved boundary; native parsing and source composition stay runtime-owned. */
export function hasCopilotManagedDomainBoundary(data: Extract<SessionEvent, { type: 'session.managed_settings_resolved' }>['data']): boolean {
	const limitTo = readCopilotManagedDomainBoundary(data);
	return limitTo !== undefined && (!Array.isArray(limitTo) || !limitTo.every(rule => typeof rule === 'string') || !limitTo.includes('Domain'));
}

/** Projects the resolved sandbox floor, including one derived from a domain boundary. */
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
	const failClosed = data.failClosed || data.sandboxEnabledByUndeterminedPolicy === true;
	const domainBoundary = hasCopilotManagedDomainBoundary(data);
	const limitTo = readCopilotManagedDomainBoundary(data);
	const denyAllDomains = Array.isArray(limitTo) && limitTo.length === 0;
	const sandboxFailClosed = data.sandboxEnabledByUndeterminedPolicy ?? (data.failClosed && sandbox?.enabled !== true);
	if (failClosed) {
		logService.warn(`[Copilot:${sessionId}] Sandbox policy fail-closed: source=${data.source}, failClosed=${data.failClosed}, sandboxEnabledByUndeterminedPolicy=${data.sandboxEnabledByUndeterminedPolicy === true}; forcing enabled=true, allowBypass=false`);
	}
	return {
		enabled: failClosed || domainBoundary || sandbox?.enabled === true,
		allowBypass: failClosed || domainBoundary ? false : typeof sandbox?.allowBypass === 'boolean' ? sandbox.allowBypass : undefined,
		...(denyAllDomains ? { allowOutbound: false, allowLocalNetwork: false } : {
			...(typeof network?.allowOutbound === 'boolean' ? { allowOutbound: network.allowOutbound } : {}),
			...(typeof network?.allowLocalNetwork === 'boolean' ? { allowLocalNetwork: network.allowLocalNetwork } : {}),
		}),
		...(typeof sandbox?.allowDevToolAccess === 'boolean' ? { allowDevToolAccess: sandbox.allowDevToolAccess } : {}),
		...(typeof sandbox?.sandboxMcpServers === 'boolean' ? { sandboxMcpServers: sandbox.sandboxMcpServers } : {}),
		...(typeof sandbox?.sandboxLspServers === 'boolean' ? { sandboxLspServers: sandbox.sandboxLspServers } : {}),
		...(typeof auth?.git === 'boolean' ? { authenticateGit: auth.git } : {}),
		...(typeof auth?.gh === 'boolean' ? { authenticateGh: auth.gh } : {}),
		...(sandboxFailClosed ? { failClosed: true } : {}),
	};
}
