/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProtectedResourceMetadata } from './state/protocol/state.js';

export const enum AgentHostTunnelAuthenticationIssuer {
	GitHub = 'github',
	Microsoft = 'microsoft',
}

export interface IAgentHostTunnelAuthenticationProviderConfiguration {
	readonly scopes: readonly string[];
}

export type AgentHostTunnelAuthenticationProviders = Readonly<Partial<Record<AgentHostTunnelAuthenticationIssuer, IAgentHostTunnelAuthenticationProviderConfiguration>>>;

const AGENT_HOST_TUNNEL_PROTECTED_RESOURCE_PREFIX = 'https://vscode.dev/agent-host/tunnels/';
export const AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID = `${AGENT_HOST_TUNNEL_PROTECTED_RESOURCE_PREFIX}github`;
export const AGENT_HOST_MICROSOFT_TUNNEL_PROTECTED_RESOURCE_ID = `${AGENT_HOST_TUNNEL_PROTECTED_RESOURCE_PREFIX}microsoft`;

interface IAgentHostTunnelAuthenticationResourceDefinition {
	readonly issuer: AgentHostTunnelAuthenticationIssuer;
	readonly resource: string;
	readonly resourceName: string;
	readonly authorizationServer: string;
}

const tunnelAuthenticationResourceDefinitions: readonly IAgentHostTunnelAuthenticationResourceDefinition[] = [
	{
		issuer: AgentHostTunnelAuthenticationIssuer.GitHub,
		resource: AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID,
		resourceName: 'VS Code Dev Tunnels (GitHub)',
		authorizationServer: 'https://github.com/login/oauth',
	},
	{
		issuer: AgentHostTunnelAuthenticationIssuer.Microsoft,
		resource: AGENT_HOST_MICROSOFT_TUNNEL_PROTECTED_RESOURCE_ID,
		resourceName: 'VS Code Dev Tunnels (Microsoft)',
		authorizationServer: 'https://login.microsoftonline.com/common/v2.0',
	},
];

export function getAgentHostTunnelAuthenticationIssuer(resource: string): AgentHostTunnelAuthenticationIssuer | undefined {
	return tunnelAuthenticationResourceDefinitions.find(definition => definition.resource === resource)?.issuer;
}

export function isAgentHostTunnelProtectedResource(resource: string): boolean {
	return resource.startsWith(AGENT_HOST_TUNNEL_PROTECTED_RESOURCE_PREFIX);
}

export function createAgentHostTunnelProtectedResources(authenticationProviders: AgentHostTunnelAuthenticationProviders | undefined): readonly ProtectedResourceMetadata[] {
	const resources: ProtectedResourceMetadata[] = [];
	for (const definition of tunnelAuthenticationResourceDefinitions) {
		const scopes = authenticationProviders?.[definition.issuer]?.scopes;
		if (!scopes?.length) {
			continue;
		}
		resources.push({
			resource: definition.resource,
			resource_name: definition.resourceName,
			authorization_servers: [definition.authorizationServer],
			scopes_supported: [...new Set(scopes)],
			required: false,
		});
	}
	return resources;
}
