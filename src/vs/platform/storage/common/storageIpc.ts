/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { UriDto } from '../../../base/common/uri.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from '../../../base/parts/storage/common/storage.js';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { ISerializedSingleFolderWorkspaceIdentifier, ISerializedWorkspaceIdentifier, IEmptyWorkspaceIdentifier, IAnyWorkspaceIdentifier } from '../../workspace/common/workspace.js';

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
	 * denote application or profile scope depending on profile.
	 */
	readonly workspace: ISerializedWorkspaceIdentifier | ISerializedSingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined;

	/**
	 * Whether this request targets the application shared storage
	 * that is shared across VS Code and Sessions app.
	 */
	readonly applicationShared?: boolean;

	/**
	 * Window owning this request, if any. Only profile and workspace
	 * storage requests with an owner participate in main process ref counting.
	 */
	readonly ownerWindowId?: number;

	/**
	 * Additional payload for the request to perform.
	 */
	readonly payload?: unknown;
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

	protected get applicationShared(): boolean {
		return false;
	}

	constructor(
		protected channel: IChannel,
		protected profile: UriDto<IUserDataProfile> | undefined,
		protected workspace: IAnyWorkspaceIdentifier | undefined,
		protected readonly ownerWindowId: number | undefined = undefined
	) {
		super();
	}

	protected toSerializableRequest(): IBaseSerializableStorageRequest {
		return { profile: this.profile, workspace: this.workspace, applicationShared: this.applicationShared, ownerWindowId: this.ownerWindowId };
	}

	async getItems(): Promise<Map<string, string>> {
		const serializableRequest = this.toSerializableRequest();
		const items: Item[] = await this.channel.call('getItems', serializableRequest);

		return new Map(items);
	}

	updateItems(request: IUpdateRequest): Promise<void> {
		const serializableRequest: ISerializableUpdateRequest = this.toSerializableRequest();

		if (request.insert) {
			serializableRequest.insert = Array.from(request.insert.entries());
		}

		if (request.delete) {
			serializableRequest.delete = Array.from(request.delete.values());
		}

		return this.channel.call('updateItems', serializableRequest);
	}

	optimize(): Promise<void> {
		const serializableRequest = this.toSerializableRequest();

		return this.channel.call('optimize', serializableRequest);
	}

	abstract close(): Promise<void>;
}

abstract class BaseProfileAwareStorageDatabaseClient extends BaseStorageDatabaseClient {

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	constructor(channel: IChannel, profile: UriDto<IUserDataProfile> | undefined, ownerWindowId: number | undefined = undefined) {
		super(channel, profile, undefined, ownerWindowId);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.channel.listen<ISerializableItemsChangeEvent>('onDidChangeStorage', this.toSerializableRequest())((e: ISerializableItemsChangeEvent) => this.onDidChangeStorage(e)));
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

export class ApplicationStorageDatabaseClient extends BaseProfileAwareStorageDatabaseClient {

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

export class ApplicationSharedStorageDatabaseClient extends BaseProfileAwareStorageDatabaseClient {

	constructor(channel: IChannel) {
		super(channel, undefined);
	}

	protected override get applicationShared(): boolean {
		return true;
	}

	async close(): Promise<void> {

		// The application shared storage database is shared across all instances so
		// we do not close it from the window. However we dispose the
		// listener for external changes because we no longer interested in it.

		this.dispose();
	}
}

export class ProfileStorageDatabaseClient extends BaseProfileAwareStorageDatabaseClient {

	constructor(channel: IChannel, profile: UriDto<IUserDataProfile> | undefined, ownerWindowId: number | undefined = undefined) {
		super(channel, profile, ownerWindowId);
	}

	async close(): Promise<void> {

		// The profile storage database is shared across all instances of
		// the same profile so we do not close it from the window.
		// However we dispose the listener for external changes because
		// we no longer interested in it.

		this.dispose();
	}
}

export class WorkspaceStorageDatabaseClient extends BaseStorageDatabaseClient implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // unsupported for workspace storage because we only ever write from one window

	constructor(channel: IChannel, workspace: IAnyWorkspaceIdentifier, ownerWindowId: number | undefined = undefined) {
		super(channel, undefined, workspace, ownerWindowId);
	}

	async close(): Promise<void> {

		// The workspace storage database is only used in this instance
		// but we do not need to close it from here, the main process
		// can take care of that.

		this.dispose();
	}
}

export class StorageClient {

	constructor(private readonly channel: IChannel) { }

	isUsed(path: string): Promise<boolean> {
		const serializableRequest: ISerializableUpdateRequest = { payload: path, profile: undefined, workspace: undefined };

		return this.channel.call('isUsed', serializableRequest);
	}
}

export class FallbackApplicationStorageDatabaseClient extends Disposable implements IStorageDatabase {

	onDidChangeItemsExternal = Event.None;

	constructor(private readonly channel: IChannel) {
		super();
	}

	async getItems(): Promise<Map<string, string>> {
		const serializableRequest: IBaseSerializableStorageRequest = { profile: undefined, workspace: undefined, applicationShared: true };
		const items: Item[] = await this.channel.call('getFallbackApplicationStorageItems', serializableRequest);
		return new Map(items);
	}

	updateItems(): Promise<void> {
		throw new Error('Not supported');
	}

	optimize(): Promise<void> {
		throw new Error('Not supported');
	}

	close(): Promise<void> {
		throw new Error('Not supported');
	}
}
