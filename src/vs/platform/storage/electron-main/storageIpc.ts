/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { IBaseSerializableStorageRequest, ISerializableItemsChangeEvent, ISerializableUpdateRequest, Key, Value } from '../common/storageIpc.js';
import { ApplicationSharedStorageMain, IStorageChangeEvent, IStorageMain } from './storageMain.js';
import { IStorageMainService } from './storageMainService.js';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { reviveIdentifier, IAnyWorkspaceIdentifier } from '../../workspace/common/workspace.js';

export class StorageDatabaseChannel extends Disposable implements IServerChannel {

	private static readonly STORAGE_CHANGE_DEBOUNCE_TIME = 100;

	private readonly onDidChangeApplicationStorageEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());
	private readonly onDidChangeApplicationSharedStorageEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());

	private readonly mapProfileToOnDidChangeProfileStorageEmitter = new Map<string /* profile ID */, { readonly emitter: Emitter<ISerializableItemsChangeEvent>; readonly store: DisposableStore }>();

	constructor(
		private readonly logService: ILogService,
		private readonly storageMainService: IStorageMainService
	) {
		super();

		this.registerStorageChangeListeners(storageMainService.applicationStorage, this.onDidChangeApplicationStorageEmitter);
		this.registerStorageChangeListeners(storageMainService.applicationSharedStorage, this.onDidChangeApplicationSharedStorageEmitter);
	}

	//#region Storage Change Events

	private registerStorageChangeListeners(storage: IStorageMain, emitter: Emitter<ISerializableItemsChangeEvent>, store: DisposableStore = this._store): void {

		// Listen for changes in provided storage to send to listeners
		// that are listening. Use a debouncer to reduce IPC traffic.

		store.add(Event.debounce(storage.onDidChangeStorage, (prev: IStorageChangeEvent[] | undefined, cur: IStorageChangeEvent) => {
			if (!prev) {
				prev = [cur];
			} else {
				prev.push(cur);
			}

			return prev;
		}, StorageDatabaseChannel.STORAGE_CHANGE_DEBOUNCE_TIME)(events => {
			if (events.length) {
				emitter.fire(this.serializeStorageChangeEvents(events, storage));
			}
		}));
	}

	private serializeStorageChangeEvents(events: IStorageChangeEvent[], storage: IStorageMain): ISerializableItemsChangeEvent {
		const changed = new Map<Key, Value>();
		const deleted = new Set<Key>();
		events.forEach(event => {
			const existing = storage.get(event.key);
			if (typeof existing === 'string') {
				changed.set(event.key, existing);
			} else {
				deleted.add(event.key);
			}
		});

		return {
			changed: Array.from(changed.entries()),
			deleted: Array.from(deleted.values())
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	listen(_: unknown, event: string, arg: IBaseSerializableStorageRequest): Event<any> {
		switch (event) {
			case 'onDidChangeStorage': {
				const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;

				// Without profile: application or application-shared scope
				if (!profile) {
					if (arg.applicationShared) {
						return this.onDidChangeApplicationSharedStorageEmitter.event;
					}

					return this.onDidChangeApplicationStorageEmitter.event;
				}

				// With profile: profile scope for the profile
				const ownerWindowId = this.getOwnerWindowId(arg);
				const storage = this.storageMainService.profileStorage(profile, ownerWindowId);
				let profileStorageChangeEmitter = this.mapProfileToOnDidChangeProfileStorageEmitter.get(profile.id);
				if (!profileStorageChangeEmitter) {
					const store = new DisposableStore();
					const emitter = store.add(new Emitter<ISerializableItemsChangeEvent>());
					this.registerStorageChangeListeners(storage, emitter, store);
					store.add(Event.once(storage.onDidCloseStorage)(() => {
						this.mapProfileToOnDidChangeProfileStorageEmitter.delete(profile.id);
						store.dispose();
					}));
					profileStorageChangeEmitter = { emitter, store };
					this.mapProfileToOnDidChangeProfileStorageEmitter.set(profile.id, profileStorageChangeEmitter);
				}

				return profileStorageChangeEmitter.emitter.event;
			}
		}

		throw new Error(`Event not found: ${event}`);
	}

	//#endregion

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async call(_: unknown, command: string, arg: IBaseSerializableStorageRequest): Promise<any> {
		const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;
		const workspace = reviveIdentifier(arg.workspace);
		const applicationShared = arg.applicationShared;
		const ownerWindowId = this.getOwnerWindowId(arg);

		// Get storage to be ready
		const storage = await this.withStorageInitialized(profile, workspace, applicationShared, ownerWindowId);

		// handle call
		switch (command) {
			case 'getItems': {
				const items = new Map(storage.items);
				return Array.from(items.entries());
			}

			case 'getFallbackApplicationStorageItems': {
				if (storage instanceof ApplicationSharedStorageMain) {
					return Array.from(storage.applicationStorageItems.entries());
				}
				return [];
			}

			case 'updateItems': {
				const items: ISerializableUpdateRequest = arg;

				if (items.insert) {
					for (const [key, value] of items.insert) {
						storage.set(key, value);
					}
				}

				items.delete?.forEach(key => storage.delete(key));

				break;
			}

			case 'optimize': {
				return storage.optimize();
			}

			case 'isUsed': {
				const path = arg.payload as string | undefined;
				if (typeof path === 'string') {
					return this.storageMainService.isUsed(path);
				}
				return false;
			}

			default:
				throw new Error(`Call not found: ${command}`);
		}
	}

	private getOwnerWindowId(arg: IBaseSerializableStorageRequest): number | undefined {
		return Number.isInteger(arg.ownerWindowId) ? arg.ownerWindowId : undefined;
	}

	private async withStorageInitialized(profile: IUserDataProfile | undefined, workspace: IAnyWorkspaceIdentifier | undefined, applicationShared: boolean | undefined, ownerWindowId: number | undefined): Promise<IStorageMain> {
		let storage: IStorageMain;
		if (workspace) {
			storage = this.storageMainService.workspaceStorage(workspace, ownerWindowId);
		} else if (profile) {
			storage = this.storageMainService.profileStorage(profile, ownerWindowId);
		} else if (applicationShared) {
			storage = this.storageMainService.applicationSharedStorage;
		} else {
			storage = this.storageMainService.applicationStorage;
		}

		try {
			await storage.init();
		} catch (error) {
			this.logService.error(`StorageIPC#init: Unable to init ${workspace ? 'workspace' : profile ? 'profile' : applicationShared ? 'application-shared' : 'application'} storage due to ${error}`);
		}

		return storage;
	}

	override dispose(): void {
		for (const profileStorageChangeEmitter of this.mapProfileToOnDidChangeProfileStorageEmitter.values()) {
			profileStorageChangeEmitter.store.dispose();
		}
		this.mapProfileToOnDidChangeProfileStorageEmitter.clear();

		super.dispose();
	}
}
