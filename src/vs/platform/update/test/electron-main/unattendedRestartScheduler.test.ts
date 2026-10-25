/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
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
		readonly display?: number;
	}

	function createWindow(options: ITestWindowOptions = {}): ICodeWindow {
		return upcastPartial<ICodeWindow>({
			id: 1,
			isReady: options.isReady ?? true,
			config: upcastPartial<INativeWindowConfiguration>({ isSessionsWindow: options.isSessionsWindow, 'disable-extensions': options.disableExtensions }),
			profile: upcastPartial<IUserDataProfile>({ isTransient: options.isTemporaryProfile }),
			remoteAuthority: options.remoteAuthority,
			isExtensionDevelopmentHost: options.isExtensionDevelopmentHost ?? false,
			isExtensionTestHost: false,
			isFullScreen: options.isFullScreen ?? false,
			serializeWindowState: () => ({ mode: options.isFullScreen ? WindowMode.Fullscreen : WindowMode.Normal, display: options.display ?? 1 }),
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
		readonly hasAuxiliaryWindow?: boolean;
		/** Blockers that the window reports for consecutive checks; afterwards it reports none. */
		readonly windowBlockers?: string[][];
		/** A restart that the previous instance remembered when it shut down. */
		readonly previousRestart?: unknown;
		readonly commit?: string;
	}

	function createFixture(options: IFixtureOptions = {}) {
		const log: unknown[] = [];
		const onStateChange = store.add(new Emitter<State>());
		const onDidLockScreen = store.add(new Emitter<void>());
		const onDidUnlockScreen = store.add(new Emitter<void>());
		const onDidSuspend = store.add(new Emitter<void>());
		const onDidResume = store.add(new Emitter<void>());
		const onDidBlurWindow = store.add(new Emitter<void>());
		const onWillShutdown = store.add(new Emitter<ShutdownEvent>());

		const stateItems = new Map<string, unknown>();
		if (options.previousRestart !== undefined) {
			stateItems.set('update.unattendedRestart', options.previousRestart);
		}
		const stateService = upcastPartial<IStateService>({
			getItem: <T>(key: string) => stateItems.get(key) as T | undefined,
			setItem: (key: string, data?: object | string | number | boolean | undefined | null) => { stateItems.set(key, data); },
			removeItem: (key: string) => { stateItems.delete(key); },
		});

		const readyUpdate = { ...update, version: options.updateVersion ?? update.version };
		let state: State = options.updateReady === false ? State.Idle(UpdateType.Archive) : State.Ready(readyUpdate, false, false);
		const updateService = upcastPartial<IUpdateService>({
			get state() { return state; },
			onStateChange: onStateChange.event,
			quitAndInstall: async (quitAndInstallOptions?: IQuitAndInstallOptions) => {
				log.push(`quitAndInstall(${quitAndInstallOptions?.relaunchInBackground ? 'background' : 'foreground'})`);
				state = State.Restarting(readyUpdate);
			},
		});

		const window = createWindow();
		const exactRestores: (IExactRestoreOptions | undefined)[] = [];
		const windowsMainService = upcastPartial<IWindowsMainService>({
			getWindows: () => [window],
			restoreExactlyOnNextStartup: exactRestoreOptions => { exactRestores.push(exactRestoreOptions); },
		});

		let isLocked = false;
		const host: IUnattendedRestartHost = {
			onDidLockScreen: onDidLockScreen.event,
			onDidUnlockScreen: onDidUnlockScreen.event,
			onDidSuspend: onDidSuspend.event,
			onDidResume: onDidResume.event,
			onDidBlurWindow: onDidBlurWindow.event,
			isWindowFocused: () => options.focusedWhenLocked !== false,
			getIdleState: () => isLocked ? 'locked' : 'active',
			isOnBatteryPower: () => false,
			getThermalState: () => 'nominal',
		};

		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('update.restartWhenIdle', options.enabled ?? true);
		configurationService.setUserConfiguration('update.enableWindowsBackgroundUpdates', true);

		const windowBlockers = [...(options.windowBlockers ?? [])];
		store.add(new UnattendedRestartScheduler(
			{
				getWindowReadiness: async () => ({ blockers: windowBlockers.shift() ?? [], enabled: (options.enabled ?? true) || (options.enabledByExperiment ?? false) }),
				host,
				os: options.os ?? OperatingSystem.Macintosh,
				argv: [],
			},
			updateService,
			windowsMainService,
			upcastPartial<IAuxiliaryWindowsMainService>({ getWindows: () => options.hasAuxiliaryWindow ? [upcastPartial<IAuxiliaryWindow>({ ...createWindow(), parentId: 1 })] : [] }),
			upcastPartial<IDialogMainService>({ hasOpenDialogs: () => options.hasOpenDialogs ?? false }),
			configurationService,
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
			upcastPartial<IProductService>({ target: 'user', commit: options.commit ?? 'current' }),
			store.add(new NullLogService()),
			createRecordingTelemetryService(log),
			upcastPartial<ILifecycleMainService>({ onWillShutdown: onWillShutdown.event }),
			stateService,
		));

		return {
			log,
			lock: () => {
				isLocked = true;
				onDidLockScreen.fire();
			},
			unlock: () => {
				isLocked = false;
				onDidUnlockScreen.fire();
			},
			blurWindow: () => onDidBlurWindow.fire(),
			suspend: () => onDidSuspend.fire(),
			resume: () => onDidResume.fire(),
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
		return { fromCommit: 'current', inBackground, attempts, lockedMinutes };
	}

	test('restarts once the screen has been locked long enough', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - MINUTE);
		const beforeThreshold = [...fixture.log];
		await timeout(2 * MINUTE);

		assert.deepStrictEqual({ beforeThreshold, afterThreshold: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			beforeThreshold: [],
			afterThreshold: ['quitAndInstall(foreground)'],
			exactRestores: [{ inBackground: false }],
			restart: pendingRestart(1, 2),
		});
	}));

	test('only measures eligibility when the setting is disabled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ enabled: false });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 30 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores }, { log: [outcome('eligible', 1, 2)], exactRestores: [] });
	}));

	test('restarts when an experiment enables the setting, which only windows resolve', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ enabled: false, enabledByExperiment: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual(fixture.log, ['quitAndInstall(foreground)']);
	}));

	test('restores the windows in the background when another application had focus when the screen got locked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(5 * SECOND);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			log: ['quitAndInstall(background)'],
			exactRestores: [{ inBackground: true }],
			restart: pendingRestart(1, 2, true),
		});
	}));

	test('restarts in the background on Windows, with floating windows, and for updates without a commit', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const windows = createFixture({ os: OperatingSystem.Windows, focusedWhenLocked: false });
		const macOS = createFixture({ focusedWhenLocked: false, hasAuxiliaryWindow: true, updateVersion: 'unknown' });

		windows.lock();
		macOS.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ windows: windows.log, macOS: macOS.log }, {
			windows: ['quitAndInstall(background)'],
			macOS: ['quitAndInstall(background)'],
		});
	}));

	test('treats a window that lost focus as the screen got locked as focused', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(500);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);

		assert.deepStrictEqual({ log: fixture.log, restart: fixture.shutdown() }, { log: ['quitAndInstall(foreground)'], restart: pendingRestart(1, 2) });
	}));

	test('does not restart while a native dialog is open', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ hasOpenDialogs: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, [outcome('blocked', 1, 2, 'app.dialogOpen')]);
	}));

	test('retries while a window cannot be restored and restarts once it can', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ windowBlockers: [['terminal.runningProcess']] });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 2 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, restart: fixture.shutdown() }, { log: ['quitAndInstall(foreground)'], restart: pendingRestart(2, 3) });
	}));

	test('retries when the shutdown is vetoed and reports nothing until the restart completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 20 * SECOND);
		fixture.veto();
		await timeout(2 * MINUTE);

		assert.deepStrictEqual({ log: fixture.log, exactRestores: fixture.exactRestores, restart: fixture.shutdown() }, {
			log: ['quitAndInstall(foreground)', 'quitAndInstall(foreground)'],
			exactRestores: [{ inBackground: false }, undefined, { inBackground: false }],
			restart: pendingRestart(2, 3),
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
			log: ['quitAndInstall(foreground)', outcome('blocked', 1, 3, 'shutdown.vetoed')],
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

	test('restarts the clock when the machine resumes while locked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			beforeThreshold: [],
			afterThreshold: ['quitAndInstall(foreground)'],
			restart: pendingRestart(1, 2),
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
			restart: pendingRestart(1, 62),
		});
	}));

	test('does nothing when the screen is unlocked before the restart is due', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - 20 * SECOND);
		fixture.unlock();
		await timeout(60 * MINUTE);

		assert.deepStrictEqual(fixture.log, []);
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

		assert.deepStrictEqual({
			noWindows: getWindowBlockers([], [], OperatingSystem.Macintosh, true),
			inBackground: getWindowBlockers(savedWindows, savedFloatingWindows, OperatingSystem.Macintosh, true),
			inForeground: getWindowBlockers(savedWindows, savedFloatingWindows, OperatingSystem.Macintosh, false),
			inForegroundOnWindows: getWindowBlockers(savedWindows, [], OperatingSystem.Windows, false),
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
