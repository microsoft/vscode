/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IJSONSchema } from '../../../../base/common/jsonSchema.js';

export type AgentCanvasInput = null | boolean | number | string | AgentCanvasInput[] | { [key: string]: AgentCanvasInput };

export interface IAgentCanvasType {
	readonly canvasTypeId: string;
	readonly extensionId: string;
	readonly displayName: string;
	readonly description?: string;
	readonly inputSchema?: IJSONSchema;
}

export const agentCanvasesMetaKey = 'vscode.canvases';
export const agentCloseCanvasCapabilityMetaKey = 'vscode.closeCanvas';
export const agentOpenCanvasCapabilityMetaKey = 'vscode.canvasManagement';

/** Versioned direct catalog/open contract, independent of live Canvas metadata. */
export function supportsAgentHostCanvasOpen(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[agentOpenCanvasCapabilityMetaKey] === 1;
}

/** Rejects values that management IPC cannot faithfully carry as JSON. */
export function isAgentCanvasInput(value: unknown, ancestors = new Set<object>(), depth = 0): value is AgentCanvasInput {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return true;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}
	if (typeof value !== 'object' || depth > 100 || ancestors.has(value)) {
		return false;
	}
	if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
		return false;
	}
	ancestors.add(value);
	const valid = Object.values(value).every(item => isAgentCanvasInput(item, ancestors, depth + 1));
	ancestors.delete(value);
	return valid;
}

/** Whether the server supports explicit Canvas dismissal. */
export function supportsAgentHostCanvasClose(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[agentCloseCanvasCapabilityMetaKey] === true;
}

/** A runtime-owned Canvas instance. Closing its browser tab does not close the instance. */
export interface IAgentCanvas {
	readonly chat: string;
	readonly instanceId: string;
	readonly canvasTypeId: string;
	readonly title?: string;
	readonly url?: string;
	readonly extensionId?: string;
	readonly status?: string;
	readonly unavailable?: boolean;
	/** Changes when the provider reopens an instance, even if its URL is unchanged. */
	readonly revision?: string;
}

/** Reads the live Canvas catalog, ignoring malformed entries from other protocol versions. */
export function readAgentCanvases(source: { readonly _meta?: Record<string, unknown> }): readonly IAgentCanvas[] {
	const value = source._meta?.[agentCanvasesMetaKey];
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is IAgentCanvas => {
		if (!entry || typeof entry !== 'object') {
			return false;
		}
		const canvas = entry as Record<string, unknown>;
		return typeof canvas.chat === 'string' && canvas.chat.length > 0
			&& typeof canvas.instanceId === 'string' && canvas.instanceId.length > 0
			&& typeof canvas.canvasTypeId === 'string' && canvas.canvasTypeId.length > 0
			&& (canvas.title === undefined || typeof canvas.title === 'string')
			&& (canvas.url === undefined || typeof canvas.url === 'string')
			&& (canvas.extensionId === undefined || typeof canvas.extensionId === 'string')
			&& (canvas.status === undefined || typeof canvas.status === 'string')
			&& (canvas.unavailable === undefined || typeof canvas.unavailable === 'boolean')
			&& (canvas.revision === undefined || typeof canvas.revision === 'string');
	});
}

/** Replaces one chat's live instances without overwriting other chats or metadata slots. */
export function withAgentCanvases(meta: Record<string, unknown> | undefined, chat: string, canvases: readonly IAgentCanvas[]): Record<string, unknown> {
	return {
		...meta,
		[agentCanvasesMetaKey]: [
			...readAgentCanvases({ _meta: meta }).filter(canvas => canvas.chat !== chat),
			...canvases,
		],
	};
}
