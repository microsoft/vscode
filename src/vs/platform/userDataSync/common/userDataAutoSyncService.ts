/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout, Delayer } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, IUserDataSyncEnablementService, ALL_SYNC_RESOURCES } from 'vs/platform/userDataSync/common/userDataSync';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type AutoSyncClassification = {
	sources: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};


export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private enabled: boolean = this.getDefaultEnablementValue();
	private successiveFailures: number = 0;
	private lastSyncTriggerTime: number | undefined = undefined;
	private readonly syncDelayer: Delayer<void>;

	private readonly _onError: Emitter<UserDataSyncError> = this._register(new Emitter<UserDataSyncError>());
	readonly onError: Event<UserDataSyncError> = this._onError.event;

	constructor(
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IAuthenticationTokenService private readonly authTokenService: IAuthenticationTokenService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.updateEnablement(false, true);
		this.syncDelayer = this._register(new Delayer<void>(0));
		this._register(Event.any<any>(authTokenService.onDidChangeToken)(() => this.updateEnablement(true, true)));
		this._register(Event.any<any>(userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true, true)));
		this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => this.updateEnablement(true, false)));
		this._register(this.userDataSyncEnablementService.onDidChangeResourceEnablement(() => this.triggerAutoSync(['resourceEnablement'])));
	}

	// For tests purpose only
	protected getDefaultEnablementValue(): boolean { return false; }

	private updateEnablement(stopIfDisabled: boolean, auto: boolean): void {
		const { enabled, reason } = this.isAutoSyncEnabled();
		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;
		if (this.enabled) {
			this.logService.info('Auto Sync: Started');
			this.sync(true, auto);
			return;
		} else {
			this.resetFailures();
			if (stopIfDisabled) {
				this.userDataSyncService.stop();
				this.logService.info('Auto Sync: stopped because', reason);
			}
		}

	}

	private async sync(loop: boolean, auto: boolean): Promise<void> {
		if (this.enabled) {
			try {
				this.lastSyncTriggerTime = new Date().getTime();
				await this.userDataSyncService.sync();
				this.resetFailures();
			} catch (e) {
				const error = UserDataSyncError.toUserDataSyncError(e);
				if (error.code === UserDataSyncErrorCode.TurnedOff || error.code === UserDataSyncErrorCode.SessionExpired) {
					this.logService.info('Auto Sync: Sync is turned off in the cloud.');
					this.logService.info('Auto Sync: Resetting the local sync state.');
					await this.userDataSyncService.resetLocal();
					this.logService.info('Auto Sync: Completed resetting the local sync state.');
					if (auto) {
						this.userDataSyncEnablementService.setEnablement(false);
						this._onError.fire(error);
						return;
					} else {
						return this.sync(loop, auto);
					}
				}
				this.logService.error(error);
				this.successiveFailures++;
				this._onError.fire(error);
			}
			if (loop) {
				await timeout(1000 * 60 * 5);
				this.sync(loop, true);
			}
		} else {
			this.logService.trace('Auto Sync: Not syncing as it is disabled.');
		}
	}

	private isAutoSyncEnabled(): { enabled: boolean, reason?: string } {
		if (!this.userDataSyncEnablementService.isEnabled()) {
			return { enabled: false, reason: 'sync is disabled' };
		}
		if (this.userDataSyncService.status === SyncStatus.Uninitialized) {
			return { enabled: false, reason: 'sync is not initialized' };
		}
		if (!this.authTokenService.token) {
			return { enabled: false, reason: 'token is not avaialable' };
		}
		return { enabled: true };
	}

	private resetFailures(): void {
		this.successiveFailures = 0;
	}

	private sources: string[] = [];
	async triggerAutoSync(sources: string[]): Promise<void> {
		if (!this.enabled) {
			return this.syncDelayer.cancel();
		}

		/*
		If sync is not triggered by sync resource (triggered by other sources like window focus etc.,)
		then limit sync to once per minute
		*/
		const isNotTriggeredBySyncResource = ALL_SYNC_RESOURCES.every(syncResource => !sources.includes(syncResource));
		if (isNotTriggeredBySyncResource && this.lastSyncTriggerTime
			&& Math.round((new Date().getTime() - this.lastSyncTriggerTime) / 1000) < 60) {
			this.logService.debug('Auto Sync Skipped: Limited to once per minute.');
			return;
		}

		this.sources.push(...sources);
		return this.syncDelayer.trigger(() => {
			this.telemetryService.publicLog2<{ sources: string[] }, AutoSyncClassification>('sync/triggered', { sources: this.sources });
			this.sources = [];

			this.logService.info('Auto Sync: Triggered.');
			return this.sync(false, true);
		}, this.successiveFailures
			? 1000 * 1 * Math.min(this.successiveFailures, 60) /* Delay by number of failures times number of seconds max till 1 minute */
			: 0); /* Do not delay if there are no failures */

	}

}
