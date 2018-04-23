/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TernarySearchTree } from 'vs/base/common/map';
import { Event } from 'vs/base/common/event';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, IStoredWorkspaceFolder, isRawFileWorkspaceFolder, isRawUriWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { isLinux } from 'vs/base/common/platform';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export enum WorkbenchState {
	EMPTY = 1,
	FOLDER,
	WORKSPACE
}

export interface IWorkspaceFoldersChangeEvent {
	added: IWorkspaceFolder[];
	removed: IWorkspaceFolder[];
	changed: IWorkspaceFolder[];
}

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * An event which fires on workbench state changes.
	 */
	onDidChangeWorkbenchState: Event<WorkbenchState>;

	/**
	 * An event which fires on workspace name changes.
	 */
	onDidChangeWorkspaceName: Event<void>;

	/**
	 * An event which fires on workspace folders change.
	 */
	onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent>;

	/**
	 * Provides access to the workspace object the platform is running with.
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
	 * Returns the folder for the given resource from the workspace.
	 * Can be null if there is no workspace or the resource is not inside the workspace.
	 */
	getWorkspaceFolder(resource: URI): IWorkspaceFolder;

	/**
	 * Return `true` if the current workspace has the given identifier otherwise `false`.
	 */
	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean;

	/**
	 * Returns if the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;
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
	readonly folders: IWorkspaceFolder[];

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI;
}

export interface IWorkspaceFolderData {
	/**
	 * The associated URI for this workspace folder.
	 */
	readonly uri: URI;

	/**
	 * The name of this workspace folder. Defaults to
	 * the basename its [uri-path](#Uri.path)
	 */
	readonly name: string;

	/**
	 * The ordinal number of this workspace folder.
	 */
	readonly index: number;
}

export interface IWorkspaceFolder extends IWorkspaceFolderData {

	/**
	 * Given workspace folder relative path, returns the resource with the absolute path.
	 */
	toResource: (relativePath: string) => URI;
}

export class Workspace implements IWorkspace {

	private _foldersMap: TernarySearchTree<WorkspaceFolder> = TernarySearchTree.forPaths<WorkspaceFolder>();
	private _folders: WorkspaceFolder[];

	constructor(
		private _id: string,
		private _name: string = '',
		folders: WorkspaceFolder[] = [],
		private _configuration: URI = null,
		private _ctime?: number
	) {
		this.folders = folders;
	}

	public update(workspace: Workspace) {
		this._id = workspace.id;
		this._name = workspace.name;
		this._configuration = workspace.configuration;
		this._ctime = workspace.ctime;
		this.folders = workspace.folders;
	}

	public get folders(): WorkspaceFolder[] {
		return this._folders;
	}

	public set folders(folders: WorkspaceFolder[]) {
		this._folders = folders;
		this.updateFoldersMap();
	}

	public get id(): string {
		return this._id;
	}

	public get ctime(): number {
		return this._ctime;
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

	public getFolder(resource: URI): IWorkspaceFolder {
		if (!resource) {
			return null;
		}

		return this._foldersMap.findSubstr(resource.toString());
	}

	private updateFoldersMap(): void {
		this._foldersMap = TernarySearchTree.forPaths<WorkspaceFolder>();
		for (const folder of this.folders) {
			this._foldersMap.set(folder.uri.toString(), folder);
		}
	}

	public toJSON(): IWorkspace {
		return { id: this.id, folders: this.folders, name: this.name, configuration: this.configuration };
	}
}

export class WorkspaceFolder implements IWorkspaceFolder {

	readonly uri: URI;
	name: string;
	index: number;

	constructor(data: IWorkspaceFolderData,
		readonly raw?: IStoredWorkspaceFolder) {
		this.uri = data.uri;
		this.index = data.index;
		this.name = data.name;
	}

	toResource(relativePath: string): URI {
		return this.uri.with({ path: paths.join(this.uri.path, relativePath) });
	}

	toJSON(): IWorkspaceFolderData {
		return { uri: this.uri, name: this.name, index: this.index };
	}
}

export function toWorkspaceFolders(configuredFolders: IStoredWorkspaceFolder[], relativeTo?: URI): WorkspaceFolder[] {
	let workspaceFolders = parseWorkspaceFolders(configuredFolders, relativeTo);
	return ensureUnique(coalesce(workspaceFolders))
		.map(({ uri, raw, name }, index) => new WorkspaceFolder({ uri, name: name || resources.basenameOrAuthority(uri), index }, raw));
}

function parseWorkspaceFolders(configuredFolders: IStoredWorkspaceFolder[], relativeTo: URI): WorkspaceFolder[] {
	return configuredFolders.map((configuredFolder, index) => {
		let uri: URI;
		if (isRawFileWorkspaceFolder(configuredFolder)) {
			uri = toUri(configuredFolder.path, relativeTo);
		} else if (isRawUriWorkspaceFolder(configuredFolder)) {
			try {
				uri = URI.parse(configuredFolder.uri);
			} catch (e) {
				console.warn(e);
				// ignore
			}
		}
		if (!uri) {
			return void 0;
		}
		return new WorkspaceFolder({ uri, name: configuredFolder.name, index }, configuredFolder);
	});
}

function toUri(path: string, relativeTo: URI): URI {
	if (path) {
		if (paths.isAbsolute(path)) {
			return URI.file(path);
		}
		if (relativeTo) {
			return relativeTo.with({ path: paths.join(relativeTo.path, path) });
		}
	}
	return null;
}

function ensureUnique(folders: WorkspaceFolder[]): WorkspaceFolder[] {
	return distinct(folders, folder => isLinux ? folder.uri.toString() : folder.uri.toString().toLowerCase());
}
