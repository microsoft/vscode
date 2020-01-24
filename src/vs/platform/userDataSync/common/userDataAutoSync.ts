/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAuthTokenService, IUserDataAutoSyncService, IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataAutoSync extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private enabled: boolean = false;

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
						await this.userDataSyncService.resetLocal();
						await this.userDataSyncUtilService.updateConfigurationValue('sync.enable', false);
						return;
					}
					if (this.userDataSyncService.status !== SyncStatus.Idle) {
						this.logService.info('Skipped auto sync as sync is happening');
						return;
					}
				}
				await this.userDataSyncService.sync();
			} catch (e) {
				this.logService.error(e);
			}
			if (loop) {
				await timeout(1000 * 60 * 5); // Loop sync for every 5 min.
				this.sync(loop, true);
			}
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
		return this.sync(false, true);
	}

}
