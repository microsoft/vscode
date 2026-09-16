/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICachedTunnel } from './tunnelAgentHost.js';

export const TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY = 'tunnelAgentHost.recentTunnels';
export const TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY = 'tunnelAgentHost.dismissedTunnels';
export const TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY = 'tunnelAgentHost.autoConnectSuppressedTunnels';
export const TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY = 'tunnelAgentHost.selfSuppressedTunnels';

export type TunnelAgentHostDiscoveryState =
	| { readonly kind: 'disabled' }
	| { readonly kind: 'needsAuthentication' }
	| { readonly kind: 'refreshing' }
	| { readonly kind: 'ready'; readonly targetCount: number }
	| { readonly kind: 'error'; readonly error: Error };

export class TunnelAgentHostDiscoveryDisabledError extends Error {
	constructor() {
		super('Tunnel Agent Host discovery is disabled.');
		this.name = 'TunnelAgentHostDiscoveryDisabledError';
	}
}

export class TunnelAgentHostDiscoveryNeedsAuthenticationError extends Error {
	constructor() {
		super('Tunnel Agent Host discovery requires authentication.');
		this.name = 'TunnelAgentHostDiscoveryNeedsAuthenticationError';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCachedTunnels(value: unknown): ICachedTunnel[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const tunnels: ICachedTunnel[] = [];
	for (const candidate of value) {
		if (!isRecord(candidate)
			|| typeof candidate.tunnelId !== 'string'
			|| typeof candidate.clusterId !== 'string'
			|| typeof candidate.name !== 'string'
			|| (candidate.protocolVersion !== undefined && typeof candidate.protocolVersion !== 'number')
			|| (candidate.authProvider !== undefined && candidate.authProvider !== 'github' && candidate.authProvider !== 'microsoft')
		) {
			continue;
		}
		tunnels.push({
			tunnelId: candidate.tunnelId,
			clusterId: candidate.clusterId,
			name: candidate.name,
			protocolVersion: candidate.protocolVersion,
			authProvider: candidate.authProvider,
		});
	}
	return tunnels;
}

export function parseTunnelIds(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((candidate): candidate is string => typeof candidate === 'string') : [];
}
