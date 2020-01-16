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
import type { IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';

export class UserDataSyncChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
			case 'onDidChangeLocal': return this.service.onDidChangeLocal;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'sync': return this.service.sync(args[0]);
			case 'pull': return this.service.pull();
			case 'push': return this.service.push();
			case '_getInitialStatus': return Promise.resolve(this.service.status);
			case 'getConflictsSource': return Promise.resolve(this.service.conflictsSource);
			case 'removeExtension': return this.service.removeExtension(args[0]);
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'reset': return this.service.reset();
			case 'resetLocal': return this.service.resetLocal();
			case 'hasPreviouslySynced': return this.service.hasPreviouslySynced();
			case 'hasRemote': return this.service.hasRemote();
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
			case 'sync': return this.service.sync(args[0]);
			case 'pull': return this.service.pull();
			case 'push': return this.service.push();
			case '_getInitialStatus': return Promise.resolve(this.service.status);
			case '_getInitialConflicts': return Promise.resolve(this.service.conflicts);
			case 'stop': this.service.stop(); return Promise.resolve();
			case 'resetLocal': return this.service.resetLocal();
			case 'hasPreviouslySynced': return this.service.hasPreviouslySynced();
			case 'hasRemote': return this.service.hasRemote();
			case 'resolveConflicts': return this.service.resolveConflicts(args[0]);
		}
		throw new Error('Invalid call');
	}
}

export class UserDataAutoSyncChannel implements IServerChannel {

	constructor(private readonly service: IUserDataAutoSyncService) { }

	listen(_: unknown, event: string): Event<any> {
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
			case 'updateConfigurationValue': return this.service.updateConfigurationValue(args[0], args[1]);
			case 'ignoreExtensionsToSync': return this.service.ignoreExtensionsToSync(args[0]);
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

	async updateConfigurationValue(key: string, value: any): Promise<void> {
		return this.channel.call('updateConfigurationValue', [key, value]);
	}

	async ignoreExtensionsToSync(extensionIdentifiers: IExtensionIdentifier[]): Promise<void> {
		return this.channel.call('ignoreExtensionsToSync', [extensionIdentifiers]);
	}

}

