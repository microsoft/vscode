/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IUserDataSyncService, IUserDataSyncUtilService, IUserDataAutoSyncService, IUserDataSyncStoreService, IUserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { URI } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';

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
			case 'sync': return this.service.sync();
			case 'acceptConflict': return this.service.acceptConflict(URI.revive(args[0]), args[1]);
			case 'pull': return this.service.pull();
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'reset': return this.service.reset();
			case 'resetLocal': return this.service.resetLocal();
			case 'resolveContent': return this.service.resolveContent(URI.revive(args[0]));
			case 'isFirstTimeSyncWithMerge': return this.service.isFirstTimeSyncWithMerge();
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

export class UserDataSyncStoreServiceChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncStoreService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'getAllRefs': return this.service.getAllRefs(args[0]);
			case 'resolveContent': return this.service.resolveContent(args[0], args[1]);
			case 'delete': return this.service.delete(args[0]);
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncBackupStoreServiceChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncBackupStoreService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'getAllRefs': return this.service.getAllRefs(args[0]);
			case 'resolveContent': return this.service.resolveContent(args[0], args[1]);
		}
		throw new Error('Invalid call');
	}
}
