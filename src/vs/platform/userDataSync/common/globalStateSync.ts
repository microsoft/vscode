/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState, SyncResource, IUserDataSynchroniser, IUserDataSyncEnablementService, IUserDataSyncBackupStoreService, ISyncResourceHandle, IStorageValue, ISyncPreviewResult } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { dirname, joinPath, basename } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IStringDictionary } from 'vs/base/common/collections';
import { edit } from 'vs/platform/userDataSync/common/content';
import { merge } from 'vs/platform/userDataSync/common/globalStateMerge';
import { parse } from 'vs/base/common/json';
import { AbstractSynchroniser, IRemoteUserData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IStorageKeysSyncRegistryService, IStorageKey } from 'vs/platform/userDataSync/common/storageKeys';
import { equals } from 'vs/base/common/arrays';

const argvStoragePrefx = 'globalState.argv.';
const argvProperties: string[] = ['locale'];

interface IGlobalSyncPreviewResult extends ISyncPreviewResult {
	readonly local: { added: IStringDictionary<IStorageValue>, removed: string[], updated: IStringDictionary<IStorageValue> };
	readonly remote: IStringDictionary<IStorageValue> | null;
	readonly skippedStorageKeys: string[];
	readonly localUserData: IGlobalState;
	readonly remoteUserData: IRemoteUserData;
	readonly lastSyncUserData: ILastSyncUserData | null;
}

interface ILastSyncUserData extends IRemoteUserData {
	skippedStorageKeys: string[] | undefined;
}

