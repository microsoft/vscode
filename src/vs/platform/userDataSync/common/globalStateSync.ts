/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState, SyncResource, IUserDataSynchroniser, IUserDataSyncResourceEnablementService,
	IUserDataSyncBackupStoreService, ISyncResourceHandle, IStorageValue, USER_DATA_SYNC_SCHEME, IRemoteUserData, ISyncData, IResourcePreview
} from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { dirname, joinPath, basename, isEqual } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IStringDictionary } from 'vs/base/common/collections';
import { edit } from 'vs/platform/userDataSync/common/content';
import { merge, IMergeResult } from 'vs/platform/userDataSync/common/globalStateMerge';
import { parse } from 'vs/base/common/json';
import { AbstractSynchroniser, ISyncResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IStorageKeysSyncRegistryService, IStorageKey } from 'vs/platform/userDataSync/common/storageKeys';
import { equals } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';

const argvStoragePrefx = 'globalState.argv.';
const argvProperties: string[] = ['locale'];

interface IGlobalStateSyncPreview extends ISyncResourcePreview {
	readonly local: { added: IStringDictionary<IStorageValue>, removed: string[], updated: IStringDictionary<IStorageValue> };
	readonly remote: IStringDictionary<IStorageValue> | null;
	readonly skippedStorageKeys: string[];
	readonly localUserData: IGlobalState;
	readonly lastSyncUserData: ILastSyncUserData | null;
}

interface ILastSyncUserData extends IRemoteUserData {
	skippedStorageKeys: string[] | undefined;
}

