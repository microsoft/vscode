/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostPowerShape, MainContext, MainThreadPowerShape, PowerSaveBlockerType, PowerSystemIdleState, PowerThermalState } from './extHost.protocol.js';

export class ExtHostPower extends Disposable implements ExtHostPowerShape {

	declare _serviceBrand: undefined;

	private readonly _proxy: MainThreadPowerShape;

	// Events
	private readonly _onDidSuspend = this._register(new Emitter<void>());
	readonly onDidSuspend: Event<void> = this._onDidSuspend.event;

	private readonly _onDidResume = this._register(new Emitter<void>());
	readonly onDidResume: Event<void> = this._onDidResume.event;

	private readonly _onDidChangeOnBatteryPower = this._register(new Emitter<boolean>());
	readonly onDidChangeOnBatteryPower: Event<boolean> = this._onDidChangeOnBatteryPower.event;

	private readonly _onDidChangeThermalState = this._register(new Emitter<PowerThermalState>());
	readonly onDidChangeThermalState: Event<PowerThermalState> = this._onDidChangeThermalState.event;

	private readonly _onDidChangeSpeedLimit = this._register(new Emitter<number>());
	readonly onDidChangeSpeedLimit: Event<number> = this._onDidChangeSpeedLimit.event;

	private readonly _onWillShutdown = this._register(new Emitter<void>());
	readonly onWillShutdown: Event<void> = this._onWillShutdown.event;

	private readonly _onDidLockScreen = this._register(new Emitter<void>());
	readonly onDidLockScreen: Event<void> = this._onDidLockScreen.event;

	private readonly _onDidUnlockScreen = this._register(new Emitter<void>());
	readonly onDidUnlockScreen: Event<void> = this._onDidUnlockScreen.event;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadPower);
	}

	// === Proxy callbacks (called by MainThread) ===

	$onDidSuspend(): void {
		this._onDidSuspend.fire();
	}

	$onDidResume(): void {
		this._onDidResume.fire();
	}

	$onDidChangeOnBatteryPower(isOnBattery: boolean): void {
		this._onDidChangeOnBatteryPower.fire(isOnBattery);
	}

	$onDidChangeThermalState(state: PowerThermalState): void {
		this._onDidChangeThermalState.fire(state);
	}

	$onDidChangeSpeedLimit(limit: number): void {
		this._onDidChangeSpeedLimit.fire(limit);
	}

	$onWillShutdown(): void {
		this._onWillShutdown.fire();
	}

	$onDidLockScreen(): void {
		this._onDidLockScreen.fire();
	}

	$onDidUnlockScreen(): void {
		this._onDidUnlockScreen.fire();
	}

	// === API for extensions ===

	getSystemIdleState(idleThresholdSeconds: number): Promise<PowerSystemIdleState> {
		return this._proxy.$getSystemIdleState(idleThresholdSeconds);
	}

	getSystemIdleTime(): Promise<number> {
		return this._proxy.$getSystemIdleTime();
	}

	getCurrentThermalState(): Promise<PowerThermalState> {
		return this._proxy.$getCurrentThermalState();
	}

	isOnBatteryPower(): Promise<boolean> {
		return this._proxy.$isOnBatteryPower();
	}

	async startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<{ id: number; isStarted: boolean; dispose: () => void }> {
		const id = await this._proxy.$startPowerSaveBlocker(type);
		const proxy = this._proxy;
		const isSupported = id >= 0;
		let disposed = false;

		return {
			id,
			get isStarted(): boolean {
				return isSupported && !disposed;
			},
			dispose: () => {
				if (isSupported && !disposed) {
					disposed = true;
					proxy.$stopPowerSaveBlocker(id);
				}
			}
		};
	}
}

export const IExtHostPower = createDecorator<IExtHostPower>('IExtHostPower');
export interface IExtHostPower extends ExtHostPower, ExtHostPowerShape { }