export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IStorageKeysSyncRegistryService private readonly storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super(SyncResource.GlobalState, fileService, environmentService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService);
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(
			Event.any(
				/* Locale change */
				Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.environmentService.argvResource)),
				/* Storage change */
				Event.filter(this.storageService.onDidChangeStorage, e => storageKeysSyncRegistryService.storageKeys.some(({ key }) => e.key === key)),
				/* Storage key registered */
				this.storageKeysSyncRegistryService.onDidChangeStorageKeys
			)((() => this._onDidChangeLocal.fire()))
		);
	}

	async pull(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pulling ui state as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pulling ui state...`);
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.syncData !== null) {
				const localGlobalState = await this.getLocalGlobalState();
				const remoteGlobalState: IGlobalState = JSON.parse(remoteUserData.syncData.content);
				const { local, remote, skipped } = merge(localGlobalState.storage, remoteGlobalState.storage, null, this.getSyncStorageKeys(), lastSyncUserData?.skippedStorageKeys || [], this.logService);
				await this.apply({
					local, remote, remoteUserData, localUserData: localGlobalState, lastSyncUserData,
					skippedStorageKeys: skipped,
					hasLocalChanged: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0,
					hasRemoteChanged: remote !== null
				});
			}

			// No remote exists to pull
			else {
				this.logService.info(`${this.syncResourceLogLabel}: Remote UI state does not exist.`);
			}

			this.logService.info(`${this.syncResourceLogLabel}: Finished pulling UI state.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pushing UI State as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pushing UI State...`);
			this.setStatus(SyncStatus.Syncing);

			const localUserData = await this.getLocalGlobalState();
			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			await this.apply({
				local: { added: {}, removed: [], updated: {} }, remote: localUserData.storage, remoteUserData, localUserData, lastSyncUserData,
				skippedStorageKeys: [],
				hasLocalChanged: false,
				hasRemoteChanged: true
			}, true);

			this.logService.info(`${this.syncResourceLogLabel}: Finished pushing UI State.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async stop(): Promise<void> { }

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI, comparableResource?: URI }[]> {
		return [{ resource: joinPath(uri, 'globalState.json') }];
	}

	async resolveContent(uri: URI): Promise<string | null> {
		let content = await super.resolveContent(uri);
		if (content) {
			return content;
		}
		content = await super.resolveContent(dirname(uri));
		if (content) {
			const syncData = this.parseSyncData(content);
			if (syncData) {
				switch (basename(uri)) {
					case 'globalState.json':
						const edits = format(syncData.content, undefined, {});
						return applyEdits(syncData.content, edits);
				}
			}
		}
		return null;
	}

	async acceptConflict(conflict: URI, content: string): Promise<void> {
		throw new Error(`${this.syncResourceLogLabel}: Conflicts should not occur`);
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const { storage } = await this.getLocalGlobalState();
			if (Object.keys(storage).length > 1 || storage[`${argvStoragePrefx}.locale`]?.value !== 'en') {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	protected async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<SyncStatus> {
		const result = await this.generatePreview(remoteUserData, lastSyncUserData);
		await this.apply(result);
		return SyncStatus.Idle;
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<IGlobalSyncPreviewResult> {
		const remoteGlobalState: IGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
		const lastSyncGlobalState: IGlobalState = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;

		const localGloablState = await this.getLocalGlobalState();

		if (remoteGlobalState) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
		}

		const { local, remote, skipped } = merge(localGloablState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, this.getSyncStorageKeys(), lastSyncUserData?.skippedStorageKeys || [], this.logService);

		return {
			local, remote, remoteUserData, localUserData: localGloablState, lastSyncUserData,
			skippedStorageKeys: skipped,
			hasLocalChanged: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0,
			hasRemoteChanged: remote !== null
		};
	}

	private async apply({ local, remote, remoteUserData, lastSyncUserData, localUserData, hasLocalChanged, hasRemoteChanged, skippedStorageKeys }: IGlobalSyncPreviewResult, forcePush?: boolean): Promise<void> {

		if (!hasLocalChanged && !hasRemoteChanged) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
		}

		if (hasLocalChanged) {
			// update local
			this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
			await this.backupLocal(JSON.stringify(localUserData));
			await this.writeLocalGlobalState(local);
			this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
		}

		if (hasRemoteChanged) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
			const content = JSON.stringify(<IGlobalState>{ storage: remote });
			remoteUserData = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref || !equals(lastSyncUserData.skippedStorageKeys, skippedStorageKeys)) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
			await this.updateLastSyncUserData(remoteUserData, { skippedStorageKeys });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
		}
	}

	private async getLocalGlobalState(): Promise<IGlobalState> {
		const storage: IStringDictionary<IStorageValue> = {};
		const argvContent: string = await this.getLocalArgvContent();
		const argvValue: IStringDictionary<any> = parse(argvContent);
		for (const argvProperty of argvProperties) {
			if (argvValue[argvProperty] !== undefined) {
				storage[`${argvStoragePrefx}${argvProperty}`] = { version: 1, value: argvValue[argvProperty] };
			}
		}
		for (const { key, version } of this.storageKeysSyncRegistryService.storageKeys) {
			const value = this.storageService.get(key, StorageScope.GLOBAL);
			if (value) {
				storage[key] = { version, value };
			}
		}
		return { storage };
	}

	private async getLocalArgvContent(): Promise<string> {
		try {
			const content = await this.fileService.readFile(this.environmentService.argvResource);
			return content.value.toString();
		} catch (error) { }
		return '{}';
	}

	private async writeLocalGlobalState({ added, removed, updated }: { added: IStringDictionary<IStorageValue>, updated: IStringDictionary<IStorageValue>, removed: string[] }): Promise<void> {
		const argv: IStringDictionary<any> = {};
		const updatedStorage: IStringDictionary<any> = {};
		const handleUpdatedStorage = (keys: string[], storage?: IStringDictionary<IStorageValue>): void => {
			for (const key of keys) {
				if (key.startsWith(argvStoragePrefx)) {
					argv[key.substring(argvStoragePrefx.length)] = storage ? storage[key].value : undefined;
					continue;
				}
				if (storage) {
					const storageValue = storage[key];
					if (storageValue.value !== String(this.storageService.get(key, StorageScope.GLOBAL))) {
						updatedStorage[key] = storageValue.value;
					}
				} else {
					if (this.storageService.get(key, StorageScope.GLOBAL) !== undefined) {
						updatedStorage[key] = undefined;
					}
				}
			}
		};
		handleUpdatedStorage(Object.keys(added), added);
		handleUpdatedStorage(Object.keys(updated), updated);
		handleUpdatedStorage(removed);
		if (Object.keys(argv).length) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating locale...`);
			await this.updateArgv(argv);
			this.logService.info(`${this.syncResourceLogLabel}: Updated locale`);
		}
		const updatedStorageKeys: string[] = Object.keys(updatedStorage);
		if (updatedStorageKeys.length) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating global state...`);
			for (const key of Object.keys(updatedStorage)) {
				this.storageService.store(key, updatedStorage[key], StorageScope.GLOBAL);
			}
			this.logService.info(`${this.syncResourceLogLabel}: Updated global state`, Object.keys(updatedStorage));
		}
	}

	private async updateArgv(argv: IStringDictionary<any>): Promise<void> {
		const argvContent = await this.getLocalArgvContent();
		let content = argvContent;
		for (const argvProperty of Object.keys(argv)) {
			content = edit(content, [argvProperty], argv[argvProperty], {});
		}
		if (argvContent !== content) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating locale...`);
			await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
			this.logService.info(`${this.syncResourceLogLabel}: Updated locale.`);
		}
	}

	private getSyncStorageKeys(): IStorageKey[] {
		return [...this.storageKeysSyncRegistryService.storageKeys, ...argvProperties.map(argvProprety => (<IStorageKey>{ key: `${argvStoragePrefx}${argvProprety}`, version: 1 }))];
	}
}
