/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IWorkspacesService, IWorkspaceIdentifier, IWorkspaceFolderCreationData, IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';

export interface IWorkspacesChannel extends IChannel {
	call(command: 'createWorkspace', arg: [IWorkspaceFolderCreationData[]]): Thenable<string>;
	call(command: string, arg?: any): Thenable<any>;
}

export class WorkspacesChannel implements IWorkspacesChannel {

	constructor(private service: IWorkspacesMainService) { }

	listen<T>(event: string, arg?: any): Event<T> {
		throw new Error('No events');
	}

	call(command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'createWorkspace': {
				const rawFolders: IWorkspaceFolderCreationData[] = arg;
				let folders: IWorkspaceFolderCreationData[];
				if (Array.isArray(rawFolders)) {
					folders = rawFolders.map(rawFolder => {
						return {
							uri: URI.revive(rawFolder.uri), // convert raw URI back to real URI
							name: rawFolder.name
						} as IWorkspaceFolderCreationData;
					});
				}

				return this.service.createWorkspace(folders);
			}
		}

		return void 0;
	}
}

export class WorkspacesChannelClient implements IWorkspacesService {

	_serviceBrand: any;

	constructor(private channel: IWorkspacesChannel) { }

	createWorkspace(folders?: IWorkspaceFolderCreationData[]): TPromise<IWorkspaceIdentifier> {
		return TPromise.wrap(this.channel.call('createWorkspace', folders));
	}
}