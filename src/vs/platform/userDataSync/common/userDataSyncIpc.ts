/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IUserDataSyncService, IUserDataSyncUtilService, ISettingsSyncService, IUserDataAuthTokenService, IUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataSync';
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
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialData': return Promise.resolve([this.service.status, this.service.conflictsSources]);
			case 'sync': return this.service.sync();
			case 'accept': return this.service.accept(args[0], args[1]);
			case 'pull': return this.service.pull();
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'reset': return this.service.reset();
			case 'resetLocal': return this.service.resetLocal();
			case 'getRemoteContent': return this.service.getRemoteContent(args[0], args[1]);
			case 'isFirstTimeSyncWithMerge': return this.service.isFirstTimeSyncWithMerge();
		}
		throw new Error('Invalid call');
	}
}

export class SettingsSyncChannel implements IServerChannel {

	constructor(private readonly service: ISettingsSyncService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
			case 'onDidChangeLocal': return this.service.onDidChangeLocal;
			case 'onDidChangeConflicts': return this.service.onDidChangeConflicts;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'sync': return this.service.sync();
			case 'accept': return this.service.accept(args[0]);
			case 'pull': return this.service.pull();
			case 'push': return this.service.push();
			case '_getInitialStatus': return Promise.resolve(this.service.status);
			case '_getInitialConflicts': return Promise.resolve(this.service.conflicts);
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'resetLocal': return this.service.resetLocal();
			case 'hasPreviouslySynced': return this.service.hasPreviouslySynced();
			case 'hasLocalData': return this.service.hasLocalData();
			case 'resolveSettingsConflicts': return this.service.resolveSettingsConflicts(args[0]);
			case 'getRemoteContent': return this.service.getRemoteContent(args[0]);
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
			case 'triggerAutoSync': return this.service.triggerAutoSync();
		}
		throw new Error('Invalid call');
	}
}

export class UserDataAuthTokenServiceChannel implements IServerChannel {
	constructor(private readonly service: IUserDataAuthTokenService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeToken': return this.service.onDidChangeToken;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'setToken': return this.service.setToken(args);
			case 'getToken': return this.service.getToken();
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

	async resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>> {
		return this.channel.call('resolveUserKeybindings', [userbindings]);
	}

	async resolveFormattingOptions(file: URI): Promise<FormattingOptions> {
		return this.channel.call('resolveFormattingOptions', [file]);
	}

}

