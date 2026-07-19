/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { IPowerService } from '../common/powerService';

const RELEASE_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export class PowerService extends Disposable implements IPowerService {
	declare readonly _serviceBrand: undefined;

	private _activeCount = 0;
	private _blocker: (vscode.Disposable & { readonly id: number }) | undefined;
	private _releaseTimer: ReturnType<typeof setTimeout> | undefined;

	private readonly _onDidSuspend = this._register(new Emitter<void>());
	readonly onDidSuspend = this._onDidSuspend.event;

	private readonly _onDidResume = this._register(new Emitter<void>());
	readonly onDidResume = this._onDidResume.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		if (typeof vscode.env.power?.onDidSuspend === 'function') {
			this._register(vscode.env.power.onDidSuspend(() => this._onDidSuspend.fire()));
			this._register(vscode.env.power.onDidResume(() => this._onDidResume.fire()));
		}
	}

	acquirePowerSaveBlocker(): IDisposable {
		this._activeCount++;
		this._logService.debug(`[PowerService] Acquired power save blocker, active count: ${this._activeCount}`);

		// Clear any pending release timer
		if (this._releaseTimer !== undefined) {
			clearTimeout(this._releaseTimer);
			this._releaseTimer = undefined;
		}

		// Start the blocker if this is the first acquisition
		if (this._activeCount === 1) {
			this._startBlocker();
		}

		let disposed = false;
		return toDisposable(() => {
			if (disposed) {
				return;
			}
			disposed = true;
			this._release();
		});
	}

	private async _startBlocker(): Promise<void> {
		if (this._blocker) {
			return;
		}

		try {
			// Check if the API is available (proposed API, desktop only)
			if (typeof vscode.env.power?.startPowerSaveBlocker !== 'function') {
				this._logService.debug('[PowerService] Power save blocker API not available');
				return;
			}

			this._blocker = await vscode.env.power.startPowerSaveBlocker('prevent-app-suspension');
			this._logService.debug(`[PowerService] Started power save blocker, id: ${this._blocker.id}`);
		} catch (err) {
			this._logService.warn(`[PowerService] Failed to start power save blocker: ${err}`);
		}
	}

	private _release(): void {
		this._activeCount--;
		this._logService.debug(`[PowerService] Released power save blocker acquisition, active count: ${this._activeCount}`);

		if (this._activeCount <= 0) {
			this._activeCount = 0;
			this._scheduleStopBlocker();
		}
	}

	private _scheduleStopBlocker(): void {
		if (this._releaseTimer !== undefined) {
			return; // Already scheduled
		}

		this._logService.debug(`[PowerService] Scheduling power save blocker release in ${RELEASE_DELAY_MS}ms`);
		this._releaseTimer = setTimeout(() => {
			this._releaseTimer = undefined;
			this._stopBlocker();
		}, RELEASE_DELAY_MS);
	}

	private _stopBlocker(): void {
		if (!this._blocker) {
			return;
		}

		// Don't stop if new acquisitions came in
		if (this._activeCount > 0) {
			return;
		}

		this._logService.debug(`[PowerService] Stopping power save blocker, id: ${this._blocker.id}`);
		this._blocker.dispose();
		this._blocker = undefined;
	}

	override dispose(): void {
		if (this._releaseTimer !== undefined) {
			clearTimeout(this._releaseTimer);
			this._releaseTimer = undefined;
		}
		if (this._blocker) {
			this._blocker.dispose();
			this._blocker = undefined;
		}
		super.dispose();
	}
}
