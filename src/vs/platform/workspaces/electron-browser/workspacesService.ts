/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkspacesService, IWorkspaceIdentifier, IWorkspaceFolderCreationData, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export class WorkspacesService implements IWorkspacesService {

	_serviceBrand: ServiceIdentifier<any>;

	private channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('workspaces');
	}

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		return this.channel.call('createUntitledWorkspace', [folders, remoteAuthority]).then(reviveWorkspaceIdentifier);
	}

	deleteUntitledWorkspace(workspaceIdentifier: IWorkspaceIdentifier): Promise<void> {
		return this.channel.call('deleteUntitledWorkspace', workspaceIdentifier);
	}

	getWorkspaceIdentifier(configPath: URI): Promise<IWorkspaceIdentifier> {
		return this.channel.call('getWorkspaceIdentifier', configPath);
	}
}
