/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentSelection, type ModelSelection } from '../common/state/protocol/state.js';

/**
 * Provider-owned backing for an exact chat. Records the SDK chat id so it can
 * be resumed after a process restart,
 * along with any model or custom-agent selection. This is also the shape
 * serialized into the opaque, agent-owned `providerData` blob the orchestrator
 * persists in its chat catalog and hands back on restore.
 */
export interface IPersistedChat {
	readonly sdkSessionId: string;
	readonly model?: ModelSelection;
	readonly agent?: AgentSelection;
}

/**
 * Serializes a peer-chat backing into the opaque `providerData` token the
 * orchestrator persists verbatim. The encoding is the agent's private business
 * — today it is the JSON of {@link IPersistedChat}.
 */
export function encodeProviderData(backing: IPersistedChat): string {
	return JSON.stringify(backing);
}

/**
 * Decodes an opaque `providerData` token produced by {@link encodeProviderData}
 * back into a peer-chat backing, tolerating corrupt/foreign blobs by returning
 * `undefined` (the same drop-on-corrupt policy as the legacy chat catalog read).
 */
export function decodeProviderData(providerData: string): IPersistedChat | undefined {
	try {
		const value = JSON.parse(providerData) as { sdkSessionId?: unknown; model?: unknown; agent?: unknown };
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const { sdkSessionId } = value;
		if (typeof sdkSessionId !== 'string' || !sdkSessionId) {
			return undefined;
		}
		// The blob is client-influenced and may be corrupted or shape-shifted by
		// a future serialization change: only accept values that actually look
		// like a `ModelSelection` / `AgentSelection`.
		const validModel = isModelSelection(value.model) ? value.model : undefined;
		const validAgent = isAgentSelection(value.agent) ? value.agent : undefined;
		return {
			sdkSessionId,
			...(validModel ? { model: validModel } : {}),
			...(validAgent ? { agent: validAgent } : {}),
		};
	} catch {
		return undefined;
	}
}

function isModelSelection(value: unknown): value is ModelSelection {
	return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

function isAgentSelection(value: unknown): value is AgentSelection {
	return !!value && typeof value === 'object' && typeof (value as { uri?: unknown }).uri === 'string';
}
