/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Event } from '../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { PowerSaveBlockerType } from '../common/native.js';

const { powerMonitor, powerSaveBlocker } = electron;

export const onDidChangeOnBatteryPower = Event.any(
	Event.map(Event.fromNodeEventEmitter<void>(powerMonitor, 'on-ac'), () => false),
	Event.map(Event.fromNodeEventEmitter<void>(powerMonitor, 'on-battery'), () => true)
);

export function isOnBatteryPower(): boolean {
	return powerMonitor.isOnBatteryPower();
}

export function startPowerSaveBlocker(type: PowerSaveBlockerType): number {
	return powerSaveBlocker.start(type);
}

export function stopPowerSaveBlocker(id: number): boolean {
	return powerSaveBlocker.stop(id);
}

export function isPowerSaveBlockerStarted(id: number): boolean {
	return powerSaveBlocker.isStarted(id);
}

export function createPowerSaveBlocker(type: PowerSaveBlockerType): IDisposable {
	const id = startPowerSaveBlocker(type);
	return toDisposable(() => stopPowerSaveBlocker(id));
}
