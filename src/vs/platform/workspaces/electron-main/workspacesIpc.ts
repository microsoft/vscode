/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

export class WorkspacesChannel implements IServerChannel {

	constructor(
		private workspacesMainService: IWorkspacesMainService,
		private windowsMainService: IWindowsMainService
	) { }

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

				return this.workspacesMainService.createUntitledWorkspace(folders, remoteAuthority);
			}
			case 'deleteUntitledWorkspace': {
				const identifier: IWorkspaceIdentifier = arg;
				return this.workspacesMainService.deleteUntitledWorkspace({ id: identifier.id, configPath: URI.revive(identifier.configPath) });
			}
			case 'getWorkspaceIdentifier': {
				return this.workspacesMainService.getWorkspaceIdentifier(URI.revive(arg));
			}
			case 'enterWorkspace': {
				const window = this.windowsMainService.getWindowById(arg[0]);
				if (window) {
					return this.windowsMainService.enterWorkspace(window, URI.revive(arg[1]));
				}
			}
		}

		throw new Error(`Call not found: ${command}`);
	}
}
