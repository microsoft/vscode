/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest, TOOL_RESULT_PLACEHOLDER } from './e2e/harness/modelRequestProjection.js';
import type { IReadableAnthropicRequest } from './e2e/harness/capiWireCodec.js';

function request(messages: IReadableAnthropicRequest['messages']): IReadableAnthropicRequest {
	return { model: 'claude-sonnet-5', system: '${system}', messages };
}

suite('modelRequestProjection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the host-authored structure of a conversation', () => {
		// Roles, ordering, retained history, and the system prompt are the
		// host's own product, so all of them are asserted verbatim.
		assert.deepStrictEqual(projectModelRequest(request([
			{ role: 'user', content: 'first question' },
			{ role: 'assistant', content: 'first answer' },
			{ role: 'user', content: 'second question' },
		])), {
			system: '${system}',
			messages: [
				{ role: 'user', content: 'first question' },
				{ role: 'assistant', content: 'first answer' },
				{ role: 'user', content: 'second question' },
			],
		});
	});

	test('the model id is elided so a catalog bump does not break every capture', () => {
		// The model moves with the provider default and the catalog rather than
		// with anything the host composes.
		const recorded = request([{ role: 'user', content: 'question' }]);
		const live: IReadableAnthropicRequest = { ...recorded, model: 'claude-sonnet-4.5' };
		assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
	});

	test('elides the tool result payload but keeps its wiring', () => {
		// The payload is environment-derived — command output, line endings and
		// listing formats all differ per OS — so only presence and the
		// `tool_use_id` link are asserted.
		assert.deepStrictEqual(projectModelRequest(request([
			{
				role: 'assistant', content: [
					{ type: 'tool_use', name: 'bash', input: { command: 'node -e "console.log(1)"' } },
				],
			},
			{
				role: 'user', content: [
					{ type: 'tool_result', tool_use_id: 'toolcall_0', content: 'Exit code: 0\r\n/Users/someone/tmp' },
				],
			},
		])).messages, [
			{
				role: 'assistant', content: [
					{ type: 'tool_use', name: '${shell}', input: { command: 'node -e "console.log(1)"' } },
				],
			},
			{
				role: 'user', content: [
					{ type: 'tool_result', tool_use_id: 'toolcall_0', content: TOOL_RESULT_PLACEHOLDER },
				],
			},
		]);
	});

	test('a capture recorded on one platform matches the same run on another', () => {
		// The shell tool is named after the platform's shell, so the recorded
		// and live names differ by construction. Both collapse to the
		// placeholder, which is what makes one capture drive every platform.
		const recorded = request([{ role: 'assistant', content: [{ type: 'tool_use', name: 'bash', input: {} }] }]);
		const live = request([{ role: 'assistant', content: [{ type: 'tool_use', name: 'powershell', input: {} }] }]);
		assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
	});

	test('run-time identifiers are elided on both sides', () => {
		// Captures store these as ordinals assigned at write time; a live run
		// mints real ones. Neither is reproducible, so only presence is kept.
		const recorded = request([{ role: 'user', content: 'Shell ID: ${uuid_0}' }]);
		const live = request([{ role: 'user', content: 'Shell ID: 6f1e5a7c-2b3d-4e5f-8a9b-0c1d2e3f4a5b' }]);
		assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
	});

	test('reasoning blocks are elided because replay cannot reproduce them', () => {
		// Aggregating a recorded reply drops reasoning, so the assistant turn
		// replayed back to the agent never carries one even though the original
		// live recording did.
		const recorded = request([{
			role: 'assistant', content: [
				{ type: 'thinking' },
				{ type: 'tool_use', name: 'view', input: { path: 'a.txt' } },
			],
		}]);
		const live = request([{
			role: 'assistant', content: [
				{ type: 'tool_use', name: 'view', input: { path: 'a.txt' } },
			],
		}]);
		assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
	});

	test('detects the regressions it exists to catch', () => {
		const recorded = projectModelRequest(request([
			{ role: 'user', content: 'first question' },
			{ role: 'assistant', content: 'first answer' },
			{ role: 'user', content: 'second question' },
		]));
		assert.deepStrictEqual({
			droppedHistory: modelRequestsMatch(recorded, projectModelRequest(request([
				{ role: 'user', content: 'second question' },
			]))),
			reorderedMessages: modelRequestsMatch(recorded, projectModelRequest(request([
				{ role: 'assistant', content: 'first answer' },
				{ role: 'user', content: 'first question' },
				{ role: 'user', content: 'second question' },
			]))),
			changedText: modelRequestsMatch(recorded, projectModelRequest(request([
				{ role: 'user', content: 'first question' },
				{ role: 'assistant', content: 'first answer' },
				{ role: 'user', content: 'a different question' },
			]))),
			missingSystemPrompt: modelRequestsMatch(recorded, projectModelRequest({
				model: 'claude-sonnet-5', system: '', messages: [
					{ role: 'user', content: 'first question' },
					{ role: 'assistant', content: 'first answer' },
					{ role: 'user', content: 'second question' },
				],
			})),
		}, {
			droppedHistory: false,
			reorderedMessages: false,
			changedText: false,
			missingSystemPrompt: false,
		});
	});

	test('detects a broken tool_use_id link', () => {
		const recorded = projectModelRequest(request([
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolcall_0', content: 'output' }] },
		]));
		const live = projectModelRequest(request([
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolcall_1', content: 'different output' }] },
		]));
		assert.strictEqual(modelRequestsMatch(recorded, live), false);
	});

	test('names the turn in the mismatch report', () => {
		const expected = projectModelRequest(request([{ role: 'user', content: 'expected' }]));
		const actual = projectModelRequest(request([{ role: 'user', content: 'actual' }]));
		const report = formatModelRequestMismatch(2, expected, actual);
		assert.ok(report.startsWith('model request #3 does not match the recorded request in the fixture'));
		assert.ok(report.includes('expected') && report.includes('actual'));
	});
});
