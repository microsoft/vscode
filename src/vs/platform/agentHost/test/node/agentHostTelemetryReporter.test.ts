/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as zlib from 'zlib';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hash } from '../../../../base/common/hash.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AgentSession } from '../../common/agent.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import type { Message, ToolDefinition } from '../../common/state/protocol/state.js';
import { buildSubagentChatUri, MessageKind } from '../../common/state/sessionState.js';
import { IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetry, IAgentHostRestrictedTelemetryContext, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { ActionType } from '../../common/state/sessionActions.js';

interface IRestrictedCall {
	eventName: string;
	properties: TelemetryProps | undefined;
}

class TestRestrictedTelemetryService implements ITelemetryService, IAgentHostRestrictedTelemetry {
	declare readonly _serviceBrand: undefined;

	telemetryLevel = TelemetryLevel.USAGE;
	sendErrorTelemetry = true;
	sessionId = 'sessionId';
	machineId = 'machineId';
	sqmId = 'sqmId';
	devDeviceId = 'devDeviceId';
	firstSessionDate = 'firstSessionDate';

	readonly enhancedEvents: IRestrictedCall[] = [];
	readonly enhancedMeasurements: Array<TelemetryMeasurements | undefined> = [];
	readonly internalEvents: IRestrictedCall[] = [];
	readonly githubStandardEvents: IRestrictedCall[] = [];
	readonly standardEvents: Array<{ eventName: string; data: ITelemetryData | undefined }> = [];

	publicLog(): void { }
	publicLogError(): void { }
	publicLog2(eventName: string, data?: ITelemetryData): void {
		this.standardEvents.push({ eventName, data });
	}
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryProps): void {
		this.githubStandardEvents.push({ eventName, properties });
	}
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.enhancedEvents.push({ eventName, properties });
		this.enhancedMeasurements.push(measurements);
	}
	sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps): void {
		this.enhancedEvents.push({ eventName, properties });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, _measurements?: TelemetryMeasurements): void {
		this.internalEvents.push({ eventName, properties });
	}
	sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps): void {
		this.internalEvents.push({ eventName, properties });
	}
	setCopilotTrackingId(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
	setInternalTelemetryContext(): void { }
}

