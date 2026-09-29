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
import { reportCodexProviderSwitch } from '../../../node/codex/codexProviderSwitchTelemetry.js';
import { getCodexAccountTelemetryContext } from '../../../node/codex/codexAccountTelemetry.js';

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

	test('reports the accepted turn snapshot after its observation window', async () => {
		const now = 1_000_000;
		await runWithFakedTimers({ useFakeTimers: true, startTime: now }, async () => {
			const telemetryService = new TestTelemetryService();
			const snapshot = getCodexAccountTelemetryContext(
				{ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus', email: 'person@example.com' },
				{ usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 1 }, now);
			await timeout(5 * 60 * 1000 + 1);
			reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', true, snapshot);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: {
					fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true,
					chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40,
				},
			}]);
		});
	});

	test('preserves unavailable context and emits only schema fields', () => {
		const telemetryService = new TestTelemetryService();
		const context = { ...getCodexAccountTelemetryContext(undefined, undefined, undefined), email: 'person@example.com', usedPercent: 42.4 };
		reportCodexProviderSwitch(telemetryService, 'vscode-proxy', 'openai', false, context);

		assert.deepStrictEqual(telemetryService.events, [{
			name: 'agentHost.codexProviderSwitch',
			data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread: false, chatgptAccountState: 'unknown', chatgptWeeklyQuotaState: 'unavailable' },
		}]);
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
