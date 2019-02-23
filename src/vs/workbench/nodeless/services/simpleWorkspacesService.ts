/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspacesService, IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';

export class SimpleWorkspacesService implements IWorkspacesService {

	_serviceBrand: any;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[]): Promise<IWorkspaceIdentifier> {
		return Promise.resolve(undefined);
	}
}