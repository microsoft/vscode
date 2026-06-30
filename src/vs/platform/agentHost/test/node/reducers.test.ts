/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { changesetReducer, chatReducer, sessionReducer } from '../../common/state/protocol/reducers.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, ChangesetOperationStatus, CustomizationLoadStatus, MessageKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ChatOriginKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ResponsePartKind, ToolCallStatus, type AgentCustomization, type ChangesetState, type Customization, type PluginCustomization, type ChatState, type SessionState } from '../../common/state/sessionState.js';
import { CustomizationType } from '../../common/state/protocol/state.js';

function makeSession(): SessionState {
	return {
		provider: 'copilot',
		title: 'Test',
		status: SessionStatus.Idle,
		project: { uri: 'file:///test-project', displayName: 'Test Project' },
		lifecycle: SessionLifecycle.Ready,
		activeClients: [],
		chats: [],
	};
}

function makeChat(): ChatState {
	const now = new Date(Date.now()).toISOString();
	return {
		resource: 'ahp-chat://test',
		title: 'Test',
		status: SessionStatus.Idle,
		modifiedAt: now,
		origin: { kind: ChatOriginKind.User },
		turns: [],
		activeTurn: undefined,
	};
}

function withActiveTurnAndToolCall(state: ChatState): ChatState {
	state = chatReducer(state, {
		type: ActionType.ChatTurnStarted,
		turnId: 'turn-1',
		message: { text: 'hello', origin: { kind: MessageKind.User } },
	});
	state = chatReducer(state, {
		type: ActionType.ChatToolCallStart,
		turnId: 'turn-1',
		toolCallId: 'tc-1',
		toolName: 'readFile',
		displayName: 'Read File',
	});
	return state;
}

suite('chatReducer – summaryStatus with tool call confirmations and input requests', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Chat status is InputNeeded when a tool call is PendingConfirmation', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// Transition to PendingConfirmation (no `confirmed` field)
		state = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});

		assert.strictEqual(state.status, SessionStatus.InputNeeded);
	});

	test('Chat status is InputNeeded when a tool call is PendingResultConfirmation', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// Transition to Running first
		state = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file',
			toolInput: '/foo.ts',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		// Then complete with requiresResultConfirmation
		state = chatReducer(state, {
			type: ActionType.ChatToolCallComplete,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			requiresResultConfirmation: true,
			result: {
				success: true,
				pastTenseMessage: 'Read file'
			},
		});

		assert.strictEqual(state.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress when tool call is confirmed', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// Transition to PendingConfirmation
		state = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});
		assert.strictEqual(state.status, SessionStatus.InputNeeded);

		// Confirm it
		state = chatReducer(state, {
			type: ActionType.ChatToolCallConfirmed,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			approved: true,
			confirmed: ToolCallConfirmationReason.UserAction,
		});

		assert.strictEqual(state.status, SessionStatus.InProgress);
	});

	test('Chat status is InputNeeded with inputRequests', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: ChatInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}]
			},
		});

		assert.strictEqual(state.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress after ChatInputCompleted', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// Add an input request
		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: ChatInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}]
			},
		});
		assert.strictEqual(state.status, SessionStatus.InputNeeded);

		// Complete the input request
		state = chatReducer(state, {
			type: ActionType.ChatInputCompleted,
			requestId: 'req-1',
			response: ChatInputResponseKind.Accept,
			answers: { 'q-1': { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'Alice' } } },
		});

		assert.strictEqual(state.status, SessionStatus.InProgress);
	});

	test('Tool call transition to PendingConfirmation updates chat status to InputNeeded', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// After ChatToolCallStart, status should be InProgress (tool is Streaming)
		assert.strictEqual(state.status, SessionStatus.InProgress);

		// Transition to PendingConfirmation via ChatToolCallReady (no confirmed)
		state = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});

		assert.strictEqual(state.status, SessionStatus.InputNeeded);
	});

	test('ChatToolCallReady preserves action metadata on pending and running tool calls', () => {
		const state = withActiveTurnAndToolCall(makeChat());
		const pending = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
			_meta: { autoApproveBySetting: true },
		});
		const running = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file',
			toolInput: '/foo.ts',
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: { autoApproveBySetting: true },
		});

		const getToolCall = (s: ChatState) => {
			const part = s.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-1');
			assert.ok(part?.kind === ResponsePartKind.ToolCall);
			return part.toolCall;
		};
		assert.deepStrictEqual([
			{ status: getToolCall(pending).status, meta: getToolCall(pending)._meta },
			{ status: getToolCall(running).status, meta: getToolCall(running)._meta },
		], [
			{ status: ToolCallStatus.PendingConfirmation, meta: { autoApproveBySetting: true } },
			{ status: ToolCallStatus.Running, meta: { autoApproveBySetting: true } },
		]);
	});
});

