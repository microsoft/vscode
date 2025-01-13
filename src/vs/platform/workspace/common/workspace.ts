/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { Event } from '../../../base/common/event.js';
import { basename, extname } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { extname as resourceExtname, basenameOrAuthority, joinPath, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { Schemas } from '../../../base/common/network.js';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {

	readonly _serviceBrand: undefined;

	/**
	 * An event which fires on workbench state changes.
	 */
	readonly onDidChangeWorkbenchState: Event<WorkbenchState>;

	/**
	 * An event which fires on workspace name changes.
	 */
	readonly onDidChangeWorkspaceName: Event<void>;

	/**
	 * An event which fires before workspace folders change.
	 */
	readonly onWillChangeWorkspaceFolders: Event<IWorkspaceFoldersWillChangeEvent>;

	/**
	 * An event which fires on workspace folders change.
	 */
	readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent>;

	/**
	 * Provides access to the complete workspace object.
	 */
	getCompleteWorkspace(): Promise<IWorkspace>;

	/**
	 * Provides access to the workspace object the window is running with.
	 * Use `getCompleteWorkspace` to get complete workspace object.
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
	 * Return `true` if the current workspace has the given identifier or root URI otherwise `false`.
	 */
	isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean;

	/**
	 * Returns if the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;
}

export interface IResolvedWorkspace extends IWorkspaceIdentifier, IBaseWorkspace {
	readonly folders: IWorkspaceFolder[];
}

export interface IBaseWorkspace {

	/**
	 * If present, marks the window that opens the workspace
	 * as a remote window with the given authority.
	 */
	readonly remoteAuthority?: string;

	/**
	 * Transient workspaces are meant to go away after being used
	 * once, e.g. a window reload of a transient workspace will
	 * open an empty window.
	 *
	 * See: https://github.com/microsoft/vscode/issues/119695
	 */
	readonly transient?: boolean;
}

export interface IBaseWorkspaceIdentifier {

	/**
	 * Every workspace (multi-root, single folder or empty)
	 * has a unique identifier. It is not possible to open
	 * a workspace with the same `id` in multiple windows
	 */
	readonly id: string;
}

/**
 * A single folder workspace identifier is a path to a folder + id.
 */
export interface ISingleFolderWorkspaceIdentifier extends IBaseWorkspaceIdentifier {

	/**
	 * Folder path as `URI`.
	 */
	readonly uri: URI;
}

/**
 * A multi-root workspace identifier is a path to a workspace file + id.
 */
export interface IWorkspaceIdentifier extends IBaseWorkspaceIdentifier {

	/**
	 * Workspace config file path as `URI`.
	 */
	configPath: URI;
}

export interface IEmptyWorkspaceIdentifier extends IBaseWorkspaceIdentifier { }

export type IAnyWorkspaceIdentifier = IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier;

export function isSingleFolderWorkspaceIdentifier(obj: unknown): obj is ISingleFolderWorkspaceIdentifier {
	const singleFolderIdentifier = obj as ISingleFolderWorkspaceIdentifier | undefined;

	return typeof singleFolderIdentifier?.id === 'string' && URI.isUri(singleFolderIdentifier.uri);
}

export function isEmptyWorkspaceIdentifier(obj: unknown): obj is IEmptyWorkspaceIdentifier {
	const emptyWorkspaceIdentifier = obj as IEmptyWorkspaceIdentifier | undefined;
	return typeof emptyWorkspaceIdentifier?.id === 'string'
		&& !isSingleFolderWorkspaceIdentifier(obj)
		&& !isWorkspaceIdentifier(obj);
}

export const EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE: IEmptyWorkspaceIdentifier = { id: 'ext-dev' };
export const UNKNOWN_EMPTY_WINDOW_WORKSPACE: IEmptyWorkspaceIdentifier = { id: 'empty-window' };

export function toWorkspaceIdentifier(workspace: IWorkspace): IAnyWorkspaceIdentifier;
export function toWorkspaceIdentifier(backupPath: string | undefined, isExtensionDevelopment: boolean): IEmptyWorkspaceIdentifier;
export function toWorkspaceIdentifier(arg0: IWorkspace | string | undefined, isExtensionDevelopment?: boolean): IAnyWorkspaceIdentifier {

	// Empty workspace
	if (typeof arg0 === 'string' || typeof arg0 === 'undefined') {

		// With a backupPath, the basename is the empty workspace identifier
		if (typeof arg0 === 'string') {
			return {
				id: basename(arg0)
			};
		}

		// Extension development empty windows have backups disabled
		// so we return a constant workspace identifier for extension
		// authors to allow to restore their workspace state even then.
		if (isExtensionDevelopment) {
			return EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE;
		}

		return UNKNOWN_EMPTY_WINDOW_WORKSPACE;
	}

	// Multi root
	const workspace = arg0;
	if (workspace.configuration) {
		return {
			id: workspace.id,
			configPath: workspace.configuration
		};
	}

	// Single folder
	if (workspace.folders.length === 1) {
		return {
			id: workspace.id,
			uri: workspace.folders[0].uri
		};
	}

	// Empty window
	return {
		id: workspace.id
	};
}

export function isWorkspaceIdentifier(obj: unknown): obj is IWorkspaceIdentifier {
	const workspaceIdentifier = obj as IWorkspaceIdentifier | undefined;

	return typeof workspaceIdentifier?.id === 'string' && URI.isUri(workspaceIdentifier.configPath);
}

export interface ISerializedSingleFolderWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
	readonly uri: UriComponents;
}

