/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICopilotBeginToolCall, ICopilotToolCallStreamUpdate, IResponseDelta } from '../../networking/common/fetch';

export namespace CustomDataPartMimeTypes {
	export const CacheControl = 'cache_control';
	export const StatefulMarker = 'stateful_marker';
	export const ThinkingData = 'thinking';
	export const ContextManagement = 'context_management';
	export const PhaseData = 'phase_data';
	export const Usage = 'usage';
	export const ToolCallStream = 'tool_call_stream';
}

export const CacheType = 'ephemeral';

/**
 * Vendors of Copilot's built-in BYOK providers whose converters handle the internal
 * {@link CustomDataPartMimeTypes.CacheControl} sentinel. Others would leak it upstream (#313920).
 *
 * TODO @vritant24: replace with an externally exposed opt-in API (#313920).
 */
export const CacheBreakpointAwareModelVendors: ReadonlySet<string> = new Set(['anthropic', 'gemini', 'openrouter']);

export function modelVendorHandlesCacheBreakpoints(vendor: string | undefined): boolean {
	return vendor !== undefined && CacheBreakpointAwareModelVendors.has(vendor);
}

export type ToolCallStreamData = Pick<IResponseDelta, 'beginToolCalls' | 'copilotToolCallStreamUpdates'>;

const toolStreamEncoder = new TextEncoder();
const toolStreamDecoder = new TextDecoder();

/** Encode internal tool progress without converting partial argument snapshots. */
export function encodeToolCallStreamData(data: ToolCallStreamData): Uint8Array {
	return toolStreamEncoder.encode(JSON.stringify(data));
}

/** Reject malformed progress at the extension boundary; never accept final calls here. */
export function decodeToolCallStreamData(data: Uint8Array): ToolCallStreamData | undefined {
	try {
		const parsed: unknown = JSON.parse(toolStreamDecoder.decode(data));
		if (typeof parsed !== 'object' || parsed === null) {
			return undefined;
		}
		const begin = 'beginToolCalls' in parsed ? parsed.beginToolCalls : undefined;
		const updates = 'copilotToolCallStreamUpdates' in parsed ? parsed.copilotToolCallStreamUpdates : undefined;
		if (begin !== undefined && (!Array.isArray(begin) || !begin.every(isBeginToolCall))) {
			return undefined;
		}
		if (updates !== undefined && (!Array.isArray(updates) || !updates.every(isToolCallStreamUpdate))) {
			return undefined;
		}
		if (!begin?.length && !updates?.length) {
			return undefined;
		}
		return { beginToolCalls: begin, copilotToolCallStreamUpdates: updates };
	} catch {
		return undefined;
	}
}

function isBeginToolCall(value: unknown): value is ICopilotBeginToolCall {
	return typeof value === 'object' && value !== null
		&& 'name' in value && typeof value.name === 'string'
		&& (!('id' in value) || typeof value.id === 'string');
}

function isToolCallStreamUpdate(value: unknown): value is ICopilotToolCallStreamUpdate {
	return isBeginToolCall(value) && 'arguments' in value && typeof value.arguments === 'string';
}
