/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, MutableDisposable, isDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IStorage, IStorageDatabase, Storage } from '../../../base/parts/storage/common/storage.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AbstractStorageService, IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget, isProfileUsingDefaultStorage } from '../../storage/common/storage.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IRemoteService } from '../../ipc/common/services.js';
import { ILogService } from '../../log/common/log.js';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient } from '../../storage/common/storageIpc.js';
import { IUserDataProfile, IUserDataProfilesService, reviveProfile } from './userDataProfile.js';

export interface IProfileStorageValueChanges {
	readonly profile: IUserDataProfile;
	readonly changes: IStorageValueChangeEvent[];
}

export interface IProfileStorageChanges {
	readonly targetChanges: IUserDataProfile[];
	readonly valueChanges: IProfileStorageValueChanges[];
}

export interface IStorageValue {
	readonly value: string | undefined;
	readonly target: StorageTarget;
}

export const IUserDataProfileStorageService = createDecorator<IUserDataProfileStorageService>('IUserDataProfileStorageService');
export interface IUserDataProfileStorageService {
	readonly _serviceBrand: undefined;

	/**
	 * Emitted whenever data is updated or deleted in a profile storage or target of a profile storage entry changes
	 */
	readonly onDidChange: Event<IProfileStorageChanges>;

	/**
	 * Return the requested profile storage data
	 * @param profile The profile from which the data has to be read from
	 */
	readStorageData(profile: IUserDataProfile): Promise<Map<string, IStorageValue>>;

	/**
	 * Update the given profile storage data in the profile storage
	 * @param profile The profile to which the data has to be written to
	 * @param data Data that has to be updated
	 * @param target Storage target of the data
	 */
	updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void>;

	/**
	 * Calls a function with a storage service scoped to given profile.
	 */
	withProfileScopedStorageService<T>(profile: IUserDataProfile, fn: (storageService: IStorageService) => Promise<T>): Promise<T>;
}

export abstract class AbstractUserDataProfileStorageService extends Disposable implements IUserDataProfileStorageService {

	_serviceBrand: undefined;

	readonly abstract onDidChange: Event<IProfileStorageChanges>;

	private readonly storageServicesMap: DisposableMap<string, StorageService> | undefined;

	constructor(
		persistStorages: boolean,
		@IStorageService protected readonly storageService: IStorageService
	) {
		super();
		if (persistStorages) {
			this.storageServicesMap = this._register(new DisposableMap<string, StorageService>());
		}
	}

	async readStorageData(profile: IUserDataProfile): Promise<Map<string, IStorageValue>> {
		return this.withProfileScopedStorageService(profile, async storageService => this.getItems(storageService));
	}

	async updateStorageData(profile: IUserDataProfile, data: Map<string, string | undefined | null>, target: StorageTarget): Promise<void> {
		return this.withProfileScopedStorageService(profile, async storageService => this.writeItems(storageService, data, target));
	}

	async withProfileScopedStorageService<T>(profile: IUserDataProfile, fn: (storageService: IStorageService) => Promise<T>): Promise<T> {
		if (this.storageService.hasScope(profile)) {
			return fn(this.storageService);
		}

		let storageService = this.storageServicesMap?.get(profile.id);
		if (!storageService) {
			storageService = new StorageService(this.createStorageDatabase(profile));
			this.storageServicesMap?.set(profile.id, storageService);

			try {
				await storageService.initialize();
			} catch (error) {
				if (this.storageServicesMap?.has(profile.id)) {
					this.storageServicesMap.deleteAndDispose(profile.id);
				} else {
					storageService.dispose();
				}
				throw error;
			}
		}
		try {
			const result = await fn(storageService);
			await storageService.flush();
			return result;
		} finally {
			if (!this.storageServicesMap?.has(profile.id)) {
				storageService.dispose();
			}
		}
	}

	private getItems(storageService: IStorageService): Map<string, IStorageValue> {
		const result = new Map<string, IStorageValue>();
		const populate = (target: StorageTarget) => {
			for (const key of storageService.keys(StorageScope.PROFILE, target)) {
				result.set(key, { value: storageService.get(key, StorageScope.PROFILE), target });
			}
		};
		populate(StorageTarget.USER);
		populate(StorageTarget.MACHINE);
		return result;
	}

	private writeItems(storageService: IStorageService, items: Map<string, string | undefined | null>, target: StorageTarget): void {
		storageService.storeAll(Array.from(items.entries()).map(([key, value]) => ({ key, value, scope: StorageScope.PROFILE, target })), true);
	}

	protected abstract createStorageDatabase(profile: IUserDataProfile): Promise<IStorageDatabase>;
}

export class RemoteUserDataProfileStorageService extends AbstractUserDataProfileStorageService implements IUserDataProfileStorageService {

	private readonly _onDidChange: Emitter<IProfileStorageChanges>;
	readonly onDidChange: Event<IProfileStorageChanges>;

	constructor(
		persistStorages: boolean,
		private readonly remoteService: IRemoteService,
		userDataProfilesService: IUserDataProfilesService,
		storageService: IStorageService,
		logService: ILogService,
	) {
		super(persistStorages, storageService);

		const channel = remoteService.getChannel('profileStorageListener');
		const disposable = this._register(new MutableDisposable());
		this._onDidChange = this._register(new Emitter<IProfileStorageChanges>({
			// Start listening to profile storage changes only when someone is listening
			onWillAddFirstListener: () => {
				disposable.value = channel.listen<IProfileStorageChanges>('onDidChange')(e => {
					logService.trace('profile storage changes', e);
					this._onDidChange.fire({
						targetChanges: e.targetChanges.map(profile => reviveProfile(profile, userDataProfilesService.profilesHome.scheme)),
						valueChanges: e.valueChanges.map(e => ({ ...e, profile: reviveProfile(e.profile, userDataProfilesService.profilesHome.scheme) }))
					});
				});
			},
			// Stop listening to profile storage changes when no one is listening
			onDidRemoveLastListener: () => disposable.value = undefined
		}));
		this.onDidChange = this._onDidChange.event;
	}

	protected async createStorageDatabase(profile: IUserDataProfile): Promise<IStorageDatabase> {
		const storageChannel = this.remoteService.getChannel('storage');
		return isProfileUsingDefaultStorage(profile) ? new ApplicationStorageDatabaseClient(storageChannel) : new ProfileStorageDatabaseClient(storageChannel, profile);
	}
}

class StorageService extends AbstractStorageService {

	private profileStorage: IStorage | undefined;

	constructor(private readonly profileStorageDatabase: Promise<IStorageDatabase>) {
		super({ flushInterval: 100 });
	}

	protected async doInitialize(): Promise<void> {
		const profileStorageDatabase = await this.profileStorageDatabase;
		const profileStorage = new Storage(profileStorageDatabase);
		this._register(profileStorage.onDidChangeStorage(e => {
			this.emitDidChangeValue(StorageScope.PROFILE, e);
		}));
		this._register(toDisposable(() => {
			profileStorage.close();
			profileStorage.dispose();
			if (isDisposable(profileStorageDatabase)) {
				profileStorageDatabase.dispose();
			}
		}));
		this.profileStorage = profileStorage;
		return this.profileStorage.init();
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.PROFILE ? this.profileStorage : undefined;
	}

	protected getLogDetails(): string | undefined { return undefined; }
	protected async switchToProfile(): Promise<void> { }
	protected async switchToWorkspace(): Promise<void> { }
	hasScope() { return false; }
}
