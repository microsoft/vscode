/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout, Delayer } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataSyncLogService, IUserDataSyncService, SyncStatus, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';

export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: any;

	private enabled: boolean = false;
	private successiveFailures: number = 0;
	private readonly syncDelayer: Delayer<void>;

	private readonly _onError: Emitter<UserDataSyncError> = this._register(new Emitter<UserDataSyncError>());
	readonly onError: Event<UserDataSyncError> = this._onError.event;

	constructor(
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IAuthenticationTokenService private readonly authTokenService: IAuthenticationTokenService,
	) {
		super();
		this.updateEnablement(false, true);
		this.syncDelayer = this._register(new Delayer<void>(0));
		this._register(Event.any<any>(authTokenService.onDidChangeToken)(() => this.updateEnablement(true, true)));
		this._register(Event.any<any>(userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true, true)));
		this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => this.updateEnablement(true, false)));
		this._register(this.userDataSyncEnablementService.onDidChangeResourceEnablement(() => this.triggerAutoSync()));
	}

	private async updateEnablement(stopIfDisabled: boolean, auto: boolean): Promise<void> {
		const enabled = await this.isAutoSyncEnabled();
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
				this.logService.info('Auto Sync: stopped.');
			}
		}

	}

	private async sync(loop: boolean, auto: boolean): Promise<void> {
		if (this.enabled) {
			try {
				await this.userDataSyncService.sync();
				this.resetFailures();
			} catch (e) {
				const error = UserDataSyncError.toUserDataSyncError(e);
				if (error.code === UserDataSyncErrorCode.TurnedOff) {
					this.logService.info('Auto Sync: Sync is turned off in the cloud.');
					this.logService.info('Auto Sync: Resetting the local sync state.');
					await this.userDataSyncService.resetLocal();
					this.logService.info('Auto Sync: Completed resetting the local sync state.');
					if (auto) {
						return this.userDataSyncEnablementService.setEnablement(false);
					} else {
						return this.sync(loop, auto);
					}
				}
				if (error.code === UserDataSyncErrorCode.SessionExpired) {
					this.logService.info('Auto Sync: Cloud has new session');
					this.logService.info('Auto Sync: Resetting the local sync state.');
					await this.userDataSyncService.resetLocal();
					this.logService.info('Auto Sync: Completed resetting the local sync state.');
					return this.sync(loop, auto);
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

	private async isAutoSyncEnabled(): Promise<boolean> {
		return this.userDataSyncEnablementService.isEnabled()
			&& this.userDataSyncService.status !== SyncStatus.Uninitialized
			&& !!(await this.authTokenService.getToken());
	}

	private resetFailures(): void {
		this.successiveFailures = 0;
	}

	async triggerAutoSync(): Promise<void> {
		if (this.enabled) {
			return this.syncDelayer.trigger(() => {
				this.logService.info('Auto Sync: Triggered.');
				return this.sync(false, true);
			}, this.successiveFailures
				? 1000 * 1 * Math.min(this.successiveFailures, 60) /* Delay by number of seconds as number of failures up to 1 minute */
				: 1000);
		} else {
			this.syncDelayer.cancel();
		}
	}

}
