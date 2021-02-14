/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { ISerializableItemsChangeEvent, ISerializableUpdateRequest, IWorkspaceArgument, Key, Value } from 'vs/platform/storage/common/storageIpc';
import { IStorageChangeEvent, IStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IStorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export class StorageDatabaseChannel extends Disposable implements IServerChannel {

	private static readonly STORAGE_CHANGE_DEBOUNCE_TIME = 100;

	private readonly _onDidChangeGlobalStorage = this._register(new Emitter<ISerializableItemsChangeEvent>());
	private readonly onDidChangeGlobalStorage = this._onDidChangeGlobalStorage.event;

	constructor(
		private logService: ILogService,
		private storageMainService: IStorageMainService
	) {
		super();

		// Trigger init of global storage directly from ctor
		this.withStorageInitialized(undefined);

		this.registerGlobalStorageListeners();
	}

	//#region Global Storage Change Events

	private registerGlobalStorageListeners(): void {

		// Listen for changes in global storage to send to listeners
		// that are listening. Use a debouncer to reduce IPC traffic.
		this._register(Event.debounce(this.storageMainService.globalStorage.onDidChangeStorage, (prev: IStorageChangeEvent[] | undefined, cur: IStorageChangeEvent) => {
			if (!prev) {
				prev = [cur];
			} else {
				prev.push(cur);
			}

			return prev;
		}, StorageDatabaseChannel.STORAGE_CHANGE_DEBOUNCE_TIME)(events => {
			if (events.length) {
				this._onDidChangeGlobalStorage.fire(this.serializeGlobalStorageEvents(events));
			}
		}));
	}

	private serializeGlobalStorageEvents(events: IStorageChangeEvent[]): ISerializableItemsChangeEvent {
		const changed = new Map<Key, Value>();
		const deleted = new Set<Key>();
		events.forEach(event => {
			const existing = this.storageMainService.globalStorage.get(event.key);
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

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeGlobalStorage': return this.onDidChangeGlobalStorage;
		}

		throw new Error(`Event not found: ${event}`);
	}

	//#endregion

	async call(_: unknown, command: string, arg: IWorkspaceArgument): Promise<any> {

		// Get storage to be ready
		const storage = await this.withStorageInitialized(arg.workspace);

		// handle call
		switch (command) {
			case 'getItems': {
				return Array.from(storage.items.entries());
			}

			case 'updateItems': {
				const items: ISerializableUpdateRequest = arg;
				if (items.insert) {
					for (const [key, value] of items.insert) {
						storage.store(key, value);
					}
				}

				if (items.delete) {
					items.delete.forEach(key => storage.remove(key));
				}

				break;
			}

			case 'close': {
				if (arg.workspace) {
					// Only allow to close workspace storage databases but not
					// the global database that is shared across multiple connections
					return storage.close();
				}

				break;
			}

			default:
				throw new Error(`Call not found: ${command}`);
		}
	}

	private async withStorageInitialized(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined): Promise<IStorageMain> {
		const storage = workspace ? this.storageMainService.workspaceStorage(workspace) : this.storageMainService.globalStorage;

		try {
			await storage.initialize();
		} catch (error) {
			this.logService.error(`[storage] init(): Unable to init ${workspace ? 'workspace' : 'global'} storage due to ${error}`);
		}

		return storage;
	}
}
