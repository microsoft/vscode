/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { IBaseSerializableStorageRequest, ISerializableItemsChangeEvent, ISerializableUpdateRequest, Key, Value } from 'vs/platform/storage/common/storageIpc';
import { IStorageChangeEvent, IStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IStorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { reviveIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class StorageDatabaseChannel extends Disposable implements IServerChannel {

	private static readonly STORAGE_CHANGE_DEBOUNCE_TIME = 100;

	private readonly onDidChangeApplicationStorageEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());

	private readonly mapProfileToOnDidChangeProfileStorageEmitter = new Map<string /* profile ID */, Emitter<ISerializableItemsChangeEvent>>();

	constructor(
		private readonly logService: ILogService,
		private readonly storageMainService: IStorageMainService
	) {
		super();

		this.registerStorageChangeListeners(storageMainService.applicationStorage, this.onDidChangeApplicationStorageEmitter);
	}

	//#region Storage Change Events

	private registerStorageChangeListeners(storage: IStorageMain, emitter: Emitter<ISerializableItemsChangeEvent>): void {

		// Listen for changes in provided storage to send to listeners
		// that are listening. Use a debouncer to reduce IPC traffic.

		this._register(Event.debounce(storage.onDidChangeStorage, (prev: IStorageChangeEvent[] | undefined, cur: IStorageChangeEvent) => {
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

	listen(_: unknown, event: string, arg: IBaseSerializableStorageRequest): Event<any> {
		switch (event) {
			case 'onDidChangeStorage': {
				const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;

				// Without profile: application scope
				if (!profile) {
					return this.onDidChangeApplicationStorageEmitter.event;
				}

				// With profile: profile scope for the profile
				let profileStorageChangeEmitter = this.mapProfileToOnDidChangeProfileStorageEmitter.get(profile.id);
				if (!profileStorageChangeEmitter) {
					profileStorageChangeEmitter = this._register(new Emitter<ISerializableItemsChangeEvent>());
					this.registerStorageChangeListeners(this.storageMainService.profileStorage(profile), profileStorageChangeEmitter);
					this.mapProfileToOnDidChangeProfileStorageEmitter.set(profile.id, profileStorageChangeEmitter);
				}

				return profileStorageChangeEmitter.event;
			}
		}

		throw new Error(`Event not found: ${event}`);
	}

	//#endregion

	async call(_: unknown, command: string, arg: IBaseSerializableStorageRequest): Promise<any> {
		const profile = arg.profile ? revive<IUserDataProfile>(arg.profile) : undefined;
		const workspace = reviveIdentifier(arg.workspace);

		// Get storage to be ready
		const storage = await this.withStorageInitialized(profile, workspace);

		// handle call
		switch (command) {
			case 'getItems': {
				return Array.from(storage.items.entries());
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

			case 'isUsed': {
				const path = arg.payload as string | undefined;
				if (typeof path === 'string') {
					return this.storageMainService.isUsed(path);
				}
			}

			default:
				throw new Error(`Call not found: ${command}`);
		}
	}

	private async withStorageInitialized(profile: IUserDataProfile | undefined, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): Promise<IStorageMain> {
		let storage: IStorageMain;
		if (workspace) {
			storage = this.storageMainService.workspaceStorage(workspace);
		} else if (profile) {
			storage = this.storageMainService.profileStorage(profile);
		} else {
			storage = this.storageMainService.applicationStorage;
		}

		try {
			await storage.init();
		} catch (error) {
			this.logService.error(`StorageIPC#init: Unable to init ${workspace ? 'workspace' : profile ? 'profile' : 'application'} storage due to ${error}`);
		}

		return storage;
	}
}
