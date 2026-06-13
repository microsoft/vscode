/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { CustomDataPartMimeTypes } from '../../common/endpointTypes';
import { decodeToolCallStreamData, encodeToolCallStreamData } from '../../common/toolCallStreamDataContainer';

describe('toolCallStreamDataContainer', () => {
	it('defines a dedicated custom mime type', () => {
		expect(CustomDataPartMimeTypes.ToolCallStream).toBe('tool_call_stream');
	});

	it('round-trips begin tool calls', () => {
		const encoded = encodeToolCallStreamData({
			beginToolCalls: [{ id: 'call-1', name: 'apply_patch' }]
		});

		expect(decodeToolCallStreamData(encoded)).toEqual({
			beginToolCalls: [{ id: 'call-1', name: 'apply_patch' }]
		});
	});

	it('round-trips tool stream updates', () => {
		const encoded = encodeToolCallStreamData({
			copilotToolCallStreamUpdates: [{ id: 'call-1', name: 'apply_patch', arguments: '{"input":"patch"}' }]
		});

		expect(decodeToolCallStreamData(encoded)).toEqual({
			copilotToolCallStreamUpdates: [{ id: 'call-1', name: 'apply_patch', arguments: '{"input":"patch"}' }]
		});
	});

	it('strips extra fields from valid payloads', () => {
		const encoded = new TextEncoder().encode(JSON.stringify({
			beginToolCalls: [{ id: 'call-1', name: 'apply_patch', ignored: true }],
			copilotToolCallStreamUpdates: [{ id: 'call-2', name: 'apply_patch', arguments: '{}', ignored: true }],
			ignored: true
		}));

		expect(decodeToolCallStreamData(encoded)).toEqual({
			beginToolCalls: [{ id: 'call-1', name: 'apply_patch' }],
			copilotToolCallStreamUpdates: [{ id: 'call-2', name: 'apply_patch', arguments: '{}' }]
		});
	});

	it('rejects malformed json', () => {
		const encoded = new TextEncoder().encode('{');

		expect(decodeToolCallStreamData(encoded)).toBeUndefined();
	});

	it.each([
		{ beginToolCalls: [] },
		{ copilotToolCallStreamUpdates: [] },
		{ beginToolCalls: [], copilotToolCallStreamUpdates: [] },
	])('rejects empty tool-stream arrays: %j', payload => {
		const encoded = encodeToolCallStreamData(payload);

		expect(decodeToolCallStreamData(encoded)).toBeUndefined();
	});

	it.each([
		{ beginToolCalls: 'bad' },
		{ beginToolCalls: [{ id: 1, name: 'apply_patch' }] },
		{ beginToolCalls: [{ id: 'call-1', name: 1 }] },
		{ copilotToolCallStreamUpdates: [{}] },
		{ copilotToolCallStreamUpdates: [{ id: 'call-1', name: 'apply_patch' }] },
		{ ignored: true },
	])('rejects wrong-shaped payloads: %j', payload => {
		const encoded = new TextEncoder().encode(JSON.stringify(payload));

		expect(decodeToolCallStreamData(encoded)).toBeUndefined();
	});
});