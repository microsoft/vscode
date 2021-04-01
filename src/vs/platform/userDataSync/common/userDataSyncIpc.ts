/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IUserDataSyncUtilService, IUserDataAutoSyncService, IUserDataSyncStoreManagementService, UserDataSyncStoreType, IUserDataSyncStore } from 'vs/platform/userDataSync/common/userDataSync';
import { URI } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { IUserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { IUserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { Disposable } from 'vs/base/common/lifecycle';

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
			case 'triggerSync': return this.service.triggerSync(args[0], args[1], args[2]);
			case 'turnOn': return this.service.turnOn();
			case 'turnOff': return this.service.turnOff(args[0]);
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

	declare readonly _serviceBrand: undefined;

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

export class UserDataSyncMachinesServiceChannel implements IServerChannel {

	constructor(private readonly service: IUserDataSyncMachinesService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChange': return this.service.onDidChange;
		}
		throw new Error(`Event not found: ${event}`);
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'getMachines': return this.service.getMachines();
			case 'addCurrentMachine': return this.service.addCurrentMachine();
			case 'removeCurrentMachine': return this.service.removeCurrentMachine();
			case 'renameMachine': return this.service.renameMachine(args[0], args[1]);
			case 'setEnablement': return this.service.setEnablement(args[0], args[1]);
		}
		throw new Error('Invalid call');
	}

}

export class UserDataSyncAccountServiceChannel implements IServerChannel {
	constructor(private readonly service: IUserDataSyncAccountService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeAccount': return this.service.onDidChangeAccount;
			case 'onTokenFailed': return this.service.onTokenFailed;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialData': return Promise.resolve(this.service.account);
			case 'updateAccount': return this.service.updateAccount(args);
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncStoreManagementServiceChannel implements IServerChannel {
	constructor(private readonly service: IUserDataSyncStoreManagementService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeUserDataSyncStore': return this.service.onDidChangeUserDataSyncStore;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'switch': return this.service.switch(args[0]);
			case 'getPreviousUserDataSyncStore': return this.service.getPreviousUserDataSyncStore();
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncStoreManagementServiceChannelClient extends Disposable {

	readonly onDidChangeUserDataSyncStore: Event<void>;

	constructor(private readonly channel: IChannel) {
		super();
		this.onDidChangeUserDataSyncStore = this.channel.listen<void>('onDidChangeUserDataSyncStore');
	}

	async switch(type: UserDataSyncStoreType): Promise<void> {
		return this.channel.call('switch', [type]);
	}

	async getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore> {
		const userDataSyncStore = await this.channel.call<IUserDataSyncStore>('getPreviousUserDataSyncStore');
		return this.revive(userDataSyncStore);
	}

	private revive(userDataSyncStore: IUserDataSyncStore): IUserDataSyncStore {
		return {
			url: URI.revive(userDataSyncStore.url),
			type: userDataSyncStore.type,
			defaultUrl: URI.revive(userDataSyncStore.defaultUrl),
			insidersUrl: URI.revive(userDataSyncStore.insidersUrl),
			stableUrl: URI.revive(userDataSyncStore.stableUrl),
			canSwitch: userDataSyncStore.canSwitch,
			authenticationProviders: userDataSyncStore.authenticationProviders,
		};
	}
}
