/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, disposableTimeout, ThrottledDelayer, timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toLocalISOString } from '../../../base/common/date.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUserDataSyncTask, IUserDataAutoSyncService, IUserDataManifest, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, UserDataAutoSyncError, UserDataSyncError, UserDataSyncErrorCode, SyncOptions } from './userDataSync.js';
import { IUserDataSyncAccountService } from './userDataSyncAccount.js';
import { IUserDataSyncMachinesService } from './userDataSyncMachines.js';

const disableMachineEventuallyKey = 'sync.disableMachineEventually';
const sessionIdKey = 'sync.sessionId';
const storeUrlKey = 'sync.storeUrl';
const productQualityKey = 'sync.productQuality';

export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: undefined;

	private readonly autoSync = this._register(new MutableDisposable<AutoSync>());
	private successiveFailures: number = 0;
	private lastSyncTriggerTime: number | undefined = undefined;
	private readonly syncTriggerDelayer: ThrottledDelayer<void>;
	private suspendUntilRestart: boolean = false;

	private readonly _onError: Emitter<UserDataSyncError> = this._register(new Emitter<UserDataSyncError>());
	readonly onError: Event<UserDataSyncError> = this._onError.event;

	private lastSyncUrl: URI | undefined;
	private get syncUrl(): URI | undefined {
		const value = this.storageService.get(storeUrlKey, StorageScope.APPLICATION);
		return value ? URI.parse(value) : undefined;
	}
	private set syncUrl(syncUrl: URI | undefined) {
		if (syncUrl) {
			this.storageService.store(storeUrlKey, syncUrl.toString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(storeUrlKey, StorageScope.APPLICATION);
		}
	}

	private previousProductQuality: string | undefined;
	private get productQuality(): string | undefined {
		return this.storageService.get(productQualityKey, StorageScope.APPLICATION);
	}
	private set productQuality(productQuality: string | undefined) {
		if (productQuality) {
			this.storageService.store(productQualityKey, productQuality, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(productQualityKey, StorageScope.APPLICATION);
		}
	}

	constructor(
		@IProductService productService: IProductService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataSyncAccountService private readonly userDataSyncAccountService: IUserDataSyncAccountService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUserDataSyncMachinesService private readonly userDataSyncMachinesService: IUserDataSyncMachinesService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.syncTriggerDelayer = this._register(new ThrottledDelayer<void>(this.getSyncTriggerDelayTime()));

		this.lastSyncUrl = this.syncUrl;
		this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;

		this.previousProductQuality = this.productQuality;
		this.productQuality = productService.quality;

		if (this.syncUrl) {

			this.logService.info('[AutoSync] Using settings sync service', this.syncUrl.toString());
			this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => {
				if (!isEqual(this.syncUrl, userDataSyncStoreManagementService.userDataSyncStore?.url)) {
					this.lastSyncUrl = this.syncUrl;
					this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;
					if (this.syncUrl) {
						this.logService.info('[AutoSync] Using settings sync service', this.syncUrl.toString());
					}
				}
			}));

			if (this.userDataSyncEnablementService.isEnabled()) {
				this.logService.info('[AutoSync] Enabled.');
			} else {
				this.logService.info('[AutoSync] Disabled.');
			}
			this.updateAutoSync();

			if (this.hasToDisableMachineEventually()) {
				this.disableMachineEventually();
			}

			this._register(userDataSyncAccountService.onDidChangeAccount(() => this.updateAutoSync()));
			this._register(userDataSyncStoreService.onDidChangeDonotMakeRequestsUntil(() => this.updateAutoSync()));
			this._register(userDataSyncService.onDidChangeLocal(source => this.triggerSync([source])));
			this._register(Event.filter(this.userDataSyncEnablementService.onDidChangeResourceEnablement, ([, enabled]) => enabled)(() => this.triggerSync(['resourceEnablement'])));
			this._register(this.userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.triggerSync(['userDataSyncStoreChanged'])));
		}
	}

	private updateAutoSync(): void {
		const { enabled, message } = this.isAutoSyncEnabled();
		if (enabled) {
			if (this.autoSync.value === undefined) {
				this.autoSync.value = new AutoSync(this.lastSyncUrl, 1000 * 60 * 5 /* 5 miutes */, this.userDataSyncStoreManagementService, this.userDataSyncStoreService, this.userDataSyncService, this.userDataSyncMachinesService, this.logService, this.telemetryService, this.storageService);
				this.autoSync.value.register(this.autoSync.value.onDidStartSync(() => this.lastSyncTriggerTime = new Date().getTime()));
				this.autoSync.value.register(this.autoSync.value.onDidFinishSync(e => this.onDidFinishSync(e)));
				if (this.startAutoSync()) {
					this.autoSync.value.start();
				}
			}
		} else {
			this.syncTriggerDelayer.cancel();
			if (this.autoSync.value !== undefined) {
				if (message) {
					this.logService.info(message);
				}
				this.autoSync.clear();
			}

			/* log message when auto sync is not disabled by user */
			else if (message && this.userDataSyncEnablementService.isEnabled()) {
				this.logService.info(message);
			}
		}
	}

	// For tests purpose only
	protected startAutoSync(): boolean { return true; }

	private isAutoSyncEnabled(): { enabled: boolean; message?: string } {
		if (!this.userDataSyncEnablementService.isEnabled()) {
			return { enabled: false, message: '[AutoSync] Disabled.' };
		}
		if (!this.userDataSyncAccountService.account) {
			return { enabled: false, message: '[AutoSync] Suspended until auth token is available.' };
		}
		if (this.userDataSyncStoreService.donotMakeRequestsUntil) {
			return { enabled: false, message: `[AutoSync] Suspended until ${toLocalISOString(this.userDataSyncStoreService.donotMakeRequestsUntil)} because server is not accepting requests until then.` };
		}
		if (this.suspendUntilRestart) {
			return { enabled: false, message: '[AutoSync] Suspended until restart.' };
		}
		return { enabled: true };
	}

	async turnOn(): Promise<void> {
		this.stopDisableMachineEventually();
		this.lastSyncUrl = this.syncUrl;
		this.updateEnablement(true);
	}

	async turnOff(everywhere: boolean, softTurnOffOnError?: boolean, donotRemoveMachine?: boolean): Promise<void> {
		try {

			// Remove machine
			if (this.userDataSyncAccountService.account && !donotRemoveMachine) {
				await this.userDataSyncMachinesService.removeCurrentMachine();
			}

			// Disable Auto Sync
			this.updateEnablement(false);

			// Reset Session
			this.storageService.remove(sessionIdKey, StorageScope.APPLICATION);

			// Reset
			if (everywhere) {
				await this.userDataSyncService.reset();
			} else {
				await this.userDataSyncService.resetLocal();
			}
		} catch (error) {
			this.logService.error(error);
			if (softTurnOffOnError) {
				this.updateEnablement(false);
			} else {
				throw error;
			}
		}
	}

	private updateEnablement(enabled: boolean): void {
		if (this.userDataSyncEnablementService.isEnabled() !== enabled) {
			this.userDataSyncEnablementService.setEnablement(enabled);
			this.updateAutoSync();
		}
	}

	private hasProductQualityChanged(): boolean {
		return !!this.previousProductQuality && !!this.productQuality && this.previousProductQuality !== this.productQuality;
	}

	private async onDidFinishSync(error: Error | undefined): Promise<void> {
		this.logService.debug('[AutoSync] Sync Finished');
		if (!error) {
			// Sync finished without errors
			this.successiveFailures = 0;
			return;
		}

		// Error while syncing
		const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);

		// Session got expired
		if (userDataSyncError.code === UserDataSyncErrorCode.SessionExpired) {
			await this.turnOff(false, true /* force soft turnoff on error */);
			this.logService.info('[AutoSync] Turned off sync because current session is expired');
		}

		// Turned off from another device
		else if (userDataSyncError.code === UserDataSyncErrorCode.TurnedOff) {
			await this.turnOff(false, true /* force soft turnoff on error */);
			this.logService.info('[AutoSync] Turned off sync because sync is turned off in the cloud');
		}

		// Exceeded Rate Limit on Client
		else if (userDataSyncError.code === UserDataSyncErrorCode.LocalTooManyRequests) {
			this.suspendUntilRestart = true;
			this.logService.info('[AutoSync] Suspended sync because of making too many requests to server');
			this.updateAutoSync();
		}

		// Exceeded Rate Limit on Server
		else if (userDataSyncError.code === UserDataSyncErrorCode.TooManyRequests) {
			await this.turnOff(false, true /* force soft turnoff on error */,
				true /* do not disable machine because disabling a machine makes request to server and can fail with TooManyRequests */);
			this.disableMachineEventually();
			this.logService.info('[AutoSync] Turned off sync because of making too many requests to server');
		}

		// Method Not Found
		else if (userDataSyncError.code === UserDataSyncErrorCode.MethodNotFound) {
			await this.turnOff(false, true /* force soft turnoff on error */);
			this.logService.info('[AutoSync] Turned off sync because current client is making requests to server that are not supported');
		}

		// Upgrade Required or Gone
		else if (userDataSyncError.code === UserDataSyncErrorCode.UpgradeRequired || userDataSyncError.code === UserDataSyncErrorCode.Gone) {
			await this.turnOff(false, true /* force soft turnoff on error */,
				true /* do not disable machine because disabling a machine makes request to server and can fail with upgrade required or gone */);
			this.disableMachineEventually();
			this.logService.info('[AutoSync] Turned off sync because current client is not compatible with server. Requires client upgrade.');
		}

		// Incompatible Local Content
		else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleLocalContent) {
			await this.turnOff(false, true /* force soft turnoff on error */);
			this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with newer version than of client. Requires client upgrade.`);
		}

		// Incompatible Remote Content
		else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleRemoteContent) {
			await this.turnOff(false, true /* force soft turnoff on error */);
			this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with older version than of client. Requires server reset.`);
		}

		// Service changed
		else if (userDataSyncError.code === UserDataSyncErrorCode.ServiceChanged || userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged) {

			// Check if default settings sync service has changed in web without changing the product quality
			// Then turn off settings sync and ask user to turn on again
			if (isWeb && userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged && !this.hasProductQualityChanged()) {
				await this.turnOff(false, true /* force soft turnoff on error */);
				this.logService.info('[AutoSync] Turned off sync because default sync service is changed.');
			}

			// Service has changed by the user. So turn off and turn on sync.
			// Show a prompt to the user about service change.
			else {
				await this.turnOff(false, true /* force soft turnoff on error */, true /* do not disable machine */);
				await this.turnOn();
				this.logService.info('[AutoSync] Sync Service changed. Turned off auto sync, reset local state and turned on auto sync.');
			}

		}

		else {
			this.logService.error(userDataSyncError);
			this.successiveFailures++;
		}

		this._onError.fire(userDataSyncError);
	}

	private async disableMachineEventually(): Promise<void> {
		this.storageService.store(disableMachineEventuallyKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		await timeout(1000 * 60 * 10);

		// Return if got stopped meanwhile.
		if (!this.hasToDisableMachineEventually()) {
			return;
		}

		this.stopDisableMachineEventually();

		// disable only if sync is disabled
		if (!this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account) {
			await this.userDataSyncMachinesService.removeCurrentMachine();
		}
	}

	private hasToDisableMachineEventually(): boolean {
		return this.storageService.getBoolean(disableMachineEventuallyKey, StorageScope.APPLICATION, false);
	}

	private stopDisableMachineEventually(): void {
		this.storageService.remove(disableMachineEventuallyKey, StorageScope.APPLICATION);
	}

	private sources: string[] = [];
	async triggerSync(sources: string[], options?: SyncOptions): Promise<void> {
		if (this.autoSync.value === undefined) {
			return this.syncTriggerDelayer.cancel();
		}

		if (options?.skipIfSyncedRecently && this.lastSyncTriggerTime && new Date().getTime() - this.lastSyncTriggerTime < 10_000) {
			this.logService.debug('[AutoSync] Skipping because sync was triggered recently.', sources);
			return;
		}

		this.sources.push(...sources);
		return this.syncTriggerDelayer.trigger(async () => {
			this.logService.trace('[AutoSync] Activity sources', ...this.sources);
			this.sources = [];
			if (this.autoSync.value) {
				await this.autoSync.value.sync('Activity', !!options?.disableCache);
			}
		}, this.successiveFailures
			? Math.min(this.getSyncTriggerDelayTime() * this.successiveFailures, 60_000) /* Delay linearly until max 1 minute */
			: options?.immediately ? 0 : this.getSyncTriggerDelayTime());

	}

	protected getSyncTriggerDelayTime(): number {
		if (this.lastSyncTriggerTime && new Date().getTime() - this.lastSyncTriggerTime > 10_000) {
			this.logService.debug('[AutoSync] Sync immediately because last sync was triggered more than 10 seconds ago.');
			return 0;
		}
		return 3_000; /* Debounce for 3 seconds if there are no failures */
	}

}

