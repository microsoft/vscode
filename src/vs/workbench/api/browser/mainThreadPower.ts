/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostPowerShape, MainContext, MainThreadPowerShape, PowerSaveBlockerType, PowerSystemIdleState, PowerThermalState } from '../common/extHost.protocol.js';
import { IPowerService } from '../../services/power/common/powerService.js';

@extHostNamedCustomer(MainContext.MainThreadPower)
export class MainThreadPower extends Disposable implements MainThreadPowerShape {

	private readonly proxy: ExtHostPowerShape;

	constructor(
		extHostContext: IExtHostContext,
		@IPowerService private readonly powerService: IPowerService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostPower);

		// Forward power events to extension host
		this._register(this.powerService.onDidSuspend(this.proxy.$onDidSuspend, this.proxy));
		this._register(this.powerService.onDidResume(this.proxy.$onDidResume, this.proxy));
		this._register(this.powerService.onDidChangeOnBatteryPower(this.proxy.$onDidChangeOnBatteryPower, this.proxy));
		this._register(this.powerService.onDidChangeThermalState((state: PowerThermalState) => this.proxy.$onDidChangeThermalState(state), this));
		this._register(this.powerService.onDidChangeSpeedLimit(this.proxy.$onDidChangeSpeedLimit, this.proxy));
		this._register(this.powerService.onWillShutdown(this.proxy.$onWillShutdown, this.proxy));
		this._register(this.powerService.onDidLockScreen(this.proxy.$onDidLockScreen, this.proxy));
		this._register(this.powerService.onDidUnlockScreen(this.proxy.$onDidUnlockScreen, this.proxy));
	}

	async $getSystemIdleState(idleThreshold: number): Promise<PowerSystemIdleState> {
		return this.powerService.getSystemIdleState(idleThreshold);
	}

	async $getSystemIdleTime(): Promise<number> {
		return this.powerService.getSystemIdleTime();
	}

	async $getCurrentThermalState(): Promise<PowerThermalState> {
		return this.powerService.getCurrentThermalState();
	}

	async $isOnBatteryPower(): Promise<boolean> {
		return this.powerService.isOnBatteryPower();
	}

	async $startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number> {
		return this.powerService.startPowerSaveBlocker(type);
	}

	async $stopPowerSaveBlocker(id: number): Promise<boolean> {
		return this.powerService.stopPowerSaveBlocker(id);
	}

	async $isPowerSaveBlockerStarted(id: number): Promise<boolean> {
		return this.powerService.isPowerSaveBlockerStarted(id);
	}
}