suite('changesetReducer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ready: ChangesetState = { status: ChangesetStatus.Ready, files: [] };
	const fileA = { id: 'file:///a.ts', edit: { after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } }, diff: { added: 1, removed: 0 } } };
	const fileARenamed = { id: 'file:///a.ts', edit: { after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } }, diff: { added: 5, removed: 0 } } };

	test('ChangesetFileSet appends a new file', () => {
		const next = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
		assert.deepStrictEqual(next.files, [fileA]);
	});

	test('ChangesetFileSet replaces an existing file by id (upsert)', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
		const next = changesetReducer(seeded, { type: ActionType.ChangesetFileSet, file: fileARenamed });
		assert.deepStrictEqual(next.files, [fileARenamed]);
	});

	test('ChangesetFileRemoved removes by id', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
		const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: fileA.id });
		assert.deepStrictEqual(next.files, []);
	});

	test('ChangesetFileRemoved is a no-op for an unknown id', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
		const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: 'file:///nope.ts' });
		assert.strictEqual(next, seeded);
	});

	test('ChangesetStatusChanged → Error attaches the error', () => {
		const err = { errorType: 'computeFailed', message: 'boom' };
		const next = changesetReducer(ready, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Error, error: err });
		assert.deepStrictEqual({ status: next.status, error: next.error }, { status: ChangesetStatus.Error, error: err });
	});

	test('ChangesetStatusChanged → Ready strips a previous error', () => {
		const errored: ChangesetState = { status: ChangesetStatus.Error, error: { errorType: 'x', message: 'y' }, files: [fileA] };
		const next = changesetReducer(errored, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Ready });
		assert.deepStrictEqual({ status: next.status, error: next.error, files: next.files }, { status: ChangesetStatus.Ready, error: undefined, files: [fileA] });
	});

	test('ChangesetOperationsChanged with array replaces operations', () => {
		const ops = [{ id: 'stage', label: 'Stage', scopes: [], status: ChangesetOperationStatus.Idle }];
		const next = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: ops });
		assert.deepStrictEqual(next.operations, ops);
	});

	test('ChangesetOperationsChanged with undefined strips operations', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: [{ id: 'stage', label: 'Stage', scopes: [], status: ChangesetOperationStatus.Idle }] });
		const next = changesetReducer(seeded, { type: ActionType.ChangesetOperationsChanged, operations: undefined });
		assert.strictEqual(next.operations, undefined);
	});

	test('ChangesetCleared empties files', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
		const next = changesetReducer(seeded, { type: ActionType.ChangesetCleared, });
		assert.deepStrictEqual(next.files, []);
	});

	test('ChangesetCleared is a no-op when files are already empty', () => {
		const next = changesetReducer(ready, { type: ActionType.ChangesetCleared, });
		assert.strictEqual(next, ready);
	});
});

suite('sessionReducer – SessionCustomizationUpdated', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const agentA: AgentCustomization = { type: CustomizationType.Agent, id: 'file:///plugin-a/agents/helper.md', uri: 'file:///plugin-a/agents/helper.md', name: 'helper' };
	const agentB: AgentCustomization = { type: CustomizationType.Agent, id: 'file:///plugin-a/agents/reviewer.md', uri: 'file:///plugin-a/agents/reviewer.md', name: 'reviewer', description: 'reviews code' };

	function pluginA(extra: Partial<PluginCustomization> = {}): Customization {
		return {
			type: CustomizationType.Plugin,
			id: 'file:///plugin-a',
			uri: 'file:///plugin-a',
			name: 'Plugin A',
			enabled: true,
			...extra,
		};
	}

	test('insert: appends a new top-level customization with its children', () => {
		const customization = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentA, agentB] });
		const state = sessionReducer(makeSession(), {
			type: ActionType.SessionCustomizationUpdated,
			customization,
		});

		assert.deepStrictEqual(state.customizations, [customization]);
	});

	test('update: replaces the matching entry entirely', () => {
		const initial = pluginA({ load: { kind: CustomizationLoadStatus.Loading }, children: [agentA] });
		const seeded = sessionReducer(makeSession(), {
			type: ActionType.SessionCustomizationUpdated,
			customization: initial,
		});
		const updated = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentB] });
		const next = sessionReducer(seeded, {
			type: ActionType.SessionCustomizationUpdated,
			customization: updated,
		});

		assert.deepStrictEqual(next.customizations, [updated]);
	});
});
