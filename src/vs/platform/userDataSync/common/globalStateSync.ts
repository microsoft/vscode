/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { toFormattedString } from '../../../base/common/jsonFormatter.js';
import { isWeb } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IHeaders } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel, IAcceptResult, IMergeResult, IResourcePreview, isSyncData } from './abstractSynchronizer.js';
import { edit } from './content.js';
import { merge } from './globalStateMerge.js';
import { ALL_SYNC_RESOURCES, Change, createSyncHeaders, getEnablementKey, IGlobalState, IRemoteUserData, IStorageValue, ISyncData, IUserData, IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, SYNC_SERVICE_URL_TYPE, UserDataSyncError, UserDataSyncErrorCode, UserDataSyncStoreType, USER_DATA_SYNC_SCHEME } from './userDataSync.js';
import { UserDataSyncStoreClient } from './userDataSyncStoreService.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../userDataProfile/common/userDataProfileStorageService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';

const argvStoragePrefx = 'globalState.argv.';
const argvProperties: string[] = ['locale'];

type StorageKeys = { machine: string[]; user: string[]; unregistered: string[] };

interface IGlobalStateResourceMergeResult extends IAcceptResult {
	readonly local: { added: IStringDictionary<IStorageValue>; removed: string[]; updated: IStringDictionary<IStorageValue> };
	readonly remote: { added: string[]; removed: string[]; updated: string[]; all: IStringDictionary<IStorageValue> | null };
}

interface IGlobalStateResourcePreview extends IResourcePreview {
	readonly localUserData: IGlobalState;
	readonly previewResult: IGlobalStateResourceMergeResult;
	readonly storageKeys: StorageKeys;
}

export function stringify(globalState: IGlobalState, format: boolean): string {
	const storageKeys = globalState.storage ? Object.keys(globalState.storage).sort() : [];
	const storage: IStringDictionary<IStorageValue> = {};
	storageKeys.forEach(key => storage[key] = globalState.storage[key]);
	globalState.storage = storage;
	return format ? toFormattedString(globalState, {}) : JSON.stringify(globalState);
}

const GLOBAL_STATE_DATA_VERSION = 1;

/**
 * Synchronises global state that includes
 * 	- Global storage with user scope
 * 	- Locale from argv properties
 *
 * Global storage is synced without checking version just like other resources (settings, keybindings).
 * If there is a change in format of the value of a storage key which requires migration then
 * 		Owner of that key should remove that key from user scope and replace that with new user scoped key.
 */
