/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setting IDs for agent network domain filtering.
 */
export const enum AgentNetworkDomainSettingId {
	NetworkFilter = 'chat.agent.networkFilter',
	AllowedNetworkDomains = 'chat.agent.sandbox.network.allowedDomains',
	DeniedNetworkDomains = 'chat.agent.sandbox.network.deniedDomains',
}