export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	private static readonly GLOBAL_STATE_DATA_URI = URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'globalState', path: `/current.json` });
	protected readonly version: number = 1;
	private readonly localPreviewResource: URI = joinPath(this.syncPreviewFolder, 'globalState.json');
	private readonly remotePreviewResource: URI = this.localPreviewResource.with({ scheme: USER_DATA_SYNC_SCHEME });

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncResourceEnablementService userDataSyncResourceEnablementService: IUserDataSyncResourceEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IStorageKeysSyncRegistryService private readonly storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super(SyncResource.GlobalState, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncResourceEnablementService, telemetryService, logService, configurationService);
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(
			Event.any(
				/* Locale change */
				Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.environmentService.argvResource)),
				/* Storage change */
				Event.filter(this.storageService.onDidChangeStorage, e => storageKeysSyncRegistryService.storageKeys.some(({ key }) => e.key === key)),
				/* Storage key registered */
				this.storageKeysSyncRegistryService.onDidChangeStorageKeys
			)((() => this.triggerLocalChange()))
		);
	}

	protected async generatePullPreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null, token: CancellationToken): Promise<IGlobalStateSyncPreview> {
		const localGlobalState = await this.getLocalGlobalState();
		if (remoteUserData.syncData !== null) {
			const remoteGlobalState: IGlobalState = JSON.parse(remoteUserData.syncData.content);
			const mergeResult = merge(localGlobalState.storage, remoteGlobalState.storage, null, this.getSyncStorageKeys(), lastSyncUserData?.skippedStorageKeys || [], this.logService);
			const { local, remote, skipped } = mergeResult;
			const resourcePreviews: IResourcePreview[] = this.getResourcePreviews(mergeResult);
			return {
				remoteUserData, lastSyncUserData,
				local, remote, localUserData: localGlobalState, skippedStorageKeys: skipped,
				hasLocalChanged: resourcePreviews.some(({ hasLocalChanged }) => hasLocalChanged),
				hasRemoteChanged: resourcePreviews.some(({ hasRemoteChanged }) => hasRemoteChanged),
				hasConflicts: false,
				isLastSyncFromCurrentMachine: false,
				resourcePreviews
			};
		} else {
			return {
				remoteUserData, lastSyncUserData,
				local: { added: {}, removed: [], updated: {} }, remote: null, localUserData: localGlobalState, skippedStorageKeys: [],
				hasLocalChanged: false,
				hasRemoteChanged: false,
				hasConflicts: false,
				isLastSyncFromCurrentMachine: false,
				resourcePreviews: []
			};
		}
	}

	protected async generatePushPreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null, token: CancellationToken): Promise<IGlobalStateSyncPreview> {
		const localUserData = await this.getLocalGlobalState();
		return {
			local: { added: {}, removed: [], updated: {} }, remote: localUserData.storage, remoteUserData, localUserData, lastSyncUserData,
			skippedStorageKeys: [],
			hasLocalChanged: false,
			hasRemoteChanged: true,
			isLastSyncFromCurrentMachine: false,
			hasConflicts: false,
			resourcePreviews: this.getResourcePreviews({ local: { added: {}, removed: [], updated: {} }, remote: localUserData.storage, skipped: [] })
		};
	}

	protected async generateReplacePreview(syncData: ISyncData, remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<IGlobalStateSyncPreview> {
		const localUserData = await this.getLocalGlobalState();
		const syncGlobalState: IGlobalState = JSON.parse(syncData.content);
		const mergeResult = merge(localUserData.storage, syncGlobalState.storage, localUserData.storage, this.getSyncStorageKeys(), lastSyncUserData?.skippedStorageKeys || [], this.logService);
		const { local, skipped } = mergeResult;
		const resourcePreviews: IResourcePreview[] = this.getResourcePreviews(mergeResult);
		return {
			local, remote: syncGlobalState.storage, remoteUserData, localUserData, lastSyncUserData,
			skippedStorageKeys: skipped,
			hasLocalChanged: resourcePreviews.some(({ hasLocalChanged }) => hasLocalChanged),
			hasRemoteChanged: true,
			isLastSyncFromCurrentMachine: false,
			hasConflicts: false,
			resourcePreviews: [],
		};
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null, token: CancellationToken): Promise<IGlobalStateSyncPreview> {
		const remoteGlobalState: IGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
		const isLastSyncFromCurrentMachine = await this.isLastSyncFromCurrentMachine(remoteUserData);
		let lastSyncGlobalState: IGlobalState | null = null;
		if (lastSyncUserData === null) {
			if (isLastSyncFromCurrentMachine) {
				lastSyncGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
			}
		} else {
			lastSyncGlobalState = lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
		}

		const localGloablState = await this.getLocalGlobalState();

		if (remoteGlobalState) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
		}

		const mergeResult = merge(localGloablState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, this.getSyncStorageKeys(), lastSyncUserData?.skippedStorageKeys || [], this.logService);
		const { local, remote, skipped } = mergeResult;
		const resourcePreviews: IResourcePreview[] = this.getResourcePreviews(mergeResult);

		return {
			local, remote, remoteUserData, localUserData: localGloablState, lastSyncUserData,
			skippedStorageKeys: skipped,
			hasLocalChanged: resourcePreviews.some(({ hasLocalChanged }) => hasLocalChanged),
			hasRemoteChanged: resourcePreviews.some(({ hasRemoteChanged }) => hasRemoteChanged),
			isLastSyncFromCurrentMachine,
			hasConflicts: false,
			resourcePreviews
		};
	}

	protected async updatePreviewWithConflict(preview: IGlobalStateSyncPreview, conflictResource: URI, content: string, token: CancellationToken): Promise<IGlobalStateSyncPreview> {
		throw new Error(`${this.syncResourceLogLabel}: Conflicts should not occur`);
	}

	protected async applyPreview({ local, remote, remoteUserData, lastSyncUserData, localUserData, hasLocalChanged, hasRemoteChanged, skippedStorageKeys }: IGlobalStateSyncPreview, forcePush: boolean): Promise<void> {

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

	private getResourcePreviews({ local, remote }: IMergeResult): IResourcePreview[] {
		const hasLocalChanged = Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0;
		const hasRemoteChanged = remote !== null;
		return [{
			hasLocalChanged,
			hasConflicts: false,
			hasRemoteChanged,
			localResouce: GlobalStateSynchroniser.GLOBAL_STATE_DATA_URI,
			remoteResource: this.remotePreviewResource
		}];
	}

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI, comparableResource?: URI }[]> {
		return [{ resource: joinPath(uri, 'globalState.json'), comparableResource: GlobalStateSynchroniser.GLOBAL_STATE_DATA_URI }];
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (isEqual(uri, GlobalStateSynchroniser.GLOBAL_STATE_DATA_URI)) {
			const localGlobalState = await this.getLocalGlobalState();
			return this.format(localGlobalState);
		}

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
						return this.format(JSON.parse(syncData.content));
				}
			}
		}

		return null;
	}

	private format(globalState: IGlobalState): string {
		const storageKeys = Object.keys(globalState.storage).sort();
		const storage: IStringDictionary<IStorageValue> = {};
		storageKeys.forEach(key => storage[key] = globalState.storage[key]);
		globalState.storage = storage;
		const content = JSON.stringify(globalState);
		const edits = format(content, undefined, {});
		return applyEdits(content, edits);
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
