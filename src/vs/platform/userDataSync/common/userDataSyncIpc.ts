/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IUserDataSyncService } from 'vs/platform/userDataSync/common/userDataSync';

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
			case '_getInitialStatus': return Promise.resolve(this.service.status);
			case 'getConflictsSource': return Promise.resolve(this.service.conflictsSource);
			case 'removeExtension': return this.service.removeExtension(args[0]);
			case 'stop': this.service.stop(); return Promise.resolve();
		}
		throw new Error('Invalid call');
	}
}
