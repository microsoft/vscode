/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { equals } from '../../../base/common/arrays.js';
import { raceTimeout, RunOnceScheduler } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { describeUnattendedRestartBlockers, IUnattendedRestartWindowReadiness } from '../../lifecycle/common/unattendedRestart.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { SystemIdleState, ThermalState } from '../../native/common/native.js';
import { IProductService } from '../../product/common/productService.js';
import { IStateService } from '../../state/node/state.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { IBaseWindow, ICodeWindow, WindowMode } from '../../window/electron-main/window.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { isUnattendedRestartSupported, IUpdateService, RESTART_WHEN_IDLE_SETTING, StateType } from '../common/update.js';
import { getRelaunchArguments } from './updateRelaunchArguments.js';

/**
 * How long the screen must stay locked before restarting. When everything would work as the
 * screen gets locked, the machine is kept awake until then, so that it does not go to sleep first.
 */
export const UNATTENDED_RESTART_LOCKED_DURATION = 60 * 1000;

/**
 * Lets the machine sleep again when the restart does not happen in time.
 */
const KEEP_AWAKE_LIMIT = 3 * 60 * 1000;

const RETRY_INTERVAL = 60 * 1000;
const WINDOW_READINESS_TIMEOUT = 10 * 1000;

/**
 * How much of what exactly blocks a window reports is logged.
 */
const MAX_DETAIL_LENGTH = 1000;

/**
 * Some platforms blur the focused window right before they report the screen lock.
 */
const FOCUS_LOSS_AT_LOCK_GRACE_PERIOD = 1000;

/**
 * Switches with which the session would not come back as it is after the update relaunch:
 * they are either not carried over, or (`disable-layout-restore`) discard the saved layout.
 */
const SESSION_ARGUMENTS: readonly (keyof NativeParsedArgs)[] = [
	'disable-extensions',
	'disable-extension',
	'disable-layout-restore',
	'enable-proposed-api',
	'inspect-extensions',
	'inspect-brk-extensions',
	'profile',
	'profile-temp',
	'use-inmemory-secretstorage',
];

/**
 * Remembers an unattended restart across the restart, to report it once it completed.
 */
const PENDING_RESTART_STATE_KEY = 'update.unattendedRestart';

/**
 * Remembers an update that an unattended restart did not install, to not restart for it again.
 */
const FAILED_UPDATE_STATE_KEY = 'update.unattendedRestartFailedUpdate';

/**
 * The operating system signals that decide whether the user is away.
 */
export interface IUnattendedRestartHost {
	readonly onDidLockScreen: Event<void>;
	readonly onDidUnlockScreen: Event<void>;
	readonly onDidSuspend: Event<void>;
	readonly onDidResume: Event<void>;
	readonly onDidSwitchToBattery: Event<void>;
	readonly onDidChangeThermalState: Event<ThermalState>;
	readonly onDidBlurWindow: Event<void>;
	isWindowFocused(): boolean;

	/**
	 * On macOS, reports the screen as locked only shortly after the lock event.
	 */
	getIdleState(): SystemIdleState;
	isOnBatteryPower(): boolean;
	getThermalState(): ThermalState;

	/**
	 * Keeps the machine from going to sleep while idle, until disposed. The display still
	 * turns off, and closing the lid of a laptop still puts it to sleep.
	 */
	preventSleep(): IDisposable;
}

function createElectronHost(): IUnattendedRestartHost {
	const { app, BrowserWindow, powerMonitor, powerSaveBlocker } = electron;

	return {
		onDidLockScreen: Event.fromNodeEventEmitter<void>(powerMonitor, 'lock-screen'),
		onDidUnlockScreen: Event.fromNodeEventEmitter<void>(powerMonitor, 'unlock-screen'),
		onDidSuspend: Event.fromNodeEventEmitter<void>(powerMonitor, 'suspend'),
		onDidResume: Event.fromNodeEventEmitter<void>(powerMonitor, 'resume'),
		onDidSwitchToBattery: Event.fromNodeEventEmitter<void>(powerMonitor, 'on-battery'),
		onDidChangeThermalState: Event.map(Event.fromNodeEventEmitter<{ state: ThermalState }>(powerMonitor, 'thermal-state-change'), e => e.state),
		onDidBlurWindow: Event.fromNodeEventEmitter<void>(app, 'browser-window-blur'),
		isWindowFocused: () => !!BrowserWindow.getFocusedWindow(),
		getIdleState: () => powerMonitor.getSystemIdleState(60),
		isOnBatteryPower: () => powerMonitor.isOnBatteryPower(),
		getThermalState: () => powerMonitor.getCurrentThermalState(),
		preventSleep: () => {
			const id = powerSaveBlocker.start('prevent-app-suspension');
			return toDisposable(() => powerSaveBlocker.stop(id));
		},
	};
}

