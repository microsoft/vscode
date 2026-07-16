/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { replayThreadToTurns } from '../../../node/codex/codexReplayMapper.js';
import { ResponsePartKind, TurnState } from '../../../common/state/sessionState.js';

suite('codexReplayMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty thread → no turns', () => {
		const turns = replayThreadToTurns({ id: 'thr', turns: [] } as never);
		assert.deepStrictEqual(turns, []);
	});

	test('thread with one user/agent exchange → one Turn', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'hi', text_elements: [] }] },
					{ type: 'agentMessage', id: 'a1', text: 'hello back', phase: null, memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].id, 'turn_a');
		assert.strictEqual(turns[0].message.text, 'hi');
		assert.strictEqual(turns[0].state, TurnState.Complete);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0];
		assert.strictEqual(part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((part as { content: string }).content, 'hello back');
	});

	test('failed turn maps to TurnState.Error', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'q', text_elements: [] }] },
				],
				itemsView: { type: 'full' } as never,
				status: 'failed' as never,
				error: { message: 'oops' } as never,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].state, TurnState.Error);
	});

	test('turn with no recognizable items is dropped', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'plan', id: 'p', text: 'planning' } as never,
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.deepStrictEqual(turns, []);
	});

	test('multi-turn thread preserves order', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [
				{
					id: 't1',
					items: [
						{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'first', text_elements: [] }] },
						{ type: 'agentMessage', id: 'a', text: 'one', phase: null, memoryCitation: null },
					],
					itemsView: { type: 'full' } as never,
					status: 'completed' as never,
					error: null, startedAt: null, completedAt: null, durationMs: null,
				},
				{
					id: 't2',
					items: [
						{ type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'second', text_elements: [] }] },
						{ type: 'agentMessage', id: 'a2', text: 'two', phase: null, memoryCitation: null },
					],
					itemsView: { type: 'full' } as never,
					status: 'completed' as never,
					error: null, startedAt: null, completedAt: null, durationMs: null,
				},
			],
		} as never);
		assert.deepStrictEqual(turns.map(t => t.id), ['t1', 't2']);
	});

	test('commandExecution renders a completed terminal tool call', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'run it', text_elements: [] }] },
					{
						type: 'commandExecution', id: 'c1',
						command: '/bin/zsh -lc \'ls -la\'', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: 'total 0', exitCode: 0, durationMs: 5,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0] as { kind: ResponsePartKind; toolCall: { toolName: string; invocationMessage: string; pastTenseMessage: string; success: boolean; content?: { text: string }[] } };
		assert.deepStrictEqual({
			kind: part.kind,
			toolName: part.toolCall.toolName,
			invocationMessage: part.toolCall.invocationMessage,
			pastTenseMessage: part.toolCall.pastTenseMessage,
			success: part.toolCall.success,
			output: part.toolCall.content?.[0].text,
		}, {
			kind: ResponsePartKind.ToolCall,
			toolName: 'shell',
			invocationMessage: 'ls -la',
			pastTenseMessage: 'Ran `ls -la`',
			success: true,
			output: 'total 0',
		});
	});

	test('commandExecution coalesces a sandbox pre-flight with its re-run into one box', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'curl it', text_elements: [] }] },
					// Pre-flight: same command, no output, success → deferred.
					{
						type: 'commandExecution', id: 'pre',
						command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: '', exitCode: 0, durationMs: 3,
					},
					// Escalated re-run: same command, real output.
					{
						type: 'commandExecution', id: 'esc',
						command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: 'Example Domain', exitCode: 0, durationMs: 30,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		// Exactly one box — the pre-flight is coalesced away.
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0] as { toolCall: { content?: { text: string }[] } };
		assert.strictEqual(part.toolCall.content?.[0].text, 'Example Domain');
	});
});
