/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, IUserDataSyncStoreService, ISyncExtension } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

export class ExtensionsSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_EXTENSIONS_KEY: string = 'extensions';

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private readonly throttledDelayer: ThrottledDelayer<void>;
	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncExtensionsResource: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.lastSyncExtensionsResource = joinPath(this.environmentService.userRoamingDataHome, '.lastSyncExtensions');
		this.throttledDelayer = this._register(new ThrottledDelayer<void>(500));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.settingsResource))(() => this.throttledDelayer.trigger(() => this.onDidChangeSettings())));
	}

	private async onDidChangeSettings(): Promise<void> {
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(): Promise<boolean> {

		if (this.status !== SyncStatus.Idle) {
			return false;
		}

		this.setStatus(SyncStatus.Syncing);

		try {
			await this.doSync();
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncStoreError && e.code === UserDataSyncStoreErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Failed to Synchronise settings as there is a new remote version available. Synchronising again...');
				return this.sync();
			}
			if (e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Failed to Synchronise settings as there is a new local version available. Synchronising again...');
				return this.sync();
			}
			throw e;
		}
		return true;
	}

	private async doSync(): Promise<void> {
		const lastSyncData = await this.getLastSyncUserData();
		const remoteData = await this.userDataSyncStoreService.read(ExtensionsSynchroniser.EXTERNAL_USER_DATA_EXTENSIONS_KEY, lastSyncData);

		const lastSyncExtensions: ISyncExtension[] = lastSyncData ? JSON.parse(lastSyncData.content!) : null;
		const remoteExtensions: ISyncExtension[] = remoteData.content ? JSON.parse(remoteData.content) : null;
		const localExtensions = await this.getLocalExtensions();

		// First time sync to remote
		if (localExtensions && !remoteExtensions) {
			this.logService.trace('Settings Sync: Remote contents does not exist. So sync with settings file.');
			// Return local extensions
			return;
		}

		if (localExtensions && remoteExtensions) {
			const localToRemote = this.compare(localExtensions, remoteExtensions);
			if (localToRemote.added.length === 0 && localToRemote.removed.length === 0 && localToRemote.updated.length === 0) {
				// No changes found between local and remote.
				return;
			}

			const baseToLocal = lastSyncExtensions ? this.compare(lastSyncExtensions, localExtensions) : { added: localExtensions.map(({ identifier }) => identifier), removed: [], updated: [] };
			const baseToRemote = lastSyncExtensions ? this.compare(lastSyncExtensions, remoteExtensions) : { added: remoteExtensions.map(({ identifier }) => identifier), removed: [], updated: [] };

			// Locally added extensions
			for (const localAdded of baseToLocal.added) {
				// Got added in remote
				if (baseToRemote.added.some(added => areSameExtensions(added, localAdded))) {
					// Is different from local to remote
					if (localToRemote.updated.some(updated => areSameExtensions(updated, localAdded))) {
						// update it in local
					}
				} else {
					// add to remote
				}
			}

			// Remotely added extension
			for (const remoteAdded of baseToRemote.added) {
				// Got added in local
				if (baseToLocal.added.some(added => areSameExtensions(added, remoteAdded))) {
					// Is different from local to remote
					if (localToRemote.updated.some(updated => areSameExtensions(updated, remoteAdded))) {
						// update it in local
					}
				} else {
					// add to local
				}
			}

			// Locally updated extensions
			for (const localUpdated of baseToLocal.updated) {
				// If updated in remote
				if (baseToRemote.updated.some(updated => areSameExtensions(updated, localUpdated))) {
					// Is different from local to remote
					if (localToRemote.updated.some(updated => areSameExtensions(updated, localUpdated))) {
						// update it in local
					}
				}
			}

			// Remotely updated extensions
			for (const remoteUpdated of baseToRemote.updated) {
				// If updated in local
				if (baseToLocal.updated.some(updated => areSameExtensions(updated, remoteUpdated))) {
					// Is different from local to remote
					if (localToRemote.updated.some(updated => areSameExtensions(updated, remoteUpdated))) {
						// update it in local
					}
				}
			}

			// Locally removed extensions
			for (const localRemoved of baseToLocal.removed) {
				// If not updated in remote
				if (!baseToRemote.updated.some(updated => areSameExtensions(updated, localRemoved))) {
					// remove it from remote
				}
			}

			// Remote removed extensions
			for (const remoteRemoved of baseToRemote.removed) {
				// If not updated in local
				if (!baseToLocal.updated.some(updated => areSameExtensions(updated, remoteRemoved))) {
					// remove it from local
				}
			}

		}

	}

	private compare(from: ISyncExtension[], to: ISyncExtension[]): { added: IExtensionIdentifier[], removed: IExtensionIdentifier[], updated: IExtensionIdentifier[] } {
		const added = to.filter(toExtension => from.every(fromExtension => !areSameExtensions(fromExtension.identifier, toExtension.identifier))).map(({ identifier }) => identifier);
		const removed = from.filter(fromExtension => to.every(toExtension => !areSameExtensions(toExtension.identifier, fromExtension.identifier))).map(({ identifier }) => identifier);
		const updated: IExtensionIdentifier[] = [];

		for (const fromExtension of from) {
			if (removed.some(identifier => areSameExtensions(identifier, fromExtension.identifier))) {
				continue;
			}
			const toExtension = to.filter(e => areSameExtensions(e.identifier, fromExtension.identifier))[0];
			if (
				fromExtension.enabled !== toExtension.enabled
				|| fromExtension.version !== toExtension.version
			) {
				updated.push(fromExtension.identifier);
			}
		}

		return { added, removed, updated };
	}

	private async getLocalExtensions(): Promise<ISyncExtension[]> {
		const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
		return installedExtensions.map(({ identifier }) => ({ identifier, enabled: true }));
	}

	private async getLastSyncUserData(): Promise<IUserData | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncExtensionsResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	protected async writeToRemote(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(ExtensionsSynchroniser.EXTERNAL_USER_DATA_EXTENSIONS_KEY, content, ref);
	}

	protected async updateLastSyncValue(remoteUserData: IUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncExtensionsResource, VSBuffer.fromString(JSON.stringify(remoteUserData)));
	}

}