export interface IUnattendedRestartSchedulerOptions {
	readonly getWindowReadiness: (window: ICodeWindow) => Promise<IUnattendedRestartWindowReadiness>;
	readonly host?: IUnattendedRestartHost;
	readonly os?: OperatingSystem;
	readonly argv?: readonly string[];
}

function isUnderThermalPressure(state: ThermalState): boolean {
	return state === 'serious' || state === 'critical';
}

/**
 * Returns whether the arguments contain switches that shape the session but that the relaunch drops.
 */
function hasSessionArguments(args: NativeParsedArgs): boolean {
	return SESSION_ARGUMENTS.some(key => {
		const value = args[key];
		return Array.isArray(value) ? value.length > 0 : !!value;
	});
}

/**
 * Returns whether restarting would drop command line arguments that shape the current session.
 */
export function hasArgumentsLostOnRelaunch(args: NativeParsedArgs, argv: readonly string[], os: OperatingSystem): boolean {
	if (os === OperatingSystem.Macintosh && getRelaunchArguments(args, argv)) {
		return true; // the macOS updater relaunches without any arguments
	}

	return hasSessionArguments(args);
}

/**
 * Returns the reasons why the windows could not be restored exactly as they are. In the
 * background, windows are shown without taking focus and enter fullscreen once they get
 * focus, in the foreground they are restored like after any update restart.
 */
export function getWindowBlockers(windows: readonly ICodeWindow[], auxiliaryWindows: readonly IBaseWindow[], os: OperatingSystem, inBackground: boolean): string[] {
	if (windows.length === 0) {
		return ['window.none']; // the relaunch would open a new window
	}

	const blockers = new Set<string>();
	const displaysWithFullScreenWindow = new Set<number | undefined>();
	for (const window of windows) {
		if (!window.isReady) {
			blockers.add('window.notReady');
		}
		if (window.remoteAuthority) {
			blockers.add('window.remote');
		}
		if (window.isExtensionDevelopmentHost || window.isExtensionTestHost) {
			blockers.add('window.extensionDevelopment');
		}
		if (window.profile?.isTransient) {
			blockers.add('window.temporaryProfile');
		}
		if (window.config && hasSessionArguments(window.config)) {
			blockers.add('window.launchArguments');
		}

		// macOS can only restore one native fullscreen window per display at once
		if (os === OperatingSystem.Macintosh && !inBackground && window.isFullScreen && !window.win?.isSimpleFullScreen()) {
			const { mode, display } = window.serializeWindowState();
			if (mode === WindowMode.Fullscreen && displaysWithFullScreenWindow.has(display)) {
				blockers.add('window.fullScreenSameDisplay');
			}
			displaysWithFullScreenWindow.add(display);
		}
	}

	// Floating windows do not remember being minimized, and restore fullscreen as maximized
	for (const window of auxiliaryWindows) {
		if (window.win?.isMinimized()) {
			blockers.add('window.auxiliaryMinimized');
		}
		if (!inBackground && window.isFullScreen) {
			blockers.add('window.auxiliaryFullScreen');
		}
	}

	return Array.from(blockers);
}

type UnattendedRestartOutcome = 'restarted' | 'restartedWithoutUpdate' | 'eligible' | 'blocked' | 'asleep';

type UnattendedRestartEvent = {
	outcome: UnattendedRestartOutcome;
	blockers: string;
	inBackground: boolean;
	attempts: number;
	lockedMinutes: number;
};

