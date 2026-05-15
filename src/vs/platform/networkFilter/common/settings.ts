/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setting IDs for agent network domain filtering.
 */
export const enum AgentNetworkDomainSettingId {
	NetworkFilter = 'chat.agent.networkFilter',
	AllowedNetworkDomains = 'chat.agent.allowedNetworkDomains',
	DeniedNetworkDomains = 'chat.agent.deniedNetworkDomains',

	// Deprecated: renamed from sandbox-scoped to agent-scoped
	DeprecatedSandboxAllowedNetworkDomains = 'chat.agent.sandbox.allowedNetworkDomains',
	DeprecatedSandboxDeniedNetworkDomains = 'chat.agent.sandbox.deniedNetworkDomains',

	// Deprecated: older names before the sandbox rename
	DeprecatedOldAllowedNetworkDomains = 'chat.agent.sandboxNetwork.allowedDomains',
	DeprecatedOldDeniedNetworkDomains = 'chat.agent.sandboxNetwork.deniedDomains',
}
