/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IBackupService } from './backup';

export interface IBackupChannel extends IChannel {
	call(command: 'getBackupPath', arg: [number]): TPromise<string>;
	call(command: string, arg?: any): TPromise<any>;
}

export class BackupChannel implements IBackupChannel {

	constructor(private service: IBackupService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getBackupPath': return this.service.getBackupPath(arg);
		}
		return undefined;
	}
}

export class BackupChannelClient implements IBackupService {

	_serviceBrand: any;

	constructor(private channel: IBackupChannel) { }

	getBackupPath(windowId: number): TPromise<string> {
		return this.channel.call('getBackupPath', windowId);
	}
}