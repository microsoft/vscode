/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxRequestError } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import {
	CloudSandboxTelemetryService,
	requestOutcomeForStatus,
} from '../../browser/cloudSandboxTelemetry.js';

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
});
