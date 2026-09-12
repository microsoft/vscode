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
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, ISessionsWindowOpenViewState, SessionsWindowOpenTelemetry, SessionsWindowSessionStartTelemetry } from '../../browser/sessionsWindowOpenTelemetry.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { URI } from '../../../../../base/common/uri.js';

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
			const selection = {
				folderUri: URI.file('/private/project'),
				origin: WorkspaceSelectionOrigin.ExistingSessions,
				state: 'selected',
				historyState: 'loaded',
				sessionFallbackState: 'completed',
				registeredProviderCount: 2,
			} satisfies IWorkspaceSelectionSnapshot;
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.TitleBar,
				{ workspaceArgumentKind: 'none', hasSessionArgument: false },
				() => true,
				() => ({ workspacePreselected, workspacePreselectionSource, viewKind: 'newSession', workspaceSelection: selection }),
				telemetryService,
				lifecycleService,
			));

			tracker.captureInitialViewState();
			workspacePreselected = false;
			workspacePreselectionSource = 'none';
			selection.registeredProviderCount = 3;
			await timeout(4_000);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agents/firstTimeWindowOpen',
				data: {
					source: 'titleBar',
					signInDialogShown: true,
					workspacePreselected: true,
					workspacePreselectionSource: 'existingSessions',
					workspaceArgumentKind: 'none',
					hasSessionArgument: false,
					workspaceArgumentIsDefault: false,
					initialViewKind: 'newSession',
					initialStateCaptureReason: 'initialization',
					initialStateCaptureDurationMs: 0,
					workspaceSelectionOrigin: 'existingSessions',
					workspaceSelectionState: 'selected',
					workspaceHistoryState: 'loaded',
					workspaceSessionFallbackState: 'completed',
					workspaceProviderCount: 2,
					workspaceHandoffState: 'notRequested',
					workspaceHandoffStateAtEmission: 'notRequested',
					workspaceHandoffDurationMs: undefined,
					viewKindAtEmission: 'newSession',
					workspacePreselectedAtEmission: false,
					workspaceSelectionOriginAtEmission: 'existingSessions',
					workspaceSelectionStateAtEmission: 'selected',
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
				{ workspaceArgumentKind: 'local', hasSessionArgument: true },
				() => false,
				() => ({ workspacePreselected: undefined, workspacePreselectionSource: undefined, viewKind: 'createdSession' }),
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
					workspaceArgumentKind: 'local',
					hasSessionArgument: true,
					workspaceArgumentIsDefault: false,
					initialViewKind: 'createdSession',
					initialStateCaptureReason: 'timer',
					initialStateCaptureDurationMs: FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS,
					workspaceSelectionOrigin: undefined,
					workspaceSelectionState: undefined,
					workspaceHistoryState: undefined,
					workspaceSessionFallbackState: undefined,
					workspaceProviderCount: undefined,
					workspaceHandoffState: 'notApplicable',
					workspaceHandoffStateAtEmission: 'notApplicable',
					workspaceHandoffDurationMs: undefined,
					viewKindAtEmission: 'createdSession',
					workspacePreselectedAtEmission: undefined,
					workspaceSelectionOriginAtEmission: undefined,
					workspaceSelectionStateAtEmission: undefined,
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
				{ workspaceArgumentKind: 'none', hasSessionArgument: false },
				() => false,
				() => ({ workspacePreselected: undefined, workspacePreselectionSource: undefined, viewKind: 'createdSession' }),
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
				captureReason: event.data.initialStateCaptureReason,
			}, {
				name: 'agents/firstTimeWindowOpen',
				source: 'commandPalette',
				signInDialogShown: false,
				workspacePreselected: undefined,
				workspacePreselectionSource: undefined,
				emissionReason,
				captureReason: emissionReason,
			});
			assert.strictEqual(
				typeof Reflect.get(event.data, 'windowCloseDurationMs'),
				shutdownReason === ShutdownReason.QUIT ? 'number' : 'undefined',
			);
			tracker.dispose();
			lifecycleService.dispose();
		}
	});

	test('distinguishes an early close while setup is pending from no eligible workspace', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.Banner,
				{ workspaceArgumentKind: 'local', hasSessionArgument: false },
				() => true,
				() => ({ workspacePreselected: false, workspacePreselectionSource: 'none', viewKind: 'noComposer' }),
				telemetryService,
				lifecycleService,
			));
			tracker.recordWorkspaceHandoffState('waitingForSetup');
			await timeout(1_000);
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			const data = telemetryService.events[0].data;
			assert.deepStrictEqual({
				captureReason: data.initialStateCaptureReason,
				captureDurationMs: data.initialStateCaptureDurationMs,
				viewKind: data.initialViewKind,
				handoff: data.workspaceHandoffState,
				selected: data.workspacePreselected,
				selectionState: data.workspaceSelectionState,
			}, {
				captureReason: 'close',
				captureDurationMs: 1_000,
				viewKind: 'noComposer',
				handoff: 'waitingForSetup',
				selected: false,
				selectionState: undefined,
			});
			tracker.dispose();
		});
	});

	test('keeps the initial pending snapshot when a workspace is selected before emission', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			const telemetryService = new TestTelemetryService();
			let selection: IWorkspaceSelectionSnapshot = {
				folderUri: undefined,
				origin: WorkspaceSelectionOrigin.None,
				state: 'none',
				historyState: 'loading',
				sessionFallbackState: 'pending',
				registeredProviderCount: 0,
			};
			const getViewState = (): ISessionsWindowOpenViewState => ({
				workspacePreselected: selection.state === 'selected',
				workspacePreselectionSource: selection.state === 'selected' ? 'providedWorkspace' : 'none',
				viewKind: 'newSession',
				workspaceSelection: selection,
			});
			const tracker = disposables.add(new SessionsWindowOpenTelemetry(
				AgentsWindowOpenSource.TitleBar,
				{ workspaceArgumentKind: 'local', hasSessionArgument: false },
				() => false,
				getViewState,
				telemetryService,
				lifecycleService,
			));
			tracker.recordWorkspaceHandoffState('waitingForProvider');
			await timeout(100);
			tracker.captureInitialViewState();
			await timeout(1_000);
			selection = {
				folderUri: URI.file('/private/handed-off-project'),
				origin: WorkspaceSelectionOrigin.WindowOpen,
				state: 'selected',
				historyState: 'loaded',
				sessionFallbackState: 'idle',
				registeredProviderCount: 1,
			};
			tracker.recordWorkspaceHandoffState('applied');
			tracker.captureInitialViewState();
			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			const data = telemetryService.events[0].data;
			assert.deepStrictEqual({
				captureReason: data.initialStateCaptureReason,
				captureDurationMs: data.initialStateCaptureDurationMs,
				initial: [data.workspacePreselected, data.workspaceSelectionOrigin, data.workspaceHistoryState, data.workspaceSessionFallbackState, data.workspaceProviderCount, data.workspaceHandoffState],
				atEmission: [data.workspacePreselectedAtEmission, data.workspaceSelectionOriginAtEmission, data.workspaceSelectionStateAtEmission, data.workspaceHandoffStateAtEmission],
				handoffDurationMs: data.workspaceHandoffDurationMs,
			}, {
				captureReason: 'initialization',
				captureDurationMs: 100,
				initial: [false, 'none', 'loading', 'pending', 0, 'waitingForProvider'],
				atEmission: [true, 'windowOpen', 'selected', 'applied'],
				handoffDurationMs: 1_100,
			});
			tracker.dispose();
		});
	});

	test('records unsupported arguments separately from history selection and caps provider counts', () => {
		const lifecycleService = disposables.add(new TestLifecycleService());
		const telemetryService = new TestTelemetryService();
		const tracker = disposables.add(new SessionsWindowOpenTelemetry(
			AgentsWindowOpenSource.CommandPalette,
			{ workspaceArgumentKind: 'remote', hasSessionArgument: false },
			() => false,
			() => ({
				workspacePreselected: true,
				workspacePreselectionSource: 'recentWorkspace',
				viewKind: 'newSession',
				workspaceSelection: {
					folderUri: URI.file('/private/fallback'),
					origin: WorkspaceSelectionOrigin.VSCodeRecent,
					state: 'selected',
					historyState: 'loaded',
					sessionFallbackState: 'idle',
					registeredProviderCount: 120,
				},
			}),
			telemetryService,
			lifecycleService,
		));
		lifecycleService.fireShutdown(ShutdownReason.CLOSE);

		const data = telemetryService.events[0].data;
		assert.deepStrictEqual({
			argument: data.workspaceArgumentKind,
			handoff: data.workspaceHandoffState,
			selected: data.workspacePreselected,
			origin: data.workspaceSelectionOrigin,
			providers: data.workspaceProviderCount,
			containsPath: JSON.stringify(data).includes('/private/'),
		}, {
			argument: 'remote',
			handoff: 'unsupportedWorkspace',
			selected: true,
			origin: 'vscodeRecent',
			providers: 100,
			containsPath: false,
		});
		tracker.dispose();
	});
});
