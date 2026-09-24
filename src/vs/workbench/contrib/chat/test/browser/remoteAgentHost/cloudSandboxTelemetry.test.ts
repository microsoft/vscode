/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxRequestError } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryService } from '../../../../../../platform/telemetry/common/telemetryService.js';
import {
	CloudSandboxConnectionHealthClassification,
	CloudSandboxConnectionOutcomeClassification,
	CloudSandboxTelemetryService,
	requestOutcomeForStatus,
} from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

interface ICapturedEvent {
	readonly eventName: string;
	readonly data: ITelemetryData | undefined;
}

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
			{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 7000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 3000, unexpectedDisconnects: 0, receivedFrames: 0 } },
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
					{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome, stage, durationMs: 2300 } },
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
			{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 2000 } },
			{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'recover', outcome: 'success', stage: 'connection', durationMs: 9000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 13_000, unexpectedDisconnects: 1, receivedFrames: 2 } },
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
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 0 } },
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'recover', outcome: state === 'failed' ? 'failure' : 'cancelled', stage: 'connection', durationMs: 13_000 } },
				{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 4000, unexpectedDisconnects: 1, receivedFrames: 0 } },
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
				periodic: [{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 540_000, unexpectedDisconnects: 0, receivedFrames: 0 } }],
				health: [
					{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 540_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 30_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 300_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
					{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 10_000, unexpectedDisconnects: 0, receivedFrames: 0 } },
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
			{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'cancelled', stage: 'credentials', durationMs: 3000 } },
			{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 0, unexpectedDisconnects: 0, receivedFrames: 1 } },
		]);
	}));

	test('connection events use the standard telemetry level gate', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const telemetry = store.add(TelemetryService.createWithLevel({
			telemetryLevel: TelemetryLevel.NONE,
			appenders: [{ log: event => events.push(event), flush: async () => { } }],
		}, new class extends mock<IProductService>() { }()));
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		connection.onConnectionStateChange('connected');
		await timeout(300_001);
		connection.onConnectionStateChange('reconnecting');
		connection.onConnectionStateChange('failed');
		service.dispose();
		assert.deepStrictEqual(events, []);
	}));

	test('classification marks every numeric payload field, and no string field, as a measurement', () => runWithFakedTimers({}, async () => {
		type ClassifiedSample<T> = { [K in Exclude<keyof T, 'owner' | 'comment'>]: T[K] extends { isMeasurement: true } ? number : string };
		const outcome: ClassifiedSample<CloudSandboxConnectionOutcomeClassification> = { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 2000 };
		const health: ClassifiedSample<CloudSandboxConnectionHealthClassification> = { connectedMs: 3000, unexpectedDisconnects: 0, receivedFrames: 1 };
		const telemetry = new TestTelemetryService();
		const service = store.add(new CloudSandboxTelemetryService(telemetry));
		const connection = store.add(service.trackConnection('connection'));
		await timeout(2000);
		connection.onConnectionStateChange('connected');
		connection.recordReceivedFrame();
		await timeout(3000);
		connection.dispose();
		service.dispose();
		assert.deepStrictEqual(telemetry.events, [
			{ eventName: 'cloudSandboxConnectionOutcome', data: outcome },
			{ eventName: 'cloudSandboxConnectionHealth', data: health },
		]);
	}));
});
