/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, IUserDataSyncStoreService, ISyncExtension, IUserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IFileService } from 'vs/platform/files/common/files';
import { Queue } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { merge } from 'vs/platform/userDataSync/common/extensionsMerge';

export class LocalizationSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_LOCALIZATION_KEY: string = 'localization';

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncExtensionsResource: URI;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.lastSyncExtensionsResource = joinPath(environmentService.userRoamingDataHome, '.lastSyncLocalization');
		this._register(
			Event.debounce(
				Event.any(
					Event.filter(this.extensionManagementService.onDidInstallExtension, (e => !!e.gallery)),
					Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error))),
				() => undefined, 500)(() => this._onDidChangeLocal.fire()));
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('sync.enableLocale')) {
			this.logService.trace('Extensions: Skipping synchronizing locale as it is disabled.');
			return false;
		}
		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Extensions: Skipping synchronizing locale as it is running already.');
			return false;
		}

		this.logService.trace('Extensions: Started synchronizing locale...');
		this.setStatus(SyncStatus.Syncing);

		try {
			await this.doSync();
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncStoreError && e.code === UserDataSyncStoreErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Extensions: Failed to synchronise extensions as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}

		this.logService.trace('Extensions: Finised synchronizing extensions.');
		this.setStatus(SyncStatus.Idle);
		return true;
	}

	stop(): void { }

	private async doSync(): Promise<void> {
		const lastSyncData = await this.getLastSyncUserData();
		const lastSyncExtensions: ISyncExtension[] | null = lastSyncData ? JSON.parse(lastSyncData.content!) : null;
		let skippedExtensions: ISyncExtension[] = lastSyncData ? lastSyncData.skippedExtensions || [] : [];

		let remoteData = await this.userDataSyncStoreService.read(ExtensionsSynchroniser.EXTERNAL_USER_DATA_LOCALIZATION_KEY, lastSyncData);
		const remoteExtensions: ISyncExtension[] = remoteData.content ? JSON.parse(remoteData.content) : null;

		const localExtensions = await this.getLocalExtensions();

		if (remoteExtensions) {
			this.logService.trace('Extensions: Merging remote extensions with local extensions...');
		} else {
			this.logService.info('Extensions: Remote extensions does not exist. Synchronizing extensions for the first time.');
		}

		const ignoredExtensions = this.configurationService.getValue<string[]>('sync.ignoredExtensions') || [];
		const { added, removed, updated, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions);

		if (!added.length && !removed.length && !updated.length && !remote) {
			this.logService.trace('Extensions: No changes found during synchronizing extensions.');
		}

		if (added.length || removed.length || updated.length) {
			this.logService.info('Extensions: Updating local extensions...');
			skippedExtensions = await this.updateLocalExtensions(added, removed, updated, skippedExtensions);
		}

		if (remote) {
			// update remote
			this.logService.info('Extensions: Updating remote extensions...');
			remoteData = await this.writeToRemote(remote, remoteData.ref);
		}

		if (remoteData.content
			&& (!lastSyncData || lastSyncData.ref !== remoteData.ref)
		) {
			// update last sync
			this.logService.info('Extensions: Updating last synchronised extensions...');
			await this.updateLastSyncValue({ ...remoteData, skippedExtensions });
		}
	}

	private async getLocalExtensions(): Promise<ISyncExtension[]> {
		const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
		return installedExtensions
			.map(({ identifier }) => ({ identifier, enabled: true }));
	}

	private async getLastSyncUserData(): Promise<ILastSyncUserData | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncExtensionsResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	private async updateLastSyncValue(lastSyncUserData: ILastSyncUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncExtensionsResource, VSBuffer.fromString(JSON.stringify(lastSyncUserData)));
	}

	private async writeToRemote(extensions: ISyncExtension[], ref: string | null): Promise<IUserData> {
		const content = JSON.stringify(extensions);
		ref = await this.userDataSyncStoreService.write(ExtensionsSynchroniser.EXTERNAL_USER_DATA_LOCALIZATION_KEY, content, ref);
		return { content, ref };
	}

}
