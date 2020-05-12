/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event, Emitter } from 'vs/base/common/event';
import { IUserDataSyncService, IUserDataSyncUtilService, IUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataSync';
import { URI } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { IStorageKeysSyncRegistryService, IStorageKey } from 'vs/platform/userDataSync/common/storageKeys';
import { Disposable } from 'vs/base/common/lifecycle';

export class UserDataSyncChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
			case 'onDidChangeConflicts': return this.service.onDidChangeConflicts;
			case 'onDidChangeLocal': return this.service.onDidChangeLocal;
			case 'onDidChangeLastSyncTime': return this.service.onDidChangeLastSyncTime;
			case 'onSyncErrors': return this.service.onSyncErrors;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialData': return Promise.resolve([this.service.status, this.service.conflicts, this.service.lastSyncTime]);
			case 'pull': return this.service.pull();
			case 'sync': return this.service.sync();
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'reset': return this.service.reset();
			case 'resetLocal': return this.service.resetLocal();
			case 'isFirstTimeSyncWithMerge': return this.service.isFirstTimeSyncWithMerge();
			case 'acceptConflict': return this.service.acceptConflict(URI.revive(args[0]), args[1]);
			case 'resolveContent': return this.service.resolveContent(URI.revive(args[0]));
			case 'getLocalSyncResourceHandles': return this.service.getLocalSyncResourceHandles(args[0]);
			case 'getRemoteSyncResourceHandles': return this.service.getRemoteSyncResourceHandles(args[0]);
			case 'getAssociatedResources': return this.service.getAssociatedResources(args[0], { created: args[1].created, uri: URI.revive(args[1].uri) });
		}
		throw new Error('Invalid call');
	}
}

export class UserDataAutoSyncChannel implements IServerChannel {

	constructor(private readonly service: IUserDataAutoSyncService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onError': return this.service.onError;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'triggerAutoSync': return this.service.triggerAutoSync(args[0]);
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSycnUtilServiceChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncUtilService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'resolveDefaultIgnoredSettings': return this.service.resolveDefaultIgnoredSettings();
			case 'resolveUserKeybindings': return this.service.resolveUserBindings(args[0]);
			case 'resolveFormattingOptions': return this.service.resolveFormattingOptions(URI.revive(args[0]));
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncUtilServiceClient implements IUserDataSyncUtilService {

	_serviceBrand: undefined;

	constructor(private readonly channel: IChannel) {
	}

	async resolveDefaultIgnoredSettings(): Promise<string[]> {
		return this.channel.call('resolveDefaultIgnoredSettings');
	}

	async resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>> {
		return this.channel.call('resolveUserKeybindings', [userbindings]);
	}

	async resolveFormattingOptions(file: URI): Promise<FormattingOptions> {
		return this.channel.call('resolveFormattingOptions', [file]);
	}

}

export class StorageKeysSyncRegistryChannel implements IServerChannel {

	constructor(private readonly service: IStorageKeysSyncRegistryService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStorageKeys': return this.service.onDidChangeStorageKeys;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialData': return Promise.resolve(this.service.storageKeys);
			case 'registerStorageKey': return Promise.resolve(this.service.registerStorageKey(args[0]));
		}
		throw new Error('Invalid call');
	}
}

export class StorageKeysSyncRegistryChannelClient extends Disposable implements IStorageKeysSyncRegistryService {

	_serviceBrand: undefined;

	private _storageKeys: ReadonlyArray<IStorageKey> = [];
	get storageKeys(): ReadonlyArray<IStorageKey> { return this._storageKeys; }
	private readonly _onDidChangeStorageKeys: Emitter<ReadonlyArray<IStorageKey>> = this._register(new Emitter<ReadonlyArray<IStorageKey>>());
	readonly onDidChangeStorageKeys = this._onDidChangeStorageKeys.event;

	constructor(private readonly channel: IChannel) {
		super();
		this.channel.call<IStorageKey[]>('_getInitialData').then(storageKeys => {
			this.updateStorageKeys(storageKeys);
			this._register(this.channel.listen<ReadonlyArray<IStorageKey>>('onDidChangeStorageKeys')(storageKeys => this.updateStorageKeys(storageKeys)));
		});
	}

	private async updateStorageKeys(storageKeys: ReadonlyArray<IStorageKey>): Promise<void> {
		this._storageKeys = storageKeys;
		this._onDidChangeStorageKeys.fire(this.storageKeys);
	}

	registerStorageKey(storageKey: IStorageKey): void {
		this.channel.call('registerStorageKey', [storageKey]);
	}

}
