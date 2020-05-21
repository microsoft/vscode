/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, disposableTimeout } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable, MutableDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, IUserDataSyncEnablementService, ALL_SYNC_RESOURCES } from 'vs/platform/userDataSync/common/userDataSync';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type AutoSyncClassification = {
	sources: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

export const RESOURCE_ENABLEMENT_SOURCE = 'resourceEnablement';

export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private readonly autoSync = this._register(new MutableDisposable<AutoSync>());
	private successiveFailures: number = 0;
	private lastSyncTriggerTime: number | undefined = undefined;
	private readonly syncTriggerDelayer: Delayer<void>;

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
		this.updateEnablement();
		this.syncTriggerDelayer = this._register(new Delayer<void>(0));
		this._register(Event.any(authTokenService.onDidChangeToken, userDataSyncService.onDidChangeStatus, this.userDataSyncEnablementService.onDidChangeEnablement)(() => this.updateEnablement()));
		this._register(Event.filter(this.userDataSyncEnablementService.onDidChangeResourceEnablement, ([, enabled]) => enabled)(() => this.triggerAutoSync([RESOURCE_ENABLEMENT_SOURCE])));
	}

	private updateEnablement(): void {
		const { enabled, reason } = this.isAutoSyncEnabled();
		if (enabled) {
			if (this.autoSync.value === undefined) {
				const autoSync = new AutoSync(this.startAutoSync(), 1000 * 60 * 5 /* 5 miutes */, this.userDataSyncService, this.logService);
				autoSync.register(autoSync.onDidStartSync(() => this.lastSyncTriggerTime = new Date().getTime()));
				autoSync.register(autoSync.onDidFinishSync(e => this.onDidFinishSync(e)));
				this.autoSync.value = autoSync;
			}
		} else {
			if (this.autoSync.value !== undefined) {
				this.logService.trace('Auto Sync: Disabled because', reason);
				this.autoSync.clear();
			}
		}
	}

	// For tests purpose only
	protected startAutoSync(): boolean { return true; }

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

	private async onDidFinishSync(error: Error | undefined): Promise<void> {
		if (!error) {
			// Sync finished without errors
			this.successiveFailures = 0;
			return;
		}

		// Error while syncing
		const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
		if (userDataSyncError.code === UserDataSyncErrorCode.TurnedOff || userDataSyncError.code === UserDataSyncErrorCode.SessionExpired) {
			this.logService.info('Auto Sync: Sync is turned off in the cloud.');
			await this.userDataSyncService.resetLocal();
			this.logService.info('Auto Sync: Did reset the local sync state.');
			this.userDataSyncEnablementService.setEnablement(false);
			this.logService.info('Auto Sync: Turned off sync because sync is turned off in the cloud');
		} else if (userDataSyncError.code === UserDataSyncErrorCode.LocalTooManyRequests) {
			this.userDataSyncEnablementService.setEnablement(false);
			this.logService.info('Auto Sync: Turned off sync because of making too many requests to server');
		} else {
			this.logService.error(userDataSyncError);
			this.successiveFailures++;
		}
		this._onError.fire(userDataSyncError);
	}

	private sources: string[] = [];
	async triggerAutoSync(sources: string[]): Promise<void> {
		if (this.autoSync.value === undefined) {
			return this.syncTriggerDelayer.cancel();
		}

		/*
		If sync is not triggered by sync resource (triggered by other sources like window focus etc.,) or by resource enablement
		then limit sync to once per 10s
		*/
		const hasToLimitSync = sources.indexOf(RESOURCE_ENABLEMENT_SOURCE) === -1 && ALL_SYNC_RESOURCES.every(syncResource => sources.indexOf(syncResource) === -1);
		if (hasToLimitSync && this.lastSyncTriggerTime
			&& Math.round((new Date().getTime() - this.lastSyncTriggerTime) / 1000) < 10) {
			this.logService.debug('Auto Sync Skipped: Limited to once per 10 seconds.');
			return;
		}

		this.sources.push(...sources);
		return this.syncTriggerDelayer.trigger(async () => {
			this.telemetryService.publicLog2<{ sources: string[] }, AutoSyncClassification>('sync/triggered', { sources: this.sources });
			this.sources = [];
			if (this.autoSync.value) {
				await this.autoSync.value.sync('Activity');
			}
		}, this.successiveFailures
			? 1000 * 1 * Math.min(Math.pow(2, this.successiveFailures), 60) /* Delay exponentially until max 1 minute */
			: 1000); /* Debounce for a second if there are no failures */

	}

}

class AutoSync extends Disposable {

	private static readonly INTERVAL_SYNCING = 'Interval';

	private readonly intervalHandler = this._register(new MutableDisposable<IDisposable>());

	private readonly _onDidStartSync = this._register(new Emitter<void>());
	readonly onDidStartSync = this._onDidStartSync.event;

	private readonly _onDidFinishSync = this._register(new Emitter<Error | undefined>());
	readonly onDidFinishSync = this._onDidFinishSync.event;

	constructor(
		start: boolean,
		private readonly interval: number /* in milliseconds */,
		private readonly userDataSyncService: IUserDataSyncService,
		private readonly logService: IUserDataSyncLogService,
	) {
		super();
		if (start) {
			this._register(this.onDidFinishSync(() => this.waitUntilNextIntervalAndSync()));
			this._register(toDisposable(() => {
				this.logService.info('Auto Sync: Stopped');
				this.userDataSyncService.stop();
			}));
			this.logService.info('Auto Sync: Started');
			this.sync(AutoSync.INTERVAL_SYNCING);
		}
	}

	private waitUntilNextIntervalAndSync(): void {
		this.intervalHandler.value = disposableTimeout(() => this.sync(AutoSync.INTERVAL_SYNCING), this.interval);
	}

	async sync(reason: string): Promise<void> {
		this.logService.info(`Auto Sync: Triggered by ${reason}`);
		this._onDidStartSync.fire();
		let error: Error | undefined;
		try {
			await this.userDataSyncService.sync();
		} catch (e) {
			error = e;
		}
		this._onDidFinishSync.fire(error);
	}

	register<T extends IDisposable>(t: T): T {
		return super._register(t);
	}

}
