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
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IDialogMainService } from '../../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { IUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IUpdateService, State, UpdateType } from '../../common/update.js';
import { getWindowBlockers, hasArgumentsLostOnRelaunch, IUnattendedRestartHost, UNATTENDED_RESTART_LOCKED_DURATION, UnattendedRestartScheduler } from '../../electron-main/unattendedRestartScheduler.js';

suite('UnattendedRestartScheduler', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const MINUTE = 60 * 1000;
	const update = { version: 'next', productVersion: '1.145.0' };

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
			win: upcastPartial<NonNullable<ICodeWindow['win']>>({
				isMinimized: () => options.isMinimized ?? false,
				isVisible: () => options.isVisible ?? true,
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
		readonly enabled?: boolean;
		readonly focusedWhenLocked?: boolean;
		readonly updateReady?: boolean;
		readonly hasOpenDialogs?: boolean;
		/** Blockers that the window reports for consecutive checks; afterwards it reports none. */
		readonly windowBlockers?: string[][];
	}

	function createFixture(options: IFixtureOptions = {}) {
		const log: unknown[] = [];
		const onStateChange = store.add(new Emitter<State>());
		const onDidLockScreen = store.add(new Emitter<void>());
		const onDidUnlockScreen = store.add(new Emitter<void>());
		const onDidSuspend = store.add(new Emitter<void>());
		const onDidResume = store.add(new Emitter<void>());
		const onDidBlurWindow = store.add(new Emitter<void>());

		let state: State = options.updateReady === false ? State.Idle(UpdateType.Archive) : State.Ready(update, false, false);
		const updateService = upcastPartial<IUpdateService>({
			get state() { return state; },
			onStateChange: onStateChange.event,
			quitAndInstall: async () => {
				log.push('quitAndInstall');
				state = State.Restarting(update);
			},
		});

		const window = createWindow();
		const windowsMainService = upcastPartial<IWindowsMainService>({ getWindows: () => [window] });

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

		const windowBlockers = [...(options.windowBlockers ?? [])];
		store.add(new UnattendedRestartScheduler(
			{
				getWindowReadiness: async () => ({ blockers: windowBlockers.shift() ?? [] }),
				host,
				os: OperatingSystem.Macintosh,
				argv: [],
			},
			updateService,
			windowsMainService,
			upcastPartial<IAuxiliaryWindowsMainService>({ getWindows: () => [] }),
			upcastPartial<IDialogMainService>({ hasOpenDialogs: () => options.hasOpenDialogs ?? false }),
			configurationService,
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
			upcastPartial<IProductService>({ target: 'user' }),
			store.add(new NullLogService()),
			createRecordingTelemetryService(log),
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
				state = State.Ready(update, false, false);
				onStateChange.fire(state);
			},
		};
	}

	function outcome(outcome: string, attempts: number, lockedMinutes: number, blockers = '') {
		return { eventName: 'update:unattendedRestart', data: { outcome, blockers, attempts, lockedMinutes } };
	}

	test('restarts once the screen has been locked long enough', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - MINUTE);
		const beforeThreshold = [...fixture.log];
		await timeout(2 * MINUTE);

		assert.deepStrictEqual({ beforeThreshold, afterThreshold: fixture.log }, {
			beforeThreshold: [],
			afterThreshold: ['quitAndInstall', outcome('restarting', 1, 15)],
		});
	}));

	test('only measures eligibility when the setting is disabled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ enabled: false });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 30 * MINUTE);

		assert.deepStrictEqual(fixture.log, [outcome('eligible', 1, 15)]);
	}));

	test('never restarts when another application had focus when the screen got locked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(5000);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 6 * MINUTE);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, [outcome('blocked', 2, 21, 'app.notFocusedWhenLocked')]);
	}));

	test('treats a window that lost focus as the screen got locked as focused', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ focusedWhenLocked: false });

		fixture.blurWindow();
		await timeout(500);
		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + MINUTE);

		assert.deepStrictEqual(fixture.log, ['quitAndInstall', outcome('restarting', 1, 15)]);
	}));

	test('does not restart while a native dialog is open', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ hasOpenDialogs: true });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + MINUTE);
		fixture.unlock();

		assert.deepStrictEqual(fixture.log, [outcome('blocked', 1, 16, 'app.dialogOpen')]);
	}));

	test('retries while a window cannot be restored and restarts once it can', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ windowBlockers: [['terminal.runningProcess']] });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 6 * MINUTE);

		assert.deepStrictEqual(fixture.log, ['quitAndInstall', outcome('restarting', 2, 20)]);
	}));

	test('restarts the clock when the machine resumes while locked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(10 * MINUTE);
		fixture.suspend();
		await timeout(60 * MINUTE);
		fixture.resume();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - MINUTE);
		const beforeThreshold = [...fixture.log];
		await timeout(2 * MINUTE);

		assert.deepStrictEqual({ beforeThreshold, afterThreshold: fixture.log }, {
			beforeThreshold: [],
			afterThreshold: ['quitAndInstall', outcome('restarting', 1, 15)],
		});
	}));

	test('waits for the update to be ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ updateReady: false });

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION + 60 * MINUTE);
		const beforeReady = [...fixture.log];
		fixture.setUpdateReady();
		await timeout(MINUTE);

		assert.deepStrictEqual({ beforeReady, afterReady: fixture.log }, {
			beforeReady: [],
			afterReady: ['quitAndInstall', outcome('restarting', 1, 75)],
		});
	}));

	test('does nothing when the screen is unlocked before the restart is due', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture();

		fixture.lock();
		await timeout(UNATTENDED_RESTART_LOCKED_DURATION - MINUTE);
		fixture.unlock();
		await timeout(60 * MINUTE);

		assert.deepStrictEqual(fixture.log, []);
	}));

	test('getWindowBlockers', () => {
		assert.deepStrictEqual({
			noWindows: getWindowBlockers([], [], OperatingSystem.Macintosh),
			restorable: getWindowBlockers([createWindow(), createWindow({ isFullScreen: true })], [createWindow()], OperatingSystem.Windows),
			notRestorable: getWindowBlockers([
				createWindow({ isReady: false }),
				createWindow({ isSessionsWindow: true }),
				createWindow({ remoteAuthority: 'ssh-remote+host' }),
				createWindow({ isExtensionDevelopmentHost: true }),
				createWindow({ isTemporaryProfile: true }),
				createWindow({ disableExtensions: true }),
				createWindow({ isVisible: false }),
				createWindow({ isFullScreen: true }),
			], [createWindow({ isMinimized: true, isVisible: false })], OperatingSystem.Macintosh),
		}, {
			noWindows: ['window.none'],
			restorable: [],
			notRestorable: ['window.notReady', 'window.agents', 'window.remote', 'window.extensionDevelopment', 'window.temporaryProfile', 'window.launchArguments', 'window.hidden', 'window.fullScreen', 'window.minimized'],
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
		}, {
			none: false,
			extensionsDirOnMacOS: true,
			extensionsDirOnWindows: false,
			noSandboxOnMacOS: true,
			disabledExtension: true,
			noDisabledExtension: false,
			temporaryProfile: true,
		});
	});
});