type UnattendedRestartClassification = {
	owner: 'alexdima';
	comment: 'Tracks whether a downloaded update could be applied by restarting while the screen was locked, to learn how often this applies and what prevents it.';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the application restarted (reported once the restart completed, with or without the update installed), would have restarted if the setting was enabled, was blocked by the last check before the screen got unlocked, or could have restarted but the machine went to sleep before the restart was due, for example because the lid got closed.' };
	blockers: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Sorted, comma separated identifiers of all the conditions that blocked the most recent attempt.' };
	inBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether another application was active when the screen got locked, so that the restart must not take focus.' };
	attempts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of checks while the screen was locked, including the one right after it got locked.' };
	lockedMinutes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Minutes since the screen was locked or the machine resumed while locked.' };
};

interface IPendingUnattendedRestart {
	readonly fromCommit: string | undefined;
	readonly toVersion?: string;
	readonly inBackground: boolean;
	readonly attempts: number;
	readonly lockedMinutes: number;
}

function isPendingUnattendedRestart(value: unknown): value is IPendingUnattendedRestart {
	const candidate = value as Partial<IPendingUnattendedRestart> | undefined;
	return !!candidate && typeof candidate === 'object' && typeof candidate.inBackground === 'boolean' && typeof candidate.attempts === 'number' && typeof candidate.lockedMinutes === 'number';
}

interface IFailedUnattendedUpdate {

	/**
	 * The commit that the update was not installed on.
	 */
	readonly commit: string | undefined;
	readonly version: string;
}

function isFailedUnattendedUpdate(value: unknown): value is IFailedUnattendedUpdate {
	const candidate = value as Partial<IFailedUnattendedUpdate> | undefined;
	return !!candidate && typeof candidate === 'object' && typeof candidate.version === 'string';
}

/**
 * Restarts to apply a downloaded update while the user is away, but only when every
 * window reports that it can be restored exactly as it is. The windows are restored
 * as they were, for example minimized, and the restart does not change which
 * application has focus: unless VS Code was the active application when the screen
 * got locked, the windows are restored in the background. The check runs as soon as
 * the screen gets locked: when everything would work, the machine is kept awake until
 * the restart is due. When `update.restartWhenIdle` is disabled, the same checks run,
 * without keeping the machine awake, to measure how often a restart would apply.
 */
export class UnattendedRestartScheduler extends Disposable {

	private readonly evaluation = this._register(new RunOnceScheduler(() => {
		this.evaluate().catch(error => this.logService.error('update#unattendedRestart - evaluation failed', error));
	}, 0));

	private readonly keepAwake = this._register(new MutableDisposable());
	private readonly keepAwakeLimit = this._register(new RunOnceScheduler(() => this.allowSleep('the restart did not happen in time'), KEEP_AWAKE_LIMIT));

	private lockedSince: number | undefined;
	private activeWhenLocked = false;
	private lastWindowBlur: number | undefined;
	private attempts = 0;
	private lastBlockers: readonly string[] | undefined;
	private hasCheckedSinceLock = false;
	private hasBeenDue = false;
	private sleptWhileLocked = false;
	private isDone = false;
	private isEvaluating = false;
	private pendingRestart: IPendingUnattendedRestart | undefined;
	private failedUpdateVersion: string | undefined;

	private readonly host: IUnattendedRestartHost;
	private readonly os: OperatingSystem;
	private readonly argv: readonly string[];

	constructor(
		private readonly options: IUnattendedRestartSchedulerOptions,
		@IUpdateService private readonly updateService: IUpdateService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IStateService private readonly stateService: IStateService,
	) {
		super();

		this.host = options.host ?? createElectronHost();
		this.os = options.os ?? OS;
		this.argv = options.argv ?? process.argv;

		this.failedUpdateVersion = this.readFailedUpdateVersion();
		this.reportCompletedRestart();

		this._register(this.host.onDidBlurWindow(() => this.lastWindowBlur = Date.now()));
		this._register(this.host.onDidLockScreen(() => this.onDidLockScreen()));
		this._register(this.host.onDidUnlockScreen(() => this.onDidUnlockScreen()));
		this._register(this.host.onDidSuspend(() => this.onDidSuspend()));
		this._register(this.host.onDidResume(() => this.onDidResume()));
		this._register(this.host.onDidSwitchToBattery(() => this.allowSleep('the machine runs on battery')));
		this._register(this.host.onDidChangeThermalState(state => {
			if (isUnderThermalPressure(state)) {
				this.allowSleep('the machine is under thermal pressure');
			}
		}));
		this._register(updateService.onStateChange(state => {
			if (state.type !== StateType.Ready) {
				if (state.type !== StateType.Restarting) {
					this.allowSleep('the update is no longer ready');
				}
				return;
			}

			if (this.pendingRestart) {
				this.onDidVetoRestart(); // the update service restores `Ready` when the shutdown is vetoed
			} else {
				this.scheduleEvaluation(0);
			}
		}));

		// Fires only once no window vetoed the shutdown; the state service is flushed afterwards
		this._register(lifecycleMainService.onWillShutdown(() => {
			if (this.pendingRestart && this.hasUpdateState(StateType.Restarting)) {
				this.stateService.setItem(PENDING_RESTART_STATE_KEY, this.pendingRestart);
			}
		}));
	}

