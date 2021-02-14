/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageChangeEvent, IStorageMain } from 'vs/platform/storage/node/storageMain';
import { IStorageMainService } from 'vs/platform/storage/node/storageMainService';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

type Key = string;
type Value = string;
type Item = [Key, Value];

interface IWorkspaceArgument {
	workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined
}

interface ISerializableUpdateRequest extends IWorkspaceArgument {
	insert?: Item[];
	delete?: Key[];
}

interface ISerializableItemsChangeEvent {
	readonly changed?: Item[];
	readonly deleted?: Key[];
}

//#region --- Storage Server

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

//#endregion

//#region --- Storage Client

abstract class BaseStorageDatabase extends Disposable implements IStorageDatabase {

	abstract onDidChangeItemsExternal: Event<IStorageItemsChangeEvent>;

	constructor(protected channel: IChannel, private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined) {
		super();
	}

	async getItems(): Promise<Map<string, string>> {
		const serializableRequest: IWorkspaceArgument = { workspace: this.workspace };
		const items: Item[] = await this.channel.call('getItems', serializableRequest);

		return new Map(items);
	}

	updateItems(request: IUpdateRequest): Promise<void> {
		const serializableRequest: ISerializableUpdateRequest = { workspace: this.workspace };

		if (request.insert) {
			serializableRequest.insert = Array.from(request.insert.entries());
		}

		if (request.delete) {
			serializableRequest.delete = Array.from(request.delete.values());
		}

		return this.channel.call('updateItems', serializableRequest);
	}

	abstract close(recovery?: () => Map<string, string>): Promise<void>;
}

class GlobalStorageDatabase extends BaseStorageDatabase implements IStorageDatabase {

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	private onDidChangeGlobalStorageListener: IDisposable | undefined;

	constructor(channel: IChannel) {
		super(channel, undefined);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.onDidChangeGlobalStorageListener = this._register(this.channel.listen<ISerializableItemsChangeEvent>('onDidChangeGlobalStorage')((e: ISerializableItemsChangeEvent) => this.onDidChangeGlobalStorage(e)));
	}

	private onDidChangeGlobalStorage(e: ISerializableItemsChangeEvent): void {
		if (Array.isArray(e.changed) || Array.isArray(e.deleted)) {
			this._onDidChangeItemsExternal.fire({
				changed: e.changed ? new Map(e.changed) : undefined,
				deleted: e.deleted ? new Set<string>(e.deleted) : undefined
			});
		}
	}

	async close(): Promise<void> {

		// when we are about to close, we start to ignore global storage changes since we close anyway
		dispose(this.onDidChangeGlobalStorageListener);
	}
}

class WorkspaceStorageDatabase extends BaseStorageDatabase implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // unsupported for workspace storage because we only ever write from one window

	constructor(channel: IChannel, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier) {
		super(channel, workspace);
	}

	async close(): Promise<void> {
		// TODO@bpasero close workspace storage?
	}
}

export class StorageDatabaseChannelClient extends Disposable {

	readonly globalStorage = new GlobalStorageDatabase(this.channel);
	readonly workspaceStorage = this.workspace ? new WorkspaceStorageDatabase(this.channel, this.workspace) : undefined;

	constructor(
		private channel: IChannel,
		private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined
	) {
		super();
	}
}

//#endregion
