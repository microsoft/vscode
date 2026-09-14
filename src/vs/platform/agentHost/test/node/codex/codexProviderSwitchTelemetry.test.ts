/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { reportCodexProviderSwitch } from '../../../node/codex/codexProviderSwitchTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];

	override publicLog2(name?: string, data?: ITelemetryData): void {
		this.events.push({ name, data });
	}
}

suite('CodexProviderSwitchTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const isDesktopThread of [false, true]) {
		test(`reports both subscription directions with desktop origin ${isDesktopThread}`, () => {
			const telemetryService = new TestTelemetryService();

			reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', isDesktopThread);
			reportCodexProviderSwitch(telemetryService, 'vscode-proxy', 'openai', isDesktopThread);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread },
			}, {
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread },
			}]);
		});
	}

	test('buckets a fresh weekly snapshot without reporting the exact percentage or reset time', async () => {
		const now = 1_000_000;
		await runWithFakedTimers({ useFakeTimers: true, startTime: now }, async () => {
			const telemetryService = new TestTelemetryService();
			const samples = [[0, 0], [9.99, 0], [10, 10], [42.4, 40], [79.9, 70], [80, 80], [89.99, 80], [90, 90], [99.99, 90], [100, 100]];
			for (const [usedPercent] of samples) {
				reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', true, {
					rateLimit: { usedPercent, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 3600 },
					observedAt: now - 5 * 60 * 1000,
				});
			}

			assert.deepStrictEqual(telemetryService.events, samples.map(([, expectedBucket]) => ({
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true, chatgptWeeklyUsedPercentBucket: expectedBucket },
			})));
		});
	});

	test('omits missing, nonweekly, stale, expired, and invalid quota snapshots instead of reporting zero', async () => {
		const now = 1_000_000;
		await runWithFakedTimers({ useFakeTimers: true, startTime: now }, async () => {
			const telemetryService = new TestTelemetryService();
			const rateLimit = { usedPercent: 97.5, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 3600 };
			const snapshot = { rateLimit, observedAt: now };
			const invalidSnapshots = [
				undefined,
				{ ...snapshot, rateLimit: undefined },
				{ ...snapshot, observedAt: undefined },
				{ ...snapshot, observedAt: Number.NaN },
				{ ...snapshot, observedAt: now + 1 },
				{ ...snapshot, observedAt: now - 5 * 60 * 1000 - 1 },
				{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: undefined } },
				{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: 300 } },
				{ ...snapshot, rateLimit: { ...rateLimit, windowDurationMins: 30 * 24 * 60 } },
				{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: now / 1000 } },
				{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: now / 1000 - 1 } },
				{ ...snapshot, rateLimit: { ...rateLimit, resetsAt: Number.POSITIVE_INFINITY } },
				{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: Number.NaN } },
				{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: Number.POSITIVE_INFINITY } },
				{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: -1 } },
				{ ...snapshot, rateLimit: { ...rateLimit, usedPercent: 101 } },
			];
			for (const invalidSnapshot of invalidSnapshots) {
				reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', true, invalidSnapshot);
			}

			assert.deepStrictEqual(telemetryService.events, invalidSnapshots.map(() => ({
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true },
			})));
		});
	});

	test('never reports missing, custom, or unchanged providers', () => {
		const telemetryService = new TestTelemetryService();

		for (const [fromProvider, toProvider] of [
			[undefined, 'openai'],
			['vscode-proxy', undefined],
			[undefined, undefined],
			['', 'vscode-proxy'],
			['openai', ''],
			['custom-provider', 'vscode-proxy'],
			['openai', 'https://private-provider.example/api'],
			['openai', 'openai'],
			['vscode-proxy', 'vscode-proxy'],
		]) {
			reportCodexProviderSwitch(telemetryService, fromProvider, toProvider, true);
		}

		assert.deepStrictEqual(telemetryService.events, []);
	});
});
