/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AgentHostPowerSaveBlockerMessageType = 'vscode:agentHostPowerSaveBlocker';

export type AgentHostPowerSaveBlockerMessage =
	| { readonly type: typeof AgentHostPowerSaveBlockerMessageType; readonly kind: 'acquire'; readonly allowOnBattery: boolean }
	| { readonly type: typeof AgentHostPowerSaveBlockerMessageType; readonly kind: 'release' };

export type AgentHostPowerSaveBlockerRequest = { readonly kind: 'acquire'; readonly allowOnBattery: boolean } | { readonly kind: 'release' };

export function toAgentHostPowerSaveBlockerMessage(request: AgentHostPowerSaveBlockerRequest): AgentHostPowerSaveBlockerMessage {
	return { type: AgentHostPowerSaveBlockerMessageType, ...request };
}

export function parseAgentHostPowerSaveBlockerMessage(message: unknown): AgentHostPowerSaveBlockerRequest | undefined {
	if (!message || typeof message !== 'object') {
		return undefined;
	}

	const candidate = message as { type?: unknown; kind?: unknown; allowOnBattery?: unknown };
	if (candidate.type !== AgentHostPowerSaveBlockerMessageType) {
		return undefined;
	}
	if (candidate.kind === 'release') {
		return { kind: 'release' };
	}
	if (candidate.kind === 'acquire' && typeof candidate.allowOnBattery === 'boolean') {
		return { kind: 'acquire', allowOnBattery: candidate.allowOnBattery };
	}
	return undefined;
}
