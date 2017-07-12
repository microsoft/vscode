/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkspacesService, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export interface IWorkspacesChannel extends IChannel {
	call(command: 'createWorkspace', arg: [string[]]): TPromise<string>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WorkspacesChannel implements IWorkspacesChannel {

	constructor(private service: IWorkspacesService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'createWorkspace': return this.service.createWorkspace(arg);
		}

		return void 0;
	}
}

export class WorkspacesChannelClient implements IWorkspacesService {

	_serviceBrand: any;

	constructor(private channel: IWorkspacesChannel) { }

	createWorkspace(folders?: string[]): TPromise<IWorkspaceIdentifier> {
		return this.channel.call('createWorkspace', folders);
	}
}