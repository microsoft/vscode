/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkspacesService, IWorkspaceFolderCreationData, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';

export class WorkspacesService implements IWorkspacesService {

	_serviceBrand: undefined;

	async createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		throw new Error('Untitled workspaces are currently unsupported in Web');
	}

	async deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		throw new Error('Untitled workspaces are currently unsupported in Web');
	}

	async getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier> {
		throw new Error('Untitled workspaces are currently unsupported in Web');
	}
}

registerSingleton(IWorkspacesService, WorkspacesService, true);
