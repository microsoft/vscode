/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { CopilotModelCallCorrelationTelemetry, getCopilotModelCallKey } from '../../node/copilot/copilotModelCallCorrelationTelemetry.js';

class CapturingTelemetryService extends mock<ITelemetryService>() {
	override readonly sessionId = 'telemetry-process';
	override telemetryLevel = TelemetryLevel.USAGE;
	readonly events: { eventName: string; data: ITelemetryData | undefined }[] = [];
	override publicLog2(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}
}

suite('CopilotModelCallCorrelationTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keys are hex encoded and scoped by process, SDK session, and native call', () => {
		const key = getCopilotModelCallKey('process', 'sdk-session', 'provider/id+with/slashes=');
		assert.deepStrictEqual({
			hex: /^[a-f0-9]{64}$/.test(key ?? ''),
			same: key === getCopilotModelCallKey('process', 'sdk-session', 'provider/id+with/slashes='),
			uniqueScopes: new Set([
				key,
				getCopilotModelCallKey('other-process', 'sdk-session', 'provider/id+with/slashes='),
				getCopilotModelCallKey('process', 'other-session', 'provider/id+with/slashes='),
				getCopilotModelCallKey('process', 'sdk-session', 'other-call'),
			]).size,
			absent: [getCopilotModelCallKey('process', undefined, 'call'), getCopilotModelCallKey('process', 'session', '')],
		}, { hex: true, same: true, uniqueScopes: 4, absent: [undefined, undefined] });
	});

	test('reports one late mapping using the first uncorrelated response time', () => {
		const telemetry = new CapturingTelemetryService();
		let now = 100;
		const reporter = disposables.add(new CopilotModelCallCorrelationTelemetry('sdk-session', telemetry, { now: () => now }));
		reporter.recordMapping('ordinary-call');
		reporter.recordUncorrelatedResponse('late-call', 'waitExpired');
		now = 110;
		reporter.recordUncorrelatedResponse('late-call', 'responseAlreadyForwarded');
		now = 145;
		reporter.recordMapping('late-call');
		reporter.recordMapping('late-call');

		assert.deepStrictEqual(telemetry.events, [{
			eventName: 'agentHost.copilotModelCallCorrelation',
			data: {
				ahModelCallKey: getCopilotModelCallKey(telemetry.sessionId, 'sdk-session', 'late-call'),
				outcome: 'mappingAfterResponse',
				responseOutcome: 'waitExpired',
				timeSinceResponseMs: 45,
			},
		}]);
	});

	test('reports rejected completions before or after a response without inventing timing', () => {
		const telemetry = new CapturingTelemetryService();
		let now = 0;
		const reporter = disposables.add(new CopilotModelCallCorrelationTelemetry('sdk-session', telemetry, { now: () => now }));
		reporter.reportCompletionIssue('call', 'cancelledRoot');
		reporter.recordUncorrelatedResponse('call', 'noActiveTurn');
		now = 23;
		reporter.reportCompletionIssue('call', 'staleTurn');

		const key = getCopilotModelCallKey(telemetry.sessionId, 'sdk-session', 'call');
		assert.deepStrictEqual(telemetry.events.map(event => event.data), [
			{ ahModelCallKey: key, outcome: 'cancelledRoot', responseOutcome: undefined, timeSinceResponseMs: undefined },
			{ ahModelCallKey: key, outcome: 'staleTurn', responseOutcome: 'noActiveTurn', timeSinceResponseMs: 23 },
		]);
	});

	test('bounds retained responses and clears them on disposal', () => {
		const telemetry = new CapturingTelemetryService();
		const reporter = disposables.add(new CopilotModelCallCorrelationTelemetry('sdk-session', telemetry, { cacheLimit: 2, now: () => 0 }));
		for (const call of ['evicted', 'retained', 'disposed']) {
			reporter.recordUncorrelatedResponse(call, 'waitExpired');
		}
		reporter.recordMapping('evicted');
		reporter.recordMapping('retained');
		reporter.dispose();
		reporter.recordMapping('disposed');
		reporter.recordUncorrelatedResponse('after-disposal', 'waitExpired');
		reporter.reportCompletionIssue('after-disposal', 'noActiveTurn');

		assert.deepStrictEqual({
			disposed: reporter.isDisposed,
			keys: telemetry.events.map(event => event.data?.ahModelCallKey),
		}, {
			disposed: true,
			keys: [getCopilotModelCallKey(telemetry.sessionId, 'sdk-session', 'retained')],
		});
	});

	test('does not collect or emit diagnostics when usage telemetry is disabled', () => {
		const telemetry = new CapturingTelemetryService();
		const reporter = disposables.add(new CopilotModelCallCorrelationTelemetry('sdk-session', telemetry));
		reporter.recordUncorrelatedResponse('before-opt-out', 'waitExpired');
		telemetry.telemetryLevel = TelemetryLevel.ERROR;
		reporter.recordMapping('before-opt-out');
		reporter.recordUncorrelatedResponse('during-opt-out', 'waitExpired');
		reporter.reportCompletionIssue('during-opt-out', 'unmappedSubagent');
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		reporter.recordMapping('before-opt-out');
		reporter.recordMapping('during-opt-out');

		assert.deepStrictEqual(telemetry.events, []);
	});
});
