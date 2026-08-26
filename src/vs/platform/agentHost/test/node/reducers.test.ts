/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { sortCustomizationEnablement, withCustomizationEnablement } from '../../common/customizationEnablement.js';
import { changesetReducer, chatReducer, sessionReducer } from '../../common/state/protocol/reducers.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, ChangesetOperationStatus, CustomizationLoadStatus, MessageKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ChatOriginKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ResponsePartKind, ToolCallStatus, TurnState, type AgentCustomization, type ChangesetState, type Customization, type PluginCustomization, type ChatState, type SessionState } from '../../common/state/sessionState.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, ToolCallContributorKind, type ToolCallContributor } from '../../common/state/protocol/state.js';

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
		startedAt: '2025-01-01T00:00:00.000Z',
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

	test('preserves turn start timestamp and duration after completion', () => {
		let state = chatReducer(makeChat(), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		const activeStartedAt = state.activeTurn?.startedAt;
		state = chatReducer(state, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-1',
			duration: 150_000,
		});

		assert.deepStrictEqual({
			activeStartedAt,
			completedStartedAt: state.turns[0].startedAt,
			duration: state.turns[0].duration,
		}, {
			activeStartedAt: '2025-01-01T00:00:00.000Z',
			completedStartedAt: '2025-01-01T00:00:00.000Z',
			duration: 150_000,
		});
	});

	test('clamps negative terminal duration', () => {
		const active = chatReducer(makeChat(), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		const afterNegativeDuration = chatReducer(active, {
			type: ActionType.ChatTurnComplete,
			turnId: 'turn-1',
			duration: -5,
		});

		assert.deepStrictEqual(afterNegativeDuration.turns[0], {
			id: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			duration: 0,
			message: { text: 'hello', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		});
	});

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

	test('Chat status is InputNeeded with an unresolved input request response part', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: ChatInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}],
			}, ChatInputRequestPurpose.AskUser),
		});

		assert.deepStrictEqual({
			status: state.status,
			responsePart: state.activeTurn?.responseParts.at(-1),
		}, {
			status: SessionStatus.InputNeeded,
			responsePart: {
				kind: ResponsePartKind.InputRequest,
				request: withChatInputRequestPurpose({
					id: 'req-1',
					message: 'What is your name?',
					questions: [{
						kind: ChatInputQuestionKind.Text,
						id: 'q-1',
						message: 'What is your name?',
						required: true,
					}],
				}, ChatInputRequestPurpose.AskUser),
			},
		});
	});

	test('ChatInputRequested replacement preserves purpose and synchronized answers through completion', () => {
		let state = withActiveTurnAndToolCall(makeChat());
		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: 'req-1',
				questions: [{ kind: ChatInputQuestionKind.Text, id: 'q-1', message: 'First?' }],
			}, ChatInputRequestPurpose.AskUser),
		});
		state = chatReducer(state, {
			type: ActionType.ChatInputAnswerChanged,
			requestId: 'req-1',
			questionId: 'q-1',
			answer: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'answer' } },
		});
		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: 'req-1',
				questions: [{ kind: ChatInputQuestionKind.Text, id: 'q-1', message: 'Updated?' }],
			}, ChatInputRequestPurpose.AskUser),
		});
		state = chatReducer(state, {
			type: ActionType.ChatInputCompleted,
			requestId: 'req-1',
			response: ChatInputResponseKind.Accept,
		});

		assert.deepStrictEqual(state.activeTurn?.responseParts.at(-1), {
			kind: ResponsePartKind.InputRequest,
			request: withChatInputRequestPurpose({
				id: 'req-1',
				questions: [{ kind: ChatInputQuestionKind.Text, id: 'q-1', message: 'Updated?' }],
				answers: {
					'q-1': { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'answer' } },
				},
			}, ChatInputRequestPurpose.AskUser),
			response: ChatInputResponseKind.Accept,
		});
	});

	test('ChatInputRequested without an active turn is ignored', () => {
		const state = chatReducer(makeChat(), {
			type: ActionType.ChatInputRequested,
			request: { id: 'req-1', questions: [] },
		});

		assert.deepStrictEqual({
			status: state.status,
			activeTurn: state.activeTurn,
		}, {
			status: SessionStatus.Idle,
			activeTurn: undefined,
		});
	});

	test('SessionStatus transitions from InputNeeded to InProgress after ChatInputCompleted', () => {
		let state = withActiveTurnAndToolCall(makeChat());

		// Add an input request
		state = chatReducer(state, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: 'req-1',
				message: 'What is your name?',
				questions: [{
					kind: ChatInputQuestionKind.Text,
					id: 'q-1',
					message: 'What is your name?',
					required: true
				}],
			}, ChatInputRequestPurpose.AskUser),
		});
		assert.strictEqual(state.status, SessionStatus.InputNeeded);

		// Complete the input request
		state = chatReducer(state, {
			type: ActionType.ChatInputCompleted,
			requestId: 'req-1',
			response: ChatInputResponseKind.Accept,
			answers: { 'q-1': { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'Alice' } } },
		});

		assert.deepStrictEqual({
			status: state.status,
			responsePart: state.activeTurn?.responseParts.at(-1),
		}, {
			status: SessionStatus.InProgress,
			responsePart: {
				kind: ResponsePartKind.InputRequest,
				request: withChatInputRequestPurpose({
					id: 'req-1',
					message: 'What is your name?',
					questions: [{
						kind: ChatInputQuestionKind.Text,
						id: 'q-1',
						message: 'What is your name?',
						required: true,
					}],
					answers: {
						'q-1': {
							state: ChatInputAnswerState.Submitted,
							value: { kind: ChatInputAnswerValueKind.Text, value: 'Alice' },
						},
					},
				}, ChatInputRequestPurpose.AskUser),
				response: ChatInputResponseKind.Accept,
			},
		});
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

	test('ChatToolCallDelta can update the invocation message without exposing partial input', () => {
		let state = chatReducer(makeChat(), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		state = chatReducer(state, {
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			toolName: 'edit',
			displayName: 'Edit File',
		});
		state = chatReducer(state, {
			type: ActionType.ChatToolCallDelta,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			content: '',
			invocationMessage: 'Replacing 2 lines with 3 lines',
		});

		const part = state.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
		assert.ok(part?.kind === ResponsePartKind.ToolCall);
		assert.deepStrictEqual({
			invocationMessage: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.invocationMessage : undefined,
			partialInput: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.partialInput : undefined,
		}, {
			invocationMessage: 'Replacing 2 lines with 3 lines',
			partialInput: '',
		});
	});

	test('ChatToolCallReady replaces provisional contributor and intention', () => {
		let state = chatReducer(makeChat(), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		state = chatReducer(state, {
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			toolName: 'mcp_tool',
			displayName: 'MCP Tool',
			intention: 'Query',
		});
		state = chatReducer(state, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
			intention: 'Query project metadata',
			invocationMessage: 'Querying project metadata',
			toolInput: '{"query":"metadata"}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		const part = state.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
		assert.ok(part?.kind === ResponsePartKind.ToolCall);
		assert.deepStrictEqual({
			status: part.toolCall.status,
			contributor: part.toolCall.contributor,
			intention: part.toolCall.intention,
		}, {
			status: ToolCallStatus.Running,
			contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
			intention: 'Query project metadata',
		});
	});

	test('ChatToolCallReady cannot change client execution ownership', () => {
		const readyContributor = (startContributor: ToolCallContributor | undefined, contributor: ToolCallContributor) => {
			let state = chatReducer(makeChat(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});
			state = chatReducer(state, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				toolName: 'tool',
				displayName: 'Tool',
				contributor: startContributor,
			});
			state = chatReducer(state, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				contributor,
				invocationMessage: 'Running tool',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			const part = state.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
			assert.ok(part?.kind === ResponsePartKind.ToolCall);
			return part.toolCall.contributor;
		};

		assert.deepStrictEqual([
			readyContributor(undefined, { kind: ToolCallContributorKind.Client, clientId: 'client-1' }),
			readyContributor(
				{ kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
				{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
			),
			readyContributor(
				{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
				{ kind: ToolCallContributorKind.Client, clientId: 'client-2' },
			),
			readyContributor(
				{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
				{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
			),
		], [
			undefined,
			{ kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
			{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
			{ kind: ToolCallContributorKind.Client, clientId: 'client-1' },
		]);
	});

	test('ChatToolCallReady updates an asynchronous judge result on a pending confirmation', () => {
		const loading = chatReducer(withActiveTurnAndToolCall(makeChat()), {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			confirmationTitle: 'Read file',
			toolInput: '/foo.ts',
			riskAssessment: {
				kind: ToolCallRiskAssessmentKind.Judge,
				status: ToolCallRiskAssessmentStatus.Loading,
			},
		});
		const complete = chatReducer(loading, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			invocationMessage: 'Read file?',
			riskAssessment: {
				kind: ToolCallRiskAssessmentKind.Judge,
				status: ToolCallRiskAssessmentStatus.Complete,
				reason: 'This reads a sensitive file.',
				safety: 0.2,
			},
		});
		const part = complete.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-1');
		assert.ok(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation);

		assert.deepStrictEqual({
			confirmationTitle: part.toolCall.confirmationTitle,
			toolInput: part.toolCall.toolInput,
			riskAssessment: part.toolCall.riskAssessment,
		}, {
			confirmationTitle: 'Read file',
			toolInput: '/foo.ts',
			riskAssessment: {
				kind: ToolCallRiskAssessmentKind.Judge,
				status: ToolCallRiskAssessmentStatus.Complete,
				reason: 'This reads a sensitive file.',
				safety: 0.2,
			},
		});
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

suite('customization enablement', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts stably and replaces decisions for one scope', () => {
		const workspaceFirst = { kind: CustomizationEnablementKind.Workspace, uri: 'file:///one', enabled: false } as const;
		const workspaceSecond = { kind: CustomizationEnablementKind.Workspace, uri: 'file:///two', enabled: true } as const;
		const global = { kind: CustomizationEnablementKind.Global, enabled: false } as const;
		const session = { kind: CustomizationEnablementKind.Session, enabled: true } as const;

		assert.deepStrictEqual(
			withCustomizationEnablement([workspaceFirst, global, workspaceSecond, session], CustomizationEnablementKind.Workspace, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///three', enabled: false }),
			[session, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///three', enabled: false }, global],
		);
		assert.deepStrictEqual(
			sortCustomizationEnablement([workspaceFirst, global, workspaceSecond, session]),
			[session, workspaceFirst, workspaceSecond, global],
		);
	});

	test('replaces enablement for plugins and MCP servers while retaining child enablement transitions', () => {
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin,
			id: 'plugin',
			uri: 'file:///plugin',
			name: 'Plugin',
			children: [{
				type: CustomizationType.Agent,
				id: 'agent',
				uri: 'file:///plugin/agent.md',
				name: 'Agent',
			}],
		};
		const mcp = {
			type: CustomizationType.McpServer,
			id: 'mcp',
			uri: 'file:///mcp.json',
			name: 'MCP',
			state: { kind: McpServerStatus.Stopped },
		} as const;
		const seeded = { ...makeSession(), customizations: [plugin, mcp] };
		const withSet = sessionReducer(seeded, {
			type: ActionType.SessionCustomizationToggled,
			id: 'plugin',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		const withMcpSet = sessionReducer(withSet, {
			type: ActionType.SessionCustomizationToggled,
			id: 'mcp',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		const withChange = sessionReducer(withMcpSet, {
			type: ActionType.SessionCustomizationToggled,
			id: 'plugin',
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		});
		const withMcpChange = sessionReducer(withChange, {
			type: ActionType.SessionCustomizationToggled,
			id: 'mcp',
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		});
		const withClear = sessionReducer(withMcpChange, {
			type: ActionType.SessionCustomizationToggled,
			id: 'plugin',
			enablement: [],
		});
		const withMcpClear = sessionReducer(withClear, {
			type: ActionType.SessionCustomizationToggled,
			id: 'mcp',
			enablement: [],
		});
		const withChildSet = sessionReducer(withMcpClear, {
			type: ActionType.SessionCustomizationToggled,
			id: 'agent',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		const withChildClear = sessionReducer(withChildSet, {
			type: ActionType.SessionCustomizationToggled,
			id: 'agent',
			enablement: [],
		});

		assert.deepStrictEqual([
			withSet.customizations,
			withMcpSet.customizations,
			withChange.customizations,
			withMcpChange.customizations,
			withClear.customizations,
			withMcpClear.customizations,
			withChildSet.customizations,
			withChildClear.customizations,
		], [
			[{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }, mcp],
			[{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }],
			[{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }],
			[{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }],
			[plugin, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }],
			[plugin, mcp],
			[{ ...plugin, children: [{ ...plugin.children![0], enabled: false }] }, mcp],
			[{ ...plugin, children: [{ ...plugin.children![0], enabled: true }] }, mcp],
		]);
	});
});