export interface ISerializedWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
	readonly configPath: UriComponents;
}

export function reviveIdentifier(identifier: undefined): undefined;
export function reviveIdentifier(identifier: ISerializedWorkspaceIdentifier): IWorkspaceIdentifier;
export function reviveIdentifier(identifier: ISerializedSingleFolderWorkspaceIdentifier): ISingleFolderWorkspaceIdentifier;
export function reviveIdentifier(identifier: IEmptyWorkspaceIdentifier): IEmptyWorkspaceIdentifier;
export function reviveIdentifier(identifier: ISerializedWorkspaceIdentifier | ISerializedSingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IAnyWorkspaceIdentifier | undefined;
export function reviveIdentifier(identifier: ISerializedWorkspaceIdentifier | ISerializedSingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IAnyWorkspaceIdentifier | undefined {

	// Single Folder
	const singleFolderIdentifierCandidate = identifier as ISerializedSingleFolderWorkspaceIdentifier | undefined;
	if (singleFolderIdentifierCandidate?.uri) {
		return { id: singleFolderIdentifierCandidate.id, uri: URI.revive(singleFolderIdentifierCandidate.uri) };
	}

	// Multi folder
	const workspaceIdentifierCandidate = identifier as ISerializedWorkspaceIdentifier | undefined;
	if (workspaceIdentifierCandidate?.configPath) {
		return { id: workspaceIdentifierCandidate.id, configPath: URI.revive(workspaceIdentifierCandidate.configPath) };
	}

	// Empty
	if (identifier?.id) {
		return { id: identifier.id };
	}

	return undefined;
}

export const enum WorkbenchState {
	EMPTY = 1,
	FOLDER,
	WORKSPACE
}

export interface IWorkspaceFoldersWillChangeEvent {

	readonly changes: IWorkspaceFoldersChangeEvent;
	readonly fromCache: boolean;

	join(promise: Promise<void>): void;
}

export interface IWorkspaceFoldersChangeEvent {
	added: IWorkspaceFolder[];
	removed: IWorkspaceFolder[];
	changed: IWorkspaceFolder[];
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
	 * Transient workspaces are meant to go away after being used
	 * once, e.g. a window reload of a transient workspace will
	 * open an empty window.
	 */
	readonly transient?: boolean;

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI | null;
}

export function isWorkspace(thing: unknown): thing is IWorkspace {
	const candidate = thing as IWorkspace | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& typeof candidate.id === 'string'
		&& Array.isArray(candidate.folders));
}

export interface IWorkspaceFolderData {

	/**
	 * The associated URI for this workspace folder.
	 */
	readonly uri: URI;

	/**
	 * The name of this workspace folder. Defaults to
	 * the basename of its [uri-path](#Uri.path)
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

export function isWorkspaceFolder(thing: unknown): thing is IWorkspaceFolder {
	const candidate = thing as IWorkspaceFolder;

	return !!(candidate && typeof candidate === 'object'
		&& URI.isUri(candidate.uri)
		&& typeof candidate.name === 'string'
		&& typeof candidate.toResource === 'function');
}

export class Workspace implements IWorkspace {

	private _foldersMap: TernarySearchTree<URI, WorkspaceFolder> = TernarySearchTree.forUris<WorkspaceFolder>(this._ignorePathCasing, () => true);
	private _folders!: WorkspaceFolder[];

	constructor(
		private _id: string,
		folders: WorkspaceFolder[],
		private _transient: boolean,
		private _configuration: URI | null,
		private _ignorePathCasing: (key: URI) => boolean,
	) {
		this.folders = folders;
	}

	update(workspace: Workspace) {
		this._id = workspace.id;
		this._configuration = workspace.configuration;
		this._transient = workspace.transient;
		this._ignorePathCasing = workspace._ignorePathCasing;
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

	get transient(): boolean {
		return this._transient;
	}

	get configuration(): URI | null {
		return this._configuration;
	}

	set configuration(configuration: URI | null) {
		this._configuration = configuration;
	}

	getFolder(resource: URI): IWorkspaceFolder | null {
		if (!resource) {
			return null;
		}

		return this._foldersMap.findSubstr(resource) || null;
	}

	private updateFoldersMap(): void {
		this._foldersMap = TernarySearchTree.forUris<WorkspaceFolder>(this._ignorePathCasing, () => true);
		for (const folder of this.folders) {
			this._foldersMap.set(folder.uri, folder);
		}
	}

	toJSON(): IWorkspace {
		return { id: this.id, folders: this.folders, transient: this.transient, configuration: this.configuration };
	}
}

export interface IRawFileWorkspaceFolder {
	readonly path: string;
	name?: string;
}

export interface IRawUriWorkspaceFolder {
	readonly uri: string;
	name?: string;
}

export class WorkspaceFolder implements IWorkspaceFolder {

	readonly uri: URI;
	readonly name: string;
	readonly index: number;

	constructor(
		data: IWorkspaceFolderData,
		/**
		 * Provides access to the original metadata for this workspace
		 * folder. This can be different from the metadata provided in
		 * this class:
		 * - raw paths can be relative
		 * - raw paths are not normalized
		 */
		readonly raw?: IRawFileWorkspaceFolder | IRawUriWorkspaceFolder
	) {
		this.uri = data.uri;
		this.index = data.index;
		this.name = data.name;
	}

	toResource(relativePath: string): URI {
		return joinPath(this.uri, relativePath);
	}

	toJSON(): IWorkspaceFolderData {
		return { uri: this.uri, name: this.name, index: this.index };
	}
}

