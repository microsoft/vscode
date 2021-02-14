/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export type Key = string;
export type Value = string;
export type Item = [Key, Value];

export interface IWorkspaceArgument {
	workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined
}

export interface ISerializableUpdateRequest extends IWorkspaceArgument {
	insert?: Item[];
	delete?: Key[];
}

export interface ISerializableItemsChangeEvent {
	readonly changed?: Item[];
	readonly deleted?: Key[];
}

abstract class BaseStorageDatabaseClient extends Disposable implements IStorageDatabase {

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

	async close(): Promise<void> {
		return this.channel.call('close', { workspace: this.workspace });
	}
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

		// Remove our listeners on `close` because we are no longer
		// interested in change events from the global database
		this.dispose();

		return super.close();
	}
}

class WorkspaceStorageDatabaseClient extends BaseStorageDatabaseClient implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // unsupported for workspace storage because we only ever write from one window

	constructor(channel: IChannel, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier) {
		super(channel, workspace);
	}
}

export class StorageDatabaseChannelClient extends Disposable {

	readonly globalStorage = new GlobalStorageDatabaseClient(this.channel);
	readonly workspaceStorage = this.workspace ? new WorkspaceStorageDatabaseClient(this.channel, this.workspace) : undefined;

	constructor(
		private channel: IChannel,
		private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined
	) {
		super();
	}
}
