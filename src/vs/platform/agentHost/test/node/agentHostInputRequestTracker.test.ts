/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, type IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { ActionType, type ChatInputCompletedAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, buildSubagentChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ChatOriginKind, MessageKind, ResponsePartKind, SessionStatus, type ChatInputAnswer, type ChatInputRequest, type ChatState } from '../../common/state/sessionState.js';
import { AgentHostInputRequestTracker } from '../../node/agentHostInputRequestTracker.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = false;
	readonly events: { eventName: string; data: unknown }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('AgentHostInputRequestTracker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const rootSession = AgentSession.uri('mock', 'root-session').toString();
	const rootChat = buildDefaultChatUri(rootSession);
	const subagentChat = buildSubagentChatUri(rootSession, 'subagent-tool');

	function createTracker(clientContext?: IAgentHostClientTelemetryContext): { telemetry: CapturingTelemetryService; tracker: AgentHostInputRequestTracker } {
		const telemetry = new CapturingTelemetryService();
		return {
			telemetry,
			tracker: new AgentHostInputRequestTracker(new AgentHostTelemetryReporter(telemetry), () => ({ elapsed: () => 25 }), () => clientContext),
		};
	}

	function completedState(session: string, turnId: string, request: ChatInputRequest, answers: Record<string, ChatInputAnswer> = {}): ChatState {
		return {
			resource: session,
			title: 'Test',
			status: SessionStatus.InProgress,
			modifiedAt: new Date().toISOString(),
			origin: { kind: ChatOriginKind.User },
			turns: [],
			activeTurn: {
				id: turnId,
				startedAt: new Date().toISOString(),
				message: { text: 'question', origin: { kind: MessageKind.User } },
				responseParts: [{
					kind: ResponsePartKind.InputRequest,
					request: { ...request, answers },
					response: ChatInputResponseKind.Accept,
				}],
				usage: undefined,
			},
		};
	}

	function accept(requestId: string): ChatInputCompletedAction {
		return { type: ActionType.ChatInputCompleted, requestId, response: ChatInputResponseKind.Accept };
	}

	test('emits accepted metrics from reduced state with standard root identifiers', () => {
		const { telemetry, tracker } = createTracker({
			clientType: AgentHostClientType.EditorWindow,
			connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			transportKind: AgentHostTransportKind.MessagePort,
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			machineId: 'client-machine-id',
			devDeviceId: 'client-dev-device-id',
		});
		const request: ChatInputRequest = withChatInputRequestPurpose({
			id: 'request-1',
			questions: [
				{ id: 'text', kind: ChatInputQuestionKind.Text, message: 'Text?' },
				{ id: 'selected', kind: ChatInputQuestionKind.SingleSelect, message: 'Select?', options: [{ id: 'recommended', label: 'Recommended', recommended: true }] },
				{ id: 'multi', kind: ChatInputQuestionKind.MultiSelect, message: 'Many?', options: [{ id: 'recommended-many', label: 'Recommended', recommended: true }, { id: 'other', label: 'Other' }] },
				{ id: 'number', kind: ChatInputQuestionKind.Number, message: 'Number?' },
				{ id: 'boolean', kind: ChatInputQuestionKind.Boolean, message: 'Boolean?' },
				{ id: 'skipped', kind: ChatInputQuestionKind.Text, message: 'Skip?' },
				{ id: 'missing', kind: ChatInputQuestionKind.Text, message: 'Missing?' },
			],
		}, ChatInputRequestPurpose.AskUser);
		const answers: Record<string, ChatInputAnswer> = {
			text: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'value' } },
			selected: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'recommended' } },
			multi: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['other'], freeformValues: ['', 'custom'] } },
			number: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
			boolean: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
			skipped: { state: ChatInputAnswerState.Skipped },
		};

		tracker.inputRequested('mock', rootChat, 'turn-1', request);
		tracker.inputCompleted(rootChat, accept(request.id), completedState(rootChat, 'turn-1', request, answers));

		assert.deepStrictEqual(telemetry.events.map(event => ({ eventName: event.eventName, data: event.data })), [{
			eventName: 'askQuestionsToolInvoked',
			data: {
				initiatorClientType: 'editor_window',
				initiatorConnectionKind: 'remote_extension_host',
				initiatorTransportKind: 'message_port',
				hostLaunchKind: 'vscode_main_process',
				initiatorMachineId: 'client-machine-id',
				initiatorDevDeviceId: 'client-dev-device-id',
				requestId: 'turn-1',
				questionCount: 7,
				answeredCount: 5,
				skippedCount: 2,
				freeTextCount: 2,
				recommendedAvailableCount: 2,
				recommendedSelectedCount: 1,
				duration: 25,
				provider: 'mock',
				agentSessionId: 'root-session',
				isSubagentSession: false,
			},
		}]);
	});

	test('replacement preserves timing and turn correlation while updating questions', () => {
		let now = 0;
		const telemetry = new CapturingTelemetryService();
		const tracker = new AgentHostInputRequestTracker(new AgentHostTelemetryReporter(telemetry), () => {
			const startedAt = now;
			return { elapsed: () => now - startedAt };
		});
		const initial: ChatInputRequest = withChatInputRequestPurpose({
			id: 'request-1',
			questions: [{ id: 'old', kind: ChatInputQuestionKind.Text, message: 'Old?' }],
		}, ChatInputRequestPurpose.AskUser);
		const replacement: ChatInputRequest = withChatInputRequestPurpose({
			id: 'request-1',
			questions: [
				{ id: 'new-1', kind: ChatInputQuestionKind.Text, message: 'New?' },
				{ id: 'new-2', kind: ChatInputQuestionKind.Text, message: 'Another?' },
			],
		}, ChatInputRequestPurpose.AskUser);

		tracker.inputRequested('mock', rootChat, 'turn-1', initial);
		now = 5;
		tracker.inputRequested('other-provider', rootChat, 'turn-2', replacement);
		now = 12;
		tracker.inputCompleted(rootChat, accept(replacement.id), completedState(rootChat, 'turn-1', replacement));

		assert.deepStrictEqual(telemetry.events, [{
			eventName: 'askQuestionsToolInvoked',
			data: {
				requestId: 'turn-1',
				questionCount: 2,
				answeredCount: 0,
				skippedCount: 2,
				freeTextCount: 0,
				recommendedAvailableCount: 0,
				recommendedSelectedCount: 0,
				duration: 12,
				provider: 'mock',
				agentSessionId: 'root-session',
				isSubagentSession: false,
			},
		}]);
	});

	test('decline, cancellation, non-ask purposes, missing active turns, and duplicate completion do not emit', () => {
		const { telemetry, tracker } = createTracker();
		const ask: ChatInputRequest = withChatInputRequestPurpose({ id: 'ask', questions: [] }, ChatInputRequestPurpose.AskUser);
		const state = completedState(rootChat, 'turn-1', ask);

		tracker.inputRequested('mock', rootChat, 'turn-1', ask);
		tracker.inputCompleted(rootChat, { ...accept(ask.id), response: ChatInputResponseKind.Decline }, state);
		tracker.inputRequested('mock', rootChat, 'turn-1', { ...ask, id: 'cancel' });
		tracker.inputCompleted(rootChat, { ...accept('cancel'), response: ChatInputResponseKind.Cancel }, state);
		tracker.inputRequested('mock', rootChat, 'turn-1', withChatInputRequestPurpose({ ...ask, id: 'elicitation' }, ChatInputRequestPurpose.Elicitation));
		tracker.inputRequested('mock', rootChat, 'turn-1', withChatInputRequestPurpose({ ...ask, id: 'plan' }, ChatInputRequestPurpose.PlanReview));
		tracker.inputRequested('mock', rootChat, 'turn-1', { id: 'legacy', questions: [] });
		tracker.inputRequested('mock', rootChat, 'turn-1', { ...ask, id: 'missing-turn' });
		tracker.inputCompleted(rootChat, accept('missing-turn'), { ...state, activeTurn: undefined });
		tracker.inputRequested('mock', rootChat, 'turn-1', { ...ask, id: 'duplicate' });
		tracker.inputCompleted(rootChat, accept('duplicate'), completedState(rootChat, 'turn-1', { ...ask, id: 'duplicate' }));
		tracker.inputCompleted(rootChat, accept('duplicate'), completedState(rootChat, 'turn-1', { ...ask, id: 'duplicate' }));

		assert.strictEqual(telemetry.events.length, 1);
	});

	test('turn, session, and tracker cleanup drop pending requests', () => {
		const { telemetry, tracker } = createTracker();
		const request: ChatInputRequest = withChatInputRequestPurpose({ id: 'request-1', questions: [] }, ChatInputRequestPurpose.AskUser);

		tracker.inputRequested('mock', rootChat, 'turn-1', request);
		tracker.clearTurn(rootChat, 'turn-1');
		tracker.inputCompleted(rootChat, accept(request.id), completedState(rootChat, 'turn-1', request));

		tracker.inputRequested('mock', rootChat, 'turn-2', { ...request, id: 'request-2' });
		tracker.clearChat(rootChat);
		tracker.inputCompleted(rootChat, accept('request-2'), completedState(rootChat, 'turn-2', { ...request, id: 'request-2' }));

		tracker.inputRequested('mock', subagentChat, 'turn-3', { ...request, id: 'request-3' });
		tracker.clearAgentSession(rootSession);
		tracker.inputCompleted(subagentChat, accept('request-3'), completedState(subagentChat, 'turn-3', { ...request, id: 'request-3' }));

		tracker.inputRequested('mock', rootChat, 'turn-4', { ...request, id: 'request-4' });
		tracker.clear();
		tracker.inputCompleted(rootChat, accept('request-4'), completedState(rootChat, 'turn-4', { ...request, id: 'request-4' }));

		assert.deepStrictEqual(telemetry.events, []);
	});

	test('emits subagent identifiers', () => {
		const { telemetry, tracker } = createTracker();
		const request: ChatInputRequest = withChatInputRequestPurpose({ id: 'request-1', questions: [] }, ChatInputRequestPurpose.AskUser);

		tracker.inputRequested('mock', subagentChat, 'turn-1', request);
		tracker.inputCompleted(subagentChat, accept(request.id), completedState(subagentChat, 'turn-1', request));

		assert.deepStrictEqual(telemetry.events.map(event => {
			const data = event.data as { agentSessionId: string; isSubagentSession: boolean };
			return { agentSessionId: data.agentSessionId, isSubagentSession: data.isSubagentSession };
		}), [{ agentSessionId: 'root-session', isSubagentSession: true }]);
	});
});