export function toWorkspaceFolder(resource: URI): WorkspaceFolder {
	return new WorkspaceFolder({ uri: resource, index: 0, name: basenameOrAuthority(resource) }, { uri: resource.toString() });
}

export const WORKSPACE_EXTENSION = 'code-workspace';
export const WORKSPACE_SUFFIX = `.${WORKSPACE_EXTENSION}`;
export const WORKSPACE_FILTER = [{ name: localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];
export const UNTITLED_WORKSPACE_NAME = 'workspace.json';

export function isUntitledWorkspace(path: URI, environmentService: IEnvironmentService): boolean {
	return extUriBiasedIgnorePathCase.isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}

export function isTemporaryWorkspace(workspace: IWorkspace): boolean;
export function isTemporaryWorkspace(path: URI): boolean;
export function isTemporaryWorkspace(arg1: IWorkspace | URI): boolean {
	let path: URI | null | undefined;
	if (URI.isUri(arg1)) {
		path = arg1;
	} else {
		path = arg1.configuration;
	}

	return path?.scheme === Schemas.tmp;
}

export const STANDALONE_EDITOR_WORKSPACE_ID = '4064f6ec-cb38-4ad0-af64-ee6467e63c82';
export function isStandaloneEditorWorkspace(workspace: IWorkspace): boolean {
	return workspace.id === STANDALONE_EDITOR_WORKSPACE_ID;
}

export function isSavedWorkspace(path: URI, environmentService: IEnvironmentService): boolean {
	return !isUntitledWorkspace(path, environmentService) && !isTemporaryWorkspace(path);
}

export function hasWorkspaceFileExtension(path: string | URI) {
	const ext = (typeof path === 'string') ? extname(path) : resourceExtname(path);

	return ext === WORKSPACE_SUFFIX;
}
