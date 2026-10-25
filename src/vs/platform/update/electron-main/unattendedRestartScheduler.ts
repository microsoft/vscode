/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { raceTimeout, RunOnceScheduler } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IUnattendedRestartReadiness } from '../../lifecycle/common/unattendedRestart.js';
import { ILogService } from '../../log/common/log.js';
import { SystemIdleState, ThermalState } from '../../native/common/native.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { IBaseWindow, ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IUpdateService, StateType } from '../common/update.js';
import { isCommit } from './relaunchInBackground.js';
import { getRelaunchArguments } from './updateRelaunchArguments.js';

/**
 * How long the screen must stay locked, with the machine awake, before restarting.
 */
export const UNATTENDED_RESTART_LOCKED_DURATION = 15 * 60 * 1000;

const RETRY_INTERVAL = 5 * 60 * 1000;
const WINDOW_READINESS_TIMEOUT = 10 * 1000;

/**
 * Some platforms blur the focused window right before they report the screen lock.
 */
const FOCUS_LOSS_AT_LOCK_GRACE_PERIOD = 1000;

/**
 * Switches that change how the session behaves but that are not carried over
 * when the update relaunches the application.
 */
const SESSION_ARGUMENTS: readonly (keyof NativeParsedArgs)[] = [
	'disable-extensions',
	'disable-extension',
	'enable-proposed-api',
	'inspect-extensions',
	'inspect-brk-extensions',
	'profile',
	'profile-temp',
	'use-inmemory-secretstorage',
];

/**
 * The operating system signals that decide whether the user is away.
 */
export interface IUnattendedRestartHost {
	readonly onDidLockScreen: Event<void>;
	readonly onDidUnlockScreen: Event<void>;
	readonly onDidSuspend: Event<void>;
	readonly onDidResume: Event<void>;
	readonly onDidBlurWindow: Event<void>;
	isWindowFocused(): boolean;
	getIdleState(): SystemIdleState;
	isOnBatteryPower(): boolean;
	getThermalState(): ThermalState;
}

function createElectronHost(): IUnattendedRestartHost {
	const { app, BrowserWindow, powerMonitor } = electron;

	return {
		onDidLockScreen: Event.fromNodeEventEmitter<void>(powerMonitor, 'lock-screen'),
		onDidUnlockScreen: Event.fromNodeEventEmitter<void>(powerMonitor, 'unlock-screen'),
		onDidSuspend: Event.fromNodeEventEmitter<void>(powerMonitor, 'suspend'),
		onDidResume: Event.fromNodeEventEmitter<void>(powerMonitor, 'resume'),
		onDidBlurWindow: Event.fromNodeEventEmitter<void>(app, 'browser-window-blur'),
		isWindowFocused: () => !!BrowserWindow.getFocusedWindow(),
		getIdleState: () => powerMonitor.getSystemIdleState(60),
		isOnBatteryPower: () => powerMonitor.isOnBatteryPower(),
		getThermalState: () => powerMonitor.getCurrentThermalState(),
	};
}