suite('AgentHostTelemetryReporter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'agent-session://copilot/abc';
	const tools: ToolDefinition[] = [{ name: 'grep' }, { name: 'edit' }];
	const userMessage: Message = { text: 'hello', origin: { kind: MessageKind.User } };

	test('userMessageSent normalizes the chat URI to its session in standard GH telemetry', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);
		const chat = buildSubagentChatUri(session, 'tool-call-1');

		reporter.userMessageSent('copilot', 'client-1', createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow), chat, 'turn-1', undefined, 'direct', userMessage);

		assert.deepStrictEqual(service.githubStandardEvents, [{
			eventName: 'agentHost.userMessageSent',
			properties: {
				provider: 'copilot',
				initiatorClientType: 'agents_window',
				conversationId: AgentSession.id(session),
				turnId: 'turn-1',
				messageOriginKind: 'user',
			},
		}]);
	});

	test('userMessageSent includes only provided initiating client telemetry identity', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.userMessageSent('copilot', 'client-1', {
			...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow),
			machineId: 'client-machine-id',
			devDeviceId: 'client-dev-device-id',
		}, session, 'turn-1', undefined, 'direct', userMessage);
		reporter.userMessageSent('copilot', 'client-2', createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), session, 'turn-2', undefined, 'direct', userMessage);

		assert.deepStrictEqual(service.standardEvents.map(event => ({
			initiatorMachineId: event.data?.initiatorMachineId,
			initiatorDevDeviceId: event.data?.initiatorDevDeviceId,
		})), [{
			initiatorMachineId: 'client-machine-id',
			initiatorDevDeviceId: 'client-dev-device-id',
		}, {
			initiatorMachineId: undefined,
			initiatorDevDeviceId: undefined,
		}]);
	});

	test('userMessageSent reports the producing actor on both standard events', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);
		const agentMessage: Message = { text: 'please take over', origin: { kind: MessageKind.Agent } };

		reporter.userMessageSent('copilot', 'client-1', createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow), session, 'turn-1', undefined, 'direct', agentMessage);
		reporter.userMessageSent('copilot', 'client-1', createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow), session, 'turn-2', undefined, 'queued', userMessage);

		assert.deepStrictEqual({
			standard: service.standardEvents.map(event => event.data?.messageOriginKind),
			github: service.githubStandardEvents.map(event => event.properties?.messageOriginKind),
		}, {
			standard: ['agent', 'user'],
			github: ['agent', 'user'],
		});
	});

	test('executionModeChanged attributes a client-originated mode change', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.executionModeChanged('copilot', session, 'interactive', 'plan', 2, {
			...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
			machineId: 'client-machine-id',
			devDeviceId: 'client-dev-device-id',
		});

		assert.deepStrictEqual(service.standardEvents.map(event => ({
			eventName: event.eventName,
			initiatorClientType: event.data?.initiatorClientType,
			initiatorMachineId: event.data?.initiatorMachineId,
			initiatorDevDeviceId: event.data?.initiatorDevDeviceId,
		})), [{
			eventName: 'agentHost.executionModeChanged',
			initiatorClientType: 'editor_window',
			initiatorMachineId: 'client-machine-id',
			initiatorDevDeviceId: 'client-dev-device-id',
		}]);
	});

	test('assistantMessageReceived emits request.options.tools keyed on the client request id, and no-ops without one or without tools', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, undefined, tools); // dropped: no client request id
		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, 'client-1', []); // dropped: no tools
		await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, 'client-1', tools); // emitted

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'request.options.tools',
			properties: {
				headerRequestId: 'client-1',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'agents_window',
				messagesJson: JSON.stringify(tools),
				messagesJSONChunk: zlib.gzipSync(Buffer.from(JSON.stringify(tools), 'utf8')).toString('base64'),
			},
		}]);
	});

	test('userMessageText emits conversation.messageText (source=user) to enhanced + internal, and no-ops on empty content', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.userMessageText(session, AgentHostClientType.EditorWindow, '', 3); // dropped: no content
		await reporter.userMessageText(session, AgentHostClientType.EditorWindow, 'hello agent', 3); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'user',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'editor_window',
				turnIndex: '3',
				messageText: 'hello agent',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('modelMessageText emits conversation.messageText (source=model) with headerRequestId, and no-ops on empty content', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, '', 3, 'client-1'); // dropped: no content
		await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, 'sure, here you go', 3, 'client-1'); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'model',
				conversationId: AgentSession.id(session),
				initiatorClientType: 'agents_window',
				turnIndex: '3',
				headerRequestId: 'client-1',
				messageText: 'sure, here you go',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('toolCallDetails emits standard and restricted aggregates whenever tools were available, and no-ops when none were', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.toolCallDetails({
			provider: 'copilot', session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.Unknown, model: 'gpt-x', responseType: 'success',
			toolCounts: {}, availableTools: [],
			turnIndex: 2, turnDuration: 1200, messageCharLen: 11,
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // dropped: no tools were available
		await reporter.toolCallDetails({
			provider: 'copilot', session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.EditorWindow, model: 'gpt-x', responseType: 'success',
			clientContext: { ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), machineId: 'client-machine-id', devDeviceId: 'client-dev-device-id' },
			toolCounts: {}, availableTools: ['grep', 'edit'],
			turnIndex: 2, turnDuration: 1200, messageCharLen: 11,
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // emitted: tools available, even though no tool calls were made
		await reporter.toolCallDetails({
			provider: 'copilot', session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', clientType: AgentHostClientType.AgentsWindow, model: 'gpt-x', responseType: 'cancelled',
			toolCounts: { grep: 2, edit: 1 }, availableTools: ['grep', 'edit'],
			turnIndex: 3, turnDuration: 2400, messageCharLen: undefined,
			numRequests: 2, totalToolCalls: 3, parallelToolCallRounds: 1, parallelToolCallsTotal: 2,
		}); // emitted

		assert.deepStrictEqual(service.standardEvents, [{
			eventName: 'toolCallDetails',
			data: {
				initiatorClientType: 'editor_window',
				initiatorMachineId: 'client-machine-id',
				initiatorDevDeviceId: 'client-dev-device-id',
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				isSubagentSession: false,
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				responseType: 'success',
				toolCounts: JSON.stringify({}),
				model: 'gpt-x',
				numRequests: 1,
				turnIndex: 2,
				turnDuration: 1200,
				messageCharLen: 11,
				availableToolCount: 2,
				totalToolCalls: 0,
				parallelToolCallRounds: 0,
				parallelToolCallsTotal: 0,
			},
		}, {
			eventName: 'toolCallDetails',
			data: {
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				isSubagentSession: false,
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				responseType: 'cancelled',
				toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
				model: 'gpt-x',
				numRequests: 2,
				turnIndex: 3,
				turnDuration: 2400,
				messageCharLen: undefined,
				availableToolCount: 2,
				totalToolCalls: 3,
				parallelToolCallRounds: 1,
				parallelToolCallsTotal: 2,
			},
		}]);

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				initiatorClientType: 'editor_window',
				responseType: 'success',
				model: 'gpt-x',
				toolCounts: JSON.stringify({}),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}, {
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				initiatorClientType: 'agents_window',
				responseType: 'cancelled',
				model: 'gpt-x',
				toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}]);
		assert.strictEqual(service.internalEvents.length, 2);
		assert.strictEqual(service.internalEvents[0].eventName, 'toolCallDetailsInternal');
		assert.strictEqual(service.internalEvents[1].eventName, 'toolCallDetailsInternal');
	});

	test('toolApproval emits chat.toolApproval with AH discriminators and reason mapping', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.toolApproval({
			provider: 'copilot', session, turnId: 'turn-1',
			toolId: 'grep', toolSourceKind: 'internal',
			confirmKind: 'confirmationNotNeeded',
			confirmationNotNeededReason: 'auto-approve-all',
			requestUnsandboxedExecution: undefined,
		});
		reporter.toolApproval({
			provider: 'copilot', session, turnId: 'turn-2',
			clientContext: { ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), machineId: 'client-machine-id', devDeviceId: 'client-dev-device-id' },
			toolId: 'bash', toolSourceKind: 'internal',
			confirmKind: 'userAction',
			confirmationNotNeededReason: undefined,
			requestUnsandboxedExecution: true,
		});
		reporter.toolApproval({
			provider: 'copilot', session, turnId: 'turn-3',
			toolId: 'my-mcp-tool', toolSourceKind: 'mcp',
			confirmKind: 'denied',
			confirmationNotNeededReason: undefined,
			requestUnsandboxedExecution: undefined,
		});

		assert.deepStrictEqual(service.standardEvents, [{
			eventName: 'chat.toolApproval',
			data: {
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				isSubagentSession: false,
				chatSessionId: AgentSession.id(session),
				requestId: 'turn-1',
				toolId: 'grep',
				toolExtensionId: undefined,
				toolSourceKind: 'internal',
				confirmKind: 'confirmationNotNeeded',
				settingId: undefined,
				lmServiceScope: undefined,
				customButtonKind: undefined,
				confirmationNotNeededReason: 'auto-approve-all',
				sandboxWrapped: undefined,
				requestUnsandboxedExecution: undefined,
			},
		}, {
			eventName: 'chat.toolApproval',
			data: {
				initiatorClientType: 'editor_window',
				initiatorMachineId: 'client-machine-id',
				initiatorDevDeviceId: 'client-dev-device-id',
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				isSubagentSession: false,
				chatSessionId: AgentSession.id(session),
				requestId: 'turn-2',
				toolId: 'bash',
				toolExtensionId: undefined,
				toolSourceKind: 'internal',
				confirmKind: 'userAction',
				settingId: undefined,
				lmServiceScope: undefined,
				customButtonKind: undefined,
				confirmationNotNeededReason: undefined,
				sandboxWrapped: undefined,
				requestUnsandboxedExecution: true,
			},
		}, {
			eventName: 'chat.toolApproval',
			data: {
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				isSubagentSession: false,
				chatSessionId: AgentSession.id(session),
				requestId: 'turn-3',
				toolId: 'my-mcp-tool',
				toolExtensionId: undefined,
				toolSourceKind: 'mcp',
				confirmKind: 'denied',
				settingId: undefined,
				lmServiceScope: undefined,
				customButtonKind: undefined,
				confirmationNotNeededReason: undefined,
				sandboxWrapped: undefined,
				requestUnsandboxedExecution: undefined,
			},
		}]);
	});

	test('turnHung emits bounded last activity categories', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.turnHung({
			provider: 'copilot',
			session,
			turnId: 'turn-1',
			hangReason: 'stalledAfterProgress',
			hadAnyProgress: true,
			lastActivityKind: ActionType.ChatToolCallDelta,
			currentStage: 'provider',
			providerDiagnosticState: 'available',
			providerDiagnosticSnapshot: {
				state: 'available',
				providerCallState: 'resolved',
				providerTurnStarted: true,
				providerSessionState: 'active',
			},
			initiatorClientConnectionState: 'connected',
			blockedOn: undefined,
			toolId: undefined,
			toolSourceKind: undefined,
			inFlightToolCallCount: 0,
			quietTimeMs: 1000,
			turnElapsedMs: 2000,
			model: undefined,
			modelTelemetryKind: undefined,
			modelSelectionKind: 'default',
			permissionLevel: undefined,
		});
		reporter.turnHung({
			provider: 'copilot',
			session,
			turnId: 'turn-2',
			hangReason: 'stalledAfterProgress',
			hadAnyProgress: true,
			lastActivityKind: 'custom/path/value',
			currentStage: 'provider',
			providerDiagnosticState: 'unsupported',
			providerDiagnosticSnapshot: undefined,
			initiatorClientConnectionState: 'unknown',
			blockedOn: undefined,
			toolId: undefined,
			toolSourceKind: undefined,
			inFlightToolCallCount: 0,
			quietTimeMs: 1000,
			turnElapsedMs: 2000,
			model: undefined,
			modelTelemetryKind: undefined,
			modelSelectionKind: 'default',
			permissionLevel: undefined,
		});

		assert.deepStrictEqual(service.standardEvents, [{
			eventName: 'agentHost.turnHung',
			data: {
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				chatSessionId: getTelemetryChatSessionId(session),
				isSubagentSession: false,
				turnId: 'turn-1',
				hangReason: 'stalledAfterProgress',
				isExpected: false,
				hadAnyProgress: true,
				lastActivityKind: 'chat.toolCallDelta',
				currentStage: 'provider',
				providerDiagnosticState: 'available',
				providerCallState: 'resolved',
				providerTurnStarted: true,
				providerSessionState: 'active',
				initiatorClientConnectionState: 'connected',
				blockedOn: undefined,
				toolId: undefined,
				toolSourceKind: undefined,
				inFlightToolCallCount: 0,
				quietTimeMs: 1000,
				turnElapsedMs: 2000,
				model: undefined,
				modelSelectionKind: 'default',
				permissionLevel: undefined,
			},
		}, {
			eventName: 'agentHost.turnHung',
			data: {
				provider: 'copilot',
				agentSessionId: AgentSession.id(session),
				chatSessionId: getTelemetryChatSessionId(session),
				isSubagentSession: false,
				turnId: 'turn-2',
				hangReason: 'stalledAfterProgress',
				isExpected: false,
				hadAnyProgress: true,
				lastActivityKind: 'other',
				currentStage: 'provider',
				providerDiagnosticState: 'unsupported',
				initiatorClientConnectionState: 'unknown',
				blockedOn: undefined,
				toolId: undefined,
				toolSourceKind: undefined,
				inFlightToolCallCount: 0,
				quietTimeMs: 1000,
				turnElapsedMs: 2000,
				model: undefined,
				modelSelectionKind: 'default',
				permissionLevel: undefined,
			},
		}]);
	});

	test('autoModeRouterDecision maps authoritative SDK router fields and score shapes without deriving values', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.autoModeRouterDecision({
			session,
			turnId: 'turn-hydra',
			clientType: AgentHostClientType.EditorWindow,
			chosenModel: 'gpt-5',
			predictedLabel: 'high',
			confidence: 0.9,
			candidateModels: ['gpt-5', 'gpt-4.1'],
			categoryScores: { reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 },
			routingMethod: 'hydra',
			availableModels: ['gpt-5', 'gpt-4.1', 'gpt-5-mini'],
			fallback: false,
			fallbackReason: 'not-needed',
			stickyOverride: true,
			routerLatencyMs: 25,
			endToEndLatencyMs: 40,
			chosenShortfall: 0.05,
			hasImage: true,
		});
		reporter.autoModeRouterDecision({
			session,
			turnId: 'turn-binary',
			clientType: AgentHostClientType.AgentsWindow,
			chosenModel: 'gpt-4.1',
			predictedLabel: 'no_reasoning',
			confidence: undefined,
			candidateModels: undefined,
			categoryScores: { needs_reasoning: 0.2, no_reasoning: 0.8 },
			routingMethod: undefined,
			availableModels: undefined,
			fallback: undefined,
			fallbackReason: undefined,
			stickyOverride: undefined,
			routerLatencyMs: undefined,
			endToEndLatencyMs: undefined,
			chosenShortfall: undefined,
			hasImage: undefined,
		});

		assert.deepStrictEqual({ events: service.enhancedEvents, measurements: service.enhancedMeasurements }, {
			events: [{
				eventName: 'automode.routerDecisionRestricted',
				properties: {
					conversationId: AgentSession.id(session),
					vscodeRequestId: 'turn-hydra',
					initiatorClientType: 'editor_window',
					predictedLabel: 'high',
					routingMethod: 'hydra',
					fallback: 'false',
					fallbackReason: 'not-needed',
					candidateModel: 'gpt-5',
					chosenModel: 'gpt-5',
					candidateModels: JSON.stringify(['gpt-5', 'gpt-4.1']),
					availableModels: JSON.stringify(['gpt-5', 'gpt-4.1', 'gpt-5-mini']),
					stickyOverrideStr: 'true',
					hasImage: 'true',
					hydraScores: JSON.stringify({ reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 }),
				},
			}, {
				eventName: 'automode.routerDecisionRestricted',
				properties: {
					conversationId: AgentSession.id(session),
					vscodeRequestId: 'turn-binary',
					initiatorClientType: 'agents_window',
					predictedLabel: 'no_reasoning',
					candidateModel: '',
					chosenModel: 'gpt-4.1',
					candidateModels: JSON.stringify([]),
					binaryScores: JSON.stringify({ needs_reasoning: 0.2, no_reasoning: 0.8 }),
				},
			}],
			measurements: [{ confidence: 0.9, latencyMs: 25, e2eLatencyMs: 40, stickyOverride: 1, chosenShortfall: 0.05 }, { scoreNeedsReasoning: 0.2, scoreNoReasoning: 0.8 }],
		});
	});

	test('skillContentRead emits plaintext skill metadata to enhanced + internal, maps plugin identity + hashes content, and no-ops without a name', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.skillContentRead({ clientType: AgentHostClientType.Unknown, name: '', path: '/skills/x/SKILL.md', content: 'body', source: 'project', pluginName: undefined, pluginVersion: undefined }); // dropped: no name
		reporter.skillContentRead({
			clientType: AgentHostClientType.AgentsWindow,
			name: 'pdf', path: '/plugins/pdf/SKILL.md', content: 'skill body',
			source: 'plugin', pluginName: 'pdf-plugin', pluginVersion: '1.2.3',
		}); // emitted

		const expected: IRestrictedCall = {
			eventName: 'skillContentRead',
			properties: {
				initiatorClientType: 'agents_window',
				skillName: 'pdf',
				skillPath: '/plugins/pdf/SKILL.md',
				skillExtensionId: 'pdf-plugin',
				skillExtensionVersion: '1.2.3',
				skillStorage: 'plugin',
				skillContentHash: String(hash('skill body')),
			},
		};
		assert.deepStrictEqual({
			standard: service.githubStandardEvents,
			enhanced: service.enhancedEvents,
			internal: service.internalEvents,
		}, {
			standard: [{
				eventName: 'skillContentRead',
				properties: {
					initiatorClientType: 'agents_window',
					skillNameHash: String(hash('pdf')),
					skillExtensionIdHash: String(hash('pdf-plugin')),
					skillExtensionVersion: '1.2.3',
					skillStorage: 'plugin',
					skillContentHash: String(hash('skill body')),
				},
			}],
			enhanced: [expected],
			internal: [expected],
		});
	});

	test('repoInfo gates collection and multiplexes sink-specific properties', async () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		await reporter.reportRepoInfo({
			restrictedTelemetryEnabled: true,
			trackingId: 'tracking-id',
			telemetryEndpoint: 'https://telemetry.example/telemetry',
			isInternal: true,
			userName: 'octocat',
			isVscodeTeamMember: true,
		}, {
			telemetryMessageId: 'turn-1',
			clientType: AgentHostClientType.EditorWindow,
			location: 'begin',
			remoteUrl: 'https://github.com/microsoft/vscode',
			repoId: 'microsoft/vscode',
			repoType: 'github',
			headCommitHash: 'abc',
			headBranchName: 'feature',
			fileRelativePaths: JSON.stringify(['src/a.ts']),
			diffsJSON: 'x'.repeat(8193),
			result: 'success',
			isActiveRepository: 'true',
			workspaceFileCount: 10,
			changedFileCount: 1,
			diffSizeBytes: 8193,
		});

		assert.deepStrictEqual({
			enhanced: service.enhancedEvents[0],
			internal: service.internalEvents[0],
		}, {
			enhanced: {
				eventName: 'request.repoInfo',
				properties: {
					initiatorClientType: 'editor_window',
					remoteUrl: 'https://github.com/microsoft/vscode',
					repoId: 'microsoft/vscode',
					repoType: 'github',
					headCommitHash: 'abc',
					headBranchName: 'feature',
					fileRelativePaths: JSON.stringify(['src/a.ts']),
					diffsJSON: 'x'.repeat(8192),
					diffsJSONChunk: zlib.gzipSync(Buffer.from('x'.repeat(8193), 'utf8')).toString('base64'),
					result: 'success',
					isActiveRepository: 'true',
					location: 'begin',
					telemetryMessageId: 'turn-1',
				},
			},
			internal: {
				eventName: 'request.repoInfo',
				properties: {
					initiatorClientType: 'editor_window',
					remoteUrl: 'https://github.com/microsoft/vscode',
					repoId: 'microsoft/vscode',
					repoType: 'github',
					headCommitHash: 'abc',
					diffsJSON: 'x'.repeat(8192),
					diffsJSONChunk: zlib.gzipSync(Buffer.from('x'.repeat(8193), 'utf8')).toString('base64'),
					result: 'success',
					isActiveRepository: 'true',
					location: 'begin',
					telemetryMessageId: 'turn-1',
				},
			},
		});
	});

	test('skillContentRead drops the version when no plugin name is known, matching the extension', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.skillContentRead({ clientType: AgentHostClientType.EditorWindow, name: 'local', path: '/skills/local/SKILL.md', content: 'c', source: 'project', pluginName: undefined, pluginVersion: '9.9.9' });

		assert.strictEqual(service.enhancedEvents.length, 1);
		assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionId, '');
		assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionVersion, '');
	});
});