class AutoSync extends Disposable {

	private static readonly INTERVAL_SYNCING = 'Interval';

	private readonly intervalHandler = this._register(new MutableDisposable<IDisposable>());

	private readonly _onDidStartSync = this._register(new Emitter<void>());
	readonly onDidStartSync = this._onDidStartSync.event;

	private readonly _onDidFinishSync = this._register(new Emitter<Error | undefined>());
	readonly onDidFinishSync = this._onDidFinishSync.event;

	private manifest: IUserDataManifest | null = null;
	private syncTask: IUserDataSyncTask | undefined;
	private syncPromise: CancelablePromise<void> | undefined;

	constructor(
		private readonly lastSyncUrl: URI | undefined,
		private readonly interval: number /* in milliseconds */,
		private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		private readonly userDataSyncService: IUserDataSyncService,
		private readonly userDataSyncMachinesService: IUserDataSyncMachinesService,
		private readonly logService: IUserDataSyncLogService,
		private readonly telemetryService: ITelemetryService,
		private readonly storageService: IStorageService,
	) {
		super();
	}

	start(): void {
		this._register(this.onDidFinishSync(() => this.waitUntilNextIntervalAndSync()));
		this._register(toDisposable(() => {
			if (this.syncPromise) {
				this.syncPromise.cancel();
				this.logService.info('[AutoSync] Cancelled sync that is in progress');
				this.syncPromise = undefined;
			}
			this.syncTask?.stop();
			this.logService.info('[AutoSync] Stopped');
		}));
		this.sync(AutoSync.INTERVAL_SYNCING, false);
	}

