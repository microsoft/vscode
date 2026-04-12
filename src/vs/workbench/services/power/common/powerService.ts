/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Represents the system's idle state.
 */
export type SystemIdleState = 'active' | 'idle' | 'locked' | 'unknown';

/**
 * Represents the system's thermal state.
 */
export type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical';

/**
 * The type of power save blocker.
 */
export type PowerSaveBlockerType = 'prevent-app-suspension' | 'prevent-display-sleep';

export const IPowerService = createDecorator<IPowerService>('powerService');

/**
 * A service for monitoring power state and preventing system sleep.
 * Only fully functional in desktop environments. Web/remote returns stub values.
 */
export interface IPowerService {

	readonly _serviceBrand: undefined;

	// Events
	readonly onDidSuspend: Event<void>;
	readonly onDidResume: Event<void>;
	readonly onDidChangeOnBatteryPower: Event<boolean>;
	readonly onDidChangeThermalState: Event<ThermalState>;
	readonly onDidChangeSpeedLimit: Event<number>;
	readonly onWillShutdown: Event<void>;
	readonly onDidLockScreen: Event<void>;
	readonly onDidUnlockScreen: Event<void>;

	// Methods
	getSystemIdleState(idleThreshold: number): Promise<SystemIdleState>;
	getSystemIdleTime(): Promise<number>;
	getCurrentThermalState(): Promise<ThermalState>;
	isOnBatteryPower(): Promise<boolean>;
	startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number>;
	stopPowerSaveBlocker(id: number): Promise<boolean>;
	isPowerSaveBlockerStarted(id: number): Promise<boolean>;
}
