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
import { keys, values } from 'vs/base/common/map';
import { startsWith } from 'vs/base/common/strings';
import { IFileService } from 'vs/platform/files/common/files';
import { Queue } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface ISyncPreviewResult {
	readonly added: ISyncExtension[];
	readonly removed: ISyncExtension[];
	readonly updated: ISyncExtension[];
	readonly remote: ISyncExtension[] | null;
}

export class ExtensionsSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_EXTENSIONS_KEY: string = 'extensions';

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncExtensionsResource: URI;
	private readonly replaceQueue: Queue<void>;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.replaceQueue = this._register(new Queue());
		this.lastSyncExtensionsResource = joinPath(environmentService.userRoamingDataHome, '.lastSyncExtensions');
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
		if (!this.configurationService.getValue<boolean>('configurationSync.enableExtensions')) {
			this.logService.trace('Extensions: Skipping synchronizing extensions as it is disabled.');
			return false;
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Extensions: Skipping synchronizing extensions as it is running already.');
			return false;
		}

		this.logService.trace('Extensions: Started synchronizing extensions...');
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

	removeExtension(identifier: IExtensionIdentifier): Promise<void> {
		return this.replaceQueue.queue(async () => {
			const remoteData = await this.userDataSyncStoreService.read(ExtensionsSynchroniser.EXTERNAL_USER_DATA_EXTENSIONS_KEY, null);
			const remoteExtensions: ISyncExtension[] = remoteData.content ? JSON.parse(remoteData.content) : [];
			const ignoredExtensions = this.configurationService.getValue<string[]>('configurationSync.extensionsToIgnore') || [];
			const removedExtensions = remoteExtensions.filter(e => !ignoredExtensions.some(id => areSameExtensions({ id }, e.identifier)) && areSameExtensions(e.identifier, identifier));
			if (removedExtensions.length) {
				for (const removedExtension of removedExtensions) {
					remoteExtensions.splice(remoteExtensions.indexOf(removedExtension), 1);
				}
				this.logService.info(`Extensions: Removing extension '${identifier.id}' from remote.`);
				await this.writeToRemote(remoteExtensions, remoteData.ref);
			}
		});
	}

	private async doSync(): Promise<void> {
		const lastSyncData = await this.getLastSyncUserData();
		let remoteData = await this.userDataSyncStoreService.read(ExtensionsSynchroniser.EXTERNAL_USER_DATA_EXTENSIONS_KEY, lastSyncData);

		const lastSyncExtensions: ISyncExtension[] = lastSyncData ? JSON.parse(lastSyncData.content!) : null;
		const remoteExtensions: ISyncExtension[] = remoteData.content ? JSON.parse(remoteData.content) : null;
		const localExtensions = await this.getLocalExtensions();

		this.logService.trace('Extensions: Merging remote extensions with local extensions...');
		const { added, removed, updated, remote } = this.merge(localExtensions, remoteExtensions, lastSyncExtensions);

		if (!added.length && !removed.length && !updated.length && !remote) {
			this.logService.trace('Extensions: No changes found during synchronizing extensions.');
		}

		if (added.length || removed.length || updated.length) {
			this.logService.info('Extensions: Updating local extensions...');
			await this.updateLocalExtensions(added, removed, updated);
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
			await this.updateLastSyncValue(remoteData);
		}
	}

	/**
	 * Merge Strategy:
	 * - If remote does not exist, merge with local (First time sync)
	 * - Overwrite local with remote changes. Removed, Added, Updated.
	 * - Update remote with those local extension which are newly added or updated or removed and untouched in remote.
	 */
	private merge(localExtensions: ISyncExtension[], remoteExtensions: ISyncExtension[] | null, lastSyncExtensions: ISyncExtension[] | null): { added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[], remote: ISyncExtension[] | null } {
		const ignoredExtensions = this.configurationService.getValue<string[]>('configurationSync.extensionsToIgnore') || [];
		// First time sync
		if (!remoteExtensions) {
			this.logService.info('Extensions: Remote extensions does not exist. Synchronizing extensions for the first time.');
			return { added: [], removed: [], updated: [], remote: localExtensions.filter(({ identifier }) => ignoredExtensions.some(id => id.toLowerCase() === identifier.id.toLowerCase())) };
		}

		const uuids: Map<string, string> = new Map<string, string>();
		const addUUID = (identifier: IExtensionIdentifier) => { if (identifier.uuid) { uuids.set(identifier.id.toLowerCase(), identifier.uuid); } };
		localExtensions.forEach(({ identifier }) => addUUID(identifier));
		remoteExtensions.forEach(({ identifier }) => addUUID(identifier));
		if (lastSyncExtensions) {
			lastSyncExtensions.forEach(({ identifier }) => addUUID(identifier));
		}

		const addExtensionToMap = (map: Map<string, ISyncExtension>, extension: ISyncExtension) => {
			const uuid = extension.identifier.uuid || uuids.get(extension.identifier.id.toLowerCase());
			const key = uuid ? `uuid:${uuid}` : `id:${extension.identifier.id.toLowerCase()}`;
			map.set(key, extension);
			return map;
		};
		const localExtensionsMap = localExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>());
		const remoteExtensionsMap = remoteExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>());
		const newRemoteExtensionsMap = remoteExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>());
		const lastSyncExtensionsMap = lastSyncExtensions ? lastSyncExtensions.reduce(addExtensionToMap, new Map<string, ISyncExtension>()) : null;
		const ignoredExtensionsSet = ignoredExtensions.reduce((set, id) => {
			const uuid = uuids.get(id.toLowerCase());
			return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
		}, new Set<string>());

		const localToRemote = this.compare(localExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet);
		if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
			// No changes found between local and remote.
			return { added: [], removed: [], updated: [], remote: null };
		}

		const added: ISyncExtension[] = [];
		const removed: IExtensionIdentifier[] = [];
		const updated: ISyncExtension[] = [];

		const baseToLocal = lastSyncExtensionsMap ? this.compare(lastSyncExtensionsMap, localExtensionsMap, ignoredExtensionsSet) : { added: keys(localExtensionsMap).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = lastSyncExtensionsMap ? this.compare(lastSyncExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet) : { added: keys(remoteExtensionsMap).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };

		const massageSyncExtension = (extension: ISyncExtension, key: string): ISyncExtension => {
			return {
				identifier: {
					id: extension.identifier.id,
					uuid: startsWith(key, 'uuid:') ? key.substring('uuid:'.length) : undefined
				},
				enabled: extension.enabled,
				version: extension.version
			};
		};

		// Remotely removed extension.
		for (const key of values(baseToRemote.removed)) {
			const e = localExtensionsMap.get(key);
			if (e) {
				removed.push(e.identifier);
			}
		}

		// Remotely added extension
		for (const key of values(baseToRemote.added)) {
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Is different from local to remote
				if (localToRemote.updated.has(key)) {
					updated.push(massageSyncExtension(remoteExtensionsMap.get(key)!, key));
				}
			} else {
				// Add to local
				added.push(massageSyncExtension(remoteExtensionsMap.get(key)!, key));
			}
		}

		// Remotely updated extensions
		for (const key of values(baseToRemote.updated)) {
			// If updated in local
			if (baseToLocal.updated.has(key)) {
				// Is different from local to remote
				if (localToRemote.updated.has(key)) {
					// update it in local
					updated.push(massageSyncExtension(remoteExtensionsMap.get(key)!, key));
				}
			}
		}

		// Locally added extensions
		for (const key of values(baseToLocal.added)) {
			// Not there in remote
			if (!baseToRemote.added.has(key)) {
				newRemoteExtensionsMap.set(key, massageSyncExtension(localExtensionsMap.get(key)!, key));
			}
		}

		// Locally updated extensions
		for (const key of values(baseToLocal.updated)) {
			// If removed in remote
			if (baseToRemote.removed.has(key)) {
				continue;
			}

			// If not updated in remote
			if (!baseToRemote.updated.has(key)) {
				newRemoteExtensionsMap.set(key, massageSyncExtension(localExtensionsMap.get(key)!, key));
			}
		}

		// Locally removed extensions
		for (const key of values(baseToLocal.removed)) {
			// If not updated in remote
			if (!baseToRemote.updated.has(key)) {
				newRemoteExtensionsMap.delete(key);
			}
		}

		const remoteChanges = this.compare(remoteExtensionsMap, newRemoteExtensionsMap, new Set<string>());
		const remote = remoteChanges.added.size > 0 || remoteChanges.updated.size > 0 || remoteChanges.removed.size > 0 ? values(newRemoteExtensionsMap) : null;
		return { added, removed, updated, remote };
	}

	private compare(from: Map<string, ISyncExtension>, to: Map<string, ISyncExtension>, ignoredExtensions: Set<string>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
		const fromKeys = keys(from).filter(key => !ignoredExtensions.has(key));
		const toKeys = keys(to).filter(key => !ignoredExtensions.has(key));
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const fromExtension = from.get(key)!;
			const toExtension = to.get(key);
			if (!toExtension
				|| fromExtension.enabled !== toExtension.enabled
				|| fromExtension.version !== toExtension.version
			) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

	private async updateLocalExtensions(added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[]): Promise<void> {
		if (removed.length) {
			const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
			const extensionsToRemove = installedExtensions.filter(({ identifier }) => removed.some(r => areSameExtensions(identifier, r)));
			await Promise.all(extensionsToRemove.map(e => {
				this.logService.info('Extensions: Removing local extension.', e.identifier.id);
				return this.extensionManagementService.uninstall(e);
			}));
		}

		if (added.length || updated.length) {
			await Promise.all([...added, ...updated].map(async e => {
				const extension = await this.extensionGalleryService.getCompatibleExtension(e.identifier, e.version);
				if (extension) {
					this.logService.info('Extensions: Installing local extension.', e.identifier.id, extension.version);
					await this.extensionManagementService.installFromGallery(extension);
				}
			}));
		}
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

	private async writeToRemote(extensions: ISyncExtension[], ref: string | null): Promise<IUserData> {
		const content = JSON.stringify(extensions);
		ref = await this.userDataSyncStoreService.write(ExtensionsSynchroniser.EXTERNAL_USER_DATA_EXTENSIONS_KEY, content, ref);
		return { content, ref };
	}

	private async updateLastSyncValue(remoteUserData: IUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncExtensionsResource, VSBuffer.fromString(JSON.stringify(remoteUserData)));
	}

}
