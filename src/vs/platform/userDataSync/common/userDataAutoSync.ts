/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAuthTokenService, IUserDataAutoSyncService, IUserDataSyncUtilService, UserDataSyncError, UserDataSyncErrorCode, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataAutoSync extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private enabled: boolean = false;
	private successiveFailures: number = 0;

	private readonly _onError: Emitter<{ code: UserDataSyncErrorCode, source?: SyncSource }> = this._register(new Emitter<{ code: UserDataSyncErrorCode, source?: SyncSource }>());
	readonly onError: Event<{ code: UserDataSyncErrorCode, source?: SyncSource }> = this._onError.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataAuthTokenService private readonly userDataAuthTokenService: IUserDataAuthTokenService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
	) {
		super();
		this.updateEnablement(false, true);
		this._register(Event.any<any>(userDataAuthTokenService.onDidChangeToken)(() => this.updateEnablement(true, true)));
		this._register(Event.any<any>(userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true, true)));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('sync.enable'))(() => this.updateEnablement(true, false)));
	}

	private async updateEnablement(stopIfDisabled: boolean, auto: boolean): Promise<void> {
		const enabled = await this.isAutoSyncEnabled();
		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;
		if (this.enabled) {
			this.logService.info('Auto sync started');
			this.sync(true, auto);
			return;
		} else {
			this.successiveFailures = 0;
			if (stopIfDisabled) {
				this.userDataSyncService.stop();
				this.logService.info('Auto sync stopped.');
			}
		}

	}

	private async sync(loop: boolean, auto: boolean): Promise<void> {
		if (this.enabled) {
			try {
				if (auto) {
					if (await this.isTurnedOffEverywhere()) {
						// Turned off everywhere. Reset & Stop Sync.
						this.logService.info('Turning off sync as it is turned off everywhere.');
						await this.userDataSyncService.resetLocal();
						await this.userDataSyncUtilService.updateConfigurationValue('sync.enable', false);
						return;
					}
					if (this.userDataSyncService.status !== SyncStatus.Idle) {
						this.logService.trace('Sync Skipped as it is syncing already');
						return;
					}
				}
				await this.userDataSyncService.sync();
				this.successiveFailures = 0;
			} catch (e) {
				// Do not count on auth errors
				if (!(e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.Unauthroized)) {
					this.successiveFailures++;
				}
				this.logService.error(e);
				this._onError.fire(e instanceof UserDataSyncError ? { code: e.code, source: e.source } : { code: UserDataSyncErrorCode.Unknown });
			}
			if (this.successiveFailures > 5) {
				this._onError.fire({ code: UserDataSyncErrorCode.TooManyFailures });
			}
			if (loop) {
				await timeout(1000 * 60 * 5 * (this.successiveFailures + 1)); // Loop sync for every (successive failures count + 1) times 5 mins interval.
				this.sync(loop, true);
			}
		} else {
			this.logService.trace('Not syncing as it is disabled.');
		}
	}

	private async isTurnedOffEverywhere(): Promise<boolean> {
		const hasRemote = await this.userDataSyncService.hasRemoteData();
		const hasPreviouslySynced = await this.userDataSyncService.hasPreviouslySynced();
		return !hasRemote && hasPreviouslySynced;
	}

	private async isAutoSyncEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('sync.enable')
			&& this.userDataSyncService.status !== SyncStatus.Uninitialized
			&& !!(await this.userDataAuthTokenService.getToken());
	}

	triggerAutoSync(): Promise<void> {
		this.logService.trace('Triggerred Sync...');
		return this.sync(false, true);
	}

}
