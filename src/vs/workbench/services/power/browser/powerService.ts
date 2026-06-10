/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IPowerService, PowerSaveBlockerType, SystemIdleState, ThermalState } from '../common/powerService.js';

/**
 * Browser stub implementation of IPowerService.
 * Power APIs are not available in web environments.
 */
export class BrowserPowerService extends Disposable implements IPowerService {

	declare readonly _serviceBrand: undefined;

	// Events never fire in browser
	readonly onDidSuspend = Event.None;
	readonly onDidResume = Event.None;
	readonly onDidChangeOnBatteryPower = Event.None;
	readonly onDidChangeThermalState = Event.None;
	readonly onDidChangeSpeedLimit = Event.None;
	readonly onWillShutdown = Event.None;
	readonly onDidLockScreen = Event.None;
	readonly onDidUnlockScreen = Event.None;

	async getSystemIdleState(_idleThreshold: number): Promise<SystemIdleState> {
		return 'unknown';
	}

	async getSystemIdleTime(): Promise<number> {
		return 0;
	}

	async getCurrentThermalState(): Promise<ThermalState> {
		return 'unknown';
	}

	async isOnBatteryPower(): Promise<boolean> {
		return false;
	}

	async startPowerSaveBlocker(_type: PowerSaveBlockerType): Promise<number> {
		// Return a fake ID (no-op in browser)
		return -1;
	}

	async stopPowerSaveBlocker(_id: number): Promise<boolean> {
		return false;
	}

	async isPowerSaveBlockerStarted(_id: number): Promise<boolean> {
		return false;
	}
}

registerSingleton(IPowerService, BrowserPowerService, InstantiationType.Delayed);
