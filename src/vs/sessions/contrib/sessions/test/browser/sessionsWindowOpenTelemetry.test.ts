/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, SessionsWindowOpenTelemetry } from '../../browser/sessionsWindowOpenTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('SessionsWindowOpenTelemetry', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits captured initial state and close duration for a quick close', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			let workspacePreselected = true;
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.TitleBar,
				() => true,
				() => ({ workspacePreselected }),
				telemetryService,
				lifecycleService,
			));

			tracker.captureInitialViewState();
			workspacePreselected = false;
			await timeout(4_000);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/firstTimeWindowOpen',
				data: {
					source: 'titleBar',
					signInDialogShown: true,
					workspacePreselected: true,
					windowCloseDurationMs: 4_000,
				},
			}]);
			tracker.dispose();
			lifecycleService.dispose();
		});
	});

	test('emits once after three minutes without a close duration', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.CommandPalette,
				() => false,
				() => ({ workspacePreselected: undefined }),
				telemetryService,
				lifecycleService,
			));

			await timeout(FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/firstTimeWindowOpen',
				data: {
					source: 'commandPalette',
					signInDialogShown: false,
					workspacePreselected: undefined,
					windowCloseDurationMs: undefined,
				},
			}]);
			tracker.dispose();
			lifecycleService.dispose();
		});
	});
});
