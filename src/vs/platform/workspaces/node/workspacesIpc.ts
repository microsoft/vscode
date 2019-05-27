/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';

export class WorkspacesChannel implements IServerChannel {

	constructor(private service: IWorkspacesMainService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'createUntitledWorkspace': {
				const rawFolders: IWorkspaceFolderCreationData[] = arg[0];
				const remoteAuthority: string = arg[1];
				let folders: IWorkspaceFolderCreationData[] | undefined = undefined;
				if (Array.isArray(rawFolders)) {
					folders = rawFolders.map(rawFolder => {
						return {
							uri: URI.revive(rawFolder.uri), // convert raw URI back to real URI
							name: rawFolder.name
						};
					});
				}

				return this.service.createUntitledWorkspace(folders, remoteAuthority);
			}
			case 'deleteUntitledWorkspace': {
				const w: IWorkspaceIdentifier = arg;
				return this.service.deleteUntitledWorkspace({ id: w.id, configPath: URI.revive(w.configPath) });
			}
			case 'getWorkspaceIdentifier': {
				return this.service.getWorkspaceIdentifier(URI.revive(arg));
			}
		}

		throw new Error(`Call not found: ${command}`);
	}
}