	/**
	 * Reports a restart once it completed. Reporting during shutdown is unreliable because
	 * telemetry is sent through the shared process, which exits when the shutdown starts.
	 */
	private reportCompletedRestart(): void {
		const restart = this.stateService.getItem<unknown>(PENDING_RESTART_STATE_KEY);
		if (restart === undefined) {
			return;
		}

		this.stateService.removeItem(PENDING_RESTART_STATE_KEY);
		if (!isPendingUnattendedRestart(restart)) {
			return;
		}

		const updated = restart.fromCommit !== this.productService.commit;
		if (!updated && restart.toVersion) {
			// Restarting for the same update would most likely not install it either
			this.failedUpdateVersion = restart.toVersion;
			this.stateService.setItem(FAILED_UPDATE_STATE_KEY, { commit: this.productService.commit, version: restart.toVersion } satisfies IFailedUnattendedUpdate);
		}

		this.logOutcome({
			outcome: updated ? 'restarted' : 'restartedWithoutUpdate',
			blockers: '',
			inBackground: restart.inBackground,
			attempts: restart.attempts,
			lockedMinutes: restart.lockedMinutes,
		});
	}

	private readFailedUpdateVersion(): string | undefined {
		const failedUpdate = this.stateService.getItem<unknown>(FAILED_UPDATE_STATE_KEY);
		if (failedUpdate === undefined) {
			return undefined;
		}

		if (!isFailedUnattendedUpdate(failedUpdate) || failedUpdate.commit !== this.productService.commit) {
			this.stateService.removeItem(FAILED_UPDATE_STATE_KEY); // another version runs now
			return undefined;
		}

		return failedUpdate.version;
	}

	private onDidVetoRestart(): void {
		this.logService.info('update#unattendedRestart - the restart was vetoed');
		this.cancelRestart();
		this.allowSleep('the restart was vetoed');
		this.isDone = false;
		this.lastBlockers = ['shutdown.vetoed'];
		this.scheduleEvaluation(RETRY_INTERVAL);
	}

	private cancelRestart(): void {
		this.pendingRestart = undefined;
		this.windowsMainService.restoreExactlyOnNextStartup(undefined);
	}

	private onDidLockScreen(): void {
		this.lockedSince = Date.now();
		this.activeWhenLocked = this.host.isWindowFocused() || (this.lastWindowBlur !== undefined && this.lockedSince - this.lastWindowBlur <= FOCUS_LOSS_AT_LOCK_GRACE_PERIOD);
		this.attempts = 0;
		this.lastBlockers = undefined;
		this.hasCheckedSinceLock = false;
		this.hasBeenDue = false;
		this.sleptWhileLocked = false;
		this.isDone = false;

		this.scheduleEvaluation(0); // right away, to keep the machine awake when everything would work
	}

	private onDidUnlockScreen(): void {
		// Locks that end before the restart is due are only reported when the machine slept in the meantime
		if (this.lastBlockers && !this.isDone && (this.hasBeenDue || this.sleptWhileLocked)) {
			if (this.lastBlockers.length > 0) {
				this.reportOutcome('blocked', this.lastBlockers);
			} else if (this.sleptWhileLocked) {
				this.reportOutcome('asleep', []);
			}
		}

		this.lockedSince = undefined;
		this.evaluation.cancel();
		this.allowSleep('the screen got unlocked');
	}

