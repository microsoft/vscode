/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { MessageKind, ResponsePartKind } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ITelemetryService, type ITelemetryData } from '../../../../../../platform/telemetry/common/telemetry.js';
import { validateTelemetryData } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { CloudSandboxLifecycleTelemetry, getCloudSandboxLifecycleSessionId, type ICloudSandboxLifecycleEvent } from '../../../browser/remoteAgentHost/cloudSandboxLifecycleTelemetry.js';
import { CloudSandboxTelemetryService } from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

class RecordingTelemetry extends mock<ITelemetryService>() {
	readonly events: ITelemetryData[] = [];
	override publicLog2(name: string, data?: ITelemetryData): void {
		if (name === 'cloudSandboxLifecycle' && data) {
			this.events.push(data);
		}
	}
}

suite('CloudSandboxLifecycleTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('user-local reporting scope suppresses all operation phases and cannot be cleared by completion metadata', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const context = { environmentKind: 'user-local' as const, environmentId: generateUuid(), agentSessionId: generateUuid(), connectionId: generateUuid() };
		for (const phase of ['credentials.connect', 'credentials.refresh', 'credentials.acquire', 'credentials.retryWait', 'credentials.authentication', 'credentials.stopped'] as const) {
			const operation = telemetry.start(phase, context);
			operation.bind({ environmentKind: undefined, serverRequestId: 'ABCD:1234:5678:90AB:CDEF' });
			operation.complete('failed', { environmentKind: undefined }, new Error('private host failure'));
			telemetry.record({ ...context, phase, outcome: 'failed', operationId: generateUuid() });
		}
		assert.deepStrictEqual(sink.events, []);
	});

	test('pairs pre-identity operations with later binding without rewriting the start', () => runWithFakedTimers({}, async () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const sessionId = generateUuid();
		const environmentId = generateUuid();
		const taskId = generateUuid();
		const operation = telemetry.start('task.create', { taskCreationPath: 'newEnvironment' });
		await timeout(25);
		operation.complete('succeeded', { environmentId, taskId, agentSessionId: sessionId });
		operation.complete('failed');
		assert.deepStrictEqual({
			rows: sink.events.map(event => ({
				operationId: event.operationId, phase: event.phase, outcome: event.outcome,
				environmentId: event.environmentId, agentSessionId: event.agentSessionId,
				durationMs: event.durationMs, sequence: event.sequence,
			})),
			uniqueEvents: new Set(sink.events.map(event => event.eventId)).size,
		}, {
			rows: [
				{ operationId: operation.id, phase: 'task.create', outcome: 'started', environmentId: undefined, agentSessionId: undefined, durationMs: undefined, sequence: 1 },
				{ operationId: operation.id, phase: 'task.create', outcome: 'succeeded', environmentId, agentSessionId: sessionId, durationMs: 25, sequence: 2 },
			],
			uniqueEvents: 2,
		});
	}));

	test('keeps reservation provenance separate from the task created by fallback', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const reservedTask = generateUuid();
		const createdTask = generateUuid();
		const operation = telemetry.start('task.create', { relatedTaskId: reservedTask, taskCreationPath: 'reservationUnconfirmed' });
		operation.complete('succeeded', { taskId: createdTask, taskCreationPath: 'reservationFallback' });
		assert.deepStrictEqual(sink.events.map(event => ({
			task: event.taskId, reservation: event.relatedTaskId, path: event.taskCreationPath,
		})), [
			{ task: undefined, reservation: reservedTask, path: 'reservationUnconfirmed' },
			{ task: createdTask, reservation: reservedTask, path: 'reservationFallback' },
		]);
	});

	test('ignores empty or unchanged bindings without erasing known identities', () => {
		const sink = new RecordingTelemetry();
		const environmentId = generateUuid();
		const taskId = generateUuid();
		const operation = new CloudSandboxLifecycleTelemetry(sink).start('task.create', { environmentId });
		operation.bind({ serverRequestId: undefined });
		operation.bind({ environmentId: undefined, taskId });
		operation.bind({ taskId });
		operation.complete('succeeded');
		assert.deepStrictEqual(sink.events.map(event => [event.outcome, event.environmentId, event.taskId]), [
			['started', environmentId, undefined], ['observed', environmentId, taskId], ['succeeded', environmentId, taskId],
		]);
	});

	test('records cancellation and missing completion distinctly', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		telemetry.start('task.reserve').failed(new CancellationError());
		telemetry.start('task.create').failed(new Error('network abort'), true);
		telemetry.start('repository.prepare');
		assert.deepStrictEqual(sink.events.map(event => [event.phase, event.outcome]), [
			['task.reserve', 'started'], ['task.reserve', 'cancelled'], ['task.create', 'started'], ['task.create', 'cancelled'], ['repository.prepare', 'started'],
		]);
	});

	test('only uploads safe identifiers and structured errors, never diagnostic text or request content', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const unsafe = 'Bearer private-token';
		const input = {
			phase: 'credentials' as const, outcome: 'failed' as const, operationId: generateUuid(),
			environmentId: 'https://private.example/repository', agentSessionId: '/private/path',
			taskId: unsafe, relatedTaskId: unsafe, connectionId: unsafe,
			chatId: unsafe, requestId: unsafe, serverRequestId: unsafe,
			error: { message: unsafe, status: 403, requestId: 'ABCD:1234:5678:9ABC:DEF01234', cause: { message: '/private/path' } },
			detail: unsafe, prompt: unsafe, token: unsafe,
		};
		telemetry.record(input);
		const event = sink.events[0];
		assert.deepStrictEqual({
			omitted: event.omittedCorrelationFields, status: event.statusCode, category: event.errorCategory,
			omittedNames: event.omittedCorrelationFieldNames,
			request: event.serverRequestId,
			privateText: /private|Bearer|prompt|token/.test(JSON.stringify(event)),
		}, {
			omitted: 8, status: 403, category: 'authorization',
			omittedNames: 'environmentId,agentSessionId,taskId,relatedTaskId,connectionId,chatId,requestId,serverRequestId',
			request: 'ABCD:1234:5678:9ABC:DEF01234', privateText: false,
		});
	});

	test('normalizes telemetry UUIDs without inventing an identity for opaque or unsafe resources', () => {
		const id = generateUuid();
		assert.deepStrictEqual([
			getCloudSandboxLifecycleSessionId(id),
			getCloudSandboxLifecycleSessionId(`ahp-session:/${id}`),
			getCloudSandboxLifecycleSessionId(`copilot:/${id.toUpperCase()}`),
			getCloudSandboxLifecycleSessionId('ahp-session:/opaque-session'),
			getCloudSandboxLifecycleSessionId(`ahp-session:/${id}?token=private`),
		], [id, id, id, undefined, undefined]);
	});

	test('revalidates every free-text metadata field and serializes only the explicit payload allowlist', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const sensitive = 'private-person@example.invalid /Users/private-person/repo private chat content';
		const event: ICloudSandboxLifecycleEvent = { phase: 'turn.complete', outcome: 'failed', operationId: generateUuid() };
		Object.assign(event, {
			phase: sensitive, outcome: sensitive, preparationStep: sensitive, taskCreationPath: sensitive, sessionState: sensitive,
			failurePoint: sensitive, recoveryAction: sensitive, refreshStopReason: sensitive, connectionState: sensitive,
			hostErrorType: sensitive, environmentId: sensitive, agentSessionId: sensitive, taskId: sensitive, relatedTaskId: sensitive,
			connectionId: sensitive, attemptId: sensitive, chatId: sensitive, requestId: sensitive, parentOperationId: sensitive, serverRequestId: sensitive,
			prompt: sensitive, message: sensitive, title: sensitive, repoNwo: sensitive, workingDirectory: sensitive, token: sensitive,
			error: { name: sensitive, code: sensitive, message: sensitive, stack: sensitive, statusCode: 403, response: { body: sensitive }, cause: { message: sensitive } },
		});
		telemetry.record(event);
		const serialized = validateTelemetryData(sink.events[0]);
		assert.deepStrictEqual({
			properties: Object.keys(serialized.properties).sort(),
			metadata: [serialized.properties.phase, serialized.properties.outcome, serialized.properties.taskCreationPath, serialized.properties.hostErrorKind, serialized.properties.errorCategory],
			omitted: serialized.measurements.omittedCorrelationFields,
			forbiddenText: /private-person|private chat content|example\.invalid|\/Users\/|Bearer/.test(JSON.stringify(serialized)),
			forbiddenKeys: ['environmentKind', 'prompt', 'message', 'title', 'repoNwo', 'workingDirectory', 'token', 'error', 'stack', 'hostErrorType'].filter(key => Object.hasOwn(serialized.properties, key)),
		}, {
			properties: ['errorCategory', 'eventId', 'hostErrorKind', 'observerId', 'omittedCorrelationFieldNames', 'operationId', 'outcome', 'phase', 'taskCreationPath'],
			metadata: ['unknown', 'unknown', 'unknown', 'unknown', 'authorization'],
			omitted: 10, forbiddenText: false, forbiddenKeys: [],
		});
	});

	test('actionable metadata uses fixed values, bounded measurements and no raw host errors', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		telemetry.record({
			phase: 'credentials.acquire', operationId: generateUuid(), outcome: 'failed',
			failurePoint: 'credentialRefresh.invalidExpiry', recoveryAction: 'deferred', refreshStopReason: 'unusableToken',
			connectionState: 'reconnecting', authenticationRestorePending: true, reconnectScheduled: false,
			attemptNumber: 3, consecutiveFailures: 2, retryDelayMs: 30_000,
			reconnectAttempt: 1, reconnectDelayMs: 0, lastSuccessfulResponseAgeMs: 1250, hostCanResume: false,
			hostErrorType: 'private arbitrary error',
		});
		const valid = validateTelemetryData(sink.events[0]);
		const malformed: ICloudSandboxLifecycleEvent = { phase: 'credentials.acquire', operationId: generateUuid(), outcome: 'failed' };
		Object.assign(malformed, {
			failurePoint: 'private path', recoveryAction: 'private decision', refreshStopReason: 'private reason', connectionState: 'private state',
			authenticationRestorePending: 'private', reconnectScheduled: 'private', hostCanResume: 'private',
			attemptNumber: Infinity, consecutiveFailures: -1, retryDelayMs: NaN,
			reconnectAttempt: 1.5, reconnectDelayMs: -1, lastSuccessfulResponseAgeMs: Infinity,
		});
		telemetry.record(malformed);
		assert.deepStrictEqual({
			properties: [valid.properties.failurePoint, valid.properties.recoveryAction, valid.properties.refreshStopReason, valid.properties.connectionState, valid.properties.hostErrorKind],
			measurements: [valid.measurements.attemptNumber, valid.measurements.consecutiveFailures, valid.measurements.retryDelayMs, valid.measurements.lastSuccessfulResponseAgeMs, valid.measurements.authenticationRestorePending, valid.measurements.reconnectScheduled, valid.measurements.hostCanResume],
			invalid: Object.keys(malformed).filter(key => !['phase', 'operationId', 'outcome'].includes(key) && sink.events[1][key] !== undefined),
			privateContent: JSON.stringify(sink.events).includes('private'),
		}, {
			properties: ['credentialRefresh.invalidExpiry', 'deferred', 'unusableToken', 'reconnecting', 'unknown'],
			measurements: [3, 2, 30_000, 1250, 1, 0, 0],
			invalid: [], privateContent: false,
		});
	});

	test('caps diagnostic counts and durations and recognizes only explicitly supported host error types', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		for (const hostErrorType of ['policyResolutionFailed', 'executionInterrupted', 'CodexThreadInUse', 'unexpected-private-type']) {
			telemetry.record({
				phase: 'turn.complete', operationId: generateUuid(), outcome: 'failed', hostErrorType,
				attemptNumber: 100_001, retryDelayMs: 30 * 24 * 60 * 60_000,
			});
		}
		assert.deepStrictEqual(sink.events.map(event => [event.hostErrorKind, event.attemptNumber, event.retryDelayMs]), [
			['policyResolutionFailed', 10_000, 604_800_000], ['executionInterrupted', 10_000, 604_800_000],
			['sessionInUse', 10_000, 604_800_000], ['unknown', 10_000, 604_800_000],
		]);
	});

	test('retains numeric observation time as a measurement rather than a dropped common timestamp', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		telemetry.record({ phase: 'binding', operationId: generateUuid(), outcome: 'observed', timestamp: 1000 });
		const serialized = validateTelemetryData(sink.events[0]);
		assert.deepStrictEqual({
			observedAt: serialized.measurements.observedAtUnixMs,
			schemaVersion: serialized.measurements.schemaVersion,
			phase: serialized.properties.phase,
			commonTimestamp: serialized.properties.timestamp,
		}, { observedAt: 1000, schemaVersion: 1, phase: 'binding', commonTimestamp: undefined });
	});

	test('ignores unclassified high-volume diagnostics and preserves phase operation/attempt IDs', () => {
		const sink = new RecordingTelemetry();
		const telemetry = new CloudSandboxLifecycleTelemetry(sink);
		const operationId = generateUuid();
		const attemptId = generateUuid();
		const environmentId = generateUuid();
		telemetry.recordDiagnostic({ operationId, phase: 'unknown.vendor.phase', outcome: 'info', timestamp: 0, detail: 'private' }, { environmentId });
		telemetry.recordDiagnostic({ operationId, attemptId, phase: 'protocol.authentication', outcome: 'failed', timestamp: 10, error: { name: 'Error', message: 'private', status: 401 } }, { environmentId });
		assert.deepStrictEqual(sink.events.map(event => ({
			operationId: event.operationId, attemptId: event.attemptId, environmentId: event.environmentId,
			category: event.errorCategory, at: event.observedAtUnixMs,
		})), [{ operationId, attemptId, environmentId, category: 'authentication', at: 10 }]);
	});

	test('a shared environment connection does not attribute every turn to its initial session', () => {
		const sink = new RecordingTelemetry();
		const service = store.add(new CloudSandboxTelemetryService(sink));
		const environmentId = generateUuid();
		const sessionA = generateUuid();
		const sessionB = generateUuid();
		const chat = `ahp-chat:/${generateUuid()}`;
		const connection = store.add(service.trackConnection('connection', 'agentsDesktop', 'existing', { environmentId, sessionId: sessionA }));
		connection.setConnectionId(generateUuid());
		connection.recordConnectionDiagnostic({
			operationId: generateUuid(), phase: 'chat.binding', timestamp: 1, outcome: 'info',
			sessionResource: `ahp-session:/${sessionB}`, chatResource: chat,
		});
		const requestId = `request_${generateUuid()}`;
		const envelope: ActionEnvelope = {
			serverSeq: 12, channel: chat, rejectionReason: 'private authorization failure',
			origin: { clientId: generateUuid(), clientSeq: 1 },
			action: { type: ActionType.ChatTurnStarted, turnId: requestId, startedAt: '2026-01-01T00:00:00Z', message: { text: 'private prompt', origin: { kind: MessageKind.User } } },
		};
		connection.recordSessionAction(envelope, { connectionState: 'connected', authenticationRestorePending: true, lastSuccessfulResponseAgeMs: 250, reconnectScheduled: false });
		connection.recordSessionAction(envelope);
		connection.dispose();
		connection.recordSessionAction({ ...envelope, serverSeq: 13 });
		assert.deepStrictEqual({
			turns: sink.events.filter(event => event.phase === 'turn.accepted').map(event => ({
				environmentId: event.environmentId, session: event.agentSessionId, request: event.requestId, outcome: event.outcome,
				failurePoint: event.failurePoint, state: event.connectionState, authenticationPending: event.authenticationRestorePending, lastResponseMs: event.lastSuccessfulResponseAgeMs,
			})),
			connectionSessions: sink.events.filter(event => event.phase === 'connection.connect').map(event => event.agentSessionId),
			privateContent: JSON.stringify(sink.events).includes('private'),
		}, {
			turns: [{ environmentId, session: sessionB, request: requestId, outcome: 'rejected', failurePoint: 'turn.rejected', state: 'connected', authenticationPending: true, lastResponseMs: 250 }],
			connectionSessions: [undefined, undefined],
			privateContent: false,
		});
	});

	test('does not emit sandbox lifecycle events for unidentified or user-local connections', () => {
		const sink = new RecordingTelemetry();
		const service = store.add(new CloudSandboxTelemetryService(sink));
		for (const context of [{}, { environmentId: generateUuid(), environmentKind: 'user-local' as const }]) {
			const connection = store.add(service.trackConnection('connection', 'agentsDesktop', 'existing', context));
			connection.onConnectionStateChange('connected');
			connection.recordConnectionDiagnostic({ phase: 'session.snapshot', operationId: generateUuid(), timestamp: 1, outcome: 'info', sessionResource: `ahp-session:/${generateUuid()}` });
			connection.dispose();
		}
		assert.deepStrictEqual(sink.events, []);
	});

	test('failed session and turn observations retain safe error categories without content', () => {
		const sink = new RecordingTelemetry();
		const service = store.add(new CloudSandboxTelemetryService(sink));
		const connection = store.add(service.trackConnection('connection', 'agentsDesktop', 'existing', { environmentId: generateUuid() }));
		const session = `ahp-session:/${generateUuid()}`;
		const chat = `ahp-chat:/${generateUuid()}`;
		connection.recordConnectionDiagnostic({ phase: 'chat.binding', operationId: generateUuid(), timestamp: 1, outcome: 'info', sessionResource: session, chatResource: chat });
		const error = { errorType: 'private type', message: 'private message', stack: 'private stack' };
		connection.recordSessionAction({ serverSeq: 1, channel: session, origin: undefined, action: { type: ActionType.SessionCreationFailed, error } });
		connection.recordSessionAction({
			serverSeq: 2, channel: chat, origin: undefined,
			action: { type: ActionType.ChatError, turnId: `request_${generateUuid()}`, duration: 20, part: { kind: ResponsePartKind.Error, error } },
		});
		assert.deepStrictEqual({
			failures: sink.events.filter(event => event.outcome === 'failed').map(event => [event.phase, event.errorCategory]),
			privateContent: JSON.stringify(sink.events).includes('private'),
		}, { failures: [['session.ready', 'unknown'], ['turn.complete', 'unknown']], privateContent: false });
	});

	test('uses a new logical operation for recovery without losing environment identity', () => {
		const sink = new RecordingTelemetry();
		const service = store.add(new CloudSandboxTelemetryService(sink));
		const environmentId = generateUuid();
		const connection = store.add(service.trackConnection('connection', 'agentsDesktop', 'created', { environmentId, taskCreationPath: 'reservationClaimed' }));
		connection.onConnectionStateChange('connected');
		connection.onConnectionStateChange('reconnecting');
		connection.onConnectionStateChange('connected');
		const operations = sink.events.filter(event => event.phase === 'connection.connect' || event.phase === 'connection.recover');
		assert.deepStrictEqual({
			outcomes: operations.map(event => [event.phase, event.outcome, event.environmentId, event.taskCreationPath]),
			distinctOperations: new Set(operations.map(event => event.operationId)).size,
		}, {
			outcomes: [
				['connection.connect', 'started', environmentId, 'reservationClaimed'],
				['connection.connect', 'succeeded', environmentId, 'reservationClaimed'],
				['connection.recover', 'started', environmentId, 'reservationClaimed'],
				['connection.recover', 'succeeded', environmentId, 'reservationClaimed'],
			],
			distinctOperations: 2,
		});
	});
});
