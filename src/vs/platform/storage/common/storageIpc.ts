/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { UriDto } from 'vs/base/common/types';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISerializedSingleFolderWorkspaceIdentifier, ISerializedWorkspaceIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export type Key = string;
export type Value = string;
export type Item = [Key, Value];

export interface IBaseSerializableStorageRequest {

	/**
	 * Profile to correlate storage. Only used when no
	 * workspace is provided. Can be undefined to denote
	 * application scope.
	 */
	readonly profile: UriDto<IUserDataProfile> | undefined;

	/**
	 * Workspace to correlate storage. Can be undefined to
	 * denote application or global scope depending on profile.
	 */
	readonly workspace: ISerializedWorkspaceIdentifier | ISerializedSingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined;
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

	constructor(
		protected channel: IChannel,
		protected profile: UriDto<IUserDataProfile> | undefined,
		protected workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined
	) {
		super();
	}

	async getItems(): Promise<Map<string, string>> {
		const serializableRequest: IBaseSerializableStorageRequest = { profile: this.profile, workspace: this.workspace };
		const items: Item[] = await this.channel.call('getItems', serializableRequest);

		return new Map(items);
	}

	updateItems(request: IUpdateRequest): Promise<void> {
		const serializableRequest: ISerializableUpdateRequest = { profile: this.profile, workspace: this.workspace };

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

abstract class BaseProfileAwareStorageDatabaseClient extends BaseStorageDatabaseClient {

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	constructor(channel: IChannel, profile: UriDto<IUserDataProfile> | undefined) {
		super(channel, profile, undefined);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.channel.listen<ISerializableItemsChangeEvent>('onDidChangeStorage', { profile: this.profile })((e: ISerializableItemsChangeEvent) => this.onDidChangeStorage(e)));
	}

	private onDidChangeStorage(e: ISerializableItemsChangeEvent): void {
		if (Array.isArray(e.changed) || Array.isArray(e.deleted)) {
			this._onDidChangeItemsExternal.fire({
				changed: e.changed ? new Map(e.changed) : undefined,
				deleted: e.deleted ? new Set<string>(e.deleted) : undefined
			});
		}
	}
}

class ApplicationStorageDatabaseClient extends BaseProfileAwareStorageDatabaseClient {

	constructor(channel: IChannel) {
		super(channel, undefined);
	}

	async close(): Promise<void> {

		// The application storage database is shared across all instances so
		// we do not close it from the window. However we dispose the
		// listener for external changes because we no longer interested in it.

		this.dispose();
	}
}

class GlobalStorageDatabaseClient extends BaseProfileAwareStorageDatabaseClient {

	constructor(channel: IChannel, profile: UriDto<IUserDataProfile>) {
		super(channel, profile);
	}

	async close(): Promise<void> {

		// The global storage database is shared across all instances of
		// the same profile so we do not close it from the window.
		// However we dispose the listener for external changes because
		// we no longer interested in it.

		this.dispose();
	}
}

class WorkspaceStorageDatabaseClient extends BaseStorageDatabaseClient implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // unsupported for workspace storage because we only ever write from one window

	constructor(channel: IChannel, workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier) {
		super(channel, undefined, workspace);
	}

	async close(): Promise<void> {

		// The workspace storage database is only used in this instance
		// but we do not need to close it from here, the main process
		// can take care of that.

		this.dispose();
	}
}

export class StorageDatabaseChannelClient extends Disposable {

	private _applicationStorage: ApplicationStorageDatabaseClient | undefined = undefined;
	get applicationStorage() {
		if (!this._applicationStorage) {
			this._applicationStorage = new ApplicationStorageDatabaseClient(this.channel);
		}

		return this._applicationStorage;
	}

	private _globalStorage: GlobalStorageDatabaseClient | undefined = undefined;
	get globalStorage() {
		if (!this._globalStorage) {
			this._globalStorage = new GlobalStorageDatabaseClient(this.channel, this.userDataProfileService.currentProfile);
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
		private userDataProfileService: IUserDataProfilesService,
		private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined
	) {
		super();
	}
}
