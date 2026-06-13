/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICopilotBeginToolCall, ICopilotToolCallStreamUpdate, IResponseDelta } from '../../networking/common/fetch';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type ToolCallStreamData = Pick<IResponseDelta, 'beginToolCalls' | 'copilotToolCallStreamUpdates'>;

export function encodeToolCallStreamData(payload: ToolCallStreamData): Uint8Array {
	return textEncoder.encode(JSON.stringify(sanitizeToolCallStreamData(payload) ?? {}));
}

export function decodeToolCallStreamData(data: Uint8Array): ToolCallStreamData | undefined {
	try {
		return sanitizeToolCallStreamData(JSON.parse(textDecoder.decode(data)));
	} catch {
		return undefined;
	}
}

function sanitizeToolCallStreamData(value: unknown): ToolCallStreamData | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	const beginToolCalls = value.beginToolCalls === undefined ? undefined : sanitizeBeginToolCalls(value.beginToolCalls);
	if (value.beginToolCalls !== undefined && !beginToolCalls) {
		return undefined;
	}

	const copilotToolCallStreamUpdates = value.copilotToolCallStreamUpdates === undefined ? undefined : sanitizeToolCallStreamUpdates(value.copilotToolCallStreamUpdates);
	if (value.copilotToolCallStreamUpdates !== undefined && !copilotToolCallStreamUpdates) {
		return undefined;
	}

	if (!beginToolCalls && !copilotToolCallStreamUpdates) {
		return undefined;
	}

	return {
		...(beginToolCalls ? { beginToolCalls } : {}),
		...(copilotToolCallStreamUpdates ? { copilotToolCallStreamUpdates } : {}),
	};
}

function sanitizeBeginToolCalls(value: unknown): ICopilotBeginToolCall[] | undefined {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined;
	}

	const beginToolCalls: ICopilotBeginToolCall[] = [];
	for (const item of value) {
		if (!isObject(item) || typeof item.name !== 'string' || (item.id !== undefined && typeof item.id !== 'string')) {
			return undefined;
		}

		beginToolCalls.push({
			name: item.name,
			...(item.id !== undefined ? { id: item.id } : {}),
		});
	}

	return beginToolCalls;
}

function sanitizeToolCallStreamUpdates(value: unknown): ICopilotToolCallStreamUpdate[] | undefined {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined;
	}

	const updates: ICopilotToolCallStreamUpdate[] = [];
	for (const item of value) {
		if (!isObject(item) || typeof item.name !== 'string' || typeof item.arguments !== 'string' || (item.id !== undefined && typeof item.id !== 'string')) {
			return undefined;
		}

		updates.push({
			name: item.name,
			arguments: item.arguments,
			...(item.id !== undefined ? { id: item.id } : {}),
		});
	}

	return updates;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}