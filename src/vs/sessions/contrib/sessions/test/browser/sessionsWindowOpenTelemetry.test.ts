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
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, SessionsWindowOpenTelemetry, SessionsWindowSessionStartTelemetry } from '../../browser/sessionsWindowOpenTelemetry.js';

function isTelemetryData(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName && isTelemetryData(data)) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('SessionsWindowOpenTelemetry', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits one window session start when initialized', () => {
		const telemetryService = new TestTelemetryService();
		new SessionsWindowSessionStartTelemetry(AgentsWindowOpenSource.TitleBar, false, telemetryService);

		assert.deepStrictEqual(telemetryService.events, [{
			name: 'agents/windowSessionStart',
			data: { sessionStart: true, source: 'titleBar', hasPreviouslyStartedSession: false },
		}]);
	});

	test('emits captured initial state and close duration for a quick close', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			let workspacePreselected = true;
			let workspacePreselectionSource = 'existingSessions';
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.TitleBar,
				() => true,
				() => ({ workspacePreselected, workspacePreselectionSource }),
				telemetryService,
				lifecycleService,
			));

			tracker.captureInitialViewState();
			workspacePreselected = false;
			workspacePreselectionSource = 'none';
			await timeout(4_000);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/firstTimeWindowOpen',
				data: {
					source: 'titleBar',
					signInDialogShown: true,
					workspacePreselected: true,
					workspacePreselectionSource: 'existingSessions',
					windowCloseDurationMs: 4_000,
					emissionReason: 'close',
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
				() => ({ workspacePreselected: undefined, workspacePreselectionSource: undefined }),
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
					workspacePreselectionSource: undefined,
					windowCloseDurationMs: undefined,
					emissionReason: 'timer',
				},
			}]);
			tracker.dispose();
			lifecycleService.dispose();
		});
	});

	test('records lifecycle shutdown reasons exactly once', () => {
		const reasons: readonly [ShutdownReason, 'quit' | 'reload' | 'otherShutdown'][] = [
			[ShutdownReason.QUIT, 'quit'],
			[ShutdownReason.RELOAD, 'reload'],
			[ShutdownReason.LOAD, 'otherShutdown'],
		];

		for (const [shutdownReason, emissionReason] of reasons) {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.CommandPalette,
				() => false,
				() => ({ workspacePreselected: undefined, workspacePreselectionSource: undefined }),
				telemetryService,
				lifecycleService,
			));

			lifecycleService.fireShutdown(shutdownReason);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			assert.strictEqual(telemetryService.events.length, 1);
			const event = telemetryService.events[0];
			assert.deepStrictEqual({
				name: event.name,
				source: Reflect.get(event.data, 'source'),
				signInDialogShown: Reflect.get(event.data, 'signInDialogShown'),
				workspacePreselected: Reflect.get(event.data, 'workspacePreselected'),
				workspacePreselectionSource: Reflect.get(event.data, 'workspacePreselectionSource'),
				emissionReason: Reflect.get(event.data, 'emissionReason'),
			}, {
				name: 'agents/firstTimeWindowOpen',
				source: 'commandPalette',
				signInDialogShown: false,
				workspacePreselected: undefined,
				workspacePreselectionSource: undefined,
				emissionReason,
			});
			assert.strictEqual(
				typeof Reflect.get(event.data, 'windowCloseDurationMs'),
				shutdownReason === ShutdownReason.QUIT ? 'number' : 'undefined',
			);
			tracker.dispose();
			lifecycleService.dispose();
		}
	});
});
