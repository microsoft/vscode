/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { aggregateResponsesSse, parseSseEvents, responsesMessageToSse, summarizeResponsesRequest, type IAnthropicMessage } from './e2e/harness/capiWireCodec.js';
import { projectModelRequest } from './e2e/harness/modelRequestProjection.js';

suite('Agent Host E2E Responses wire codec', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const patch = '*** Begin Patch\n*** Update File: empty.txt\n@@\n-\n+fixed\n*** End Patch';

	test('round-trips custom tool input without JSON encoding or duplicate streaming content', () => {
		const message: IAnthropicMessage = {
			content: [
				{ type: 'text', text: 'Applying patch' },
				{ type: 'tool_use', id: 'call_patch', name: 'apply_patch', format: 'custom', input: patch },
				{ type: 'tool_use', id: 'call_view', name: 'view', input: { path: 'empty.txt' } },
			],
			stopReason: 'tool_use',
			usage: { inputTokens: 1, outputTokens: 1 },
		};
		const stream = responsesMessageToSse(message);
		const events = parseSseEvents(stream);
		assert.deepStrictEqual({
			message: aggregateResponsesSse(stream),
			added: events.filter(event => event.type === 'response.output_item.added').map(event => event.item),
			customDeltas: events.filter(event => event.type === 'response.custom_tool_call_input.delta').map(event => event.delta),
			customDone: events.filter(event => event.type === 'response.custom_tool_call_input.done').map(event => event.input),
		}, {
			message,
			added: [
				{ id: 'item_0', type: 'message', role: 'assistant', status: 'in_progress', content: [] },
				{ id: 'item_1', type: 'custom_tool_call', name: 'apply_patch', call_id: 'call_patch', input: '', status: 'in_progress' },
				{ id: 'item_2', type: 'function_call', name: 'view', call_id: 'call_view', arguments: '', status: 'in_progress' },
			],
			customDeltas: [patch],
			customDone: [patch],
		});
	});

	test('retains custom calls and output wiring in projected request history', () => {
		const request = summarizeResponsesRequest(JSON.stringify({
			model: 'test-model',
			instructions: 'system',
			input: [
				{ type: 'custom_tool_call', name: 'apply_patch', call_id: 'call_patch', input: patch },
				{ type: 'custom_tool_call_output', call_id: 'call_patch', output: 'Patched' },
			],
		}));
		assert.ok(request);
		const projection = projectModelRequest(request);
		assert.deepStrictEqual(request.messages, [
			{ role: 'assistant', content: [{ type: 'tool_use', name: 'apply_patch', format: 'custom', input: patch }] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_patch', content: 'Patched' }] },
		]);
		assert.deepStrictEqual(projection.messages[0], request.messages[0]);
	});

	test('rejects malformed custom tool input rather than silently dropping the call', () => {
		assert.throws(() => aggregateResponsesSse('event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"custom_tool_call","name":"apply_patch"}}\n\n'), /missing its string input/);
		assert.throws(() => responsesMessageToSse({
			content: [{ type: 'tool_use', id: 'bad', name: 'apply_patch', format: 'custom', input: {} }],
			stopReason: 'tool_use',
		}), /without string input/);
	});
});
