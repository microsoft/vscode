/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TernarySearchTree } from 'vs/base/common/map';
import { Event } from 'vs/base/common/event';
import { IWorkspaceIdentifier, IStoredWorkspaceFolder, isRawFileWorkspaceFolder, isRawUriWorkspaceFolder, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { isLinux } from 'vs/base/common/platform';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export const enum WorkbenchState {
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
	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null;

	/**
	 * Return `true` if the current workspace has the given identifier otherwise `false`.
	 */
	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean;

	/**
	 * Returns if the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;
}

export namespace IWorkspace {
	export function isIWorkspace(thing: any): thing is IWorkspace {
		return thing && typeof thing === 'object'
			&& typeof (thing as IWorkspace).id === 'string'
			&& Array.isArray((thing as IWorkspace).folders);
	}
}

export interface IWorkspace {

	/**
	 * the unique identifier of the workspace.
	 */
	readonly id: string;

	/**
	 * Folders in the workspace.
	 */
	readonly folders: IWorkspaceFolder[];

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI | null;
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

export namespace IWorkspaceFolder {
	export function isIWorkspaceFolder(thing: any): thing is IWorkspaceFolder {
		return thing && typeof thing === 'object'
			&& URI.isUri((thing as IWorkspaceFolder).uri)
			&& typeof (thing as IWorkspaceFolder).name === 'string'
			&& typeof (thing as IWorkspaceFolder).toResource === 'function';
	}
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
		folders: WorkspaceFolder[] = [],
		private _configuration: URI | null = null
	) {
		this.folders = folders;
	}

	update(workspace: Workspace) {
		this._id = workspace.id;
		this._configuration = workspace.configuration;
		this.folders = workspace.folders;
	}

	get folders(): WorkspaceFolder[] {
		return this._folders;
	}

	set folders(folders: WorkspaceFolder[]) {
		this._folders = folders;
		this.updateFoldersMap();
	}

	get id(): string {
		return this._id;
	}

	get configuration(): URI | null {
		return this._configuration;
	}

	set configuration(configuration: URI | null) {
		this._configuration = configuration;
	}

	getFolder(resource: URI): IWorkspaceFolder | null | undefined {
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

	toJSON(): IWorkspace {
		return { id: this.id, folders: this.folders, configuration: this.configuration };
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
		return resources.joinPath(this.uri, relativePath);
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

function parseWorkspaceFolders(configuredFolders: IStoredWorkspaceFolder[], relativeTo: URI | undefined): Array<WorkspaceFolder | undefined> {
	return configuredFolders.map((configuredFolder, index) => {
		let uri: URI | null = null;
		if (isRawFileWorkspaceFolder(configuredFolder)) {
			uri = toUri(configuredFolder.path, relativeTo);
		} else if (isRawUriWorkspaceFolder(configuredFolder)) {
			try {
				uri = URI.parse(configuredFolder.uri);
				// this makes sure all workspace folder are absolute
				if (uri.path[0] !== '/') {
					uri = uri.with({ path: '/' + uri.path });
				}
			} catch (e) {
				console.warn(e);
				// ignore
			}
		}
		if (!uri) {
			return undefined;
		}
		return new WorkspaceFolder({ uri, name: configuredFolder.name! /*is ensured in caller*/, index }, configuredFolder);
	});
}

function toUri(path: string, relativeTo: URI | undefined): URI | null {
	if (path) {
		if (paths.isAbsolute(path)) {
			return URI.file(path);
		}
		if (relativeTo) {
			return resources.joinPath(relativeTo, path);
		}
	}
	return null;
}

function ensureUnique(folders: WorkspaceFolder[]): WorkspaceFolder[] {
	return distinct(folders, folder => isLinux ? folder.uri.toString() : folder.uri.toString().toLowerCase());
}
