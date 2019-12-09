/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { timeout } from 'vs/base/common/async';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';

export class UserDataAutoSync extends Disposable {

	private enabled: boolean = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IAuthTokenService private readonly authTokenService: IAuthTokenService,
	) {
		super();
		this.updateEnablement(false);
		this._register(Event.any<any>(authTokenService.onDidChangeStatus, userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true)));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('sync.enable'))(() => this.updateEnablement(true)));
	}

	private updateEnablement(stopIfDisabled: boolean): void {
		const enabled = this.isSyncEnabled();
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

	private isSyncEnabled(): boolean {
		return this.configurationService.getValue<boolean>('sync.enable')
			&& this.userDataSyncService.status !== SyncStatus.Uninitialized
			&& this.authTokenService.status === AuthTokenStatus.SignedIn;
	}

}
