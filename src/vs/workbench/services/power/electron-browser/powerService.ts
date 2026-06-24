/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IPowerService, PowerSaveBlockerType, SystemIdleState, ThermalState } from '../common/powerService.js';
import { Event } from '../../../../base/common/event.js';

/**
 * Desktop implementation of IPowerService using Electron's powerMonitor.
 */
export class NativePowerService extends Disposable implements IPowerService {

	declare readonly _serviceBrand: undefined;

	readonly onDidSuspend: Event<void>;
	readonly onDidResume: Event<void>;
	readonly onDidChangeOnBatteryPower: Event<boolean>;
	readonly onDidChangeThermalState: Event<ThermalState>;
	readonly onDidChangeSpeedLimit: Event<number>;
	readonly onWillShutdown: Event<void>;
	readonly onDidLockScreen: Event<void>;
	readonly onDidUnlockScreen: Event<void>;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super();

		// Forward events from native host service
		this.onDidSuspend = nativeHostService.onDidSuspendOS;
		this.onDidResume = Event.map(nativeHostService.onDidResumeOS, () => undefined);
		this.onDidChangeOnBatteryPower = nativeHostService.onDidChangeOnBatteryPower;
		this.onDidChangeThermalState = nativeHostService.onDidChangeThermalState;
		this.onDidChangeSpeedLimit = nativeHostService.onDidChangeSpeedLimit;
		this.onWillShutdown = nativeHostService.onWillShutdownOS;
		this.onDidLockScreen = nativeHostService.onDidLockScreen;
		this.onDidUnlockScreen = nativeHostService.onDidUnlockScreen;
	}

	async getSystemIdleState(idleThreshold: number): Promise<SystemIdleState> {
		return this.nativeHostService.getSystemIdleState(idleThreshold);
	}

	async getSystemIdleTime(): Promise<number> {
		return this.nativeHostService.getSystemIdleTime();
	}

	async getCurrentThermalState(): Promise<ThermalState> {
		return this.nativeHostService.getCurrentThermalState();
	}

	async isOnBatteryPower(): Promise<boolean> {
		return this.nativeHostService.isOnBatteryPower();
	}

	async startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number> {
		return this.nativeHostService.startPowerSaveBlocker(type);
	}

	async stopPowerSaveBlocker(id: number): Promise<boolean> {
		return this.nativeHostService.stopPowerSaveBlocker(id);
	}

	async isPowerSaveBlockerStarted(id: number): Promise<boolean> {
		return this.nativeHostService.isPowerSaveBlockerStarted(id);
	}
}

registerSingleton(IPowerService, NativePowerService, InstantiationType.Delayed);