	private waitUntilNextIntervalAndSync(): void {
		this.intervalHandler.value = disposableTimeout(() => {
			this.sync(AutoSync.INTERVAL_SYNCING, false);
			this.intervalHandler.value = undefined;
		}, this.interval);
	}

	sync(reason: string, disableCache: boolean): Promise<void> {
		const syncPromise = createCancelablePromise(async token => {
			if (this.syncPromise) {
				try {
					// Wait until existing sync is finished
					this.logService.debug('[AutoSync] Waiting until sync is finished.');
					await this.syncPromise;
				} catch (error) {
					if (isCancellationError(error)) {
						// Cancelled => Disposed. Donot continue sync.
						return;
					}
				}
			}
			return this.doSync(reason, disableCache, token);
		});
		this.syncPromise = syncPromise;
		this.syncPromise.finally(() => this.syncPromise = undefined);
		return this.syncPromise;
	}

	private hasSyncServiceChanged(): boolean {
		return this.lastSyncUrl !== undefined && !isEqual(this.lastSyncUrl, this.userDataSyncStoreManagementService.userDataSyncStore?.url);
	}

	private async hasDefaultServiceChanged(): Promise<boolean> {
		const previous = await this.userDataSyncStoreManagementService.getPreviousUserDataSyncStore();
		const current = this.userDataSyncStoreManagementService.userDataSyncStore;
		// check if defaults changed
		return !!current && !!previous &&
			(!isEqual(current.defaultUrl, previous.defaultUrl) ||
				!isEqual(current.insidersUrl, previous.insidersUrl) ||
				!isEqual(current.stableUrl, previous.stableUrl));
	}

