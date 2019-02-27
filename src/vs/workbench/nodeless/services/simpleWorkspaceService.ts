/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWorkspaceContextService, Workspace, WorkbenchState, IWorkspaceFolder, IWorkspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { Event } from 'vs/base/common/event';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { isWindows } from 'vs/base/common/platform';

export const workspaceResource = URI.file(isWindows ? 'C:\\simpleWorkspace' : '/simpleWorkspace');

export class SimpleWorkspaceService implements IWorkspaceContextService {
	_serviceBrand: any;

	private workspace: Workspace;

	readonly onDidChangeWorkspaceName = Event.None;
	readonly onDidChangeWorkspaceFolders = Event.None;
	readonly onDidChangeWorkbenchState = Event.None;

	constructor() {
		this.workspace = new Workspace(
			workspaceResource.toString(),
			toWorkspaceFolders([{ path: workspaceResource.fsPath }])
		);
	}

	getFolders(): IWorkspaceFolder[] {
		return this.workspace ? this.workspace.folders : [];
	}

	getWorkbenchState(): WorkbenchState {
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		if (this.workspace.folders.length) {
			return WorkbenchState.FOLDER;
		}

		return WorkbenchState.EMPTY;
	}

	getCompleteWorkspace(): Promise<IWorkspace> {
		return Promise.resolve(this.getWorkspace());
	}

	getWorkspace(): IWorkspace {
		return this.workspace;
	}

	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(resource);
	}

	isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return isEqualOrParent(resource, this.workspace.folders[0].uri);
		}

		return false;
	}

	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && isEqual(this.workspace.folders[0].uri, workspaceIdentifier);
	}
}