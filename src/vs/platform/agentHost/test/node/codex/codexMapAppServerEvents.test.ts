/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createCodexSessionMapState, extractUserInputText, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, resetCodexTurnMapState, turnStateFromStatus } from '../../../node/codex/codexMapAppServerEvents.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from '../../../common/state/sessionState.js';
import { ActiveClientToolSet } from '../../../node/activeClientState.js';

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
					content: [{ type: 'text', text: 'hello', text_elements: [] }],
				}],
				itemsView: { type: 'full' } as never,
				status: 'inProgress' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			},
		}, 'fallback');
		assert.strictEqual(state.currentTurnId, 'turn_a');
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatTurnStarted,
			turnId: 'turn_a',
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
				last: { inputTokens: 10, cachedInputTokens: 4, outputTokens: 6, reasoningOutputTokens: 2, totalTokens: 16 },
				total: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 60, reasoningOutputTokens: 20, totalTokens: 160 },
				modelContextWindow: 200000,
			},
		});
		assert.deepStrictEqual(actions, [{
			type: ActionType.ChatUsage,
			turnId: 'turn_a',
			usage: {
				inputTokens: 10,
				outputTokens: 6,
				cacheReadTokens: 4,
				_meta: { reasoningOutputTokens: 2, modelContextWindow: 200000 },
			},
		}]);
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
			ready: { type: ActionType.ChatToolCallReady, turnId: 'turn_a', toolCallId, invocationMessage: 'vscode tests', toolInput: 'vscode tests', confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: 'search' } },
			complete: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'Searched vscode tests' } }],
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
			completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId, result: { success: true, pastTenseMessage: 'Applied file changes', content: [{ type: ToolResultContentType.Text, text: 'update: src/a.ts\n@@ -1 +1 @@\n-old\n+new' }] } }],
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
				error: null, startedAt: null, completedAt: null, durationMs: null,
			},
		});
		assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnComplete, turnId: 'turn_a' }]);
		assert.strictEqual(state.currentTurnId, undefined);
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
		});
		assert.deepStrictEqual({ actions, remainingToolCalls: state.itemToToolCall.size }, {
			actions: [
				{ type: ActionType.ChatToolCallComplete, turnId: 'turn_a', toolCallId: 'tc_1', result: { success: false, pastTenseMessage: 'Stopped shell', content: [{ type: ToolResultContentType.Text, text: 'partial output' }], error: { message: 'Turn completed before the tool reported completion' } } },
				{ type: ActionType.ChatTurnComplete, turnId: 'turn_a' },
			],
			remainingToolCalls: 0,
		});
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
		assert.strictEqual(actions.length, 2);
		assert.strictEqual((actions[0] as { type: ActionType }).type, ActionType.ChatError);
		assert.strictEqual((actions[1] as { type: ActionType }).type, ActionType.ChatTurnComplete);
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
		assert.strictEqual(actions.length, 1);
		assert.strictEqual((actions[0] as { type: ActionType }).type, ActionType.ChatTurnCancelled);
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
		resetCodexTurnMapState(state);
		assert.deepStrictEqual({
			currentTurnId: state.currentTurnId,
			parts: state.itemToPartId.size,
			toolCalls: state.itemToToolCall.size,
			reasoning: state.itemToReasoningPartId.size,
		}, { currentTurnId: 'turn_a', parts: 0, toolCalls: 0, reasoning: 0 });
	});
});
