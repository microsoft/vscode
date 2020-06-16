/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, disposableTimeout, CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable, MutableDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IUserDataSyncLogService, IUserDataSyncService, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, IUserDataSyncEnablementService, IUserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

type AutoSyncClassification = {
	sources: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

type AutoSyncEnablementClassification = {
	enabled?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

const enablementKey = 'sync.enable';

export class UserDataAutoSyncEnablementService extends Disposable {

	private _onDidChangeEnablement = new Emitter<boolean>();
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	constructor(
		@IStorageService protected readonly storageService: IStorageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super();
		this._register(storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	isEnabled(): boolean {
		switch (this.environmentService.sync) {
			case 'on':
				return true;
			case 'off':
				return false;
		}
		return this.storageService.getBoolean(enablementKey, StorageScope.GLOBAL, this.environmentService.enableSyncByDefault);
	}

	canToggleEnablement(): boolean {
		return this.environmentService.sync === undefined;
	}

	private onDidStorageChange(workspaceStorageChangeEvent: IWorkspaceStorageChangeEvent): void {
		if (workspaceStorageChangeEvent.scope === StorageScope.GLOBAL) {
			if (enablementKey === workspaceStorageChangeEvent.key) {
				this._onDidChangeEnablement.fire(this.isEnabled());
			}
		}
	}

}

export class UserDataAutoSyncService extends UserDataAutoSyncEnablementService implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private readonly autoSync = this._register(new MutableDisposable<AutoSync>());
	private successiveFailures: number = 0;
	private lastSyncTriggerTime: number | undefined = undefined;
	private readonly syncTriggerDelayer: Delayer<void>;

	private readonly _onError: Emitter<UserDataSyncError> = this._register(new Emitter<UserDataSyncError>());
	readonly onError: Event<UserDataSyncError> = this._onError.event;

	constructor(
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataSyncAccountService private readonly authTokenService: IUserDataSyncAccountService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(storageService, environmentService);
		this.syncTriggerDelayer = this._register(new Delayer<void>(0));

		if (userDataSyncStoreService.userDataSyncStore) {
			this.updateAutoSync();
			this._register(authTokenService.onDidChangeAccount(() => this.updateAutoSync()));
			this._register(Event.debounce<string, string[]>(userDataSyncService.onDidChangeLocal, (last, source) => last ? [...last, source] : [source], 1000)(sources => this.triggerSync(sources, false)));
			this._register(Event.filter(this.userDataSyncEnablementService.onDidChangeResourceEnablement, ([, enabled]) => enabled)(() => this.triggerSync(['resourceEnablement'], false)));
		}
	}

	private updateAutoSync(): void {
		const { enabled, reason } = this.isAutoSyncEnabled();
		if (enabled) {
			if (this.autoSync.value === undefined) {
				this.autoSync.value = new AutoSync(1000 * 60 * 5 /* 5 miutes */, this.userDataSyncService, this.logService);
				this.autoSync.value.register(this.autoSync.value.onDidStartSync(() => this.lastSyncTriggerTime = new Date().getTime()));
				this.autoSync.value.register(this.autoSync.value.onDidFinishSync(e => this.onDidFinishSync(e)));
				if (this.startAutoSync()) {
					this.autoSync.value.start();
				}
			}
		} else {
			this.syncTriggerDelayer.cancel();
			if (this.autoSync.value !== undefined) {
				this.logService.info('Auto Sync: Disabled because', reason);
				this.autoSync.clear();
			}
		}
	}

	// For tests purpose only
	protected startAutoSync(): boolean { return true; }

	private isAutoSyncEnabled(): { enabled: boolean, reason?: string } {
		if (!this.isEnabled()) {
			return { enabled: false, reason: 'sync is disabled' };
		}
		if (!this.authTokenService.account) {
			return { enabled: false, reason: 'token is not avaialable' };
		}
		return { enabled: true };
	}

	async turnOn(pullFirst: boolean): Promise<void> {
		if (pullFirst) {
			await this.userDataSyncService.pull();
		} else {
			await this.userDataSyncService.sync(CancellationToken.None);
		}

		this.setEnablement(true);
		this.updateAutoSync();
	}

	async turnOff(): Promise<void> {
		this.setEnablement(false);
		this.updateAutoSync();
	}

	setEnablement(enabled: boolean): void {
		if (this.isEnabled() !== enabled) {
			this.telemetryService.publicLog2<{ enabled: boolean }, AutoSyncEnablementClassification>(enablementKey, { enabled });
			this.storageService.store(enablementKey, enabled, StorageScope.GLOBAL);
		}
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
			this.turnOff();
			this.logService.info('Auto Sync: Turned off sync because sync is turned off in the cloud');
		} else if (userDataSyncError.code === UserDataSyncErrorCode.LocalTooManyRequests) {
			this.turnOff();
			this.logService.info('Auto Sync: Turned off sync because of making too many requests to server');
		} else {
			this.logService.error(userDataSyncError);
			this.successiveFailures++;
		}
		this._onError.fire(userDataSyncError);
	}

	private sources: string[] = [];
	async triggerSync(sources: string[], skipIfSyncedRecently: boolean): Promise<void> {
		if (this.autoSync.value === undefined) {
			return this.syncTriggerDelayer.cancel();
		}

		if (skipIfSyncedRecently && this.lastSyncTriggerTime
			&& Math.round((new Date().getTime() - this.lastSyncTriggerTime) / 1000) < 10) {
			this.logService.debug('Auto Sync: Skipped. Limited to once per 10 seconds.');
			return;
		}

		this.sources.push(...sources);
		return this.syncTriggerDelayer.trigger(() => {
			this.logService.trace('activity sources', ...this.sources);
			this.telemetryService.publicLog2<{ sources: string[] }, AutoSyncClassification>('sync/triggered', { sources: this.sources });
			this.sources = [];
			if (this.autoSync.value) {
				this.autoSync.value.sync('Activity');
			}
		}, this.successiveFailures
			? this.getSyncTriggerDelayTime() * 1 * Math.min(Math.pow(2, this.successiveFailures), 60) /* Delay exponentially until max 1 minute */
			: this.getSyncTriggerDelayTime());

	}

	protected getSyncTriggerDelayTime(): number {
		return 1000; /* Debounce for a second if there are no failures */
	}

}

class AutoSync extends Disposable {

	private static readonly INTERVAL_SYNCING = 'Interval';

	private readonly intervalHandler = this._register(new MutableDisposable<IDisposable>());

	private readonly _onDidStartSync = this._register(new Emitter<void>());
	readonly onDidStartSync = this._onDidStartSync.event;

	private readonly _onDidFinishSync = this._register(new Emitter<Error | undefined>());
	readonly onDidFinishSync = this._onDidFinishSync.event;

	private syncPromise: CancelablePromise<void> | undefined;

	constructor(
		private readonly interval: number /* in milliseconds */,
		private readonly userDataSyncService: IUserDataSyncService,
		private readonly logService: IUserDataSyncLogService,
	) {
		super();
	}

	start(): void {
		this._register(this.onDidFinishSync(() => this.waitUntilNextIntervalAndSync()));
		this._register(toDisposable(() => {
			if (this.syncPromise) {
				this.syncPromise.cancel();
				this.logService.info('Auto sync: Canelled sync that is in progress');
				this.syncPromise = undefined;
			}
			this.userDataSyncService.stop();
			this.logService.info('Auto Sync: Stopped');
		}));
		this.logService.info('Auto Sync: Started');
		this.sync(AutoSync.INTERVAL_SYNCING);
	}

	private waitUntilNextIntervalAndSync(): void {
		this.intervalHandler.value = disposableTimeout(() => this.sync(AutoSync.INTERVAL_SYNCING), this.interval);
	}

	sync(reason: string): void {
		const syncPromise = createCancelablePromise(async token => {
			if (this.syncPromise) {
				try {
					// Wait until existing sync is finished
					this.logService.debug('Auto Sync: Waiting until sync is finished.');
					await this.syncPromise;
				} catch (error) {
					if (isPromiseCanceledError(error)) {
						// Cancelled => Disposed. Donot continue sync.
						return;
					}
				}
			}
			return this.doSync(reason, token);
		});
		this.syncPromise = syncPromise;
		this.syncPromise.finally(() => this.syncPromise = undefined);
	}

	private async doSync(reason: string, token: CancellationToken): Promise<void> {
		this.logService.info(`Auto Sync: Triggered by ${reason}`);
		this._onDidStartSync.fire();
		let error: Error | undefined;
		try {
			await this.userDataSyncService.sync(token);
		} catch (e) {
			this.logService.error(e);
			error = e;
		}
		this._onDidFinishSync.fire(error);
	}

	register<T extends IDisposable>(t: T): T {
		return super._register(t);
	}

}
