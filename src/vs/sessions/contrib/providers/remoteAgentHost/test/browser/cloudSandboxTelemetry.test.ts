/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxRequestError } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import {
	CloudSandboxRequestVolumeReporter,
	reportCredentialRefreshStopped,
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
			[200, 202, 204, 400, 404, 429, 500, 503, undefined].map(requestOutcomeForStatus),
			[
				'succeeded',
				'waking',
				'succeeded',
				'clientError',
				'clientError',
				'clientError',
				'serverError',
				'serverError',
				'networkError',
			],
		);
	});

	test('volume is reported per action, with outcomes broken out', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = store.add(new CloudSandboxRequestVolumeReporter(telemetryService));

		reporter.record('reconnect', 'serverError');
		reporter.record('reconnect', 'serverError');
		reporter.record('reconnect', 'succeeded');
		reporter.record('connect', 'waking');
		reporter.flush();

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
				{ eventName: 'cloudSandboxRequestVolume', action: 'reconnect', total: 3, succeeded: 1, waking: 0, serverError: 2 },
				{ eventName: 'cloudSandboxRequestVolume', action: 'connect', total: 1, succeeded: 0, waking: 1, serverError: 0 },
			],
		);
	});

	test('flushing resets the counts, and a flush with nothing recorded reports nothing', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = store.add(new CloudSandboxRequestVolumeReporter(telemetryService));

		reporter.flush();
		assert.strictEqual(telemetryService.events.length, 0, 'nothing recorded yet');

		reporter.record('getEnvironment', 'succeeded');
		reporter.flush();
		reporter.flush();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ action: e.data?.action, total: e.data?.total })),
			[{ action: 'getEnvironment', total: 1 }],
		);
	});

	test('disposing reports whatever has been counted so far', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new CloudSandboxRequestVolumeReporter(telemetryService);

		reporter.record('listTasks', 'clientError');
		reporter.dispose();

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ action: e.data?.action, total: e.data?.total, clientError: e.data?.clientError })),
			[{ action: 'listTasks', total: 1, clientError: 1 }],
		);
	});

	test('a refresh stop reports its reason, cycle count and causing status', () => {
		const telemetryService = new TestTelemetryService();

		reportCredentialRefreshStopped(telemetryService, 'permanentError', 0, new CloudSandboxRequestError(404, 'gone'));
		reportCredentialRefreshStopped(telemetryService, 'consecutiveFailures', 10);

		assert.deepStrictEqual(
			telemetryService.events.map(e => ({ eventName: e.eventName, ...e.data })),
			[
				{ eventName: 'cloudSandboxCredentialRefreshStopped', reason: 'permanentError', consecutiveFailures: 0, statusCode: 404 },
				{ eventName: 'cloudSandboxCredentialRefreshStopped', reason: 'consecutiveFailures', consecutiveFailures: 10, statusCode: undefined },
			],
		);
	});
});
