/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAuthTokenService } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataAutoSync extends Disposable {

	private enabled: boolean = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataAuthTokenService private readonly userDataAuthTokenService: IUserDataAuthTokenService,
	) {
		super();
		this.updateEnablement(false);
		this._register(Event.any<any>(userDataAuthTokenService.onDidChangeToken)(() => this.updateEnablement(true)));
		this._register(Event.any<any>(userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true)));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('sync.enable'))(() => this.updateEnablement(true)));
	}

	private async updateEnablement(stopIfDisabled: boolean): Promise<void> {
		const enabled = await this.isSyncEnabled();
		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;
		if (this.enabled) {
			this.logService.info('Syncing configuration started');
			this.sync(true);
			return;
		} else {
			if (stopIfDisabled) {
				this.userDataSyncService.stop();
				this.logService.info('Syncing configuration stopped.');
			}
		}

	}

	protected async sync(loop: boolean): Promise<void> {
		if (this.enabled) {
			try {
				await this.userDataSyncService.sync();
			} catch (e) {
				this.logService.error(e);
			}
			if (loop) {
				await timeout(1000 * 60 * 5); // Loop sync for every 5 min.
				this.sync(loop);
			}
		}
	}

	private async isSyncEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('sync.enable')
			&& this.userDataSyncService.status !== SyncStatus.Uninitialized
			&& !!(await this.userDataAuthTokenService.getToken());
	}

}
