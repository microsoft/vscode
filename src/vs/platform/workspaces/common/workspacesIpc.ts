/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkspacesService, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import URI from 'vs/base/common/uri';

export interface IWorkspacesChannel extends IChannel {
	call(command: 'createWorkspace', arg: [(string | URI)[]]): TPromise<string>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WorkspacesChannel implements IWorkspacesChannel {

	constructor(private service: IWorkspacesService) { }

	public call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'createWorkspace': {
				let folders: any[];
				if (Array.isArray(arg)) {
					folders = arg.map(folder => {
						if (typeof folder === 'string') {
							return folder;
						}

						return URI.revive(folder);
					});
				}

				return this.service.createWorkspace(folders);
			};
		}

		return void 0;
	}
}

export class WorkspacesChannelClient implements IWorkspacesService {

	_serviceBrand: any;

	constructor(private channel: IWorkspacesChannel) { }

	public createWorkspace(folderPaths?: string[]): TPromise<IWorkspaceIdentifier>;
	public createWorkspace(folderResources?: URI[]): TPromise<IWorkspaceIdentifier>;
	public createWorkspace(arg1?: any[]): TPromise<IWorkspaceIdentifier> {
		return this.channel.call('createWorkspace', arg1);
	}
}