/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { readAgentMessageDelegationMeta } from '../../../common/meta/agentMessageDelegationMeta.js';
import { createCodexSessionMapState, extractUserInputText, finalizeCodexTurnMapState, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageModelCallCompleted, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, resetCodexTurnMapState, turnStateFromStatus } from '../../../node/codex/codexMapAppServerEvents.js';
import { ActionType, type ChatAction, type SessionAction } from '../../../common/state/sessionActions.js';
import { chatReducer } from '../../../common/state/protocol/reducers.js';
import { ChatOriginKind, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState, type ChatState } from '../../../common/state/sessionState.js';
import { ActiveClientToolSet } from '../../../node/activeClientState.js';

/** Extracts the content of a Markdown response part emitted by a mapper action. */
function markdownPartContent(action: SessionAction | ChatAction | undefined): string | undefined {
	return action?.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown
		? action.part.content
		: undefined;
}

suite('codexMapAppServerEvents', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('turn/started emits ChatTurnStarted with user message text', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnStarted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [{
					type: 'userMessage',
					id: 'item_user',
					clientId: null,
					content: [{ type: 'text', text: 'hello', text_elements: [] }],
				}],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: 1_752_012_321,
				completedAt: null,
				durationMs: null,
			},
		}, 'fallback');
		assert.strictEqual(state.currentTurnId, 'turn_a');
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatTurnStarted,
			turnId: 'turn_a',
			startedAt: '2025-07-08T22:05:21.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		}]);
	});

	test('turn/started falls back to provided text when items has no userMessage', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnStarted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_b',
				items: [],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, 'the prompt');
		assert.strictEqual((actions[0] as { message: { text: string } }).message.text, 'the prompt');
	});

	test('turn/started exposes a delegated prompt without its private envelope', () => {
		const actions = mapTurnStarted(createCodexSessionMapState(), {
			threadId: 'thr_1',
			turn: {
				id: 'turn_delegated',
				items: [{
					type: 'userMessage',
					id: 'item_user',
					clientId: null,
					content: [{
						type: 'text',
						text: '<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Review &lt;this&gt;</input></codex_delegation>',
						text_elements: [],
					}],
				}],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, '');
		const action = actions[0];
		assert.strictEqual(action.type, ActionType.ChatTurnStarted);
		if (action.type !== ActionType.ChatTurnStarted) {
			return;
		}
		assert.deepStrictEqual({
			text: action.message.text,
			delegation: readAgentMessageDelegationMeta(action.message),
		}, {
			text: 'Review <this>',
			delegation: { sourceThreadId: 'source-thread' },
		});
	});

	test('turn/started uses a current timestamp when Codex omits startedAt', () => {
		const before = new Date().toISOString();
		const actions = mapTurnStarted(createCodexSessionMapState(), {
			threadId: 'thr_1',
			turn: {
				id: 'turn_c',
				items: [],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, 'prompt');

		const startedAt = actions[0].type === ActionType.ChatTurnStarted ? actions[0].startedAt : undefined;
		assert.ok(typeof startedAt === 'string' && startedAt >= before && startedAt <= new Date().toISOString());
	});

	test('item/started for agentMessage seeds a markdown part', () => {
		const state = createCodexSessionMapState();
		const actions = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1',
			turnId: 'turn_a',
			startedAtMs: 0,
		});
		assert.strictEqual(actions.length, 1);
		const a = actions[0] as { type: ActionType; turnId: string; part: { kind: ResponsePartKind; id: string; content: string } };
		assert.strictEqual(a.type, ActionType.ChatResponsePart);
		assert.strictEqual(a.turnId, 'turn_a');
		assert.strictEqual(a.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual(typeof a.part.id, 'string');
		assert.ok(a.part.id.length > 0);
		assert.strictEqual(state.itemToPartId.get('item_x'), a.part.id);
	});

	test('item/started for non-agentMessage item is ignored (Phase 2)', () => {
		const state = createCodexSessionMapState();
		const actions = mapItemStarted(state, {
			item: { type: 'plan', id: 'item_p', text: 'plan text' } as never,
			threadId: 'thr_1',
			turnId: 'turn_a',
			startedAtMs: 0,
		});
		assert.deepStrictEqual(actions, []);
		assert.strictEqual(state.itemToPartId.size, 0);
	});

	test('item/agentMessage/delta emits ChatDelta for known itemId', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const partId = state.itemToPartId.get('item_x')!;
		const actions = mapAgentMessageDelta(state, {
			threadId: 'thr_1',
			turnId: 'turn_a',
			itemId: 'item_x',
			delta: 'chunk',
		});
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatDelta,
			turnId: 'turn_a',
			partId,
			content: 'chunk',
		}]);
	});

	test('item/agentMessage/delta for unknown itemId is dropped', () => {
		const state = createCodexSessionMapState();
		const actions = mapAgentMessageDelta(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'unknown', delta: 'orphan',
		});
		assert.deepStrictEqual(actions, []);
	});

	test('item/reasoning summary events seed a reasoning part and stream deltas', () => {
		const state = createCodexSessionMapState();
		const start = mapReasoningSummaryPartAdded(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'rs_1', summaryIndex: 0,
		});
		const partId = state.itemToReasoningPartId.get('rs_1:summary:0');
		const delta = mapReasoningSummaryTextDelta(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'rs_1', summaryIndex: 0, delta: 'thinking',
		});
		assert.deepStrictEqual({
			start: start.map(action => action.type),
			partKind: start[0]?.type === ActionType.ChatResponsePart ? start[0].part.kind : undefined,
			delta,
		}, {
			start: [ActionType.ChatResponsePart],
			partKind: ResponsePartKind.Reasoning,
			delta: [{ type: ActionType.ChatReasoning, turnId: 'turn_a', partId, content: 'thinking' }],
		});
	});

	test('item/reasoning text delta creates a reasoning part when start was missed', () => {
		const state = createCodexSessionMapState();
		const actions = mapReasoningTextDelta(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'rs_2', contentIndex: 1, delta: 'raw thought',
		});
		const partId = state.itemToReasoningPartId.get('rs_2:text:1');
		assert.deepStrictEqual({
			types: actions.map(action => action.type),
			partKind: actions[0]?.type === ActionType.ChatResponsePart ? actions[0].part.kind : undefined,
			delta: actions[1],
		}, {
			types: [ActionType.ChatResponsePart, ActionType.ChatReasoning],
			partKind: ResponsePartKind.Reasoning,
			delta: { type: ActionType.ChatReasoning, turnId: 'turn_a', partId, content: 'raw thought' },
		});
	});

	test('thread/tokenUsage/updated emits ChatUsage for the turn', () => {
		const actions = mapTokenUsageUpdated({
			threadId: 'thr_1',
			turnId: 'turn_a',
			tokenUsage: {
				last: { inputTokens: 10, cachedInputTokens: 4, cacheWriteInputTokens: 0, outputTokens: 6, reasoningOutputTokens: 2, totalTokens: 16 },
				total: { inputTokens: 100, cachedInputTokens: 40, cacheWriteInputTokens: 0, outputTokens: 60, reasoningOutputTokens: 20, totalTokens: 160 },
				modelContextWindow: 200000,
			},
		}, 'codex-model:openai:gpt-5.6-sol');
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatUsage,
			turnId: 'turn_a',
			usage: {
				inputTokens: 10,
				outputTokens: 6,
				model: 'codex-model:openai:gpt-5.6-sol',
				cacheReadTokens: 4,
				_meta: { reasoningOutputTokens: 2, modelContextWindow: 200000 },
			},
		}]);
	});

	test('thread/tokenUsage/updated identifies one completed model call from cumulative usage', () => {
		const resource = URI.parse('agent-chat://codex/session');
		assert.deepStrictEqual(mapTokenUsageModelCallCompleted({
			threadId: 'thr_1',
			turnId: 'turn_a',
			tokenUsage: {
				last: { inputTokens: 10, cachedInputTokens: 4, cacheWriteInputTokens: 0, outputTokens: 6, reasoningOutputTokens: 2, totalTokens: 16 },
				total: { inputTokens: 100, cachedInputTokens: 40, cacheWriteInputTokens: 0, outputTokens: 60, reasoningOutputTokens: 20, totalTokens: 160 },
				modelContextWindow: 200000,
			},
		}, resource), {
			kind: 'model_call_completed',
			resource,
			turnId: 'turn_a',
			modelCallId: '100:40:0:60:20:160',
		});
	});

	test('contextCompaction item maps to visible running and completed progress', () => {
		const state = createCodexSessionMapState();
		const started = mapItemStarted(state, {
			item: { type: 'contextCompaction', id: 'compact_1' },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('compact_1')?.toolCallId;
		const completed = mapItemCompleted(state, {
			item: { type: 'contextCompaction', id: 'compact_1' },
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 1,
		});

		assert.deepStrictEqual({ started, completed, remaining: state.itemToToolCall.size }, {
			started: [
				{ type: ActionType.ChatToolCallStart, turnId: 'turn_a', toolCallId, toolName: 'compact', displayName: 'Compact conversation' },
				{ type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Compacting conversation', confirmed: ToolCallConfirmationReason.NotNeeded },
			],
			completed: [{
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn_a',
				toolCallId,
				result: { success: true, pastTenseMessage: 'Compacted conversation' },
			}],
			remaining: 0,
		});
	});

	test('item/completed for agentMessage clears the mapping', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: '', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		assert.strictEqual(state.itemToPartId.size, 1);
		mapItemCompleted(state, {
			item: { type: 'agentMessage', id: 'item_x', text: 'final', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.strictEqual(state.itemToPartId.size, 0);
	});

	test('second agentMessage in a turn is seeded with a leading block separator', () => {
		const state = createCodexSessionMapState();
		const first = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'm1', text: 'Consolidating the recommendation and tradeoffs.', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const second = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'm2', text: '## Conclusion', phase: null, memoryCitation: null },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		assert.deepStrictEqual({
			first: markdownPartContent(first[0]),
			second: markdownPartContent(second[0]),
		}, {
			first: 'Consolidating the recommendation and tradeoffs.',
			second: '\n\n## Conclusion',
		});
	});

	test('agentMessage block separator counter resets per turn', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, { item: { type: 'agentMessage', id: 'm1', text: 'a', phase: null, memoryCitation: null }, threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0 });
		mapItemStarted(state, { item: { type: 'agentMessage', id: 'm2', text: 'b', phase: null, memoryCitation: null }, threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0 });
		// A new turn resets the counter, so its first agentMessage is unseeded.
		resetCodexTurnMapState(state);
		const firstOfNextTurn = mapItemStarted(state, { item: { type: 'agentMessage', id: 'm3', text: 'c', phase: null, memoryCitation: null }, threadId: 'thr_1', turnId: 'turn_b', startedAtMs: 0 });
		assert.strictEqual(markdownPartContent(firstOfNextTurn[0]), 'c');
	});

	test('adjacent agentMessages keep a Markdown heading on its own line after coalescing', () => {
		const state = createCodexSessionMapState();
		let chat: ChatState = {
			resource: 'ahp-chat://test',
			title: 'Test',
			status: SessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			origin: { kind: ChatOriginKind.User },
			turns: [],
			activeTurn: undefined,
		};
		const apply = (actions: readonly (SessionAction | ChatAction)[]) => {
			for (const action of actions) {
				chat = chatReducer(chat, action as ChatAction);
			}
		};
		apply(mapTurnStarted(state, {
			threadId: 'thr_1',
			turn: { id: 'turn_a', items: [], itemsView: { type: 'full' } as never, status: 'inProgress' as never, error: null, startedAt: null, completedAt: null, durationMs: null },
		}, 'prompt'));
		// Preamble message, then the final-answer message; two distinct items.
		apply(mapItemStarted(state, { item: { type: 'agentMessage', id: 'm1', text: '', phase: null, memoryCitation: null }, threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0 }));
		apply(mapAgentMessageDelta(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'm1', delta: 'Consolidating the recommendation and tradeoffs.' }));
		apply(mapItemStarted(state, { item: { type: 'agentMessage', id: 'm2', text: '', phase: null, memoryCitation: null }, threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0 }));
		apply(mapAgentMessageDelta(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'm2', delta: '## Conclusion\n\nDone.' }));

		// Adjacent markdown parts are coalesced by plain concatenation, so the
		// joined text must keep `## Conclusion` at the start of a line.
		const joined = (chat.activeTurn?.responseParts ?? [])
			.map(part => part.kind === ResponsePartKind.Markdown ? part.content : '')
			.join('');
		assert.strictEqual(joined, 'Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.');
	});

	test('item/started for commandExecution emits ChatToolCallStart + Delta + Ready and registers tool-call entry', () => {
		const state = createCodexSessionMapState();
		const actions = mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1',
				command: 'ls -la', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		assert.strictEqual(actions.length, 3);
		const start = actions[0];
		const delta = actions[1];
		const ready = actions[2];
		assert.strictEqual(start.type, ActionType.ChatToolCallStart);
		assert.strictEqual(delta.type, ActionType.ChatToolCallDelta);
		assert.strictEqual(ready.type, ActionType.ChatToolCallReady);
		const entry = state.itemToToolCall.get('cmd_1');
		assert.ok(entry);
		assert.strictEqual(entry!.toolCallId, (start as { toolCallId: string }).toolCallId);
		assert.strictEqual(entry!.turnId, 'turn_a');
		assert.strictEqual((delta as { content: string }).content, 'ls -la');
		assert.strictEqual((ready as { confirmed: ToolCallConfirmationReason }).confirmed, ToolCallConfirmationReason.NotNeeded);
		assert.deepStrictEqual((start as { _meta?: Record<string, unknown> })._meta, { toolKind: 'terminal' });
	});

	test('commandExecution unwraps the OS shell wrapper for display (start + completed)', () => {
		const state = createCodexSessionMapState();
		const started = mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_wrap',
				command: '/bin/zsh -lc \'touch ~/foo\'', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const delta = started[1] as { content: string };
		const ready = started[2] as { invocationMessage: string; toolInput: string };
		// A successful no-output command is deferred to coalesce a possible
		// sandbox pre-flight re-run; with no re-run it flushes at turn end.
		const deferred = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_wrap',
				command: '/bin/zsh -lc \'touch ~/foo\'', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: '',
				exitCode: 0, durationMs: 4,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		const flushed = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [], itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		} as never);
		const complete = flushed[0] as { result: { pastTenseMessage: string } };
		assert.deepStrictEqual({
			deferred,
			delta: delta.content,
			invocationMessage: ready.invocationMessage,
			toolInput: ready.toolInput,
			pastTenseMessage: complete.result.pastTenseMessage,
		}, {
			deferred: [],
			delta: 'touch ~/foo',
			invocationMessage: 'touch ~/foo',
			toolInput: 'touch ~/foo',
			pastTenseMessage: 'Ran `touch ~/foo`',
		});
	});

	test('commandExecution coalesces a sandbox pre-flight with its approved re-run into one box', () => {
		const state = createCodexSessionMapState();
		// Pre-flight: codex runs the command in the sandbox first; it produces
		// no output and completes successfully.
		const preStarted = mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_preflight',
				command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_preflight')!.toolCallId;
		const preCompleted = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_preflight',
				command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: '', exitCode: 0, durationMs: 4,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		// Escalation: same command re-run under an approval prompt, new item id.
		const escStarted = mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_escalated',
				command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const escCompleted = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_escalated',
				command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: 'Example Domain', exitCode: 0, durationMs: 40,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		const startCount = (actions: readonly unknown[]) => actions.filter(a => (a as { type: ActionType }).type === ActionType.ChatToolCallStart).length;
		assert.deepStrictEqual({
			// exactly one box opened (pre-flight's), escalation reuses it
			starts: startCount(preStarted) + startCount(escStarted),
			// pre-flight completion deferred, escalation start emits nothing
			preCompleted,
			escStarted,
			// single completion carries the escalation's real output
			escComplete: escCompleted[0],
		}, {
			starts: 1,
			preCompleted: [],
			escStarted: [],
			escComplete: {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn_a',
				toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Ran `curl -s https://example.com`',
					content: [{ type: ToolResultContentType.Text, text: 'Example Domain' }],
					error: undefined,
				},
			},
		});
	});

	test('item/commandExecution/outputDelta streams running tool content', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_output',
				command: 'echo hi', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_output')!.toolCallId;
		const first = mapCommandExecutionOutputDelta(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'cmd_output', delta: 'hi' });
		const second = mapCommandExecutionOutputDelta(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'cmd_output', delta: '\n' });
		assert.deepStrictEqual({ first, second }, {
			first: [{ type: ActionType.ChatToolCallContentChanged, turnId: 'turn_a', toolCallId, content: [{ type: ToolResultContentType.Text, text: 'hi' }] }],
			second: [{ type: ActionType.ChatToolCallContentChanged, turnId: 'turn_a', toolCallId, content: [{ type: ToolResultContentType.Text, text: 'hi\n' }] }],
		});
	});

	test('item/completed for commandExecution falls back to streamed output when aggregated output is empty', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_streamed_output',
				command: 'echo hi', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_streamed_output')!.toolCallId;
		mapCommandExecutionOutputDelta(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'cmd_streamed_output', delta: 'hi\n' });

		const actions = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_streamed_output',
				command: 'echo hi', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: '',
				exitCode: 0, durationMs: 12,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});

		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatToolCallComplete,
			turnId: 'turn_a',
			toolCallId,
			result: {
				success: true,
				pastTenseMessage: 'Ran `echo hi`',
				content: [{ type: ToolResultContentType.Text, text: 'hi\n' }],
				error: undefined,
			},
		}]);
	});

	test('item/completed for commandExecution emits ChatToolCallComplete with aggregated output', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_2',
				command: 'echo hi', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_2')!.toolCallId;
		const actions = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_2',
				command: 'echo hi', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: 'hi\n',
				exitCode: 0, durationMs: 12,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.strictEqual(actions.length, 1);
		const complete = actions[0] as { type: ActionType; toolCallId: string; result: { success: boolean; content?: { type: ToolResultContentType; text: string }[] } };
		assert.strictEqual(complete.type, ActionType.ChatToolCallComplete);
		assert.strictEqual(complete.toolCallId, toolCallId);
		assert.strictEqual(complete.result.success, true);
		assert.deepStrictEqual(complete.result.content, [{ type: ToolResultContentType.Text, text: 'hi\n' }]);
		assert.strictEqual(state.itemToToolCall.size, 0);
	});

	test('item/completed for commandExecution with non-zero exit reports failure', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_3',
				command: 'false', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const actions = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_3',
				command: 'false', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: '',
				exitCode: 1, durationMs: 3,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		const complete = actions[0] as { result: { success: boolean; error?: { message: string } } };
		assert.strictEqual(complete.result.success, false);
		assert.strictEqual(complete.result.error?.message, 'Exit code 1');
	});

	test('webSearch item maps to search tool call lifecycle', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: {
				type: 'webSearch', id: 'web_1', query: 'vscode tests',
				action: { type: 'search', query: 'vscode tests', queries: null },
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('web_1')!.toolCallId;
		const completeActions = mapItemCompleted(state, {
			item: {
				type: 'webSearch', id: 'web_1', query: 'vscode tests',
				action: { type: 'search', query: 'vscode tests', queries: null },
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({
			startTypes: startActions.map(action => action.type),
			startMeta: startActions[0]?.type === ActionType.ChatToolCallStart ? startActions[0]._meta : undefined,
			delta: startActions[1],
			ready: startActions[2],
			complete: completeActions,
			remainingToolCalls: state.itemToToolCall.size,
		}, {
			startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
			startMeta: { toolKind: 'search' },
			delta: { type: ActionType.ChatToolCallDelta, turnId: 'turn_a', toolCallId, content: 'vscode tests' },
			ready: { type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Searching the web for vscode tests', toolInput: 'vscode tests', confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: 'search' } },
			complete: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'Searched the web for vscode tests' } }],
			remainingToolCalls: 0,
		});
	});

	test('imageGeneration item maps to an image tool call lifecycle', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: { type: 'imageGeneration', id: 'image_1', status: 'in_progress', revisedPrompt: null, result: '' },
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('image_1')!.toolCallId;
		const completeActions = mapItemCompleted(state, {
			item: { type: 'imageGeneration', id: 'image_1', status: 'completed', revisedPrompt: 'A watercolor fox', result: 'aW1hZ2U=' },
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({
			start: startActions,
			complete: completeActions,
			remainingToolCalls: state.itemToToolCall.size,
		}, {
			start: [{
				type: ActionType.ChatToolCallStart,
				turnId: 'turn_a',
				toolCallId,
				toolName: 'image_gen.imagegen',
				displayName: 'Generate image',
			}, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn_a',
				toolCallId,
				invocationMessage: 'Generating image',
				toolInput: '{"prompt":"Generate image"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			}],
			complete: [{
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn_a',
				toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Generated image',
					content: [{ type: ToolResultContentType.EmbeddedResource, data: 'aW1hZ2U=', contentType: 'image/png' }],
				},
			}],
			remainingToolCalls: 0,
		});
	});

	test('fileChange item maps to file edit tool call lifecycle', () => {
		const state = createCodexSessionMapState();
		const changes = [{ path: 'src/a.ts', kind: { type: 'update', move_path: null }, diff: '@@ -1 +1 @@\n-old\n+new' }] as const;
		const startActions = mapItemStarted(state, {
			item: { type: 'fileChange', id: 'file_1', changes, status: 'inProgress' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('file_1')!.toolCallId;
		const patchActions = mapFileChangePatchUpdated(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'file_1', changes: [{ path: 'src/b.ts', kind: { type: 'add' }, diff: '+hello' }] });
		const completeActions = mapItemCompleted(state, {
			item: { type: 'fileChange', id: 'file_1', changes, status: 'completed' } as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({
			startTypes: startActions.map(action => action.type),
			delta: startActions[1],
			ready: startActions[2],
			initialContent: startActions[3],
			patchActions,
			completeActions,
			remainingToolCalls: state.itemToToolCall.size,
		}, {
			startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady, ActionType.ChatToolCallContentChanged],
			delta: { type: ActionType.ChatToolCallDelta, turnId: 'turn_a', toolCallId, content: 'update: src/a.ts' },
			ready: { type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'update: src/a.ts', toolInput: 'update: src/a.ts', confirmed: ToolCallConfirmationReason.NotNeeded },
			initialContent: { type: ActionType.ChatToolCallContentChanged, turnId: 'turn_a', toolCallId, content: [{ type: ToolResultContentType.Text, text: 'update: src/a.ts\n@@ -1 +1 @@\n-old\n+new' }] },
			patchActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: 'turn_a', toolCallId, content: [{ type: ToolResultContentType.Text, text: 'add: src/b.ts\n+hello' }] }],
			completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'update: src/a.ts', content: [{ type: ToolResultContentType.Text, text: 'update: src/a.ts\n@@ -1 +1 @@\n-old\n+new' }] } }],
			remainingToolCalls: 0,
		});
	});

	test('mcpToolCall item maps to tool call lifecycle with progress', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: { type: 'mcpToolCall', id: 'mcp_1', server: 'github', tool: 'search', status: 'inProgress', arguments: { query: 'vscode' }, mcpAppResourceUri: undefined, pluginId: null, result: null, error: null, durationMs: null } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('mcp_1')!.toolCallId;
		const progressActions = mapMcpToolCallProgress(state, { threadId: 'thr_1', turnId: 'turn_a', itemId: 'mcp_1', message: 'Searching' });
		const completeActions = mapItemCompleted(state, {
			item: { type: 'mcpToolCall', id: 'mcp_1', server: 'github', tool: 'search', status: 'completed', arguments: { query: 'vscode' }, mcpAppResourceUri: undefined, pluginId: null, result: { content: ['done'], structuredContent: { count: 1 }, _meta: null }, error: null, durationMs: 5 } as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({
			startTypes: startActions.map(action => action.type),
			delta: startActions[1],
			ready: startActions[2],
			progressActions,
			completeActions,
			remainingToolCalls: state.itemToToolCall.size,
		}, {
			startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
			delta: { type: ActionType.ChatToolCallDelta, turnId: 'turn_a', toolCallId, content: '{\n  "query": "vscode"\n}' },
			ready: { type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Calling github.search', toolInput: '{\n  "query": "vscode"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
			progressActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: 'turn_a', toolCallId, content: [{ type: ToolResultContentType.Text, text: 'Searching' }] }],
			completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'Called github.search', content: [{ type: ToolResultContentType.Text, text: 'done\n{\n  "count": 1\n}' }] } }],
			remainingToolCalls: 0,
		});
	});

	test('mcpToolCall start carries an MCP contributor when the server has a customization', () => {
		const state = createCodexSessionMapState();
		state.mcpCustomizationIds.set('github', 'cust-gh');
		const startActions = mapItemStarted(state, {
			item: {
				type: 'mcpToolCall', id: 'mcp_c', server: 'github', tool: 'search',
				status: 'inProgress', arguments: {}, mcpAppResourceUri: undefined,
				pluginId: null, result: null, error: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const start = startActions[0];
		if (start.type !== ActionType.ChatToolCallStart) {
			throw new Error('expected a ChatToolCallStart action');
		}
		assert.deepStrictEqual(start.contributor, { kind: ToolCallContributorKind.MCP, customizationId: 'cust-gh' });
	});

	test('mcpToolCall start carries no contributor when the server has no customization', () => {
		const state = createCodexSessionMapState();
		// mcpCustomizationIds is empty: the agent has not applied an MCP
		// inventory yet, so the start must not stamp a (bogus) MCP contributor —
		// the tool then reports the default `agentHost` source.
		const startActions = mapItemStarted(state, {
			item: {
				type: 'mcpToolCall', id: 'mcp_n', server: 'github', tool: 'search',
				status: 'inProgress', arguments: {}, mcpAppResourceUri: undefined,
				pluginId: null, result: null, error: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const start = startActions[0];
		if (start.type !== ActionType.ChatToolCallStart) {
			throw new Error('expected a ChatToolCallStart action');
		}
		assert.strictEqual(start.contributor, undefined);
	});

	test('a host-declined commandExecution reports result.error.code = denied', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_d',
				command: 'rm file', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const entry = state.itemToToolCall.get('cmd_d');
		if (!entry) {
			throw new Error('expected a tracked tool call');
		}
		// The host declined the approval (recorded by respondToPermissionRequest).
		state.declinedToolCalls.add(entry.toolCallId);
		const actions = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_d',
				command: 'rm file', cwd: '/tmp', processId: null,
				source: 'agent' as never, status: 'failed' as never,
				commandActions: [], aggregatedOutput: null,
				exitCode: null, durationMs: 1,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		const complete = actions[0];
		if (complete.type !== ActionType.ChatToolCallComplete) {
			throw new Error('expected a ChatToolCallComplete action');
		}
		assert.strictEqual(complete.result.success, false);
		assert.strictEqual(complete.result.error?.code, 'denied');
	});

	test('a host-declined mcpToolCall reports result.error.code = denied', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'mcpToolCall', id: 'mcp_d', server: 'github', tool: 'search',
				status: 'inProgress', arguments: {}, mcpAppResourceUri: undefined,
				pluginId: null, result: null, error: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const entry = state.itemToToolCall.get('mcp_d');
		if (!entry) {
			throw new Error('expected a tracked tool call');
		}
		// The host declined the approval (recorded by respondToPermissionRequest).
		// The decline is drained once in the shared completion prologue, so a
		// non-command tool type is classified as a denial just like a command.
		state.declinedToolCalls.add(entry.toolCallId);
		const actions = mapItemCompleted(state, {
			item: {
				type: 'mcpToolCall', id: 'mcp_d', server: 'github', tool: 'search',
				status: 'failed', arguments: {}, mcpAppResourceUri: undefined,
				pluginId: null, result: null, error: null, durationMs: 1,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		const complete = actions[0];
		if (complete.type !== ActionType.ChatToolCallComplete) {
			throw new Error('expected a ChatToolCallComplete action');
		}
		assert.strictEqual(complete.result.success, false);
		assert.strictEqual(complete.result.error?.code, 'denied');
	});

	test('collabAgentToolCall spawnAgent start renders compactly (no prompt dump — the child conversation shows it)', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_1', tool: 'spawnAgent',
				status: 'inProgress', senderThreadId: 'thr_1', receiverThreadIds: [],
				prompt: 'Investigate the failing test', model: 'gpt-5.5',
				reasoningEffort: null, agentsStates: {},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('collab_1')!.toolCallId;
		// spawnAgent opens a read-only child conversation (the host attaches
		// the subagent-discovery block to this tool call), so the raw prompt
		// is deliberately NOT dumped into the tool box.
		assert.deepStrictEqual({
			actions: startActions,
			entryToolName: state.itemToToolCall.get('collab_1')!.toolName,
		}, {
			actions: [
				{ type: ActionType.ChatToolCallStart, turnId: 'turn_a', toolCallId, toolName: 'codex.spawnAgent', displayName: 'Spawn agent' },
				{ type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Spawning agent', confirmed: ToolCallConfirmationReason.NotNeeded },
			],
			entryToolName: 'codex.spawnAgent',
		});
	});

	test('collabAgentToolCall sendInput start still carries the prompt (only spawnAgent is compacted)', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_si', tool: 'sendInput',
				status: 'inProgress', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1'],
				prompt: 'Also check the CHANGELOG', model: null,
				reasoningEffort: null, agentsStates: {},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('collab_si')!.toolCallId;
		assert.deepStrictEqual(startActions, [
			{ type: ActionType.ChatToolCallStart, turnId: 'turn_a', toolCallId, toolName: 'codex.sendInput', displayName: 'Send input to agent' },
			{ type: ActionType.ChatToolCallDelta, turnId: 'turn_a', toolCallId, content: 'Also check the CHANGELOG' },
			{ type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Sending input to agent', toolInput: 'Also check the CHANGELOG', confirmed: ToolCallConfirmationReason.NotNeeded },
		]);
	});

	test('collabAgentToolCall spawnAgent completed renders the subagent result as tool output', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_2', tool: 'spawnAgent',
				status: 'inProgress', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1'],
				prompt: 'Investigate the failing test', model: 'gpt-5.5',
				reasoningEffort: null, agentsStates: {},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('collab_2')!.toolCallId;
		const actions = mapItemCompleted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_2', tool: 'spawnAgent',
				status: 'completed', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1'],
				prompt: 'Investigate the failing test', model: 'gpt-5.5',
				reasoningEffort: null,
				agentsStates: { sub_1: { status: 'completed', message: 'Found the bug in foo.ts' } },
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({ actions, remainingToolCalls: state.itemToToolCall.size }, {
			actions: [{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Spawned agent',
					content: [{ type: ToolResultContentType.Text, text: 'Completed — Found the bug in foo.ts' }],
				},
			}],
			remainingToolCalls: 0,
		});
	});

	test('collabAgentToolCall wait aggregates results from multiple subagents', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_wait', tool: 'wait',
				status: 'inProgress', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1', 'sub_2'],
				prompt: null, model: null, reasoningEffort: null, agentsStates: {},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('collab_wait')!.toolCallId;
		const actions = mapItemCompleted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_wait', tool: 'wait',
				status: 'completed', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1', 'sub_2'],
				prompt: null, model: null, reasoningEffort: null,
				agentsStates: {
					sub_1: { status: 'completed', message: 'Migration finished' },
					sub_2: { status: 'running', message: 'Still analysing' },
				},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
			result: {
				success: true,
				pastTenseMessage: 'Finished waiting',
				content: [{ type: ToolResultContentType.Text, text: 'Agent 1: Completed — Migration finished\nAgent 2: Running — Still analysing' }],
			},
		}]);
	});

	test('collabAgentToolCall failure reports the errored subagent state', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_fail', tool: 'spawnAgent',
				status: 'inProgress', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1'],
				prompt: 'Refactor the parser', model: 'gpt-5.5', reasoningEffort: null, agentsStates: {},
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('collab_fail')!.toolCallId;
		const actions = mapItemCompleted(state, {
			item: {
				type: 'collabAgentToolCall', id: 'collab_fail', tool: 'spawnAgent',
				status: 'failed', senderThreadId: 'thr_1', receiverThreadIds: ['sub_1'],
				prompt: 'Refactor the parser', model: 'gpt-5.5', reasoningEffort: null,
				agentsStates: { sub_1: { status: 'errored', message: 'Model unavailable' } },
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
			result: {
				success: false,
				pastTenseMessage: 'Spawn agent failed',
				content: [{ type: ToolResultContentType.Text, text: 'Errored — Model unavailable' }],
				error: { message: 'Collab agent failed' },
			},
		}]);
	});

	test('dynamicToolCall item carries a Client contributor when a client owns the tool', () => {
		const toolSet = new ActiveClientToolSet();
		toolSet.set('win-7', [{ name: 'get_magic_word' }]);
		const state = createCodexSessionMapState(new Set(), toolSet);
		const startActions = mapItemStarted(state, {
			item: { type: 'dynamicToolCall', id: 'dyn_2', namespace: null, tool: 'get_magic_word', arguments: {}, status: 'inProgress', contentItems: null, success: null, durationMs: null } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const start = startActions[0] as { type: ActionType; toolName: string; contributor?: { kind: ToolCallContributorKind; clientId: string } };
		assert.deepStrictEqual({
			type: start.type,
			toolName: start.toolName,
			contributor: start.contributor,
		}, {
			type: ActionType.ChatToolCallStart,
			toolName: 'get_magic_word',
			contributor: { kind: ToolCallContributorKind.Client, clientId: 'win-7' },
		});
	});

	test('dynamicToolCall item omits the Client contributor for a server tool', () => {
		// A server tool is registered under its bare name and executes
		// in-process, so it must not carry a Client contributor even when a
		// workbench client owns the (other) client tools.
		const toolSet = new ActiveClientToolSet();
		toolSet.set('win-7', [{ name: 'get_magic_word' }]);
		const state = createCodexSessionMapState(new Set(['addComment']), toolSet);
		const startActions = mapItemStarted(state, {
			item: { type: 'dynamicToolCall', id: 'dyn_3', namespace: null, tool: 'addComment', arguments: {}, status: 'inProgress', contentItems: null, success: null, durationMs: null } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const start = startActions[0] as { type: ActionType; toolName: string; contributor?: { kind: ToolCallContributorKind; clientId: string } };
		assert.deepStrictEqual({
			type: start.type,
			toolName: start.toolName,
			contributor: start.contributor,
		}, {
			type: ActionType.ChatToolCallStart,
			toolName: 'addComment',
			contributor: undefined,
		});
	});

	test('dynamicToolCall item maps to tool call lifecycle', () => {
		const state = createCodexSessionMapState();
		const startActions = mapItemStarted(state, {
			item: { type: 'dynamicToolCall', id: 'dyn_1', namespace: 'client', tool: 'lookup', arguments: { symbol: 'A' }, status: 'inProgress', contentItems: null, success: null, durationMs: null } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('dyn_1')!.toolCallId;
		const completeActions = mapItemCompleted(state, {
			item: { type: 'dynamicToolCall', id: 'dyn_1', namespace: 'client', tool: 'lookup', arguments: { symbol: 'A' }, status: 'completed', contentItems: [{ type: 'inputText', text: 'Found A' }, { type: 'inputImage', imageUrl: 'https://example.test/a.png' }], success: true, durationMs: 5 } as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 0,
		});
		assert.deepStrictEqual({
			startTypes: startActions.map(action => action.type),
			delta: startActions[1],
			ready: startActions[2],
			completeActions,
			remainingToolCalls: state.itemToToolCall.size,
		}, {
			startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
			delta: { type: ActionType.ChatToolCallDelta, turnId: 'turn_a', toolCallId, content: '{\n  "symbol": "A"\n}' },
			ready: { type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'Calling client.lookup', toolInput: '{\n  "symbol": "A"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
			completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'Called client.lookup', content: [{ type: ToolResultContentType.Text, text: 'Found A\nhttps://example.test/a.png' }] } }],
			remainingToolCalls: 0,
		});
	});

	test('turn/completed with status=completed emits ChatTurnComplete', () => {
		const state = createCodexSessionMapState();
		state.currentTurnId = 'turn_a';
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [], itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: 1_752_012_321, completedAt: 1_752_012_323.5, durationMs: 2500,
			},
		});
		assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnComplete, turnId: 'turn_a', duration: 2500 }]);
		assert.strictEqual(state.currentTurnId, undefined);
	});

	test('turn/completed does not infer dropped command success without an exit status', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
				processId: null, source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_1')!.toolCallId;
		const responseStarted = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'msg_1', text: '' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 1,
		});
		const responseDelta = mapAgentMessageDelta(state, {
			threadId: 'thr_1', turnId: 'turn_a', itemId: 'msg_1', delta: 'done',
		});
		assert.deepStrictEqual({ responseStarted, responseDelta }, { responseStarted: [], responseDelta: [] });

		const partId = state.itemToPartId.get('msg_1')!;
		const notification = {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [{
					type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
					processId: null, source: 'agent', status: 'completed', commandActions: [],
					aggregatedOutput: '', exitCode: null, durationMs: 2,
				} as never],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: 3,
			},
		};
		const actions = mapTurnCompleted(state, notification);

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
				result: { success: false, pastTenseMessage: 'Stopped shell', content: undefined, error: { message: 'Turn completed before the tool reported completion' } },
			},
			{ type: ActionType.ChatResponsePart, turnId: 'turn_a', part: { kind: ResponsePartKind.Markdown, id: partId, content: '' } },
			{ type: ActionType.ChatDelta, turnId: 'turn_a', partId, content: 'done' },
			{ type: ActionType.ChatTurnComplete, turnId: 'turn_a', duration: 3 },
		]);
	});

	test('turn/completed recovers a command result with an observed exit status', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
				processId: null, source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_1')!.toolCallId;
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [{
					type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
					processId: null, source: 'agent', status: 'completed', commandActions: [],
					aggregatedOutput: 'done', exitCode: 0, durationMs: 2,
				} as never],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: 3,
			},
		});

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Ran `node -e writeFile()`',
					content: [{ type: ToolResultContentType.Text, text: 'done' }],
					error: undefined,
				},
			},
			{ type: ActionType.ChatTurnComplete, turnId: 'turn_a', duration: 3 },
		]);
	});

	test('turn/completed does not recover a non-command tool through the pure mapper', () => {
		const state = createCodexSessionMapState();
		state.itemToToolCall.set('tool_1', { toolCallId: 'tc_1', turnId: 'turn_a', toolName: 'web_search', output: '' });
		const responseStarted = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'msg_1', text: '' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 1,
		});
		const partId = state.itemToPartId.get('msg_1')!;
		assert.deepStrictEqual(responseStarted, [
			{ type: ActionType.ChatResponsePart, turnId: 'turn_a', part: { kind: ResponsePartKind.Markdown, id: partId, content: '' } },
		]);

		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a',
				items: [{ type: 'webSearch', id: 'tool_1', query: 'query', action: { type: 'search', query: 'query' } } as never],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: 3,
			},
		});

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId: 'tc_1',
				result: { success: false, pastTenseMessage: 'Stopped web_search', content: undefined, error: { message: 'Turn completed before the tool reported completion' } },
			},
			{ type: ActionType.ChatTurnComplete, turnId: 'turn_a', duration: 3 },
		]);
	});

	test('superseding a pending pre-flight releases its deferred response before the next response', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
				processId: null, source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});

		const toolCallId = state.itemToToolCall.get('cmd_1')!.toolCallId;
		const firstResponse = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'msg_1', text: '' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 1,
		});
		assert.deepStrictEqual(firstResponse, []);
		const firstPartId = state.itemToPartId.get('msg_1')!;
		const completed = mapItemCompleted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
				processId: null, source: 'agent' as never, status: 'completed' as never,
				commandActions: [], aggregatedOutput: '', exitCode: 0, durationMs: 2,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', completedAtMs: 2,
		});
		assert.deepStrictEqual(completed, []);
		const nextResponse = mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'msg_2', text: '' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 3,
		});
		const secondPartId = state.itemToPartId.get('msg_2')!;

		assert.deepStrictEqual(nextResponse, [
			{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Ran `node -e writeFile()`',
					content: undefined,
					error: undefined,
				},
			},
			{ type: ActionType.ChatResponsePart, turnId: 'turn_a', part: { kind: ResponsePartKind.Markdown, id: firstPartId, content: '' } },
			{ type: ActionType.ChatResponsePart, turnId: 'turn_a', part: { kind: ResponsePartKind.Markdown, id: secondPartId, content: '\n\n' } },
		]);
	});

	test('steering finalization completes open commands before deferred response actions', () => {
		const state = createCodexSessionMapState();
		mapItemStarted(state, {
			item: {
				type: 'commandExecution', id: 'cmd_1', command: 'node -e writeFile()', cwd: '/tmp',
				processId: null, source: 'agent' as never, status: 'inProgress' as never,
				commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
			} as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 0,
		});
		const toolCallId = state.itemToToolCall.get('cmd_1')!.toolCallId;
		assert.deepStrictEqual(mapItemStarted(state, {
			item: { type: 'agentMessage', id: 'msg_1', text: 'done' } as never,
			threadId: 'thr_1', turnId: 'turn_a', startedAtMs: 1,
		}), []);
		const partId = state.itemToPartId.get('msg_1')!;

		const actions = finalizeCodexTurnMapState(state, 'Turn was superseded by a steering message before the tool reported completion');

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId,
				result: {
					success: false,
					pastTenseMessage: 'Stopped shell',
					content: undefined,
					error: { message: 'Turn was superseded by a steering message before the tool reported completion' },
				},
			},
			{ type: ActionType.ChatResponsePart, turnId: 'turn_a', part: { kind: ResponsePartKind.Markdown, id: partId, content: 'done' } },
		]);
		assert.deepStrictEqual({
			toolCalls: state.itemToToolCall.size,
			deferredResponses: state.deferredResponseActions.length,
			pendingPreflight: state.pendingPreflight,
		}, {
			toolCalls: 0,
			deferredResponses: 0,
			pendingPreflight: undefined,
		});
	});

	test('turn/completed completes orphaned tool calls before completing the turn', () => {
		const state = createCodexSessionMapState();
		state.itemToToolCall.set('cmd_1', { toolCallId: 'tc_1', turnId: 'turn_a', toolName: 'shell', output: 'partial output' });
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a', items: [], itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		}, 321);
		const completeAction = actions[1] as { type: ActionType; turnId: string; duration: number };
		const { duration: completeDuration, ...completeRest } = completeAction;
		assert.deepStrictEqual({ actions: [actions[0], completeRest], remainingToolCalls: state.itemToToolCall.size }, {
			actions: [
				{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId: 'tc_1', result: { success: false, pastTenseMessage: 'Stopped shell', content: [{ type: ToolResultContentType.Text, text: 'partial output' }], error: { message: 'Turn completed before the tool reported completion' } } },
				{ type: ActionType.ChatTurnComplete, turnId: 'turn_a' },
			],
			remainingToolCalls: 0,
		});
		assert.strictEqual(completeDuration, 321);
	});

	test('turn/completed with status=failed emits ChatError + ChatTurnComplete', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a', items: [], itemsView: { type: 'full' } as never,
				status: 'failed' as never,
				error: { message: 'boom' } as never,
				startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.deepStrictEqual(actions, [
			{ type: ActionType.ChatError, turnId: 'turn_a', duration: 0, part: { kind: ResponsePartKind.Error, error: { errorType: 'CodexError', message: 'boom' } } },
			{ type: ActionType.ChatTurnComplete, turnId: 'turn_a', duration: 0 },
		]);
	});

	test('turn/completed with status=interrupted emits ChatTurnCancelled', () => {
		const state = createCodexSessionMapState();
		const actions = mapTurnCompleted(state, {
			threadId: 'thr_1',
			turn: {
				id: 'turn_a', items: [], itemsView: { type: 'full' } as never,
				status: 'interrupted' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnCancelled, turnId: 'turn_a', duration: 0 }]);
	});

	test('turnStateFromStatus maps strings correctly', () => {
		assert.strictEqual(turnStateFromStatus('completed'), TurnState.Complete);
		assert.strictEqual(turnStateFromStatus('interrupted'), TurnState.Cancelled);
		assert.strictEqual(turnStateFromStatus('failed'), TurnState.Error);
		assert.strictEqual(turnStateFromStatus('weird'), TurnState.Complete);
	});

	test('extractUserInputText joins text inputs and ignores non-text', () => {
		assert.strictEqual(
			extractUserInputText([
				{ type: 'text', text: 'first', text_elements: [] },
				{ type: 'image', url: 'http://x/y.png' },
				{ type: 'text', text: 'second', text_elements: [] },
				{ type: 'mention', name: 'foo', path: '/foo' },
			]),
			'first\n\nsecond',
		);
		assert.strictEqual(extractUserInputText([]), '');
		assert.strictEqual(extractUserInputText([{ type: 'image', url: 'http://x/y.png' }]), '');
	});

	test('resetCodexTurnMapState clears item maps but preserves currentTurnId', () => {
		const state = createCodexSessionMapState();
		state.currentTurnId = 'turn_a';
		state.itemToPartId.set('i1', 'p1');
		state.itemToToolCall.set('i2', { toolCallId: 'tc', turnId: 'turn_a', toolName: 'shell', output: '' });
		state.itemToReasoningPartId.set('i3', 'r1');
		state.declinedToolCalls.add('tc-stale');
		resetCodexTurnMapState(state);
		assert.deepStrictEqual({
			currentTurnId: state.currentTurnId,
			parts: state.itemToPartId.size,
			toolCalls: state.itemToToolCall.size,
			reasoning: state.itemToReasoningPartId.size,
			declined: state.declinedToolCalls.size,
		}, { currentTurnId: 'turn_a', parts: 0, toolCalls: 0, reasoning: 0, declined: 0 });
	});
});