export interface IUnattendedRestartSchedulerOptions {
	readonly getWindowReadiness: (window: ICodeWindow) => Promise<IUnattendedRestartReadiness>;
	readonly host?: IUnattendedRestartHost;
	readonly os?: OperatingSystem;
	readonly argv?: readonly string[];
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
 * Returns the reasons why the windows could not be restored exactly as they are.
 */
export function getWindowBlockers(windows: readonly ICodeWindow[], auxiliaryWindows: readonly IBaseWindow[], os: OperatingSystem): string[] {
	if (windows.length === 0) {
		return ['window.none']; // the relaunch would open a new window
	}

	const blockers = new Set<string>();
	for (const window of windows) {
		if (!window.isReady) {
			blockers.add('window.notReady');
		}
		if (window.config?.isSessionsWindow) {
			blockers.add('window.agents');
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
	}

	for (const window of [...windows, ...auxiliaryWindows]) {
		if (window.win?.isMinimized()) {
			blockers.add('window.minimized');
		} else if (!window.win?.isVisible()) {
			blockers.add('window.hidden');
		}
		if (os === OperatingSystem.Macintosh && window.isFullScreen) {
			blockers.add('window.fullScreen'); // restoring creates a new Space
		}
	}

	return Array.from(blockers);
}

type UnattendedRestartOutcome = 'restarting' | 'eligible' | 'blocked';

/**
 * Restarts to apply a downloaded update while the user is away, but only when every
 * window reports that it can be restored exactly as it is. The restart does not change
 * which application has focus: unless VS Code was the active application when the
 * screen got locked, it relaunches in the background. When `update.restartWhenIdle`
 * is disabled, the same checks run to measure how often a restart would apply.
 */
export class UnattendedRestartScheduler extends Disposable {

	private readonly evaluation = this._register(new RunOnceScheduler(() => {
		this.evaluate().catch(error => this.logService.error('update#unattendedRestart - evaluation failed', error));
	}, 0));

	private lockedSince: number | undefined;
	private activeWhenLocked = false;
	private lastWindowBlur: number | undefined;
	private attempts = 0;
	private lastBlockers: readonly string[] | undefined;
	private isDone = false;
	private isEvaluating = false;

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
	) {
		super();

		this.host = options.host ?? createElectronHost();
		this.os = options.os ?? OS;
		this.argv = options.argv ?? process.argv;

		this._register(this.host.onDidBlurWindow(() => this.lastWindowBlur = Date.now()));
		this._register(this.host.onDidLockScreen(() => this.onDidLockScreen()));
		this._register(this.host.onDidUnlockScreen(() => this.onDidUnlockScreen()));
		this._register(this.host.onDidSuspend(() => this.evaluation.cancel()));
		this._register(this.host.onDidResume(() => this.onDidResume()));
		this._register(updateService.onStateChange(state => {
			if (state.type === StateType.Ready) {
				this.scheduleEvaluation(0);
			}
		}));
	}

	private onDidLockScreen(): void {
		this.lockedSince = Date.now();
		this.activeWhenLocked = this.host.isWindowFocused() || (this.lastWindowBlur !== undefined && this.lockedSince - this.lastWindowBlur <= FOCUS_LOSS_AT_LOCK_GRACE_PERIOD);
		this.attempts = 0;
		this.lastBlockers = undefined;
		this.isDone = false;

		this.scheduleEvaluation(UNATTENDED_RESTART_LOCKED_DURATION);
	}

	private onDidUnlockScreen(): void {
		if (this.lastBlockers && !this.isDone) {
			this.reportOutcome('blocked', this.lastBlockers);
		}

		this.lockedSince = undefined;
		this.evaluation.cancel();
	}

	private onDidResume(): void {
		if (this.lockedSince !== undefined) {
			this.lockedSince = Date.now(); // the user might be about to return
			this.scheduleEvaluation(UNATTENDED_RESTART_LOCKED_DURATION);
		}
	}

	private scheduleEvaluation(delay: number): void {
		if (this.lockedSince !== undefined && !this.isDone && this.isSupported()) {
			this.evaluation.schedule(delay);
		}
	}

	private isSupported(): boolean {
		switch (this.os) {
			case OperatingSystem.Macintosh:
				return true;
			case OperatingSystem.Windows:
				// Only user setup applies updates in the background without elevation or installer UI
				return this.productService.target === 'user' && this.configurationService.getValue<boolean>('update.enableWindowsBackgroundUpdates') === true;
			default:
				return false;
		}
	}

	private async evaluate(): Promise<void> {
		const lockedSince = this.lockedSince;
		if (lockedSince === undefined || this.isDone || this.isEvaluating || !this.hasUpdateState(StateType.Ready)) {
			return;
		}

		if (!this.isEnabled() && this.telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
			return; // nothing to restart and nothing to learn
		}

		const remaining = lockedSince + UNATTENDED_RESTART_LOCKED_DURATION - Date.now();
		if (remaining > 0) {
			this.evaluation.schedule(remaining);
			return;
		}

		this.isEvaluating = true;
		try {
			this.attempts++;
			const blockers = await this.getBlockers();
			if (this.lockedSince !== lockedSince || !this.hasUpdateState(StateType.Ready)) {
				return; // unlocked or update changed while checking
			}

			if (blockers.length > 0) {
				this.logService.info(`update#unattendedRestart - not restarting: ${blockers.join(', ')}`);
				this.lastBlockers = blockers;
				this.evaluation.schedule(RETRY_INTERVAL);
				return;
			}

			this.isDone = true;
			if (!this.isEnabled()) {
				this.reportOutcome('eligible', []);
				return;
			}

			this.logService.info(`update#unattendedRestart - restarting ${this.activeWhenLocked ? 'in the foreground' : 'in the background'} to apply the update while the screen is locked`);
			await this.updateService.quitAndInstall({ relaunchInBackground: !this.activeWhenLocked });

			if (this.hasUpdateState(StateType.Restarting)) {
				this.reportOutcome('restarting', []);
			} else {
				this.isDone = false; // a newer update postponed the restart
			}
		} finally {
			this.isEvaluating = false;
		}
	}

	private hasUpdateState(type: StateType): boolean {
		return this.updateService.state.type === type;
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>('update.restartWhenIdle') === true;
	}

	private async getBlockers(): Promise<string[]> {
		const windows = this.windowsMainService.getWindows();
		const auxiliaryWindows = this.auxiliaryWindowsMainService.getWindows();
		const blockers = new Set(getWindowBlockers(windows, auxiliaryWindows, this.os));
		if (!this.activeWhenLocked) {
			for (const blocker of this.getBackgroundRelaunchBlockers(auxiliaryWindows)) {
				blockers.add(blocker);
			}
		}
		if (this.dialogMainService.hasOpenDialogs()) {
			blockers.add('app.dialogOpen');
		}
		if (this.host.getIdleState() !== 'locked') {
			blockers.add('system.notLocked');
		}
		if (this.host.isOnBatteryPower()) {
			blockers.add('system.onBatteryPower');
		}
		const thermalState = this.host.getThermalState();
		if (thermalState === 'serious' || thermalState === 'critical') {
			blockers.add('system.thermalPressure');
		}
		if (hasArgumentsLostOnRelaunch(this.environmentMainService.args, this.argv, this.os)) {
			blockers.add('app.launchArguments');
		}

		if (blockers.size === 0) {
			const windowBlockers = await Promise.all(windows.map(window => this.getWindowReadinessBlockers(window)));
			for (const blocker of windowBlockers.flat()) {
				blockers.add(blocker);
			}
		}

		return Array.from(blockers).sort();
	}

	/**
	 * Returns why relaunching without taking focus from the active application is not possible.
	 */
	private getBackgroundRelaunchBlockers(auxiliaryWindows: readonly IBaseWindow[]): string[] {
		if (this.os !== OperatingSystem.Macintosh) {
			return ['app.backgroundRelaunchUnsupported'];
		}

		const blockers: string[] = [];
		if (auxiliaryWindows.length > 0) {
			blockers.push('window.auxiliary'); // floating windows are restored by showing them, which activates the application
		}
		const state = this.updateService.state;
		if (state.type === StateType.Ready && !isCommit(state.update.version)) {
			blockers.push('update.unknownVersion'); // the relaunch waits for this commit to be installed
		}

		return blockers;
	}

	private async getWindowReadinessBlockers(window: ICodeWindow): Promise<readonly string[]> {
		try {
			const readiness = await raceTimeout(this.options.getWindowReadiness(window), WINDOW_READINESS_TIMEOUT);
			if (!readiness) {
				return ['window.noResponse'];
			}

			if (!Array.isArray(readiness.blockers) || !readiness.blockers.every(blocker => typeof blocker === 'string' && /^[\w.]+$/.test(blocker))) {
				return ['window.invalidResponse'];
			}

			return readiness.blockers;
		} catch (error) {
			this.logService.error('update#unattendedRestart - failed to ask window whether it can restart', error);

			return ['window.noResponse'];
		}
	}

	private reportOutcome(outcome: UnattendedRestartOutcome, blockers: readonly string[]): void {
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
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the application restarted, would have restarted if the setting was enabled, or was blocked for the whole time the screen was locked.' };
			blockers: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Sorted, comma separated identifiers of the conditions that blocked the most recent attempt.' };
			inBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether another application was active when the screen got locked, so that the restart must not take focus.' };
			attempts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of restart attempts while the screen was locked.' };
			lockedMinutes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Minutes since the screen was locked or the machine resumed while locked.' };
		};

		this.telemetryService.publicLog2<UnattendedRestartEvent, UnattendedRestartClassification>('update:unattendedRestart', {
			outcome,
			blockers: blockers.join(','),
			inBackground: !this.activeWhenLocked,
			attempts: this.attempts,
			lockedMinutes: this.lockedSince === undefined ? 0 : Math.round((Date.now() - this.lockedSince) / 60_000),
		});
	}
}
