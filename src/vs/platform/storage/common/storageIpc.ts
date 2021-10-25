/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { IEmptyWorkspaceIdentifier, ISerializedSingleFolderWorkspaceIdentifier, ISerializedWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export type Key = string;
export type Value = string;
export type Item = [Key, Value];

export interface IBaseSerializableStorageRequest {
	readonly workspace: ISerializedWorkspaceIdentifier | ISerializedSingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined
}

export interface ISerializableUpdateRequest extends IBaseSerializableStorageRequest {
	insert?: Item[];
	delete?: Key[];
}

export interface ISerializableItemsChangeEvent {
	readonly changed?: Item[];
	readonly deleted?: Key[];
}

abstract class BaseStorageDatabaseClient extends Disposable implements IStorageDatabase {

	abstract readonly onDidChangeItemsExternal: Event<IStorageItemsChangeEvent>;

	constructor(protected channel: IChannel, protected workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined) {
		super();
	}

	async getItems(): Promise<Map<string, string>> {
		const serializableRequest: IBaseSerializableStorageRequest = { workspace: this.workspace };
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

	abstract close(): Promise<void>;
}

class GlobalStorageDatabaseClient extends BaseStorageDatabaseClient implements IStorageDatabase {

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	constructor(channel: IChannel) {
		super(channel, undefined);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.channel.listen<ISerializableItemsChangeEvent>('onDidChangeGlobalStorage')((e: ISerializableItemsChangeEvent) => this.onDidChangeGlobalStorage(e)));
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

		// The global storage database is shared across all instances so
		// we do not await it. However we dispose the listener for external
		// changes because we no longer interested int it.
		this.dispose();
	}
}

class WorkspaceStorageDatabaseClient extends BaseStorageDatabaseClient implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // unsupported for workspace storage because we only ever write from one window

	constructor(channel: IChannel, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier) {
		super(channel, workspace);
	}

	async close(): Promise<void> {
		const serializableRequest: ISerializableUpdateRequest = { workspace: this.workspace };

		return this.channel.call('close', serializableRequest);
	}
}

export class StorageDatabaseChannelClient extends Disposable {

	private _globalStorage: GlobalStorageDatabaseClient | undefined = undefined;
	get globalStorage() {
		if (!this._globalStorage) {
			this._globalStorage = new GlobalStorageDatabaseClient(this.channel);
		}

		return this._globalStorage;
	}

	private _workspaceStorage: WorkspaceStorageDatabaseClient | undefined = undefined;
	get workspaceStorage() {
		if (!this._workspaceStorage && this.workspace) {
			this._workspaceStorage = new WorkspaceStorageDatabaseClient(this.channel, this.workspace);
		}

		return this._workspaceStorage;
	}

	constructor(
		private channel: IChannel,
		private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined
	) {
		super();
	}
}
