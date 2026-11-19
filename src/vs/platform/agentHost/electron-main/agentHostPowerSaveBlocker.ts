/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { createPowerSaveBlocker, isOnBatteryPower, onDidChangeOnBatteryPower } from '../../native/electron-main/power.js';
import { ILogService } from '../../log/common/log.js';
import { parseAgentHostPowerSaveBlockerMessage } from '../common/agentHostPowerSaveBlocker.js';

interface IAgentHostPowerRuntime {
	readonly supportsBatteryPower: boolean;
	readonly onDidChangeOnBatteryPower: Event<boolean>;
	isOnBatteryPower(): boolean;
	createPowerSaveBlocker(): IDisposable;
}

const electronPowerRuntime: IAgentHostPowerRuntime = {
	supportsBatteryPower: isMacintosh || isWindows,
	onDidChangeOnBatteryPower,
	isOnBatteryPower,
	createPowerSaveBlocker: () => createPowerSaveBlocker('prevent-app-suspension'),
};

export class AgentHostElectronPowerSaveBlocker extends Disposable {
	private readonly _blocker = this._register(new MutableDisposable<IDisposable>());
	private readonly _poll = this._register(new RunOnceScheduler(() => this._update(), 30_000));
	private _allowOnBattery: boolean | undefined;

	constructor(
		private readonly _logService: ILogService,
		private readonly _powerRuntime: IAgentHostPowerRuntime = electronPowerRuntime,
	) {
		super();
		if (_powerRuntime.supportsBatteryPower) {
			this._register(_powerRuntime.onDidChangeOnBatteryPower(() => this._update()));
		}
	}

	handleMessage(message: unknown): void {
		const request = parseAgentHostPowerSaveBlockerMessage(message);
		if (!request) {
			return;
		}

		if (request.kind === 'release' || (!request.allowOnBattery && !this._powerRuntime.supportsBatteryPower)) {
			this._allowOnBattery = undefined;
			this._poll.cancel();
			this._blocker.clear();
			return;
		}

		this._allowOnBattery = request.allowOnBattery;
		this._update();
	}

	private _update(): void {
		if (this._allowOnBattery === undefined) {
			return;
		}

		try {
			if (this._allowOnBattery || !this._powerRuntime.isOnBatteryPower()) {
				this._blocker.value ??= this._powerRuntime.createPowerSaveBlocker();
			} else {
				this._blocker.clear();
			}
		} catch (error) {
			this._blocker.clear();
			this._logService.warn('[AgentHostKeepAwake] Cannot inhibit idle sleep on this host', error);
		}

		if (this._allowOnBattery !== undefined) {
			this._poll.schedule();
		}
	}
}