	private async doSync(reason: string, disableCache: boolean, token: CancellationToken): Promise<void> {
		this.logService.info(`[AutoSync] Triggered by ${reason}`);
		this._onDidStartSync.fire();

		let error: Error | undefined;
		try {
			await this.createAndRunSyncTask(disableCache, token);
		} catch (e) {
			this.logService.error(e);
			error = e;
			if (UserDataSyncError.toUserDataSyncError(e).code === UserDataSyncErrorCode.MethodNotFound) {
				try {
					this.logService.info('[AutoSync] Client is making invalid requests. Cleaning up data...');
					await this.userDataSyncService.cleanUpRemoteData();
					this.logService.info('[AutoSync] Retrying sync...');
					await this.createAndRunSyncTask(disableCache, token);
					error = undefined;
				} catch (e1) {
					this.logService.error(e1);
					error = e1;
				}
			}
		}

		this._onDidFinishSync.fire(error);
	}

	private async createAndRunSyncTask(disableCache: boolean, token: CancellationToken): Promise<void> {
		this.syncTask = await this.userDataSyncService.createSyncTask(this.manifest, disableCache);
		if (token.isCancellationRequested) {
			return;
		}
		this.manifest = this.syncTask.manifest;

		// Server has no data but this machine was synced before
		if (this.manifest === null && await this.userDataSyncService.hasPreviouslySynced()) {
			if (this.hasSyncServiceChanged()) {
				if (await this.hasDefaultServiceChanged()) {
					throw new UserDataAutoSyncError(localize('default service changed', "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
				} else {
					throw new UserDataAutoSyncError(localize('service changed', "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
				}
			} else {
				// Sync was turned off in the cloud
				throw new UserDataAutoSyncError(localize('turned off', "Cannot sync because syncing is turned off in the cloud"), UserDataSyncErrorCode.TurnedOff);
			}
		}

		const sessionId = this.storageService.get(sessionIdKey, StorageScope.APPLICATION);
		// Server session is different from client session
		if (sessionId && this.manifest && sessionId !== this.manifest.session) {
			if (this.hasSyncServiceChanged()) {
				if (await this.hasDefaultServiceChanged()) {
					throw new UserDataAutoSyncError(localize('default service changed', "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
				} else {
					throw new UserDataAutoSyncError(localize('service changed', "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
				}
			} else {
				throw new UserDataAutoSyncError(localize('session expired', "Cannot sync because current session is expired"), UserDataSyncErrorCode.SessionExpired);
			}
		}

		const machines = await this.userDataSyncMachinesService.getMachines(this.manifest || undefined);
		// Return if cancellation is requested
		if (token.isCancellationRequested) {
			return;
		}

		const currentMachine = machines.find(machine => machine.isCurrent);
		// Check if sync was turned off from other machine
		if (currentMachine?.disabled) {
			// Throw TurnedOff error
			throw new UserDataAutoSyncError(localize('turned off machine', "Cannot sync because syncing is turned off on this machine from another machine."), UserDataSyncErrorCode.TurnedOff);
		}

		const startTime = new Date().getTime();
		await this.syncTask.run();
		this.telemetryService.publicLog2<{
			duration: number;
		}, {
			owner: 'sandy081';
			comment: 'Report when running a sync operation';
			duration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Time taken to run sync operation' };
		}>('settingsSync:sync', { duration: new Date().getTime() - startTime });

		// After syncing, get the manifest if it was not available before
		if (this.manifest === null) {
			try {
				this.manifest = await this.userDataSyncStoreService.manifest(null);
			} catch (error) {
				throw new UserDataAutoSyncError(toErrorMessage(error), error instanceof UserDataSyncError ? error.code : UserDataSyncErrorCode.Unknown);
			}
		}

		// Update local session id
		if (this.manifest && this.manifest.session !== sessionId) {
			this.storageService.store(sessionIdKey, this.manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		// Return if cancellation is requested
		if (token.isCancellationRequested) {
			return;
		}

		// Add current machine
		if (!currentMachine) {
			await this.userDataSyncMachinesService.addCurrentMachine(this.manifest || undefined);
		}
	}

	register<T extends IDisposable>(t: T): T {
		return super._register(t);
	}

}
