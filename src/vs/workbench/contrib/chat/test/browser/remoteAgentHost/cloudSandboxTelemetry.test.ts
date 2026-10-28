/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxRequestError, type CloudSandboxTaskCreationPath } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IConnectionDiagnosticEvent, traceConnectionOperation } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryService } from '../../../../../../platform/telemetry/common/telemetryService.js';
import {
	CloudSandboxConnectionHealthClassification,
	CloudSandboxConnectionOutcomeClassification,
	CloudSandboxFirstSessionRequestClassification,
	CloudSandboxProvisioningOutcomeClassification,
	CloudSandboxTelemetryService,
	UserLocalRelaySessionOpenClassification,
	getCloudSandboxConnectionSurface,
	requestOutcomeForStatus,
} from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

interface ICapturedEvent {
	readonly eventName: string;
	readonly data: ITelemetryData | undefined;
}

const connectionDetails = {
	environmentOperation: 'resume', provisioningMs: 0, reservationWaitMs: 0, readinessMs: 0,
	preparationMs: 0, connectionMs: 0,
	environmentKind: 'cloud',
	taskCreationPath: 'unknown',
	surface: 'unknown', source: 'existing', credentialRequests: 0, wakingResponses: 0, transportAttempts: 0,
	credentialsMs: 0, relayMs: 0, protocolMs: 0, authenticationMs: 0, restorationMs: 0,
	firstFailurePhase: undefined, firstFailureCode: undefined,
	credentialFailures: 0, relayFailures: 0, protocolFailures: 0, authenticationFailures: 0, restorationFailures: 0,
};

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'sessionId';
	readonly machineId = 'machineId';
	readonly sqmId = 'sqmId';
	readonly devDeviceId = 'devDeviceId';
	readonly firstSessionDate = 'firstSessionDate';
	readonly events: ICapturedEvent[] = [];

	publicLog(): void { }
	publicLogError(): void { }
	publicLog2(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('cloudSandbox telemetry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the actual window and runtime rather than assuming every sandbox client is the Editor', () => {
		assert.deepStrictEqual([
			getCloudSandboxConnectionSurface(false, false),
			getCloudSandboxConnectionSurface(false, true),
			getCloudSandboxConnectionSurface(true, false),
			getCloudSandboxConnectionSurface(true, true),
		], ['editorDesktop', 'editorWeb', 'agentsDesktop', 'agentsWeb']);
	});

	for (const taskCreationPath of ['newEnvironment', 'existingEnvironment', 'reservationClaimed', 'reservationFallback', 'unknown'] as const) {
		test(`carries ${taskCreationPath} across existing timing events without changing their boundaries`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			await timeout(20_000);
			const provisioningStartedAt = Date.now();
			await timeout(400);
			service.reportProvisioningOutcome('success', 400, taskCreationPath);
			const connection = store.add(service.trackConnection('credentials', 'agentsWeb', 'created', { provisioningStartedAt, taskCreationPath, reservationWaitMs: 0 }));
			const request = connection.createRequestObserver();
			request('issued');
			request('waking');
			await timeout(200);
			connection.setConnectStage('connection');
			for (const [phase, duration] of [
				['transport.connect', 50], ['protocol.initialize', 75],
				['protocol.authentication', 25], ['protocol.subscriptions', 40],
			] as const) {
				const diagnostic = { operationId: `private-${phase}`, phase, timestamp: Date.now(), detail: 'private-diagnostic-content' };
				connection.recordConnectionDiagnostic({ ...diagnostic, outcome: 'started' });
				await timeout(duration);
				connection.recordConnectionDiagnostic({ ...diagnostic, outcome: 'succeeded' });
			}
			connection.onConnectionStateChange('connected');
			await timeout(300);
			const firstRequest = { operationId: 'private-first', phase: 'protocol.firstSessionRequest', timestamp: Date.now() };
			connection.recordConnectionDiagnostic({ ...firstRequest, outcome: 'started' });
			await timeout(60);
			connection.recordConnectionDiagnostic({ ...firstRequest, outcome: 'succeeded' });
			connection.recordConnectionDiagnostic({ ...firstRequest, outcome: 'succeeded' });
			connection.dispose();
			service.dispose();

			const connect = telemetry.events.find(event => event.eventName === 'cloudSandboxConnectionOutcome')?.data;
			assert.deepStrictEqual({
				events: telemetry.events.map(event => event.eventName),
				paths: telemetry.events.filter(event => event.data?.taskCreationPath !== undefined).map(event => event.data?.taskCreationPath),
				taskMs: telemetry.events[0].data?.durationMs,
				timing: {
					provisioningMs: connect?.provisioningMs, reservationWaitMs: connect?.reservationWaitMs, readinessMs: connect?.readinessMs,
					durationMs: connect?.durationMs, credentialsMs: connect?.credentialsMs, relayMs: connect?.relayMs,
					protocolMs: connect?.protocolMs, authenticationMs: connect?.authenticationMs, restorationMs: connect?.restorationMs,
				},
				firstRequestMs: telemetry.events.find(event => event.eventName === 'cloudSandboxFirstSessionRequest')?.data?.durationMs,
				privateContent: JSON.stringify(telemetry.events).includes('private-'),
			}, {
				events: ['cloudSandboxProvisioningOutcome', 'cloudSandboxConnectionOutcome', 'cloudSandboxFirstSessionRequest', 'cloudSandboxConnectionHealth'],
				paths: [taskCreationPath, taskCreationPath, taskCreationPath], taskMs: 400,
				timing: { provisioningMs: 400, reservationWaitMs: 0, readinessMs: 790, durationMs: 390, credentialsMs: 200, relayMs: 50, protocolMs: 75, authenticationMs: 25, restorationMs: 40 },
				firstRequestMs: 60, privateContent: false,
			});
		}));
	}

	test('recovery retains startup provenance without counting task creation again', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const provisioningStartedAt = Date.now();
		await timeout(20);
		const connection = store.add(service.trackConnection('connection', 'agentsWeb', 'created', { provisioningStartedAt, reservationWaitMs: 15, taskCreationPath: 'reservationClaimed' }));
		await timeout(30);
		connection.onConnectionStateChange('connected');
		connection.onConnectionStateChange('reconnecting');
		await timeout(40);
		connection.onConnectionStateChange('connected');
		service.dispose();

		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'cloudSandboxConnectionOutcome').map(event => ({
			operation: event.data?.operation, path: event.data?.taskCreationPath,
			provisioningMs: event.data?.provisioningMs, reservationWaitMs: event.data?.reservationWaitMs, readinessMs: event.data?.readinessMs,
		})), [
			{ operation: 'connect', path: 'reservationClaimed', provisioningMs: 20, reservationWaitMs: 15, readinessMs: 50 },
			{ operation: 'recover', path: 'reservationClaimed', provisioningMs: 0, reservationWaitMs: 0, readinessMs: 40 },
		]);
	}));

	for (const measurement of [
		{ name: 'unknown', value: undefined, expected: undefined },
		{ name: 'zero', value: 0, expected: 0 },
		{ name: 'observed wait', value: 40, expected: 40 },
		{ name: 'larger than provisioning', value: 500, expected: 100 },
		{ name: 'negative', value: -10, expected: 0 },
		{ name: 'not finite', value: Infinity, expected: undefined },
		{ name: 'not a number', value: NaN, expected: undefined },
	]) {
		test(`reservation wait is a measured subset, not added to readiness: ${measurement.name}`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const provisioningStartedAt = Date.now();
			await timeout(100);
			const connection = store.add(service.trackConnection('credentials', 'agentsWeb', 'created', {
				provisioningStartedAt, reservationWaitMs: measurement.value, taskCreationPath: 'reservationClaimed',
			}));
			await timeout(20);
			connection.setConnectStage('connection');
			await timeout(30);
			connection.onConnectionStateChange('connected');
			service.dispose();

			const data = telemetry.events.find(event => event.eventName === 'cloudSandboxConnectionOutcome')?.data;
			assert.deepStrictEqual({
				reservationWaitMs: data?.reservationWaitMs, provisioningMs: data?.provisioningMs,
				durationMs: data?.durationMs, readinessMs: data?.readinessMs,
				preparationMs: data?.preparationMs, connectionMs: data?.connectionMs,
			}, {
				reservationWaitMs: measurement.expected, provisioningMs: 100, durationMs: 50,
				readinessMs: 150, preparationMs: 20, connectionMs: 30,
			});
		}));
	}

	test('a known reservation wait does not invent an unknown submission start', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection', 'agentsWeb', 'created', { reservationWaitMs: 40 }));
		await timeout(30);
		connection.onConnectionStateChange('connected');
		service.dispose();

		const data = telemetry.events.find(event => event.eventName === 'cloudSandboxConnectionOutcome')?.data;
		assert.deepStrictEqual({ wait: data?.reservationWaitMs, total: data?.readinessMs, provisioning: data?.provisioningMs }, {
			wait: 40, total: undefined, provisioning: undefined,
		});
	}));

	test('unrecognized creation-path metadata becomes unknown without exporting it', () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const taskCreationPath: CloudSandboxTaskCreationPath = JSON.parse('"private-diagnostic-content"');
		const reservationWaitMs: number = JSON.parse('"private-timing-content"');
		service.reportProvisioningOutcome('failure', 10, taskCreationPath);
		const connection = store.add(service.trackConnection('connection', 'agentsWeb', 'created', { taskCreationPath, reservationWaitMs }));
		connection.onConnectionStateChange('connected');
		const request = { operationId: 'first', phase: 'protocol.firstSessionRequest', timestamp: Date.now() };
		connection.recordConnectionDiagnostic({ ...request, outcome: 'started' });
		connection.recordConnectionDiagnostic({ ...request, outcome: 'succeeded' });
		service.dispose();

		assert.deepStrictEqual({
			paths: telemetry.events.filter(event => event.data?.taskCreationPath !== undefined).map(event => event.data?.taskCreationPath),
			reservationWait: telemetry.events.find(event => event.eventName === 'cloudSandboxConnectionOutcome')?.data?.reservationWaitMs,
			privateContent: JSON.stringify(telemetry.events).includes('private-'),
		}, { paths: ['unknown', 'unknown', 'unknown'], reservationWait: undefined, privateContent: false });
	});

	for (const source of ['created', 'existing'] as const) {
		for (const outcome of ['success', 'failure', 'cancelled'] as const) {
			test(`includes slow protocol responses in ${source} environment readiness with ${outcome}`, () => runWithFakedTimers({}, async () => {
				const telemetry = new TestTelemetryService();
				const service = store.add(new CloudSandboxTelemetryService(telemetry));
				const provisioningStartedAt = Date.now();
				await timeout(1000);
				const connection = store.add(service.trackConnection('credentials', 'agentsWeb', source, { provisioningStartedAt, reservationWaitMs: 200 }));
				await timeout(100);
				connection.setConnectStage('connection');
				const diagnostic = (operationId: string, phase: string, outcome: IConnectionDiagnosticEvent['outcome']) =>
					connection.recordConnectionDiagnostic({ operationId, phase, outcome, timestamp: Date.now() });
				diagnostic('relay', 'transport.connect', 'started');
				await timeout(10);
				diagnostic('relay', 'transport.connect', 'succeeded');
				diagnostic('handshake', 'protocol.initialize', 'started');
				await timeout(8000);
				if (outcome !== 'cancelled') {
					diagnostic('handshake', 'protocol.initialize', outcome === 'success' ? 'succeeded' : 'failed');
				}
				connection.onConnectionStateChange(outcome === 'success' ? 'connected' : outcome === 'failure' ? 'failed' : 'disposed');
				service.dispose();

				assert.deepStrictEqual(telemetry.events, [{
					eventName: 'cloudSandboxConnectionOutcome', data: {
						...connectionDetails, operation: 'connect', source, surface: 'agentsWeb', outcome, stage: 'protocol',
						environmentOperation: source === 'created' ? 'provision' : 'resume',
						provisioningMs: source === 'created' ? 1000 : 0, readinessMs: source === 'created' ? 9110 : 8110,
						reservationWaitMs: source === 'created' ? 200 : 0,
						durationMs: 8110, preparationMs: 100, connectionMs: 8010, credentialsMs: 100,
						relayMs: 10, transportAttempts: 1, protocolMs: 8000,
						protocolFailures: outcome === 'failure' ? 1 : 0,
						firstFailurePhase: outcome === 'failure' ? 'protocol.initialize' : undefined,
					},
				}]);
			}));
		}
	}

	test('separates Mission Control outcomes and connection health from cloud sandboxes', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const cloud = store.add(service.trackConnection('connection'));
		const missionControl = store.add(service.trackConnection('connection', 'agentsDesktop', 'existing', { environmentKind: 'user-local' }));
		cloud.onConnectionStateChange('connected');
		missionControl.onConnectionStateChange('connected');
		cloud.recordConnectionDiagnostic({ operationId: 'cloud-session', phase: 'protocol.firstSessionRequest', outcome: 'started', timestamp: Date.now() });
		missionControl.recordConnectionDiagnostic({ operationId: 'session', phase: 'protocol.firstSessionRequest', outcome: 'started', timestamp: Date.now() });
		await timeout(1000);
		cloud.recordConnectionDiagnostic({ operationId: 'cloud-session', phase: 'protocol.firstSessionRequest', outcome: 'succeeded', timestamp: Date.now() });
		missionControl.recordConnectionDiagnostic({ operationId: 'session', phase: 'protocol.firstSessionRequest', outcome: 'succeeded', timestamp: Date.now() });
		missionControl.onConnectionStateChange('reconnecting');
		missionControl.onConnectionStateChange('reconnecting');
		await timeout(1000);
		missionControl.onConnectionStateChange('connected');
		await timeout(1000);
		service.flushConnectionHealth();
		missionControl.dispose();
		cloud.dispose();
		const failed = store.add(service.trackConnection('credentials', 'agentsDesktop', 'existing', { environmentKind: 'user-local' }));
		failed.completeConnect('failure');
		const cancelled = store.add(service.trackConnection('credentials', 'agentsDesktop', 'existing', { environmentKind: 'user-local' }));
		cancelled.completeConnect('cancelled');
		service.dispose();

		assert.deepStrictEqual({
			outcomes: telemetry.events.filter(event => event.eventName.endsWith('ConnectionOutcome')).map(event => [
				event.eventName, event.data?.environmentKind, event.data?.operation, event.data?.environmentOperation, event.data?.outcome,
			]),
			firstRequest: telemetry.events.filter(event => event.eventName.endsWith('FirstSessionRequest')),
			health: telemetry.events.filter(event => event.eventName.endsWith('ConnectionHealth')),
			totalEvents: telemetry.events.length,
		}, {
			outcomes: [
				['cloudSandboxConnectionOutcome', 'cloud', 'connect', 'resume', 'success'],
				['userLocalRelayConnectionOutcome', 'user-local', 'connect', 'attach', 'success'],
				['userLocalRelayConnectionOutcome', 'user-local', 'recover', 'recover', 'success'],
				['userLocalRelayConnectionOutcome', 'user-local', 'connect', 'attach', 'failure'],
				['userLocalRelayConnectionOutcome', 'user-local', 'connect', 'attach', 'cancelled'],
			],
			firstRequest: [
				{ eventName: 'cloudSandboxFirstSessionRequest', data: { environmentKind: 'cloud', taskCreationPath: 'unknown', surface: 'unknown', source: 'existing', outcome: 'success', durationMs: 1000 } },
				{ eventName: 'userLocalRelayFirstSessionRequest', data: { environmentKind: 'user-local', taskCreationPath: 'unknown', surface: 'agentsDesktop', source: 'existing', outcome: 'success', durationMs: 1000 } },
			],
			health: [
				{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 3000, unexpectedDisconnects: 0, receivedFrames: 0 } },
				{ eventName: 'userLocalRelayConnectionHealth', data: { environmentKind: 'user-local', connectedMs: 2000, unexpectedDisconnects: 1, receivedFrames: 0 } },
			],
			totalEvents: 9,
		});
	}));

	test('missing provisioning start stays unknown rather than understating new-environment readiness', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('credentials', 'agentsWeb', 'created'));
		await timeout(50);
		connection.setConnectStage('connection');
		await timeout(100);
		connection.onConnectionStateChange('connected');
		service.dispose();
		assert.deepStrictEqual(telemetry.events, [{
			eventName: 'cloudSandboxConnectionOutcome', data: {
				...connectionDetails, operation: 'connect', source: 'created', surface: 'agentsWeb', outcome: 'success', stage: 'connection',
				environmentOperation: 'provision', provisioningMs: undefined, reservationWaitMs: undefined, readinessMs: undefined,
				durationMs: 150, preparationMs: 50, connectionMs: 100, credentialsMs: 50,
			},
		}]);
	}));

	test('user-local attachment is not classified as sandbox resume', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection', 'agentsDesktop', 'existing', { environmentKind: 'user-local' }));
		await timeout(40);
		connection.onConnectionStateChange('connected');
		service.dispose();
		assert.deepStrictEqual(telemetry.events, [{
			eventName: 'userLocalRelayConnectionOutcome', data: {
				...connectionDetails, operation: 'connect', surface: 'agentsDesktop', outcome: 'success', stage: 'connection',
				environmentKind: 'user-local', environmentOperation: 'attach', readinessMs: 40, durationMs: 40, connectionMs: 40,
			},
		}]);
	}));

	test('attributes cumulative phases and actual requests to each logical operation without exporting diagnostic content', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const provisioningStartedAt = Date.now();
		await timeout(100);
		const connection = store.add(service.trackConnection('credentials', 'agentsWeb', 'created', { provisioningStartedAt }));
		const request = connection.createRequestObserver();
		const diagnostic = (operationId: string, phase: string, outcome: IConnectionDiagnosticEvent['outcome']) => connection.recordConnectionDiagnostic({
			operationId, phase, outcome, timestamp: Date.now(),
			detail: 'https://private.example/?token=secret', error: { name: 'Error', message: 'private request content' },
		});
		request('issued');
		await timeout(20);
		request('waking');
		request('issued');
		await timeout(30);
		connection.setConnectStage('connection');
		diagnostic('dial-1', 'transport.connect', 'started');
		await timeout(10);
		diagnostic('dial-1', 'transport.connect', 'failed');
		await timeout(40);
		diagnostic('renew', 'credentials', 'started');
		request('issued');
		await timeout(20);
		diagnostic('renew', 'credentials', 'succeeded');
		for (const [phase, duration] of [
			['transport.reconnect', 15], ['protocol.reconnect', 30], ['protocol.authentication', 40], ['protocol.subscriptions', 50],
		] as const) {
			diagnostic(phase, phase, 'started');
			await timeout(duration);
			diagnostic(phase, phase, 'succeeded');
		}
		connection.onConnectionStateChange('connected');
		connection.onConnectionStateChange('reconnecting');
		diagnostic('next-renew', 'credentials', 'started');
		request('issued');
		await timeout(25);
		connection.onConnectionStateChange('failed');
		diagnostic('next-renew', 'credentials', 'succeeded');
		request('issued');
		service.dispose();

		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'cloudSandboxConnectionOutcome'), [
			{
				eventName: 'cloudSandboxConnectionOutcome', data: {
					...connectionDetails,
					operation: 'connect', outcome: 'success', stage: 'restoration', durationMs: 255, surface: 'agentsWeb', source: 'created',
					environmentOperation: 'provision', provisioningMs: 100, reservationWaitMs: undefined, readinessMs: 355,
					preparationMs: 70, connectionMs: 185,
					credentialRequests: 3, wakingResponses: 1, transportAttempts: 2,
					credentialsMs: 70, relayMs: 25, protocolMs: 30, authenticationMs: 40, restorationMs: 50,
					firstFailurePhase: 'transport.connect', firstFailureCategory: 'unknown', relayFailures: 1,
				},
			},
			{
				eventName: 'cloudSandboxConnectionOutcome', data: {
					...connectionDetails, operation: 'recover', outcome: 'failure', stage: 'credentials', durationMs: 25,
					environmentOperation: 'recover', readinessMs: 25,
					preparationMs: 25,
					surface: 'agentsWeb', source: 'created', credentialRequests: 1, credentialsMs: 25,
				},
			},
		]);
	}));

	for (const operation of ['connect', 'recover'] as const) {
		for (const outcome of ['success', 'failure', 'cancelled'] as const) {
			test(`partitions ${operation} ${outcome} without counting credential retry backoff or nested authentication twice`, () => runWithFakedTimers({}, async () => {
				const telemetry = new TestTelemetryService();
				const service = store.add(new CloudSandboxTelemetryService(telemetry));
				const connection = store.add(service.trackConnection(operation === 'connect' ? 'credentials' : 'connection'));
				if (operation === 'recover') {
					connection.onConnectionStateChange('connected');
					await timeout(1000);
					connection.onConnectionStateChange('reconnecting');
				}
				await timeout(5);
				connection.setConnectStage('connection');
				const diagnostic = (operationId: string, phase: string, outcome: IConnectionDiagnosticEvent['outcome']) =>
					connection.recordConnectionDiagnostic({ operationId, phase, outcome, timestamp: Date.now() });
				diagnostic('auth', 'protocol.authentication', 'started');
				await timeout(10);
				diagnostic('first', 'credentials', 'started');
				await timeout(20);
				diagnostic('first', 'credentials', 'failed');
				diagnostic('auth', 'protocol.authentication', 'failed');
				await timeout(30);
				diagnostic('second', 'credentials', 'started');
				await timeout(40);
				diagnostic('first', 'credentials', 'succeeded');
				diagnostic('second', 'credentials', 'succeeded');
				await timeout(50);
				connection.onConnectionStateChange(outcome === 'success' ? 'connected' : outcome === 'failure' ? 'failed' : 'disposed');
				service.dispose();

				assert.deepStrictEqual(telemetry.events.filter(event => event.data?.operation === operation).map(event => event.data), [{
					...connectionDetails, operation, outcome, stage: 'credentials', durationMs: 155,
					environmentOperation: operation === 'connect' ? 'resume' : 'recover', readinessMs: 155,
					preparationMs: operation === 'connect' ? 95 : 90, connectionMs: operation === 'connect' ? 60 : 65,
					credentialsMs: operation === 'connect' ? 65 : 60, authenticationMs: 30,
					firstFailurePhase: 'credentials', credentialFailures: 1, authenticationFailures: 1,
				}]);
			}));
		}
	}

	test('connection setup ends credential failure backoff even without another credential phase', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('credentials'));
		connection.recordConnectionDiagnostic({ operationId: 'mint', phase: 'credentials', outcome: 'started', timestamp: Date.now() });
		await timeout(10);
		connection.recordConnectionDiagnostic({ operationId: 'mint', phase: 'credentials', outcome: 'failed', timestamp: Date.now() });
		await timeout(20);
		connection.recordConnectionDiagnostic({ operationId: 'relay', phase: 'transport.connect', outcome: 'started', timestamp: Date.now() });
		await timeout(30);
		connection.onConnectionStateChange('connected');
		service.dispose();
		assert.deepStrictEqual(telemetry.events, [{
			eventName: 'cloudSandboxConnectionOutcome', data: {
				...connectionDetails, operation: 'connect', outcome: 'success', stage: 'relay', durationMs: 60,
				readinessMs: 60,
				preparationMs: 30, connectionMs: 30, credentialsMs: 10, relayMs: 30, transportAttempts: 1,
				firstFailurePhase: 'credentials', credentialFailures: 1,
			},
		}]);
	}));

	for (const outcome of ['success', 'failure', 'cancelled'] as const) {
		test(`preserves the first protocol failure after credential cooldown and ${outcome}`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const connection = store.add(service.trackConnection('connection', 'agentsWeb'));
			connection.onConnectionStateChange('connected');
			connection.onConnectionStateChange('reconnecting');
			const errors = [
				['protocol.reconnect', new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'invalid params: missing field `channel`')],
				['credentials', new Error('Sandbox credential refresh is stopped or waiting to retry.')],
			] as const;
			for (const [phase, error] of errors) {
				await assert.rejects(traceConnectionOperation(event => connection.recordConnectionDiagnostic(event), phase, async () => {
					await timeout(10);
					throw error;
				}), caught => caught === error);
			}
			connection.onConnectionStateChange(outcome === 'success' ? 'connected' : outcome === 'failure' ? 'failed' : 'disposed');
			service.dispose();

			assert.deepStrictEqual(telemetry.events.filter(event => event.data?.operation === 'recover'), [{
				eventName: 'cloudSandboxConnectionOutcome',
				data: {
					...connectionDetails, operation: 'recover', outcome, stage: 'credentials', surface: 'agentsWeb', durationMs: 20,
					environmentOperation: 'recover', readinessMs: 20,
					preparationMs: 10, connectionMs: 10,
					credentialsMs: 10, protocolMs: 10,
					firstFailurePhase: 'protocol.reconnect', firstFailureCode: JsonRpcErrorCodes.InvalidParams,
					firstFailureCategory: 'protocol',
					credentialFailures: 1, protocolFailures: 1,
				},
			}]);
		}));
	}

	test('resets failure evidence for the next recovery and ignores duplicate completions', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		connection.onConnectionStateChange('connected');
		for (const [index, code] of [JsonRpcErrorCodes.InvalidParams, AhpErrorCodes.AuthRequired].entries()) {
			connection.onConnectionStateChange('reconnecting');
			const event = {
				operationId: `attempt-${index}`, phase: 'protocol.reconnect', timestamp: Date.now(),
				error: { name: 'Error', message: 'private response', code: String(code) },
			};
			connection.recordConnectionDiagnostic({ ...event, outcome: 'started' });
			connection.recordConnectionDiagnostic({ ...event, outcome: 'failed' });
			connection.recordConnectionDiagnostic({ ...event, outcome: 'failed' });
			connection.onConnectionStateChange('connected');
		}
		service.dispose();

		assert.deepStrictEqual(telemetry.events.filter(event => event.data?.operation === 'recover').map(event => event.data), [
			{
				...connectionDetails, operation: 'recover', outcome: 'success', stage: 'protocol', durationMs: 0,
				environmentOperation: 'recover',
				firstFailurePhase: 'protocol.reconnect', firstFailureCode: JsonRpcErrorCodes.InvalidParams, firstFailureCategory: 'protocol', protocolFailures: 1,
			},
			{
				...connectionDetails, operation: 'recover', outcome: 'success', stage: 'protocol', durationMs: 0,
				environmentOperation: 'recover',
				firstFailurePhase: 'protocol.reconnect', firstFailureCode: AhpErrorCodes.AuthRequired, firstFailureCategory: 'authentication', protocolFailures: 1,
			},
		]);
	}));

	test('exports only allowlisted failure phases and protocol codes, never diagnostic content', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		for (const code of [String(JsonRpcErrorCodes.InvalidParams), String(AhpErrorCodes.AuthRequired), 'private-code', '-12345', undefined]) {
			const connection = store.add(service.trackConnection('connection'));
			for (const phase of ['private-phase', 'protocol.reconnect']) {
				const event = {
					operationId: 'private-id', phase, timestamp: Date.now(), detail: 'private-detail',
					error: { name: 'private-name', message: 'private-message', code, requestId: 'private-request', cause: { name: 'Error', message: 'private-cause' } },
				};
				connection.recordConnectionDiagnostic({ ...event, outcome: 'started' });
				connection.recordConnectionDiagnostic({ ...event, outcome: 'failed' });
			}
			connection.onConnectionStateChange('failed');
		}
		service.dispose();

		assert.deepStrictEqual(telemetry.events.map(event => event.data), [
			JsonRpcErrorCodes.InvalidParams, AhpErrorCodes.AuthRequired, undefined, undefined, undefined,
		].map(firstFailureCode => ({
			...connectionDetails, operation: 'connect', outcome: 'failure', stage: 'protocol', durationMs: 0,
			firstFailurePhase: 'protocol.reconnect', firstFailureCode, firstFailureCategory: firstFailureCode === AhpErrorCodes.AuthRequired ? 'authentication' : firstFailureCode === JsonRpcErrorCodes.InvalidParams ? 'protocol' : 'unknown', protocolFailures: 1,
		})));
	}));

	for (const state of ['failed', 'disposed'] as const) {
		test(`keeps credential backoff in preparation when ${state}`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const connection = store.add(service.trackConnection('credentials'));
			connection.recordConnectionDiagnostic({ operationId: 'mint', phase: 'credentials', outcome: 'started', timestamp: Date.now() });
			await timeout(10);
			connection.recordConnectionDiagnostic({ operationId: 'mint', phase: 'credentials', outcome: 'failed', timestamp: Date.now() });
			await timeout(90);
			connection.onConnectionStateChange(state);
			service.dispose();
			assert.deepStrictEqual(telemetry.events, [{
				eventName: 'cloudSandboxConnectionOutcome', data: {
					...connectionDetails, operation: 'connect', outcome: state === 'failed' ? 'failure' : 'cancelled', stage: 'credentials',
					durationMs: 100, readinessMs: 100, preparationMs: 100, credentialsMs: 10, firstFailurePhase: 'credentials', credentialFailures: 1,
				},
			}]);
		}));

		test(`includes partial nested phases when authentication is ${state}`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const connection = store.add(service.trackConnection('connection'));
			connection.recordConnectionDiagnostic({ operationId: 'auth', phase: 'protocol.authentication', outcome: 'started', timestamp: Date.now() });
			await timeout(10);
			connection.recordConnectionDiagnostic({ operationId: 'credential', phase: 'credentials', outcome: 'started', timestamp: Date.now() });
			await timeout(20);
			connection.recordConnectionDiagnostic({ operationId: 'credential', phase: 'credentials', outcome: 'succeeded', timestamp: Date.now() });
			await timeout(30);
			connection.onConnectionStateChange(state);
			service.dispose();
			assert.deepStrictEqual(telemetry.events, [{
				eventName: 'cloudSandboxConnectionOutcome',
				data: { ...connectionDetails, operation: 'connect', outcome: state === 'failed' ? 'failure' : 'cancelled', stage: 'authentication', durationMs: 60, readinessMs: 60, preparationMs: 20, connectionMs: 40, credentialsMs: 20, authenticationMs: 60 },
			}]);
		}));
	}

	test('simultaneous connections retain separate request counts and cancellation outcomes', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const first = store.add(service.trackConnection('credentials'));
		const second = store.add(service.trackConnection('credentials'));
		const firstRequest = first.createRequestObserver();
		const secondRequest = second.createRequestObserver();
		firstRequest('issued');
		secondRequest('issued');
		firstRequest('waking');
		firstRequest('issued');
		await timeout(10);
		first.completeConnect('failure');
		await timeout(10);
		second.completeConnect('cancelled');
		service.dispose();
		assert.deepStrictEqual(telemetry.events.map(event => event.data), [
			{ ...connectionDetails, operation: 'connect', outcome: 'failure', stage: 'credentials', durationMs: 10, readinessMs: 10, preparationMs: 10, credentialsMs: 10, credentialRequests: 2, wakingResponses: 1 },
			{ ...connectionDetails, operation: 'connect', outcome: 'cancelled', stage: 'credentials', durationMs: 20, readinessMs: 20, preparationMs: 20, credentialsMs: 20, credentialRequests: 1 },
		]);
	}));

	test('late phase completion cannot finish the same phase in a newer recovery', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		connection.recordConnectionDiagnostic({ operationId: 'old', phase: 'transport.connect', outcome: 'started', timestamp: Date.now() });
		await timeout(10);
		connection.onConnectionStateChange('connected');
		connection.onConnectionStateChange('reconnecting');
		connection.recordConnectionDiagnostic({ operationId: 'new', phase: 'transport.reconnect', outcome: 'started', timestamp: Date.now() });
		await timeout(5);
		connection.recordConnectionDiagnostic({ operationId: 'old', phase: 'transport.connect', outcome: 'failed', timestamp: Date.now() });
		await timeout(15);
		connection.recordConnectionDiagnostic({ operationId: 'new', phase: 'transport.reconnect', outcome: 'succeeded', timestamp: Date.now() });
		connection.onConnectionStateChange('connected');
		service.dispose();
		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'cloudSandboxConnectionOutcome').map(event => event.data), [
			{ ...connectionDetails, operation: 'connect', outcome: 'success', stage: 'relay', durationMs: 10, readinessMs: 10, connectionMs: 10, transportAttempts: 1, relayMs: 10 },
			{ ...connectionDetails, operation: 'recover', environmentOperation: 'recover', outcome: 'success', stage: 'relay', durationMs: 20, readinessMs: 20, connectionMs: 20, transportAttempts: 1, relayMs: 20 },
		]);
	}));

	test('a late pending response is not attributed to a newer recovery', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		const oldRequest = connection.createRequestObserver();
		oldRequest('issued');
		connection.onConnectionStateChange('connected');
		connection.onConnectionStateChange('reconnecting');
		const currentRequest = connection.createRequestObserver();
		currentRequest('issued');
		oldRequest('waking');
		currentRequest('waking');
		connection.onConnectionStateChange('failed');
		service.dispose();
		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'cloudSandboxConnectionOutcome').map(event => event.data), [
			{ ...connectionDetails, operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 0, credentialRequests: 1 },
			{ ...connectionDetails, operation: 'recover', environmentOperation: 'recover', outcome: 'failure', stage: 'connection', durationMs: 0, credentialRequests: 1, wakingResponses: 1 },
		]);
	}));

	for (const environmentKind of ['cloud', 'user-local'] as const) {
		for (const outcome of ['success', 'failure', 'cancelled'] as const) {
			test(`reports ${environmentKind} first session request ${outcome} without counting user idle time`, () => runWithFakedTimers({}, async () => {
				const telemetry = new TestTelemetryService();
				const service = store.add(new CloudSandboxTelemetryService(telemetry));
				const connection = store.add(service.trackConnection('connection', 'editorDesktop', 'existing', { environmentKind: environmentKind === 'user-local' ? environmentKind : undefined }));
				connection.onConnectionStateChange('connected');
				await timeout(20_000);
				connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'started', timestamp: Date.now() });
				await timeout(40);
				if (outcome === 'cancelled') {
					connection.dispose();
				} else {
					connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: outcome === 'success' ? 'succeeded' : 'failed', timestamp: Date.now() });
				}
				connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'succeeded', timestamp: Date.now() });
				service.dispose();
				assert.deepStrictEqual(telemetry.events.filter(event => event.eventName.endsWith('FirstSessionRequest')), [{
					eventName: environmentKind === 'user-local' ? 'userLocalRelayFirstSessionRequest' : 'cloudSandboxFirstSessionRequest',
					data: { environmentKind, taskCreationPath: 'unknown', surface: 'editorDesktop', source: 'existing', outcome, durationMs: 40 },
				}]);
			}));
		}
	}

	test('reports one user-local session snapshot outcome per ready cycle and ignores duplicate or stale diagnostics', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection', 'agentsWeb', 'existing', { environmentKind: 'user-local' }));
		const attemptId = generateUuid();
		const observe = (operationId: string, outcome: IConnectionDiagnosticEvent['outcome'], connectionOperation: 'connect' | 'recover' = 'connect') =>
			connection.recordConnectionDiagnostic({
				operationId, phase: 'protocol.sessionOpen', outcome, timestamp: Date.now(), attemptId, requestKind: 'subscribeSession', connectionOperation,
				detail: 'private detail', error: outcome === 'failed' ? { name: 'private name', message: '/Users/alice/private', code: String(AhpErrorCodes.PermissionDenied), requestId: 'private request' } : undefined,
			});
		connection.onConnectionStateChange('connected');
		observe('first', 'started');
		await timeout(25);
		observe('first', 'failed');
		for (let index = 0; index < 100; index++) {
			observe(`duplicate-${index}`, 'started');
			observe(`duplicate-${index}`, 'succeeded');
		}
		connection.onConnectionStateChange('reconnecting');
		connection.onConnectionStateChange('connected');
		observe('second', 'started', 'recover');
		observe('first', 'succeeded');
		await timeout(15);
		observe('second', 'succeeded', 'recover');
		connection.dispose();
		service.dispose();

		type ClassifiedSample<T> = { [K in keyof Omit<T, 'owner' | 'comment'>]: NonNullable<T[K]> extends { isMeasurement: true } ? number : string };
		const failure: ClassifiedSample<UserLocalRelaySessionOpenClassification> = {
			environmentKind: 'user-local', taskCreationPath: 'unknown', surface: 'agentsWeb', source: 'existing', outcome: 'failure', durationMs: 25,
			requestKind: 'subscribeSession', connectionOperation: 'connect', attemptId, errorCategory: 'authorization', errorCode: AhpErrorCodes.PermissionDenied,
		};
		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'userLocalRelaySessionOpen'), [
			{ eventName: 'userLocalRelaySessionOpen', data: failure },
			{ eventName: 'userLocalRelaySessionOpen', data: { environmentKind: 'user-local', taskCreationPath: 'unknown', surface: 'agentsWeb', source: 'existing', outcome: 'success', durationMs: 15, requestKind: 'subscribeSession', connectionOperation: 'recover', attemptId } },
		]);
	}));

	test('classifies first session request failures without exporting diagnostic content', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection', 'agentsWeb', 'existing', { environmentKind: 'user-local' }));
		connection.onConnectionStateChange('connected');
		const event = {
			operationId: 'request', phase: 'protocol.firstSessionRequest', timestamp: Date.now(), requestKind: 'subscribeRoot' as const,
			connectionOperation: 'connect' as const, attemptId: 'private invalid identifier', detail: 'private-detail',
			error: { name: 'private-name', message: 'private-message', code: 'private-code', requestId: 'private-request', cause: { name: 'Error', message: 'private-cause', status: 401 } },
		};
		connection.recordConnectionDiagnostic({ ...event, outcome: 'started' });
		await timeout(10);
		connection.recordConnectionDiagnostic({ ...event, outcome: 'failed' });
		connection.recordConnectionDiagnostic({ ...event, outcome: 'failed' });
		service.dispose();
		assert.deepStrictEqual(telemetry.events.filter(event => event.eventName.endsWith('FirstSessionRequest')), [{
			eventName: 'userLocalRelayFirstSessionRequest', data: {
				environmentKind: 'user-local', taskCreationPath: 'unknown', surface: 'agentsWeb', source: 'existing', outcome: 'failure', durationMs: 10,
				requestKind: 'subscribeRoot', connectionOperation: 'connect', errorCategory: 'authentication', statusCode: 401,
			},
		}]);
	}));

	for (const state of ['reconnecting', 'failed', 'disposed'] as const) {
		test(`settles a pending session snapshot once when ${state}, without counting later completion`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const connection = store.add(service.trackConnection('connection', 'unknown', 'existing', { environmentKind: 'user-local' }));
			connection.onConnectionStateChange('connected');
			const event = { operationId: 'open', phase: 'protocol.sessionOpen', timestamp: Date.now() };
			connection.recordConnectionDiagnostic({ ...event, outcome: 'started' });
			await timeout(10);
			connection.onConnectionStateChange(state);
			connection.recordConnectionDiagnostic({ ...event, outcome: 'succeeded' });
			service.dispose();
			assert.deepStrictEqual(telemetry.events.filter(event => event.eventName === 'userLocalRelaySessionOpen'), [{
				eventName: 'userLocalRelaySessionOpen', data: {
					environmentKind: 'user-local', taskCreationPath: 'unknown', surface: 'unknown', source: 'existing', durationMs: 10,
					outcome: state === 'disposed' ? 'cancelled' : 'failure',
					...(state === 'disposed' ? {} : { errorCategory: 'connectionClosed' }),
				},
			}]);
		}));
	}

	test('requestOutcomeForStatus buckets every response kind', () => {
		assert.deepStrictEqual(
			[200, 202, 204, 400, 404, 429, 500, 503, 100, 302, undefined].map(requestOutcomeForStatus),
			[
				'succeeded',
				'waking',
				'succeeded',
				'clientError',
				'clientError',
				'clientError',
				'serverError',
				'serverError',
				// Only 2xx is a success, matching the client's own check: a 1xx/3xx is thrown as a
				// request failure, so counting it as a success would understate the failure rate.
				'unexpectedStatus',
				'unexpectedStatus',
				'networkError',
			],
		);
	});

	test('requests are reported per action, with outcomes broken out', () => {
		const telemetryService = new TestTelemetryService();
		const sandboxTelemetry = store.add(new CloudSandboxTelemetryService(telemetryService));

		sandboxTelemetry.reportRequest('reconnect', 'serverError');
		sandboxTelemetry.reportRequest('reconnect', 'serverError');
		sandboxTelemetry.reportRequest('reconnect', 'succeeded');
		sandboxTelemetry.reportRequest('connect', 'waking');
		sandboxTelemetry.flushRequestCounts();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({
				eventName: e.eventName,
				action: e.data?.action,
				total: e.data?.total,
				succeeded: e.data?.succeeded,
				waking: e.data?.waking,
				serverError: e.data?.serverError,
			})),
			[
				{ eventName: 'cloudSandboxRequests', action: 'reconnect', total: 3, succeeded: 1, waking: 0, serverError: 2 },
				{ eventName: 'cloudSandboxRequests', action: 'connect', total: 1, succeeded: 0, waking: 1, serverError: 0 },
			],
		);
	});

	test('flushing resets the counts, and a flush with nothing recorded reports nothing', () => {
		const telemetryService = new TestTelemetryService();
		const sandboxTelemetry = store.add(new CloudSandboxTelemetryService(telemetryService));

		sandboxTelemetry.flushRequestCounts();
		assert.strictEqual(telemetryService.events.length, 0, 'nothing recorded yet');

		sandboxTelemetry.reportRequest('getEnvironment', 'succeeded');
		sandboxTelemetry.flushRequestCounts();
		sandboxTelemetry.flushRequestCounts();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ action: e.data?.action, total: e.data?.total })),
			[{ action: 'getEnvironment', total: 1 }],
		);
	});

	test('disposing reports whatever has been counted so far', () => {
		const telemetryService = new TestTelemetryService();
		const sandboxTelemetry = new CloudSandboxTelemetryService(telemetryService);

		sandboxTelemetry.reportRequest('listTasks', 'clientError');
		sandboxTelemetry.dispose();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ action: e.data?.action, total: e.data?.total, clientError: e.data?.clientError })),
			[{ action: 'listTasks', total: 1, clientError: 1 }],
		);
	});

	test('a refresh stop reports its reason, cycle count and causing status', () => {
		const telemetryService = new TestTelemetryService();
		const sandboxTelemetry = store.add(new CloudSandboxTelemetryService(telemetryService));

		sandboxTelemetry.reportCredentialRefreshStopped('permanentError', 0, new CloudSandboxRequestError(404, 'gone'));
		sandboxTelemetry.reportCredentialRefreshStopped('consecutiveFailures', 10);

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ eventName: e.eventName, ...e.data })),
			[
				{ eventName: 'cloudSandboxCredentialRefreshStopped', reason: 'permanentError', consecutiveFailures: 0, statusCode: 404 },
				{ eventName: 'cloudSandboxCredentialRefreshStopped', reason: 'consecutiveFailures', consecutiveFailures: 10, statusCode: undefined },
			],
		);
	});

	test('the window covers only the time from its first request, not preceding idle time', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const telemetryService = new TestTelemetryService();
		const disposables = new DisposableStore();
		const sandboxTelemetry = disposables.add(new CloudSandboxTelemetryService(telemetryService));

		// Hours of silence before the first request. Folding that into `windowMs` would make the
		// reported request rate look far lower than it actually was.
		await new Promise<void>(resolve => setTimeout(resolve, 6 * 60 * 60_000));
		sandboxTelemetry.reportRequest('connect', 'succeeded');
		await new Promise<void>(resolve => setTimeout(resolve, 60_000));
		sandboxTelemetry.flushRequestCounts();
		disposables.dispose();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ action: e.data?.action, total: e.data?.total, windowMs: e.data?.windowMs })),
			[{ action: 'connect', total: 1, windowMs: 60_000 }],
		);
	}));

	test('initial retries stay in one connect sample and never count as a healthy connection loss', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('credentials'));
		await timeout(2000);
		connection.setConnectStage('connection');
		connection.onConnectionStateChange('connecting');
		await timeout(1000);
		connection.onConnectionStateChange('reconnecting');
		connection.completeConnect('failure'); // A surviving retry, not a terminal failure.
		await timeout(4000);
		connection.onConnectionStateChange('connected');
		connection.completeConnect('success');
		connection.onConnectionStateChange('connected');
		await timeout(3000);
		connection.dispose();
		service.dispose();

		assert.deepStrictEqual(telemetry.events, [
			{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 7000, readinessMs: 7000, preparationMs: 2000, connectionMs: 5000, credentialsMs: 2000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 3000, unexpectedDisconnects: 0, receivedFrames: 0 } },
		]);
	}));

	for (const outcome of ['failure', 'cancelled'] as const) {
		for (const stage of ['credentials', 'connection'] as const) {
			test(`reports ${outcome} during ${stage} once, even before a client exists`, () => runWithFakedTimers({}, async () => {
				const telemetry = new TestTelemetryService();
				const service = store.add(new CloudSandboxTelemetryService(telemetry));
				const connection = store.add(service.trackConnection(stage));
				await timeout(2300);
				connection.completeConnect(outcome);
				connection.completeConnect('success');
				connection.dispose();
				connection.onConnectionStateChange('connected');
				connection.recordReceivedFrame();
				service.dispose();
				assert.deepStrictEqual(telemetry.events, [
					{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'connect', outcome, stage, durationMs: 2300, readinessMs: 2300, preparationMs: stage === 'credentials' ? 2300 : 0, connectionMs: stage === 'connection' ? 2300 : 0, credentialsMs: stage === 'credentials' ? 2300 : 0 } },
				]);
			}));
		}
	}

	test('a recovery spans backoff and replacement clients without multiplying outages', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		await timeout(2000);
		connection.onConnectionStateChange('connected');
		await timeout(10_000);
		connection.onConnectionStateChange('reconnecting');
		connection.recordReceivedFrame();
		await timeout(1000);
		connection.onConnectionStateChange('reconnecting');
		connection.onConnectionStateChange('connecting');
		await timeout(8000);
		connection.recordReceivedFrame();
		connection.onConnectionStateChange('connected');
		await timeout(3000);
		connection.dispose();
		service.dispose();

		assert.deepStrictEqual(telemetry.events, [
			{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 2000, readinessMs: 2000, connectionMs: 2000 } },
			{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'recover', environmentOperation: 'recover', outcome: 'success', stage: 'connection', durationMs: 9000, readinessMs: 9000, connectionMs: 9000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 13_000, unexpectedDisconnects: 1, receivedFrames: 2 } },
		]);
	}));

	for (const state of ['failed', 'disposed'] as const) {
		test(`a recovery that is ${state} stops exposure at the original drop`, () => runWithFakedTimers({}, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			const connection = store.add(service.trackConnection('connection'));
			connection.onConnectionStateChange('connected');
			await timeout(4000);
			connection.onConnectionStateChange('reconnecting');
			await timeout(13_000);
			connection.onConnectionStateChange(state);
			connection.onConnectionStateChange('connected');
			connection.recordReceivedFrame();
			await timeout(2000);
			connection.dispose();
			service.dispose();

			assert.deepStrictEqual(telemetry.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 0 } },
				{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'recover', environmentOperation: 'recover', outcome: state === 'failed' ? 'failure' : 'cancelled', stage: 'connection', durationMs: 13_000, readinessMs: 13_000, connectionMs: 13_000 } },
				{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 4000, unexpectedDisconnects: 1, receivedFrames: 0 } },
			]);
		}));
	}

	test('healthy connections report periodic exposure, with independent final deltas and no idle timer', async () => {
		let timerFirings = 0;
		await runWithFakedTimers({ onHistory: history => timerFirings = history.length }, async () => {
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			await timeout(60_000);
			const first = store.add(service.trackConnection('connection'));
			first.onConnectionStateChange('connected');
			await timeout(60_000);
			const second = store.add(service.trackConnection('connection'));
			second.onConnectionStateChange('connected');
			await timeout(240_001);
			const periodic = telemetry.events.filter(e => e.eventName === 'cloudSandboxConnectionHealth');
			await timeout(29_999);
			first.dispose();
			await timeout(270_001);
			await timeout(9999);
			second.dispose();
			service.flushConnectionHealth();
			await timeout(600_000);
			service.dispose();

			assert.deepStrictEqual({
				periodic,
				health: telemetry.events.filter(e => e.eventName === 'cloudSandboxConnectionHealth'),
			}, {
				periodic: [{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 540_000, unexpectedDisconnects: 0, receivedFrames: 0 } }],
				health: [
					{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 540_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 30_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 300_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 10_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
				],
			});
		});
		assert.strictEqual(timerFirings, 9, 'only seven test delays and two health ticks; no timer before tracking or after the last teardown');
	});

	test('the health denominator is connected time, not wall time or time spent recovering', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		connection.onConnectionStateChange('connected');
		await timeout(3_600_000);
		connection.onConnectionStateChange('reconnecting');
		await timeout(60_000);
		connection.onConnectionStateChange('connected');
		await timeout(3_600_000);
		connection.dispose();
		service.dispose();
		const health = telemetry.events.filter(e => e.eventName === 'cloudSandboxConnectionHealth');
		const connectedMs = health.reduce((total, e) => total + Number(e.data?.connectedMs), 0);
		const disconnects = health.reduce((total, e) => total + Number(e.data?.unexpectedDisconnects), 0);
		assert.deepStrictEqual({ connectedMs, disconnects, per100ConnectedHours: disconnects / (connectedMs / 3_600_000) * 100 }, {
			connectedMs: 7_200_000, disconnects: 1, per100ConnectedHours: 50,
		});
	}));

	test('owner disposal cancels unfinished operations and rejects late callbacks and new tracking', () => runWithFakedTimers({}, async () => {
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('credentials'));
		connection.recordReceivedFrame();
		await timeout(3000);
		service.dispose();
		connection.onConnectionStateChange('connected');
		connection.recordReceivedFrame();
		service.trackConnection('connection').onConnectionStateChange('connected');
		service.dispose();
		assert.deepStrictEqual(telemetry.events, [
			{ eventName: 'cloudSandboxConnectionOutcome', data: { ...connectionDetails, operation: 'connect', outcome: 'cancelled', stage: 'credentials', durationMs: 3000, readinessMs: 3000, preparationMs: 3000, credentialsMs: 3000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { environmentKind: 'cloud', connectedMs: 0, unexpectedDisconnects: 0, receivedFrames: 1 } },
		]);
	}));

	for (const environmentKind of ['cloud', 'user-local'] as const) {
		test(`${environmentKind} connection events use the standard telemetry level gate`, () => runWithFakedTimers({}, async () => {
			const events: string[] = [];
			const telemetry = store.add(TelemetryService.createWithLevel({
				telemetryLevel: TelemetryLevel.NONE,
				appenders: [{ log: event => events.push(event), flush: async () => { } }],
			}, new class extends mock<IProductService>() { }()));
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			service.reportProvisioningOutcome('success', 1000);
			const connection = store.add(service.trackConnection('connection', 'unknown', 'existing', { environmentKind: environmentKind === 'user-local' ? environmentKind : undefined }));
			connection.onConnectionStateChange('connected');
			await timeout(300_001);
			connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'started', timestamp: Date.now() });
			connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'succeeded', timestamp: Date.now() });
			connection.recordConnectionDiagnostic({ operationId: 'open', phase: 'protocol.sessionOpen', outcome: 'started', timestamp: Date.now() });
			connection.recordConnectionDiagnostic({ operationId: 'open', phase: 'protocol.sessionOpen', outcome: 'succeeded', timestamp: Date.now() });
			connection.onConnectionStateChange('reconnecting');
			connection.onConnectionStateChange('failed');
			service.dispose();
			assert.deepStrictEqual(events, []);
		}));
	}

	for (const environmentKind of ['cloud', 'user-local'] as const) {
		test(`${environmentKind} classification marks every numeric payload field, and no string field, as a measurement`, () => runWithFakedTimers({}, async () => {
			type ClassifiedSample<T> = { [K in keyof Omit<T, 'owner' | 'comment'>]: NonNullable<T[K]> extends { isMeasurement: true } ? number : string };
			const outcome: ClassifiedSample<CloudSandboxConnectionOutcomeClassification> = {
				...connectionDetails, environmentKind, environmentOperation: environmentKind === 'user-local' ? 'attach' : 'resume',
				operation: 'connect', outcome: 'success', stage: 'protocol', durationMs: 2000, readinessMs: 2000, connectionMs: 2000,
				firstFailurePhase: 'protocol.reconnect', firstFailureCode: JsonRpcErrorCodes.InvalidParams, firstFailureCategory: 'protocol', protocolFailures: 1,
			};
			const provisioning: ClassifiedSample<CloudSandboxProvisioningOutcomeClassification> = { outcome: 'success', durationMs: 1000, taskCreationPath: 'unknown' };
			const firstRequest: ClassifiedSample<CloudSandboxFirstSessionRequestClassification> = { environmentKind, taskCreationPath: 'unknown', surface: 'unknown', source: 'existing', outcome: 'success', durationMs: 3000 };
			const health: ClassifiedSample<CloudSandboxConnectionHealthClassification> = { environmentKind, connectedMs: 3000, unexpectedDisconnects: 0, receivedFrames: 1 };
			const telemetry = new TestTelemetryService();
			const service = store.add(new CloudSandboxTelemetryService(telemetry));
			service.reportProvisioningOutcome('success', 1000);
			const connection = store.add(service.trackConnection('connection', 'unknown', 'existing', { environmentKind: environmentKind === 'user-local' ? environmentKind : undefined }));
			const failedPhase = {
				operationId: 'reconnect', phase: 'protocol.reconnect', timestamp: Date.now(),
				error: { name: 'Error', message: 'private response', code: String(JsonRpcErrorCodes.InvalidParams) },
			};
			connection.recordConnectionDiagnostic({ ...failedPhase, outcome: 'started' });
			connection.recordConnectionDiagnostic({ ...failedPhase, outcome: 'failed' });
			await timeout(2000);
			connection.onConnectionStateChange('connected');
			connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'started', timestamp: Date.now() });
			connection.recordReceivedFrame();
			await timeout(3000);
			connection.recordConnectionDiagnostic({ operationId: 'first', phase: 'protocol.firstSessionRequest', outcome: 'succeeded', timestamp: Date.now() });
			connection.dispose();
			service.dispose();
			assert.deepStrictEqual(telemetry.events, [
				{ eventName: 'cloudSandboxProvisioningOutcome', data: provisioning },
				{ eventName: environmentKind === 'user-local' ? 'userLocalRelayConnectionOutcome' : 'cloudSandboxConnectionOutcome', data: outcome },
				{ eventName: environmentKind === 'user-local' ? 'userLocalRelayFirstSessionRequest' : 'cloudSandboxFirstSessionRequest', data: firstRequest },
				{ eventName: environmentKind === 'user-local' ? 'userLocalRelayConnectionHealth' : 'cloudSandboxConnectionHealth', data: health },
			]);
		}));
	}
});
