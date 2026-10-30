/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { IProcessEnvironment, OperatingSystem } from '../../../../base/common/platform.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAuxiliaryWindow } from '../../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IDialogMainService } from '../../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, ShutdownEvent, ShutdownReason } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { ThermalState } from '../../../native/common/native.js';
import { IProductService } from '../../../product/common/productService.js';
import { IStateService } from '../../../state/node/state.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { IUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow, WindowMode } from '../../../window/electron-main/window.js';
import { IExactRestoreOptions, IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IQuitAndInstallOptions, IUpdateService, State, UpdateType } from '../../common/update.js';
import { getWindowBlockers, hasArgumentsLostOnRelaunch, IUnattendedRestartHost, UNATTENDED_RESTART_LOCKED_DURATION, UnattendedRestartScheduler } from '../../electron-main/unattendedRestartScheduler.js';

suite('UnattendedRestartScheduler', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const MINUTE = 60 * 1000;
	const SECOND = 1000;
	const update = { version: '0123456789abcdef0123456789abcdef01234567', productVersion: '1.145.0' };

	class RecordingLogService extends NullLogService {
		readonly messages: string[] = [];
		override info(message: string): void {
			this.messages.push(message);
		}
	}

	interface ITestWindowOptions {
		readonly isReady?: boolean;
		readonly isSessionsWindow?: boolean;
		readonly remoteAuthority?: string;
		readonly isExtensionDevelopmentHost?: boolean;
		readonly isTemporaryProfile?: boolean;
		readonly disableExtensions?: boolean;
		readonly isMinimized?: boolean;
		readonly isVisible?: boolean;
		readonly isFullScreen?: boolean;
		/** Restored in the background, it enters fullscreen once it gets focus. */
		readonly isFullScreenPending?: boolean;
		readonly hasPendingMode?: boolean;
		readonly launchedFromCli?: boolean;
		readonly display?: number;
	}

	function createWindow(options: ITestWindowOptions = {}): ICodeWindow {
		return upcastPartial<ICodeWindow>({
			id: 1,
			isReady: options.isReady ?? true,
			config: upcastPartial<INativeWindowConfiguration>({ isSessionsWindow: options.isSessionsWindow, 'disable-extensions': options.disableExtensions, userEnv: options.launchedFromCli ? { VSCODE_CLI: '1' } : {} }),
			profile: upcastPartial<IUserDataProfile>({ isTransient: options.isTemporaryProfile }),
			remoteAuthority: options.remoteAuthority,
			isExtensionDevelopmentHost: options.isExtensionDevelopmentHost ?? false,
			isExtensionTestHost: false,
			isFullScreen: options.isFullScreen ?? false,
			hasPendingMode: options.hasPendingMode ?? false,
			serializeWindowState: () => ({ mode: options.isFullScreen || options.isFullScreenPending ? WindowMode.Fullscreen : WindowMode.Normal, display: options.display ?? 1 }),
			win: upcastPartial<NonNullable<ICodeWindow['win']>>({
				isMinimized: () => options.isMinimized ?? false,
				isVisible: () => options.isVisible ?? true,
				isSimpleFullScreen: () => false,
			}),
		});
	}

	function createRecordingTelemetryService(log: unknown[]): ITelemetryService {
		return upcastPartial<ITelemetryService>({
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2: (eventName: string, data?: unknown) => {
				log.push({ eventName, data });
			},
		});
	}

	interface IFixtureOptions {
		readonly os?: OperatingSystem;
		/** The setting in user settings, which both the main process and the windows read. */
		readonly enabled?: boolean;
		/** Whether an experiment enables the setting by default, which only windows resolve. */
		readonly enabledByExperiment?: boolean;
		readonly focusedWhenLocked?: boolean;
		readonly updateReady?: boolean;
		readonly updateVersion?: string;
		readonly hasOpenDialogs?: boolean;
		readonly onBattery?: boolean;
		readonly hasAuxiliaryWindow?: boolean;
		readonly isWindowReady?: boolean;
		/** Blockers that the window reports for consecutive checks; afterwards it reports none. */
		readonly windowBlockers?: string[][];
		/** What exactly blocks, which the window reports with its blockers. */
		readonly windowDetails?: Record<string, string>;
		/** A restart that the previous instance remembered when it shut down. */
		readonly previousRestart?: unknown;
		/** An update that a previous unattended restart did not install. */
		readonly failedUpdate?: unknown;
		readonly commit?: string;
		/** The environment of the main process. */
		readonly env?: IProcessEnvironment;
		/** Windows only answer once `answerWindows()` is called. */
		readonly holdWindowAnswers?: boolean;
		/** How long checking for a newer update takes before shutting down. */
		readonly newerUpdateCheckDuration?: number;
		/** Whether the first restart finds a newer update, which postpones it. */
		readonly newerUpdateOnRestart?: boolean;
	}

	function createFixture(options: IFixtureOptions = {}) {
		const log: unknown[] = [];
		const onStateChange = store.add(new Emitter<State>());
		const onDidLockScreen = store.add(new Emitter<void>());
		const onDidUnlockScreen = store.add(new Emitter<void>());
		const onDidSuspend = store.add(new Emitter<void>());
		const onDidResume = store.add(new Emitter<void>());
		const onDidSwitchToBattery = store.add(new Emitter<void>());
		const onDidChangeThermalState = store.add(new Emitter<ThermalState>());
		const onDidBlurWindow = store.add(new Emitter<void>());
		const onWillShutdown = store.add(new Emitter<ShutdownEvent>());

		const stateItems = new Map<string, unknown>();
		if (options.failedUpdate !== undefined) {
			stateItems.set('update.unattendedRestartFailedUpdate', options.failedUpdate);
		}
		if (options.previousRestart !== undefined) {
			stateItems.set('update.unattendedRestart', options.previousRestart);
		}
		const stateService = upcastPartial<IStateService>({
			getItem: <T>(key: string) => stateItems.get(key) as T | undefined,
			setItem: (key: string, data?: object | string | number | boolean | undefined | null) => { stateItems.set(key, data); },
			removeItem: (key: string) => { stateItems.delete(key); },
		});

		const readyUpdate = { ...update, version: options.updateVersion ?? update.version };
		let hasFoundNewerUpdate = false;
		let state: State = options.updateReady === false ? State.Idle(UpdateType.Archive) : State.Ready(readyUpdate, false, false);
		const updateService = upcastPartial<IUpdateService>({
			get state() { return state; },
			onStateChange: onStateChange.event,
			quitAndInstall: async (quitAndInstallOptions?: IQuitAndInstallOptions) => {
				log.push(`quitAndInstall(${quitAndInstallOptions?.relaunchInBackground ? 'background' : 'foreground'}${quitAndInstallOptions?.unattended ? '' : ', explicit'})`);
				if (options.newerUpdateOnRestart && !hasFoundNewerUpdate) {
					hasFoundNewerUpdate = true;
					state = State.Overwriting(readyUpdate, false);
					onStateChange.fire(state);
					return;
				}
				if (options.newerUpdateCheckDuration) {
					await timeout(options.newerUpdateCheckDuration);
				}
				if (quitAndInstallOptions?.token?.isCancellationRequested) {
					log.push('cancelled');
					return;
				}
				state = State.Restarting(readyUpdate);
			},
		});

		const window = createWindow({ isReady: options.isWindowReady });
		const exactRestores: (IExactRestoreOptions | undefined)[] = [];
		const windowsMainService = upcastPartial<IWindowsMainService>({
			getWindows: () => [window],
			restoreExactlyOnNextStartup: exactRestoreOptions => { exactRestores.push(exactRestoreOptions); },
		});

		let isLocked = false;
		let lockTimer: ReturnType<typeof setTimeout> | undefined;
		let onBattery = options.onBattery ?? false;
		let thermalState: ThermalState = 'nominal';
		const host: IUnattendedRestartHost = {
			onDidLockScreen: onDidLockScreen.event,
			onDidUnlockScreen: onDidUnlockScreen.event,
			onDidSuspend: onDidSuspend.event,
			onDidResume: onDidResume.event,
			onDidSwitchToBattery: onDidSwitchToBattery.event,
			onDidChangeThermalState: onDidChangeThermalState.event,
			onDidBlurWindow: onDidBlurWindow.event,
			isWindowFocused: () => options.focusedWhenLocked !== false,
			getIdleState: () => isLocked ? 'locked' : 'active',
			isOnBatteryPower: () => onBattery,
			getThermalState: () => thermalState,
			preventSleep: () => {
				log.push('keepAwake');
				return toDisposable(() => log.push('allowSleep'));
			},
		};

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('update.restartWhenIdle', options.enabled ?? true);
		configurationService.setUserConfiguration('update.enableWindowsBackgroundUpdates', true);

		const windowBlockers = [...(options.windowBlockers ?? [])];
		let windowAnswers = new DeferredPromise<void>();
		if (!options.holdWindowAnswers) {
			windowAnswers.complete();
		}
		const logService = store.add(new RecordingLogService());
		store.add(new UnattendedRestartScheduler(
			{
				getWindowReadiness: async () => {
					await windowAnswers.p;
					return { blockers: windowBlockers.shift() ?? [], details: options.windowDetails, enabled: (options.enabled ?? true) || (options.enabledByExperiment ?? false) };
				},
				host,
				os: options.os ?? OperatingSystem.Macintosh,
				argv: [],
				env: options.env ?? {},
			},
			updateService,
			windowsMainService,
			upcastPartial<IAuxiliaryWindowsMainService>({ getWindows: () => options.hasAuxiliaryWindow ? [upcastPartial<IAuxiliaryWindow>({ ...createWindow(), parentId: 1 })] : [] }),
			upcastPartial<IDialogMainService>({ hasOpenDialogs: () => options.hasOpenDialogs ?? false }),
			configurationService,
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
			upcastPartial<IProductService>({ target: 'user', commit: options.commit ?? 'current' }),
			logService,
			createRecordingTelemetryService(log),
			upcastPartial<ILifecycleMainService>({ onWillShutdown: onWillShutdown.event }),
			stateService,
		));

		return {
			log,
			messages: logService.messages,
			lock: () => {
				// Like macOS, which reports the screen as locked only shortly after the lock event
				lockTimer = setTimeout(() => isLocked = true, SECOND);
				onDidLockScreen.fire();
			},
			unlock: () => {
				clearTimeout(lockTimer);
				isLocked = false;
				onDidUnlockScreen.fire();
			},
			holdWindowAnswers: () => windowAnswers = new DeferredPromise<void>(),
			answerWindows: () => windowAnswers.complete(),
			blurWindow: () => onDidBlurWindow.fire(),
			suspend: () => onDidSuspend.fire(),
			resume: () => onDidResume.fire(),
			switchToBattery: () => {
				onBattery = true;
				onDidSwitchToBattery.fire();
			},
			changeThermalState: (state: ThermalState) => {
				thermalState = state;
				onDidChangeThermalState.fire(state);
			},
			setUpdateReady: () => {
				state = State.Ready(readyUpdate, false, false);
				onStateChange.fire(state);
			},
			veto: () => {
				state = State.Ready(readyUpdate, false, false);
				onStateChange.fire(state);
			},
			/** Completes the shutdown and returns the restart that is remembered for the next launch. */
			shutdown: () => {
				onWillShutdown.fire({ reason: ShutdownReason.QUIT, join: () => { } });
				return stateItems.get('update.unattendedRestart');
			},
			stateItems,
			exactRestores,
		};
	}

	function outcome(outcome: string, attempts: number, lockedMinutes: number, blockers = '', inBackground = false) {
		return { eventName: 'update:unattendedRestart', data: { outcome, blockers, inBackground, attempts, lockedMinutes } };
	}

	function pendingRestart(attempts: number, lockedMinutes: number, inBackground = false) {
		return { fromCommit: 'current', toVersion: update.version, inBackground, attempts, lockedMinutes };
	}

	test('keeps the machine awake from the lock and restarts once the screen has been locked long enough', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - 20 * SECOND);
		const beforeThreshold = [...fixture.log];
		await timeout(MINUTE);

		assert.deepStrictEqual({ beforeThreshold, afterThreshold: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			beforeThreshold: ['keepAwake'],
			afterThreshold: ['keepAwake', 'quitAndInstall(foreground)'],
			exactRestores: [{ inBackground: false }],
			restart: pendingRestart(2, 1),
		});
	}));

	test('only measures eligibility when the setting is disabled, without keeping the machine awake', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ enabled: false });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 30 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores }, { log: [outcome('eligible', 2, 1)], exactRestores: [] });
	}));

	test('restarts when an experiment enables the setting, which only windows resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ enabled: false, enabledByExperiment: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual(fixture.log, ['keepAwake', 'quitAndInstall(foreground)']);
	}));

	test('restores the windows in the background when another application had focus when the screen got locked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(5 * SECOND);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			log: ['keepAwake', 'quitAndInstall(background)'],
			exactRestores: [{ inBackground: true }],
			restart: pendingRestart(2, 1, true),
		});
	}));

	test('restarts in the background with floating windows and for updates without a commit, but not on Windows yet', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const windows = createFixture({ os: OperatingSystem.Windows, focusedWhenLocked: false });
		const macOS = createFixture({ focusedWhenLocked: false, hasAuxiliaryWindow: true, updateVersion: 'unknown' });

		windows.lock();
		macOS.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		windows.unlock();

		assert.deepStrictEqual({ windows: windows.log, macOS: macOS.log }, {
			windows: [],
			macOS: ['keepAwake', 'quitAndInstall(background)'],
		});
	}));

	test('treats a window that lost focus as the screen got locked as focused', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(500);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ log: fixture.log, restart: fixture.shutdown() }, { log: ['keepAwake', 'quitAndInstall(foreground)'], restart: pendingRestart(2, 1) });
	}));

	test('does not keep the machine awake or restart while a native dialog is open', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ hasOpenDialogs: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, [outcome('blocked', 2, 1, 'app.dialogOpen')]);
	}));

	test('only keeps the machine awake while it is on power', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const onBattery = createFixture({ onBattery: true });
		const unplugged = createFixture();

		onBattery.lock();
		unplugged.lock();
		await timeout(20 * SECOND);
		unplugged.switchToBattery();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION);
		onBattery.unlock();
		unplugged.unlock();

		assert.deepStrictEqual({ onBattery: onBattery.log, unplugged: unplugged.log }, {
			onBattery: [outcome('blocked', 2, 1, 'system.onBatteryPower')],
			unplugged: ['keepAwake', 'allowSleep', outcome('blocked', 2, 1, 'system.onBatteryPower')],
		});
	}));

	test('checks power and heat once the windows answered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const unplugged = createFixture({ holdWindowAnswers: true });
		const heated = createFixture({ holdWindowAnswers: true });

		unplugged.lock();
		heated.lock();
		await timeout(10);
		unplugged.switchToBattery();
		heated.changeThermalState('serious');
		unplugged.answerWindows();
		heated.answerWindows();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		unplugged.unlock();
		heated.unlock();

		assert.deepStrictEqual({ unplugged: unplugged.log, heated: heated.log }, {
			unplugged: [outcome('blocked', 2, 1, 'system.onBatteryPower')],
			heated: [outcome('blocked', 2, 1, 'system.thermalPressure')],
		});
	}));

	test('does not restart when the machine switches to battery while the windows answer the check when the restart is due', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - SECOND);
		fixture.holdWindowAnswers();
		await timeout(2 * SECOND);
		fixture.switchToBattery();
		fixture.answerWindows();
		await timeout(20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, ['keepAwake', 'allowSleep', outcome('blocked', 2, 1, 'system.onBatteryPower')]);
	}));

	test('checks again when the screen gets locked again, or the machine resumes, while a check waits for the windows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const relocked = createFixture({ holdWindowAnswers: true });
		const resumed = createFixture({ holdWindowAnswers: true });

		relocked.lock();
		resumed.lock();
		await timeout(10);
		relocked.unlock();
		relocked.lock();
		resumed.suspend();
		resumed.resume();
		await timeout(10);
		relocked.answerWindows();
		resumed.answerWindows();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ relocked: relocked.log, resumed: resumed.log }, {
			relocked: ['keepAwake', 'quitAndInstall(foreground)'],
			resumed: ['keepAwake', 'quitAndInstall(foreground)'],
		});
	}));

	test('does not shut down when the screen gets unlocked while the restart checks for a newer update', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ newerUpdateCheckDuration: 2 * SECOND });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + SECOND);
		fixture.unlock();
		await timeout(5 * SECOND);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			log: ['keepAwake', 'quitAndInstall(foreground)', 'allowSleep', 'cancelled'],
			exactRestores: [{ inBackground: false }, undefined],
			restart: undefined,
		});
	}));

	test('restarts once a newer update that postponed the restart is ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ newerUpdateOnRestart: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		const whilePostponed = [...fixture.log];
		fixture.setUpdateReady();
		await timeout(20 * SECOND);

		assert.deepStrictEqual({ whilePostponed, log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			whilePostponed: ['keepAwake', 'quitAndInstall(foreground)', 'allowSleep'],
			log: ['keepAwake', 'quitAndInstall(foreground)', 'allowSleep', 'quitAndInstall(foreground)'],
			exactRestores: [{ inBackground: false }, undefined, { inBackground: false }],
			restart: pendingRestart(3, 1),
		});
	}));

	test('does not restart a VS Code started from a terminal on macOS, whose environment the relaunch would not have', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ env: { VSCODE_CLI: '1' } });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, [outcome('blocked', 2, 1, 'app.launchedFromCli')]);
	}));

	test('lets the machine sleep as soon as it is under thermal pressure, and does not restart then', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(20 * SECOND);
		fixture.changeThermalState('fair');
		const whenFair = [...fixture.log];
		fixture.changeThermalState('serious');
		const whenSerious = [...fixture.log];
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION);
		fixture.unlock();

		assert.deepStrictEqual({ whenFair, whenSerious, log: fixture.log }, {
			whenFair: ['keepAwake'],
			whenSerious: ['keepAwake', 'allowSleep'],
			log: ['keepAwake', 'allowSleep', outcome('blocked', 2, 1, 'system.thermalPressure')],
		});
	}));

	test('reports everything that blocked the last attempt, but does not ask windows that are not ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const dialogOpen = createFixture({ hasOpenDialogs: true, windowBlockers: [['terminal.runningProcess'], ['chat.sessionInProgress']] });
		const notReady = createFixture({ isWindowReady: false, windowBlockers: [['terminal.runningProcess'], ['terminal.runningProcess']] });

		dialogOpen.lock();
		notReady.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		dialogOpen.unlock();
		notReady.unlock();

		assert.deepStrictEqual({ dialogOpen: dialogOpen.log, notReady: notReady.log }, {
			dialogOpen: [outcome('blocked', 2, 1, 'app.dialogOpen,chat.sessionInProgress')],
			notReady: [outcome('blocked', 2, 1, 'window.notReady')],
		});
	}));

	test('logs what exactly blocks, but only reports the blockers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({
			windowBlockers: [['workbench.editorNotRestorable'], ['workbench.editorNotRestorable']],
			windowDetails: { 'workbench.editorNotRestorable': 'Release Notes: 1.145.0 [workbench.editors.webviewInput, releaseNotes]' },
		});

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual({ log: fixture.log, messages: fixture.messages.filter(message => message.includes('not restarting')) }, {
			log: [outcome('blocked', 2, 1, 'workbench.editorNotRestorable')],
			messages: ['update#unattendedRestart - not restarting: workbench.editorNotRestorable (Release Notes: 1.145.0 [workbench.editors.webviewInput, releaseNotes])'],
		});
	}));

	test('retries while a window cannot be restored and restarts once it can', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ windowBlockers: [['terminal.runningProcess'], ['terminal.runningProcess']] });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 2 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, restart: fixture.shutdown() }, { log: ['quitAndInstall(foreground)'], restart: pendingRestart(3, 2) });
	}));

	test('retries when the shutdown is vetoed and reports nothing until the restart completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.veto();
		await timeout(2 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			log: ['keepAwake', 'quitAndInstall(foreground)', 'allowSleep', 'quitAndInstall(foreground)'],
			exactRestores: [{ inBackground: false }, undefined, { inBackground: false }],
			restart: pendingRestart(3, 2),
		});
	}));

	test('reports a vetoed restart as blocked when the screen gets unlocked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.veto();
		await timeout(20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual({ log: fixture.log, restart: fixture.shutdown() }, {
			log: ['keepAwake', 'quitAndInstall(foreground)', 'allowSleep', outcome('blocked', 2, 2, 'shutdown.vetoed')],
			restart: undefined,
		});
	}));

	test('reports a completed restart on the next launch', () => {
		const updated = createFixture({ previousRestart: { fromCommit: 'previous', inBackground: true, attempts: 2, lockedMinutes: 20 }, commit: 'current' });
		const notUpdated = createFixture({ previousRestart: { fromCommit: 'current', inBackground: false, attempts: 1, lockedMinutes: 15 }, commit: 'current' });
		const malformed = createFixture({ previousRestart: { fromCommit: 'previous' } });

		assert.deepStrictEqual({
			updated: { log: updated.log, remembered: updated.stateItems.size },
			notUpdated: { log: notUpdated.log, remembered: notUpdated.stateItems.size },
			malformed: { log: malformed.log, remembered: malformed.stateItems.size },
		}, {
			updated: { log: [outcome('restarted', 2, 20, '', true)], remembered: 0 },
			notUpdated: { log: [outcome('restartedWithoutUpdate', 1, 15)], remembered: 0 },
			malformed: { log: [], remembered: 0 },
		});
	});

	test('does not restart again for an update that the last unattended restart did not install', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const notInstalled = { fromCommit: 'current', toVersion: update.version, inBackground: false, attempts: 1, lockedMinutes: 2 };
		const sameUpdate = createFixture({ previousRestart: notInstalled });
		const newerUpdate = createFixture({ previousRestart: notInstalled, updateVersion: 'fedcba9876543210fedcba9876543210fedcba98' });
		const updatedSince = createFixture({ failedUpdate: { commit: 'previous', version: update.version } });

		for (const fixture of [sameUpdate, newerUpdate, updatedSince]) {
			fixture.lock();
		}
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		sameUpdate.unlock();

		assert.deepStrictEqual({
			sameUpdate: { log: sameUpdate.log, failedUpdate: sameUpdate.stateItems.get('update.unattendedRestartFailedUpdate') },
			newerUpdate: newerUpdate.log,
			updatedSince: { log: updatedSince.log, failedUpdate: updatedSince.stateItems.get('update.unattendedRestartFailedUpdate') },
		}, {
			sameUpdate: {
				log: [outcome('restartedWithoutUpdate', 1, 2), outcome('blocked', 2, 1, 'update.installFailed')],
				failedUpdate: { commit: 'current', version: update.version },
			},
			newerUpdate: [outcome('restartedWithoutUpdate', 1, 2), 'keepAwake', 'quitAndInstall(foreground)'],
			updatedSince: { log: ['keepAwake', 'quitAndInstall(foreground)'], failedUpdate: undefined },
		});
	}));

	test('keeps the machine awake again when it resumes while locked, and restarts the clock', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - 20 * SECOND);
		fixture.suspend();
		await timeout(60 * MINUTE);
		fixture.resume();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - 20 * SECOND);
		const beforeThreshold = [...fixture.log];
		await timeout(MINUTE);

		assert.deepStrictEqual({ beforeThreshold, afterThreshold: fixture.log, restart: fixture.shutdown() }, {
			beforeThreshold: ['keepAwake', 'allowSleep', 'keepAwake'],
			afterThreshold: ['keepAwake', 'allowSleep', 'keepAwake', 'quitAndInstall(foreground)'],
			restart: pendingRestart(3, 1),
		});
	}));

	test('reports when the machine went to sleep before the restart was due, for example because the lid got closed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const enabled = createFixture();
		const measuring = createFixture({ enabled: false });

		for (const fixture of [enabled, measuring]) {
			fixture.lock();
		}
		await timeout(10 * SECOND);
		for (const fixture of [enabled, measuring]) {
			fixture.suspend();
		}
		await timeout(8 * 60 * MINUTE);
		for (const fixture of [enabled, measuring]) {
			fixture.resume();
		}
		await timeout(5 * SECOND);
		for (const fixture of [enabled, measuring]) {
			fixture.unlock();
		}

		assert.deepStrictEqual({ enabled: enabled.log, measuring: measuring.log }, {
			enabled: ['keepAwake', 'allowSleep', 'keepAwake', outcome('asleep', 2, 0), 'allowSleep'],
			measuring: [outcome('asleep', 2, 0)],
		});
	}));

	test('waits for the update to be ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ updateReady: false });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 60 * MINUTE);
		const beforeReady = [...fixture.log];
		fixture.setUpdateReady();
		await timeout(20 * SECOND);

		assert.deepStrictEqual({ beforeReady, afterReady: fixture.log, restart: fixture.shutdown() }, {
			beforeReady: [],
			afterReady: ['quitAndInstall(foreground)'],
			restart: pendingRestart(1, 61),
		});
	}));

	test('lets the machine sleep again and reports nothing when the screen is unlocked before the restart is due', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - 20 * SECOND);
		fixture.unlock();
		await timeout(60 * MINUTE);

		assert.deepStrictEqual(fixture.log, ['keepAwake', 'allowSleep']);
	}));

	test('getWindowBlockers', () => {
		const savedWindows = [
			createWindow({ isSessionsWindow: true }),
			createWindow({ isMinimized: true, isVisible: false }),
			createWindow({ isVisible: false }),
			createWindow({ isFullScreen: true, display: 1 }),
			createWindow({ isFullScreen: true, display: 1 }),
		];
		const savedFloatingWindows = [createWindow(), createWindow({ isFullScreen: true })];

		const pendingFullScreenWindows = [createWindow({ isFullScreenPending: true, display: 2 }), createWindow({ isFullScreen: true, display: 2 })];

		assert.deepStrictEqual({
			noWindows: getWindowBlockers([], [], OperatingSystem.Macintosh, true),
			inBackground: getWindowBlockers(savedWindows, savedFloatingWindows, OperatingSystem.Macintosh, true),
			inForeground: getWindowBlockers(savedWindows, savedFloatingWindows, OperatingSystem.Macintosh, false),
			inForegroundOnWindows: getWindowBlockers(savedWindows, [], OperatingSystem.Windows, false),
			pendingFullScreenInForeground: getWindowBlockers(pendingFullScreenWindows, [], OperatingSystem.Macintosh, false),
			pendingFloatingWindowMode: getWindowBlockers([createWindow()], [createWindow({ hasPendingMode: true })], OperatingSystem.Macintosh, true),
			openedFromTerminal: getWindowBlockers([createWindow({ launchedFromCli: true })], [], OperatingSystem.Macintosh, true),
			notRestorable: getWindowBlockers([
				createWindow({ isReady: false }),
				createWindow({ remoteAuthority: 'ssh-remote+host' }),
				createWindow({ isExtensionDevelopmentHost: true }),
				createWindow({ isTemporaryProfile: true }),
				createWindow({ disableExtensions: true }),
			], [createWindow({ isMinimized: true, isVisible: false })], OperatingSystem.Macintosh, true),
		}, {
			noWindows: ['window.none'],
			inBackground: [],
			inForeground: ['window.fullScreenSameDisplay', 'window.auxiliaryFullScreen'], // macOS restores one native fullscreen window per display at once
			inForegroundOnWindows: [],
			pendingFullScreenInForeground: ['window.fullScreenSameDisplay'],
			pendingFloatingWindowMode: ['window.auxiliaryPendingMode'],
			openedFromTerminal: ['window.launchedFromCli'],
			notRestorable: ['window.notReady', 'window.remote', 'window.extensionDevelopment', 'window.temporaryProfile', 'window.launchArguments', 'window.auxiliaryMinimized'],
		});
	});

	test('hasArgumentsLostOnRelaunch', () => {
		const args = (partial: Partial<NativeParsedArgs>): NativeParsedArgs => ({ _: [], ...partial });

		assert.deepStrictEqual({
			none: hasArgumentsLostOnRelaunch(args({}), [], OperatingSystem.Macintosh),
			extensionsDirOnMacOS: hasArgumentsLostOnRelaunch(args({ 'extensions-dir': '/extensions' }), [], OperatingSystem.Macintosh),
			extensionsDirOnWindows: hasArgumentsLostOnRelaunch(args({ 'extensions-dir': 'C:\\extensions' }), [], OperatingSystem.Windows),
			noSandboxOnMacOS: hasArgumentsLostOnRelaunch(args({}), ['--no-sandbox'], OperatingSystem.Macintosh),
			disabledExtension: hasArgumentsLostOnRelaunch(args({ 'disable-extension': ['publisher.extension'] }), [], OperatingSystem.Windows),
			noDisabledExtension: hasArgumentsLostOnRelaunch(args({ 'disable-extension': [] }), [], OperatingSystem.Windows),
			temporaryProfile: hasArgumentsLostOnRelaunch(args({ 'profile-temp': true }), [], OperatingSystem.Windows),
			layoutRestoreDisabled: hasArgumentsLostOnRelaunch(args({ 'disable-layout-restore': true }), [], OperatingSystem.Windows),
		}, {
			none: false,
			extensionsDirOnMacOS: true,
			extensionsDirOnWindows: false,
			noSandboxOnMacOS: true,
			disabledExtension: true,
			noDisabledExtension: false,
			temporaryProfile: true,
			layoutRestoreDisabled: true,
		});
	});
});
