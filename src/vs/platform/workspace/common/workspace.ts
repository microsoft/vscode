/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TrieMap } from 'vs/base/common/map';
import Event from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { distinct } from 'vs/base/common/arrays';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export enum WorkbenchState {
	EMPTY = 1,
	FOLDER,
	WORKSPACE
}

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * Return the state of the workbench.
	 *
	 * WorkbenchState.EMPTY - if the workbench was opened with empty window or file
	 * WorkbenchState.FOLDER - if the workbench was opened with a folder
	 * WorkbenchState.WORKSPACE - if the workbench was opened with a workspace
	 */
	getWorkbenchState(): WorkbenchState;

	/**
	 * An event which fires on workspace name changes.
	 */
	onDidChangeWorkspaceName: Event<void>;

	/**
	 * An event which fires on workspace folders change.
	 */
	onDidChangeWorkspaceFolders: Event<void>;

	/**
	 * Returns the folder for the given resource from the workspace.
	 * Can be null if there is no workspace or the resource is not inside the workspace.
	 */
	getWorkspaceFolder(resource: URI): URI;

	/**
	 * Return `true` if the current workspace has the given identifier otherwise `false`.
	 */
	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean;

	/**
	 * Returns if the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;
}

export interface IWorkspace {

	/**
	 * the unique identifier of the workspace.
	 */
	readonly id: string;

	/**
	 * the name of the workspace.
	 */
	readonly name: string;

	/**
	 * Folders in the workspace.
	 */
	readonly folders: URI[];

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI;
}

export class Workspace implements IWorkspace {

	private _foldersMap: TrieMap<URI> = new TrieMap<URI>();
	private _folders: URI[];

	constructor(
		public readonly id: string,
		private _name: string,
		folders: URI[],
		private _configuration: URI = null,
		public readonly ctime?: number
	) {
		this.folders = folders;
	}

	private ensureUnique(folders: URI[]): URI[] {
		return distinct(folders, folder => isLinux ? folder.fsPath : folder.fsPath.toLowerCase());
	}

	public get folders(): URI[] {
		return this._folders;
	}

	public set folders(folders: URI[]) {
		this._folders = this.ensureUnique(folders);
		this.updateFoldersMap();
	}

	public get name(): string {
		return this._name;
	}

	public set name(name: string) {
		this._name = name;
	}

	public get configuration(): URI {
		return this._configuration;
	}

	public set configuration(configuration: URI) {
		this._configuration = configuration;
	}

	public getFolder(resource: URI): URI {
		if (!resource) {
			return null;
		}

		return this._foldersMap.findSubstr(resource.fsPath);
	}

	private updateFoldersMap(): void {
		this._foldersMap = new TrieMap<URI>();
		for (const folder of this.folders) {
			this._foldersMap.insert(folder.fsPath, folder);
		}
	}

	public toJSON(): IWorkspace {
		return { id: this.id, folders: this.folders, name: this.name };
	}
}
