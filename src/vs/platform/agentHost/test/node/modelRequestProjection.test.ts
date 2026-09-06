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

	test('a path matches however it is spelled', () => {
		// Windows CI recorded all of these against captures made on macOS. Each
		// pair is the same location addressed differently: an unsubstituted
		// workdir, an unsubstituted homedir, a `\` separator, and the workspace
		// directory itself with no trailing file.
		const pairs: [string, string][] = [
			['Read the file at ${workdir}/peer-note.txt.', 'Read the file at C:\\Users\\CLOUDT~1\\Temp\\ws\\peer-note.txt.'],
			['${homedir}/.copilot/session-state/${uuid_0}/plan.md', 'C:\\Users\\CLOUDT~1\\Temp\\home-x/.copilot/session-state/${uuid_0}/plan.md'],
			['${homedir}/user-data/agentPlugins/${plugin_copy}/1/skills/probe-skill', 'D:\\a\\_temp\\home\\user-data\\agentPlugins\\e2e-probe\\1\\skills\\probe-skill'],
			['* ${workdir}/calculator.py (2 lines)', '* ${workdir}\\calculator.py (2 lines)'],
			['cd ${workdir} && echo hi', 'cd C:\\Users\\CLOUDT~1\\Temp\\ahp-cd-strip-test-kWEDtO && echo hi'],
		];
		assert.deepStrictEqual(pairs.map(([recorded, live]) => modelRequestsMatch(
			projectModelRequest(request([{ role: 'user', content: recorded }])),
			projectModelRequest(request([{ role: 'user', content: live }])),
		)), [true, true, true, true, true]);
	});

	test('the surrounding text still has to match', () => {
		// Eliding the path must not elide the instruction wrapped around it.
		assert.strictEqual(modelRequestsMatch(
			projectModelRequest(request([{ role: 'user', content: 'Read ${workdir}/a.txt' }])),
			projectModelRequest(request([{ role: 'user', content: 'Delete ${workdir}/a.txt' }])),
		), false);
	});

	test('prose that merely contains a slash is left alone', () => {
		const prose = [
			'use a 3/4 ratio',
			'on 2024/01/02 we shipped',
			'Reply with exactly "hello world".',
		];
		assert.deepStrictEqual(
			prose.map(text => (projectModelRequest(request([{ role: 'user', content: text }])).messages[0].content)),
			prose,
		);
	});

	test('a runtime-authored change-notice preamble does not desync a capture on a CLI bump', () => {
		// A newer CLI began prepending a `<tools_changed_notice>` block to the
		// user turn when a plan-mode turn drops `exit_plan_mode`. The host
		// composed the same question, so eliding the runtime's preamble on the
		// live side matches it against a capture recorded before the change.
		const recorded = request([{ role: 'user', content: 'What did the plan say to print? Reply with exactly "hello world".' }]);
		const live = request([{
			role: 'user', content: [
				'<tools_changed_notice>',
				'Tools no longer available: exit_plan_mode',
				'</tools_changed_notice>',
				'',
				'What did the plan say to print? Reply with exactly "hello world".',
			].join('\n'),
		}]);
		assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
	});

	test('the question wrapped around a change-notice preamble still has to match', () => {
		// Eliding the runtime preamble must not elide the user's own question.
		const notice = '<mode_changed_notice>\nSwitched to default mode.\n</mode_changed_notice>\n\n';
		assert.strictEqual(modelRequestsMatch(
			projectModelRequest(request([{ role: 'user', content: notice + 'print the plan' }])),
			projectModelRequest(request([{ role: 'user', content: notice + 'delete the plan' }])),
		), false);
	});

	test('a tool input matches regardless of key order', () => {
		// The `input` is JSON the model produced; its key order is not
		// guaranteed to survive a re-record or a YAML round-trip, and comparing
		// raw JSON would report identical requests as a regression.
		const toolUse = (input: Record<string, unknown>) => request([{
			role: 'assistant', content: [{ type: 'tool_use', name: 'bash', input }],
		}]);
		assert.ok(modelRequestsMatch(
			projectModelRequest(toolUse({ command: 'echo hi', description: 'say hi' })),
			projectModelRequest(toolUse({ description: 'say hi', command: 'echo hi' })),
		));
	});

	test('a different tool input value is still a mismatch', () => {
		// Key-order tolerance must not become value tolerance.
		const toolUse = (input: Record<string, unknown>) => request([{
			role: 'assistant', content: [{ type: 'tool_use', name: 'bash', input }],
		}]);
		assert.strictEqual(modelRequestsMatch(
			projectModelRequest(toolUse({ command: 'echo hi' })),
			projectModelRequest(toolUse({ command: 'echo bye' })),
		), false);
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
