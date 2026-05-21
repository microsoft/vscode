/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { changesetReducer, sessionReducer } from '../../common/state/protocol/reducers.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, CustomizationStatus, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, type ChangesetState, type CustomizationAgentRef, type CustomizationRef, type SessionState } from '../../common/state/sessionState.js';

function makeSession(): SessionState {
	return {
		summary: {
			resource: 'copilot:/test',
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
		},
		lifecycle: SessionLifecycle.Ready,
		turns: [],
	};
}

function withActiveTurnAndToolCall(state: SessionState): SessionState {
	state = sessionReducer(state, {
		type: ActionType.SessionTurnStarted,
		turnId: 'turn-1',
		userMessage: { text: 'hello' },
	});
	state = sessionReducer(state, {
		type: ActionType.SessionToolCallStart,
		turnId: 'turn-1',
		toolCallId: 'tc-1',
		toolName: 'readFile',
		displayName: 'Read File',
	});
	return state;
}

suite('sessionReducer – summaryStatus with tool call confirmations and input requests', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('SessionStatus is InputNeeded when a tool call is PendingConfirmation', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Transition to PendingConfirmation (no `confirmed` field)
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus is InputNeeded when a tool call is PendingResultConfirmation', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Transition to Running first
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file',
			toolInput: '/foo.ts',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		// Then complete with requiresResultConfirmation
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallComplete,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			requiresResultConfirmation: true,
			result: {
				success: true,
				pastTenseMessage: 'Read file'
			},
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress when tool call is confirmed', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Transition to PendingConfirmation
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});
		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);

		// Confirm it
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallConfirmed,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			approved: true,
			confirmed: ToolCallConfirmationReason.UserAction,
		});

		assert.strictEqual(state.summary.status, SessionStatus.InProgress);
	});

	test('SessionStatus is InputNeeded with inputRequests', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		state = sessionReducer(state, {
			type: ActionType.SessionInputRequested,
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: SessionInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}]
			},
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress after SessionInputCompleted', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Add an input request
		state = sessionReducer(state, {
			type: ActionType.SessionInputRequested,
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: SessionInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}]
			},
		});
		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);

		// Complete the input request
		state = sessionReducer(state, {
			type: ActionType.SessionInputCompleted,
			requestId: 'req-1',
			response: SessionInputResponseKind.Accept,
			answers: { 'q-1': { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Text, value: 'Alice' } } },
		});

		assert.strictEqual(state.summary.status, SessionStatus.InProgress);
	});

	test('Tool call transition to PendingConfirmation updates summary status to InputNeeded', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// After SessionToolCallStart, status should be InProgress (tool is Streaming)
		assert.strictEqual(state.summary.status, SessionStatus.InProgress);

		// Transition to PendingConfirmation via SessionToolCallReady (no confirmed)
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
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
		const ops = [{ id: 'stage', label: 'Stage', scopes: [] }];
		const next = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: ops });
		assert.deepStrictEqual(next.operations, ops);
	});

	test('ChangesetOperationsChanged with undefined strips operations', () => {
		const seeded = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: [{ id: 'stage', label: 'Stage', scopes: [] }] });
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

suite('sessionReducer – SessionCustomizationUpdated.agents', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ref: CustomizationRef = { uri: 'file:///plugin-a', displayName: 'Plugin A' };
	const agentA: CustomizationAgentRef = { uri: 'file:///plugin-a/agents/helper.md', name: 'helper' };
	const agentB: CustomizationAgentRef = { uri: 'file:///plugin-a/agents/reviewer.md', name: 'reviewer', description: 'reviews code' };

	function withCustomization(status: CustomizationStatus): SessionState {
		return sessionReducer(makeSession(), {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			enabled: true,
			status,
		});
	}

	test('insert: persists agents from the action onto SessionCustomization', () => {
		const state = sessionReducer(makeSession(), {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			enabled: true,
			status: CustomizationStatus.Loaded,
			agents: [agentA, agentB],
		});

		assert.deepStrictEqual(state.customizations, [{
			customization: ref,
			enabled: true,
			status: CustomizationStatus.Loaded,
			agents: [agentA, agentB],
		}]);
	});

	test('update: replaces previously-set agents when the action carries a new array', () => {
		const seeded = sessionReducer(withCustomization(CustomizationStatus.Loading), {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			agents: [agentA],
		});
		const next = sessionReducer(seeded, {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			agents: [agentB],
		});

		assert.deepStrictEqual(next.customizations?.[0].agents, [agentB]);
	});

	test('update: preserves existing agents when the action omits the field', () => {
		const seeded = sessionReducer(withCustomization(CustomizationStatus.Loading), {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			agents: [agentA],
		});
		const next = sessionReducer(seeded, {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			status: CustomizationStatus.Loaded,
		});

		assert.deepStrictEqual(next.customizations?.[0], {
			customization: ref,
			enabled: true,
			status: CustomizationStatus.Loaded,
			agents: [agentA],
		});
	});

	test('update: an empty agents array is respected (means "no agents contributed")', () => {
		const seeded = sessionReducer(withCustomization(CustomizationStatus.Loading), {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			agents: [agentA],
		});
		const next = sessionReducer(seeded, {
			type: ActionType.SessionCustomizationUpdated,
			customization: ref,
			agents: [],
		});

		assert.deepStrictEqual(next.customizations?.[0].agents, []);
	});
});
