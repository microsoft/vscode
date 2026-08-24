/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

/**
 * Logs the initial power state and power state change events to the output channel.
 * Monitors vscode.env.power for battery status, thermal state, suspend/resume, and power-saving modes.
 */
export class PowerStateLogger extends Disposable implements IExtensionContribution {
	readonly id = 'powerStateLogger';

	private _manualBlocker: vscode.env.power.PowerSaveBlocker | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Register toggle power save blocker command
		this._register(vscode.commands.registerCommand('github.copilot.debug.togglePowerSaveBlocker', async () => {
			const isActive = await this._toggleManualPowerSaveBlocker();
			vscode.window.showInformationMessage(isActive ? 'Power save blocker is now active' : 'Power save blocker is now inactive');
		}));

		// Log initial power state
		this.logInitialPowerState();

		// Listen for system suspend/resume events
		this._register(vscode.env.power.onDidSuspend(() => {
			this.logService.debug('[Power] System is suspending (going to sleep)');
		}));

		this._register(vscode.env.power.onDidResume(() => {
			this.logService.debug('[Power] System is resuming from sleep');
		}));

		// Listen for battery power state changes
		this._register(vscode.env.power.onDidChangeOnBatteryPower(onBattery => {
			this.logService.debug(`[Power] Battery power state changed: ${onBattery ? 'on battery' : 'on AC power'}`);
		}));

		// Listen for thermal state changes (macOS only)
		this._register(vscode.env.power.onDidChangeThermalState(thermalState => {
			this.logService.debug(`[Power] Thermal state changed: ${thermalState}`);
		}));

		// Listen for CPU speed limit changes
		this._register(vscode.env.power.onDidChangeSpeedLimit(speedLimit => {
			this.logService.debug(`[Power] CPU speed limit changed: ${speedLimit}% ${speedLimit < 100 ? '(throttled)' : ''}`);
		}));

		// Listen for shutdown events
		this._register(vscode.env.power.onWillShutdown(() => {
			this.logService.debug('[Power] System is about to shut down or reboot');
		}));

		// Listen for screen lock/unlock events
		this._register(vscode.env.power.onDidLockScreen(() => {
			this.logService.debug('[Power] Screen is being locked');
		}));

		this._register(vscode.env.power.onDidUnlockScreen(() => {
			this.logService.debug('[Power] Screen has been unlocked');
		}));
	}

	private async logInitialPowerState(): Promise<void> {
		try {
			const [onBattery, thermalState, idleTime] = await Promise.all([
				vscode.env.power.isOnBatteryPower(),
				vscode.env.power.getCurrentThermalState(),
				vscode.env.power.getSystemIdleTime()
			]);

			this.logService.debug(`[Power] Initial power state: ${onBattery ? 'on battery' : 'on AC power'}, thermal state: ${thermalState}, system idle time: ${idleTime}s`);
		} catch (error) {
			this.logService.debug(`[Power] Failed to retrieve initial power state: ${error}`);
		}
	}

	private async _toggleManualPowerSaveBlocker(): Promise<boolean> {
		if (this._manualBlocker) {
			this.logService.debug(`[Power] Stopping manual power save blocker, id: ${this._manualBlocker.id}`);
			this._manualBlocker.dispose();
			this._manualBlocker = undefined;
			return false;
		}

		try {
			// Check if the API is available (proposed API, desktop only)
			if (typeof vscode.env.power?.startPowerSaveBlocker !== 'function') {
				this.logService.debug('[Power] Power save blocker API not available');
				return false;
			}

			this._manualBlocker = await vscode.env.power.startPowerSaveBlocker('prevent-app-suspension');
			this.logService.debug(`[Power] Started manual power save blocker, id: ${this._manualBlocker.id}`);
			return true;
		} catch (err) {
			this.logService.warn(`[Power] Failed to start manual power save blocker: ${err}`);
			return false;
		}
	}

	override dispose(): void {
		if (this._manualBlocker) {
			this._manualBlocker.dispose();
			this._manualBlocker = undefined;
		}
		super.dispose();
	}
}
