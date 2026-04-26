/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { sessionReducer } from '../../common/state/protocol/reducers.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, type SessionState } from '../../common/state/sessionState.js';

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
		session: 'copilot:/test',
		turnId: 'turn-1',
		userMessage: { text: 'hello' },
	});
	state = sessionReducer(state, {
		type: ActionType.SessionToolCallStart,
		session: 'copilot:/test',
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
			session: 'copilot:/test',
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
			session: 'copilot:/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file',
			toolInput: '/foo.ts',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		// Then complete with requiresResultConfirmation
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallComplete,
			session: 'copilot:/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			requiresResultConfirmation: true,
			result: {
				success: true,
				pastTenseMessage: 'Read file',
			},
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress when tool call is confirmed', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Transition to PendingConfirmation
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallReady,
			session: 'copilot:/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});
		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);

		// Confirm it
		state = sessionReducer(state, {
			type: ActionType.SessionToolCallConfirmed,
			session: 'copilot:/test',
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
			session: 'copilot:/test',
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: SessionInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true,
				}],
			},
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});

	test('SessionStatus transitions from InputNeeded to InProgress after SessionInputCompleted', () => {
		let state = withActiveTurnAndToolCall(makeSession());

		// Add an input request
		state = sessionReducer(state, {
			type: ActionType.SessionInputRequested,
			session: 'copilot:/test',
			request: {
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: SessionInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true,
				}],
			},
		});
		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);

		// Complete the input request
		state = sessionReducer(state, {
			type: ActionType.SessionInputCompleted,
			session: 'copilot:/test',
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
			session: 'copilot:/test',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			toolInput: '/foo.ts',
		});

		assert.strictEqual(state.summary.status, SessionStatus.InputNeeded);
	});
});