	private onDidSuspend(): void {
		this.evaluation.cancel();
		if (this.lockedSince !== undefined) {
			this.sleptWhileLocked = true;
		}
		this.allowSleep('the machine went to sleep anyway, for example because the lid got closed');
	}

	private onDidResume(): void {
		if (this.lockedSince !== undefined) {
			this.lockedSince = Date.now(); // the user might be about to return
			this.hasCheckedSinceLock = false;
			this.scheduleEvaluation(0);
		}
	}

	private keepMachineAwake(): void {
		if (!this.keepAwake.value) {
			this.keepAwake.value = this.host.preventSleep();
			this.keepAwakeLimit.schedule();
			this.logService.info('update#unattendedRestart - keeping the machine awake until the restart is due');
		}
	}

	private allowSleep(reason: string): void {
		this.keepAwakeLimit.cancel();
		if (this.keepAwake.value) {
			this.keepAwake.clear();
			this.logService.info(`update#unattendedRestart - letting the machine sleep again: ${reason}`);
		}
	}

	private scheduleEvaluation(delay: number): void {
		if (this.lockedSince !== undefined && !this.isDone && this.isSupported()) {
			this.evaluation.schedule(delay);
		}
	}

	private isSupported(): boolean {
		return isUnattendedRestartSupported(this.os, this.productService, this.configurationService);
	}

	private async evaluate(): Promise<void> {
		const lockedSince = this.lockedSince;
		if (lockedSince === undefined || this.isDone || this.isEvaluating || !this.hasUpdateState(StateType.Ready)) {
			return;
		}

		if (!this.isEnabled() && this.telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
			return; // nothing to restart and nothing to learn (experiments that enable it need telemetry too)
		}

		const isDue = Date.now() >= lockedSince + UNATTENDED_RESTART_LOCKED_DURATION;
		if (!isDue && this.hasCheckedSinceLock) {
			this.evaluation.schedule(lockedSince + UNATTENDED_RESTART_LOCKED_DURATION - Date.now());
			return;
		}

		this.isEvaluating = true;
		try {
			this.attempts++;
			this.hasCheckedSinceLock = true;
			this.hasBeenDue ||= isDue;
			const inBackground = !this.activeWhenLocked;
			const { blockers, details, enabled } = await this.getBlockers(inBackground, isDue);
			if (this.lockedSince !== lockedSince || !this.hasUpdateState(StateType.Ready)) {
				return; // unlocked or update changed while checking
			}

			if (blockers.length > 0) {
				this.allowSleep('the restart is blocked');
				if (!equals(blockers, this.lastBlockers)) {
					this.logService.info(`update#unattendedRestart - not restarting: ${describeUnattendedRestartBlockers(blockers, details)}`); // retried every minute, so only log changes
				}
				this.lastBlockers = blockers;
				this.evaluation.schedule(isDue ? RETRY_INTERVAL : lockedSince + UNATTENDED_RESTART_LOCKED_DURATION - Date.now());
				return;
			}

			this.lastBlockers = [];
			if (!isDue) {
				// Everything would work, so do not let the machine go to sleep before the restart is due
				if (enabled) {
					this.keepMachineAwake();
				}
				this.evaluation.schedule(lockedSince + UNATTENDED_RESTART_LOCKED_DURATION - Date.now());
				return;
			}

			this.isDone = true;
			if (!enabled) {
				this.reportOutcome('eligible', []);
				return;
			}

			this.logService.info(`update#unattendedRestart - restarting ${inBackground ? 'in the background' : 'in the foreground'} to apply the update while the screen is locked`);
			const toVersion = this.updateService.state.type === StateType.Ready ? this.updateService.state.update.version : undefined;
			this.pendingRestart = { fromCommit: this.productService.commit, toVersion, inBackground, attempts: this.attempts, lockedMinutes: this.getLockedMinutes() };
			this.windowsMainService.restoreExactlyOnNextStartup({ inBackground });
			await this.updateService.quitAndInstall({ unattended: true, relaunchInBackground: inBackground });

			// The shutdown can still be vetoed, which is handled when the update service restores `Ready`
			if (!this.hasUpdateState(StateType.Restarting)) {
				this.cancelRestart();
				this.isDone = false; // a newer update postponed the restart
			}
		} finally {
			this.isEvaluating = false;
		}
	}

