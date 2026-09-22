/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { getCodexAccountTelemetryContext } from '../../../node/codex/codexAccountTelemetry.js';
import { reportCodexProviderSwitch } from '../../../node/codex/codexProviderSwitchTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];

	override publicLog2(name?: string, data?: ITelemetryData): void {
		this.events.push({ name, data });
	}
}

suite('CodexProviderSwitchTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const unknownContext = getCodexAccountTelemetryContext(undefined);
	const signedInAccount = { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt' } as const;

	for (const isDesktopThread of [false, true]) {
		test(`reports both subscription directions with desktop origin ${isDesktopThread}`, () => {
			const telemetryService = new TestTelemetryService();

			reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', isDesktopThread, unknownContext);
			reportCodexProviderSwitch(telemetryService, 'vscode-proxy', 'openai', isDesktopThread, unknownContext);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread, ...unknownContext },
			}, {
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread, ...unknownContext },
			}]);
		});
	}

	test('buckets a fresh weekly snapshot without reporting the exact percentage or reset time', async () => {
		const now = 1_000_000;
		await runWithFakedTimers({ useFakeTimers: true, startTime: now }, async () => {
			const telemetryService = new TestTelemetryService();
			const samples = [[0, 0], [9.99, 0], [10, 10], [42.4, 40], [79.9, 70], [80, 80], [89.99, 80], [90, 90], [99.99, 90], [100, 100]];
			for (const [usedPercent] of samples) {
				reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', true, getCodexAccountTelemetryContext(signedInAccount, {
					rateLimit: { usedPercent, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 3600 },
					observedAt: now - 5 * 60 * 1000,
				}));
			}

			assert.deepStrictEqual(telemetryService.events, samples.map(([, expectedBucket]) => ({
				name: 'agentHost.codexProviderSwitch',
				data: {
					fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true,
					chatgptAccountState: 'signedIn', chatgptPlanTier: 'unknown',
					chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: expectedBucket,
				},
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
			const contexts = invalidSnapshots.map(value => getCodexAccountTelemetryContext(signedInAccount, value));
			for (const context of contexts) {
				reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', true, context);
			}

			assert.deepStrictEqual(telemetryService.events, contexts.map(context => ({
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true, ...context },
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
			reportCodexProviderSwitch(telemetryService, fromProvider, toProvider, true, unknownContext);
		}

		assert.deepStrictEqual(telemetryService.events, []);
	});

	test('does not reclassify the admitted snapshot after a delayed acceptance', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000_000 }, async () => {
			const telemetryService = new TestTelemetryService();
			const accountContext = getCodexAccountTelemetryContext(signedInAccount, {
				rateLimit: { usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: Date.now() / 1000 + 1 },
				observedAt: Date.now(),
			});
			await timeout(5 * 60 * 1000 + 1);
			reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', false, accountContext);
			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: {
					fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false,
					chatgptAccountState: 'signedIn', chatgptPlanTier: 'unknown',
					chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40,
				},
			}]);
		});
	});
});
