/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, ISynchroniser, IUserDataSyncStoreService, SyncSource, IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SettingsSynchroniser } from 'vs/platform/userDataSync/common/settingsSync';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { timeout } from 'vs/base/common/async';
import { ExtensionsSynchroniser } from 'vs/platform/userDataSync/common/extensionsSync';
import { IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private readonly synchronisers: ISynchroniser[];

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	readonly onDidChangeLocal: Event<void>;

	private _conflictsSource: SyncSource | null = null;
	get conflictsSource(): SyncSource | null { return this._conflictsSource; }

	private readonly settingsSynchroniser: SettingsSynchroniser;
	private readonly extensionsSynchroniser: ExtensionsSynchroniser;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuthTokenService private readonly authTokenService: IAuthTokenService,
	) {
		super();
		this.settingsSynchroniser = this._register(this.instantiationService.createInstance(SettingsSynchroniser));
		this.extensionsSynchroniser = this._register(this.instantiationService.createInstance(ExtensionsSynchroniser));
		this.synchronisers = [this.settingsSynchroniser, this.extensionsSynchroniser];
		this.updateStatus();
		this._register(Event.any(...this.synchronisers.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
		this.onDidChangeLocal = Event.any(...this.synchronisers.map(s => s.onDidChangeLocal));
		this._register(authTokenService.onDidChangeStatus(() => this.onDidChangeAuthTokenStatus()));
	}

	async sync(_continue?: boolean): Promise<boolean> {
		if (!this.userDataSyncStoreService.enabled) {
			throw new Error('Not enabled');
		}
		if (this.authTokenService.status === AuthTokenStatus.Inactive) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			if (!await synchroniser.sync(_continue)) {
				return false;
			}
		}
		return true;
	}

	stop(): void {
		if (!this.userDataSyncStoreService.enabled) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			synchroniser.stop();
		}
	}

	removeExtension(identifier: IExtensionIdentifier): Promise<void> {
		return this.extensionsSynchroniser.removeExtension(identifier);
	}

	private updateStatus(): void {
		this._conflictsSource = this.computeConflictsSource();
		this.setStatus(this.computeStatus());
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

	private computeStatus(): SyncStatus {
		if (!this.userDataSyncStoreService.enabled) {
			return SyncStatus.Uninitialized;
		}
		if (this.synchronisers.some(s => s.status === SyncStatus.HasConflicts)) {
			return SyncStatus.HasConflicts;
		}
		if (this.synchronisers.some(s => s.status === SyncStatus.Syncing)) {
			return SyncStatus.Syncing;
		}
		return SyncStatus.Idle;
	}

	private computeConflictsSource(): SyncSource | null {
		const source = this.synchronisers.filter(s => s.status === SyncStatus.HasConflicts)[0];
		if (source) {
			if (source instanceof SettingsSynchroniser) {
				return SyncSource.Settings;
			}
		}
		return null;
	}

	private onDidChangeAuthTokenStatus(): void {
		if (this.authTokenService.status === AuthTokenStatus.Inactive) {
			this.stop();
		}
	}

}

export class UserDataAutoSync extends Disposable {

	private enabled: boolean = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IAuthTokenService private readonly authTokenService: IAuthTokenService,
	) {
		super();
		this.updateEnablement(false);
		this._register(Event.any<any>(authTokenService.onDidChangeStatus, userDataSyncService.onDidChangeStatus)(() => this.updateEnablement(true)));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('configurationSync.enable'))(() => this.updateEnablement(true)));

		// Sync immediately if there is a local change.
		this._register(Event.debounce(this.userDataSyncService.onDidChangeLocal, () => undefined, 500)(() => this.sync(false)));
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

	private async sync(loop: boolean): Promise<void> {
		if (this.enabled) {
			try {
				await this.userDataSyncService.sync();
			} catch (e) {
				this.logService.error(e);
			}
			if (loop) {
				await timeout(1000 * 5); // Loop sync for every 5s.
				this.sync(loop);
			}
		}
	}

	private isSyncEnabled(): boolean {
		return this.configurationService.getValue<boolean>('configurationSync.enable')
			&& this.userDataSyncService.status !== SyncStatus.Uninitialized
			&& this.authTokenService.status !== AuthTokenStatus.Inactive;
	}

}