	private hasUpdateState(type: StateType): boolean {
		return this.updateService.state.type === type;
	}

	/**
	 * Whether `update.restartWhenIdle` is enabled in user settings or by policy.
	 * Experiments only change the default in windows (see {@link getBlockers}).
	 */
	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(RESTART_WHEN_IDLE_SETTING) === true;
	}

	private async getBlockers(inBackground: boolean, isDue: boolean): Promise<{ readonly blockers: string[]; readonly details: ReadonlyMap<string, string>; readonly enabled: boolean }> {
		const windows = this.windowsMainService.getWindows();
		const blockers = new Set(getWindowBlockers(windows, this.auxiliaryWindowsMainService.getWindows(), this.os, inBackground));
		if (this.dialogMainService.hasOpenDialogs()) {
			blockers.add('app.dialogOpen');
		}
		const state = this.updateService.state;
		if (state.type === StateType.Ready && state.update.version === this.failedUpdateVersion) {
			blockers.add('update.installFailed');
		}
		// The check right after the lock event relies on that event: the idle state reports the lock only shortly after it
		if (isDue && this.host.getIdleState() !== 'locked') {
			blockers.add('system.notLocked');
		}
		if (this.host.isOnBatteryPower()) {
			blockers.add('system.onBatteryPower');
		}
		if (isUnderThermalPressure(this.host.getThermalState())) {
			blockers.add('system.thermalPressure');
		}
		if (hasArgumentsLostOnRelaunch(this.environmentMainService.args, this.argv, this.os)) {
			blockers.add('app.launchArguments');
		}

		// Ask the windows even when something else blocks already, so that the outcome tells everything
		// that prevented the restart. Windows that are not ready block already and cannot answer yet.
		const readiness = await Promise.all(windows.filter(window => window.isReady).map(window => this.getWindowReadiness(window)));
		const details = new Map<string, string>();
		for (const windowReadiness of readiness) {
			for (const blocker of windowReadiness.blockers) {
				blockers.add(blocker);
			}

			// What exactly blocks, only for the log
			for (const [blocker, detail] of Object.entries(windowReadiness.details ?? {})) {
				if (typeof detail === 'string' && windowReadiness.blockers.includes(blocker)) {
					const known = details.get(blocker);
					details.set(blocker, known ? `${known}; ${detail.slice(0, MAX_DETAIL_LENGTH)}` : detail.slice(0, MAX_DETAIL_LENGTH));
				}
			}
		}

		// Windows resolve experiments, which can enable the setting by default
		const enabled = readiness.every(windowReadiness => windowReadiness.enabled);

		return { blockers: Array.from(blockers).sort(), details, enabled };
	}

	private async getWindowReadiness(window: ICodeWindow): Promise<IUnattendedRestartWindowReadiness> {
		try {
			const readiness = await raceTimeout(this.options.getWindowReadiness(window), WINDOW_READINESS_TIMEOUT);
			if (!readiness) {
				return { blockers: ['window.noResponse'], enabled: false };
			}

			if (!Array.isArray(readiness.blockers) || !readiness.blockers.every(blocker => typeof blocker === 'string' && /^[\w.]+$/.test(blocker)) || typeof readiness.enabled !== 'boolean') {
				return { blockers: ['window.invalidResponse'], enabled: false };
			}

			return readiness;
		} catch (error) {
			this.logService.error('update#unattendedRestart - failed to ask window whether it can restart', error);

			return { blockers: ['window.noResponse'], enabled: false };
		}
	}

	private getLockedMinutes(): number {
		return this.lockedSince === undefined ? 0 : Math.round((Date.now() - this.lockedSince) / 60_000);
	}

	private reportOutcome(outcome: UnattendedRestartOutcome, blockers: readonly string[]): void {
		this.logOutcome({
			outcome,
			blockers: blockers.join(','),
			inBackground: !this.activeWhenLocked,
			attempts: this.attempts,
			lockedMinutes: this.getLockedMinutes(),
		});
	}

	private logOutcome(event: UnattendedRestartEvent): void {
		this.telemetryService.publicLog2<UnattendedRestartEvent, UnattendedRestartClassification>('update:unattendedRestart', event);
	}
}
