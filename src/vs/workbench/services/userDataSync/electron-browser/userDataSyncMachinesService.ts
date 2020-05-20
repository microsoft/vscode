/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataSyncMachinesService, IUserDataSyncMachine } from 'vs/platform/userDataSync/common/userDataSyncMachines';

class UserDataSyncMachinesService extends Disposable implements IUserDataSyncMachinesService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		super();
		this.channel = sharedProcessService.getChannel('userDataSyncMachines');
	}

	getMachines(): Promise<IUserDataSyncMachine[]> {
		return this.channel.call<IUserDataSyncMachine[]>('getMachines');
	}

	updateName(name: string): Promise<void> {
		return this.channel.call('updateName', [name]);
	}

	unset(): Promise<void> {
		return this.channel.call('unset');
	}

	disable(id: string): Promise<void> {
		return this.channel.call('disable', [id]);
	}

}

registerSingleton(IUserDataSyncMachinesService, UserDataSyncMachinesService);