export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = GLOBAL_STATE_DATA_VERSION;
	private readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'globalState.json');
	private readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	private readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	private readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	private readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	private readonly localGlobalStateProvider: LocalGlobalStateProvider;

	constructor(
		profile: IUserDataProfile,
		collection: string | undefined,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super({ syncResource: SyncResource.GlobalState, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
		this.localGlobalStateProvider = instantiationService.createInstance(LocalGlobalStateProvider);
		this._register(fileService.watch(this.extUri.dirname(this.environmentService.argvResource)));
		this._register(
			Event.any(
				/* Locale change */
				Event.filter(fileService.onDidFilesChange, e => e.contains(this.environmentService.argvResource)),
				Event.filter(userDataProfileStorageService.onDidChange, e => {
					/* StorageTarget has changed in profile storage */
					if (e.targetChanges.some(profile => this.syncResource.profile.id === profile.id)) {
						return true;
					}
					/* User storage data has changed in profile storage */
					if (e.valueChanges.some(({ profile, changes }) => this.syncResource.profile.id === profile.id && changes.some(change => change.target === StorageTarget.USER))) {
						return true;
					}
					return false;
				}),
			)((() => this.triggerLocalChange()))
		);
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean): Promise<IGlobalStateResourcePreview[]> {
		const remoteGlobalState: IGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;

		// Use remote data as last sync data if last sync data does not exist and remote data is from same machine
		lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
		const lastSyncGlobalState: IGlobalState | null = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;

		const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);

		if (remoteGlobalState) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
		}

		const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
		const { local, remote } = merge(localGlobalState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, storageKeys, this.logService);
		const previewResult: IGlobalStateResourceMergeResult = {
			content: null,
			local,
			remote,
			localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote.all !== null ? Change.Modified : Change.None,
		};

		const localContent = stringify(localGlobalState, false);
		return [{
			baseResource: this.baseResource,
			baseContent: lastSyncGlobalState ? stringify(lastSyncGlobalState, false) : localContent,
			localResource: this.localResource,
			localContent,
			localUserData: localGlobalState,
			remoteResource: this.remoteResource,
			remoteContent: remoteGlobalState ? stringify(remoteGlobalState, false) : null,
			previewResource: this.previewResource,
			previewResult,
			localChange: previewResult.localChange,
			remoteChange: previewResult.remoteChange,
			acceptedResource: this.acceptedResource,
			storageKeys
		}];
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSyncGlobalState: IGlobalState | null = lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
		if (lastSyncGlobalState === null) {
			return true;
		}
		const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
		const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
		const { remote } = merge(localGlobalState.storage, lastSyncGlobalState.storage, lastSyncGlobalState.storage, storageKeys, this.logService);
		return remote.all !== null;
	}

	protected async getMergeResult(resourcePreview: IGlobalStateResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return { ...resourcePreview.previewResult, hasConflicts: false };
	}

	protected async getAcceptResult(resourcePreview: IGlobalStateResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IGlobalStateResourceMergeResult> {

		/* Accept local resource */
		if (this.extUri.isEqual(resource, this.localResource)) {
			return this.acceptLocal(resourcePreview);
		}

		/* Accept remote resource */
		if (this.extUri.isEqual(resource, this.remoteResource)) {
			return this.acceptRemote(resourcePreview);
		}

		/* Accept preview resource */
		if (this.extUri.isEqual(resource, this.previewResource)) {
			return resourcePreview.previewResult;
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	private async acceptLocal(resourcePreview: IGlobalStateResourcePreview): Promise<IGlobalStateResourceMergeResult> {
		if (resourcePreview.remoteContent !== null) {
			const remoteGlobalState: IGlobalState = JSON.parse(resourcePreview.remoteContent);
			const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, remoteGlobalState.storage, resourcePreview.storageKeys, this.logService);
			return {
				content: resourcePreview.remoteContent,
				local,
				remote,
				localChange: Change.None,
				remoteChange: remote.all !== null ? Change.Modified : Change.None,
			};
		} else {
			return {
				content: resourcePreview.localContent,
				local: { added: {}, removed: [], updated: {} },
				remote: { added: Object.keys(resourcePreview.localUserData.storage), removed: [], updated: [], all: resourcePreview.localUserData.storage },
				localChange: Change.None,
				remoteChange: Change.Modified,
			};
		}
	}

	private async acceptRemote(resourcePreview: IGlobalStateResourcePreview): Promise<IGlobalStateResourceMergeResult> {
		if (resourcePreview.remoteContent !== null) {
			const remoteGlobalState: IGlobalState = JSON.parse(resourcePreview.remoteContent);
			const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, resourcePreview.localUserData.storage, resourcePreview.storageKeys, this.logService);
			return {
				content: resourcePreview.remoteContent,
				local,
				remote,
				localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
				remoteChange: Change.None,
			};
		} else {
			return {
				content: resourcePreview.remoteContent,
				local: { added: {}, removed: [], updated: {} },
				remote: { added: [], removed: [], updated: [], all: null },
				localChange: Change.None,
				remoteChange: Change.None,
			};
		}
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IGlobalStateResourcePreview, IGlobalStateResourceMergeResult][], force: boolean): Promise<void> {
		const { localUserData } = resourcePreviews[0][0];
		const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];

		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
		}

		if (localChange !== Change.None) {
			// update local
			this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
			await this.backupLocal(JSON.stringify(localUserData));
			await this.localGlobalStateProvider.writeLocalGlobalState(local, this.syncResource.profile);
			this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
		}

		if (remoteChange !== Change.None) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
			const content = JSON.stringify({ storage: remote.all });
			remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state.${remote.added.length ? ` Added: ${remote.added}.` : ''}${remote.updated.length ? ` Updated: ${remote.updated}.` : ''}${remote.removed.length ? ` Removed: ${remote.removed}.` : ''}`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
		}
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
		) {
			const content = await this.resolvePreviewContent(uri);
			return content ? stringify(JSON.parse(content), true) : content;
		}
		return null;
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const { storage } = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
			if (Object.keys(storage).length > 1 || storage[`${argvStoragePrefx}.locale`]?.value !== 'en') {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	private async getStorageKeys(lastSyncGlobalState: IGlobalState | null): Promise<StorageKeys> {
		const storageData = await this.userDataProfileStorageService.readStorageData(this.syncResource.profile);
		const user: string[] = [], machine: string[] = [];
		for (const [key, value] of storageData) {
			if (value.target === StorageTarget.USER) {
				user.push(key);
			} else if (value.target === StorageTarget.MACHINE) {
				machine.push(key);
			}
		}
		const registered = [...user, ...machine];
		const unregistered = lastSyncGlobalState?.storage ? Object.keys(lastSyncGlobalState.storage).filter(key => !key.startsWith(argvStoragePrefx) && !registered.includes(key) && storageData.get(key) !== undefined) : [];

		if (!isWeb) {
			// Following keys are synced only in web. Do not sync these keys in other platforms
			const keysSyncedOnlyInWeb = [...ALL_SYNC_RESOURCES.map(resource => getEnablementKey(resource)), SYNC_SERVICE_URL_TYPE];
			unregistered.push(...keysSyncedOnlyInWeb);
			machine.push(...keysSyncedOnlyInWeb);
		}

		return { user, machine, unregistered };
	}
}

export class LocalGlobalStateProvider {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService
	) { }

	async getLocalGlobalState(profile: IUserDataProfile): Promise<IGlobalState> {
		const storage: IStringDictionary<IStorageValue> = {};
		if (profile.isDefault) {
			const argvContent: string = await this.getLocalArgvContent();
			const argvValue: IStringDictionary<any> = parse(argvContent);
			for (const argvProperty of argvProperties) {
				if (argvValue[argvProperty] !== undefined) {
					storage[`${argvStoragePrefx}${argvProperty}`] = { version: 1, value: argvValue[argvProperty] };
				}
			}
		}
		const storageData = await this.userDataProfileStorageService.readStorageData(profile);
		for (const [key, value] of storageData) {
			if (value.value && value.target === StorageTarget.USER) {
				storage[key] = { version: 1, value: value.value };
			}
		}
		return { storage };
	}

	private async getLocalArgvContent(): Promise<string> {
		try {
			this.logService.debug('GlobalStateSync#getLocalArgvContent', this.environmentService.argvResource);
			const content = await this.fileService.readFile(this.environmentService.argvResource);
			this.logService.debug('GlobalStateSync#getLocalArgvContent - Resolved', this.environmentService.argvResource);
			return content.value.toString();
		} catch (error) {
			this.logService.debug(getErrorMessage(error));
		}
		return '{}';
	}

	async writeLocalGlobalState({ added, removed, updated }: { added: IStringDictionary<IStorageValue>; updated: IStringDictionary<IStorageValue>; removed: string[] }, profile: IUserDataProfile): Promise<void> {
		const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.GlobalState, profile);
		const argv: IStringDictionary<any> = {};
		const updatedStorage = new Map<string, string | undefined>();
		const storageData = await this.userDataProfileStorageService.readStorageData(profile);
		const handleUpdatedStorage = (keys: string[], storage?: IStringDictionary<IStorageValue>): void => {
			for (const key of keys) {
				if (key.startsWith(argvStoragePrefx)) {
					argv[key.substring(argvStoragePrefx.length)] = storage ? storage[key].value : undefined;
					continue;
				}
				if (storage) {
					const storageValue = storage[key];
					if (storageValue.value !== storageData.get(key)?.value) {
						updatedStorage.set(key, storageValue.value);
					}
				} else {
					if (storageData.get(key) !== undefined) {
						updatedStorage.set(key, undefined);
					}
				}
			}
		};
		handleUpdatedStorage(Object.keys(added), added);
		handleUpdatedStorage(Object.keys(updated), updated);
		handleUpdatedStorage(removed);

		if (Object.keys(argv).length) {
			this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
			const argvContent = await this.getLocalArgvContent();
			let content = argvContent;
			for (const argvProperty of Object.keys(argv)) {
				content = edit(content, [argvProperty], argv[argvProperty], {});
			}
			if (argvContent !== content) {
				this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
				await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
				this.logService.info(`${syncResourceLogLabel}: Updated locale.`);
			}
			this.logService.info(`${syncResourceLogLabel}: Updated locale`);
		}

		if (updatedStorage.size) {
			this.logService.trace(`${syncResourceLogLabel}: Updating global state...`);
			await this.userDataProfileStorageService.updateStorageData(profile, updatedStorage, StorageTarget.USER);
			this.logService.info(`${syncResourceLogLabel}: Updated global state`, [...updatedStorage.keys()]);
		}
	}
}

export class GlobalStateInitializer extends AbstractInitializer {

	constructor(
		@IStorageService storageService: IStorageService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(SyncResource.GlobalState, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
	}

	protected async doInitialize(remoteUserData: IRemoteUserData): Promise<void> {
		const remoteGlobalState: IGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
		if (!remoteGlobalState) {
			this.logService.info('Skipping initializing global state because remote global state does not exist.');
			return;
		}

		const argv: IStringDictionary<any> = {};
		const storage: IStringDictionary<any> = {};
		for (const key of Object.keys(remoteGlobalState.storage)) {
			if (key.startsWith(argvStoragePrefx)) {
				argv[key.substring(argvStoragePrefx.length)] = remoteGlobalState.storage[key].value;
			} else {
				if (this.storageService.get(key, StorageScope.PROFILE) === undefined) {
					storage[key] = remoteGlobalState.storage[key].value;
				}
			}
		}

		if (Object.keys(argv).length) {
			let content = '{}';
			try {
				const fileContent = await this.fileService.readFile(this.environmentService.argvResource);
				content = fileContent.value.toString();
			} catch (error) { }
			for (const argvProperty of Object.keys(argv)) {
				content = edit(content, [argvProperty], argv[argvProperty], {});
			}
			await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
		}

		if (Object.keys(storage).length) {
			const storageEntries: Array<IStorageEntry> = [];
			for (const key of Object.keys(storage)) {
				storageEntries.push({ key, value: storage[key], scope: StorageScope.PROFILE, target: StorageTarget.USER });
			}
			this.storageService.storeAll(storageEntries, true);
		}
	}

}

export class UserDataSyncStoreTypeSynchronizer {

	constructor(
		private readonly userDataSyncStoreClient: UserDataSyncStoreClient,
		@IStorageService private readonly storageService: IStorageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	getSyncStoreType(userData: IUserData): UserDataSyncStoreType | undefined {
		const remoteGlobalState = this.parseGlobalState(userData);
		return remoteGlobalState?.storage[SYNC_SERVICE_URL_TYPE]?.value as UserDataSyncStoreType;
	}

	async sync(userDataSyncStoreType: UserDataSyncStoreType): Promise<void> {
		const syncHeaders = createSyncHeaders(generateUuid());
		try {
			return await this.doSync(userDataSyncStoreType, syncHeaders);
		} catch (e) {
			if (e instanceof UserDataSyncError) {
				switch (e.code) {
					case UserDataSyncErrorCode.PreconditionFailed:
						this.logService.info(`Failed to synchronize UserDataSyncStoreType as there is a new remote version available. Synchronizing again...`);
						return this.doSync(userDataSyncStoreType, syncHeaders);
				}
			}
			throw e;
		}
	}

	private async doSync(userDataSyncStoreType: UserDataSyncStoreType, syncHeaders: IHeaders): Promise<void> {
		// Read the global state from remote
		const globalStateUserData = await this.userDataSyncStoreClient.readResource(SyncResource.GlobalState, null, undefined, syncHeaders);
		const remoteGlobalState = this.parseGlobalState(globalStateUserData) || { storage: {} };

		// Update the sync store type
		remoteGlobalState.storage[SYNC_SERVICE_URL_TYPE] = { value: userDataSyncStoreType, version: GLOBAL_STATE_DATA_VERSION };

		// Write the global state to remote
		const machineId = await getServiceMachineId(this.environmentService, this.fileService, this.storageService);
		const syncDataToUpdate: ISyncData = { version: GLOBAL_STATE_DATA_VERSION, machineId, content: stringify(remoteGlobalState, false) };
		await this.userDataSyncStoreClient.writeResource(SyncResource.GlobalState, JSON.stringify(syncDataToUpdate), globalStateUserData.ref, undefined, syncHeaders);
	}

	private parseGlobalState({ content }: IUserData): IGlobalState | null {
		if (!content) {
			return null;
		}
		const syncData = JSON.parse(content);
		if (isSyncData(syncData)) {
			return syncData ? JSON.parse(syncData.content) : null;
		}
		throw new Error('Invalid remote data');
	}

}
