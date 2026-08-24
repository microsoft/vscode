/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@github/copilot-sdk';
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { AgentSession } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import { readAgentErrorTelemetryMeta } from '../../common/meta/agentErrorMeta.js';
import { buildChatUri, buildSubagentSessionUri } from '../../common/state/sessionState.js';
import { classifyCopilotClientOperationFailure, CopilotClientStartupConfigChangedError, createCopilotFailureCorrelation, isRecognizedCopilotClientStartupFailure, normalizeCopilotApiEndpoint, reportCopilotClientStartup, reportCopilotModelCallFailure } from '../../node/copilot/copilotFailureTelemetry.js';

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = true;
	readonly events: { eventName: string; data: Record<string, unknown> | undefined }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: Record<string, unknown>): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(eventName: string, data?: Record<string, unknown>): void {
		this.events.push({ eventName, data });
	}
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('CopilotFailureTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('separates startup failures from established-client operation failures', () => {
		const errors = [
			new Error('Connection is closed.'),
			new Error('Connection is disposed.'),
			new Error('Client not connected'),
			new Error('The in-process runtime connection is closed.'),
			new Error('Failed to start CLI server: spawn failed'),
			new Error('CLI server exited with code 1'),
			new Error('CLI server exited unexpectedly with code 1'),
			new Error('Timeout waiting for CLI server to start'),
			new CopilotClientStartupConfigChangedError(),
			new Error('429 too many requests'),
		];
		assert.deepStrictEqual({
			operationFailures: errors.map(classifyCopilotClientOperationFailure),
			startupFailures: errors.map(isRecognizedCopilotClientStartupFailure),
		}, {
			operationFailures: [
				'connectionClosed',
				'connectionDisposed',
				'clientNotConnected',
				'runtimeConnectionClosed',
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
			],
			startupFailures: [false, false, false, false, true, true, true, true, true, false],
		});
	});

	test('reports bounded causes for configuration changes and unknown startup failures', () => {
		const telemetryService = new CapturingTelemetryService();
		reportCopilotClientStartup(telemetryService, {
			outcome: 'failure',
			durationMs: 10,
			attemptNumber: 1,
		}, new CopilotClientStartupConfigChangedError());
		reportCopilotClientStartup(telemetryService, {
			outcome: 'failure',
			durationMs: 20,
			attemptNumber: 2,
		}, new Error('Unexpected startup failure'));

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.copilotClientStartup',
			data: {
				outcome: 'failure',
				durationMs: 10,
				attemptNumber: 1,
				startupFailureCause: 'configurationChanged',
				startupFailureResource: 'other',
				startupExitCode: undefined,
			},
		}, {
			eventName: 'agentHost.copilotClientStartup',
			data: {
				outcome: 'failure',
				durationMs: 20,
				attemptNumber: 2,
				startupFailureCause: 'other',
				startupFailureResource: 'other',
			},
		}]);
	});

	test('builds the Agent Host and SDK correlation tuple', () => {
		const session = AgentSession.uri('copilotcli', 'agent-session-id');
		const chat = URI.parse(buildChatUri(session, 'peer-chat-id'));

		assert.deepStrictEqual(createCopilotFailureCorrelation(session, chat, 'turn-id', 'sdk-session-id', {
			clientType: AgentHostClientType.EditorWindow,
			connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			transportKind: AgentHostTransportKind.MessagePort,
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			machineId: 'client-machine-id',
			devDeviceId: 'client-dev-device-id',
		}), {
			initiatorClientType: 'editor_window',
			initiatorConnectionKind: 'remote_extension_host',
			initiatorTransportKind: 'message_port',
			hostLaunchKind: 'vscode_main_process',
			initiatorMachineId: 'client-machine-id',
			initiatorDevDeviceId: 'client-dev-device-id',
			agentSessionId: 'agent-session-id',
			chatSessionId: getTelemetryChatSessionId(chat),
			turnId: 'turn-id',
			sdkSessionId: 'sdk-session-id',
		});
	});

	test('hashes subagent chat IDs without path-like telemetry values', () => {
		const session = AgentSession.uri('copilotcli', 'agent-session-id');
		const subagent = URI.parse(buildSubagentSessionUri(session, 'tool-call-id'));
		const value = getTelemetryChatSessionId(subagent);

		assert.strictEqual(value, String(Number(value)));
		assert.strictEqual(value.includes('/'), false);
	});

	test('normalizes only allowlisted Copilot API endpoints', () => {
		assert.deepStrictEqual([
			normalizeCopilotApiEndpoint('/chat/completions'),
			normalizeCopilotApiEndpoint('/responses'),
			normalizeCopilotApiEndpoint('/v1/messages'),
			normalizeCopilotApiEndpoint('ws:/responses'),
			normalizeCopilotApiEndpoint('https://api.githubcopilot.com/responses'),
			normalizeCopilotApiEndpoint('https://contoso.example/private/deployment'),
			normalizeCopilotApiEndpoint(undefined),
		], [
			'chatCompletions',
			'responses',
			'anthropicMessages',
			'responsesWebSocket',
			'responses',
			'other',
			undefined,
		]);
	});

	test('reports bounded model call endpoint categories instead of raw endpoints', () => {
		const telemetryService = new CapturingTelemetryService();
		const session = AgentSession.uri('copilotcli', 'agent-session-id');
		const chat = URI.parse(buildChatUri(session, 'peer-chat-id'));
		const correlation = createCopilotFailureCorrelation(session, chat, 'turn-id', 'sdk-session-id');
		const event: SessionEventPayload<'model.call_failure'> = {
			type: 'model.call_failure',
			id: 'event-1',
			parentId: 'parent-1',
			agentId: 'agent-1',
			timestamp: '2026-01-01T00:00:00.000Z',
			ephemeral: true,
			data: {
				source: 'top_level',
				failureKind: 'api',
				transport: 'http',
				apiEndpoint: '/responses',
				statusCode: 500,
				durationMs: 42,
				model: 'gpt-5.6-sol',
				reasoningEffort: 'high',
				isAuto: false,
				isByok: false,
				rte: true,
				badRequestKind: undefined,
				apiCallId: 'api-call-id',
				providerCallId: 'provider-call-id',
				serviceRequestId: 'service-request-id',
				requestFingerprint: undefined,
			},
		};

		reportCopilotModelCallFailure(telemetryService, event, correlation);

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.copilotModelCallFailure',
			data: {
				agentSessionId: 'agent-session-id',
				chatSessionId: getTelemetryChatSessionId(chat),
				turnId: 'turn-id',
				sdkSessionId: 'sdk-session-id',
				sdkEventId: 'event-1',
				sdkParentEventId: 'parent-1',
				sdkAgentId: 'agent-1',
				failureKind: 'api',
				source: 'top_level',
				transport: 'http',
				apiEndpoint: 'responses',
				statusCode: 500,
				durationMs: 42,
				model: 'gpt-5.6-sol',
				reasoningEffort: 'high',
				isAuto: false,
				isByok: false,
				rte: true,
				badRequestKind: undefined,
				apiCallId: 'api-call-id',
				providerCallId: 'provider-call-id',
				serviceRequestId: 'service-request-id',
				messageCount: undefined,
				toolCallCount: undefined,
				toolResultMessageCount: undefined,
				namelessToolCallCount: undefined,
				imagePartCount: undefined,
				imagePartsMissingMediaType: undefined,
			},
		}]);
	});

	test('drops empty provider request identifiers', () => {
		assert.deepStrictEqual(readAgentErrorTelemetryMeta({
			errorType: 'test',
			message: 'failed',
			_meta: {
				chatError: {
					fetchError: {
						requestId: '',
						serverRequestId: '',
					},
				},
			},
		}), {
			providerCallId: undefined,
			serviceRequestId: undefined,
		});
	});
});
