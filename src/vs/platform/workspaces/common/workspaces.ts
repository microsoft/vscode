/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { URI, UriComponents } from 'vs/base/common/uri';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { extname } from 'vs/base/common/path';
import { dirname, resolvePath, isEqualAuthority, isEqualOrParent, relativePath, extname as resourceExtname } from 'vs/base/common/resources';
import * as jsonEdit from 'vs/base/common/jsonEdit';
import * as json from 'vs/base/common/json';
import { Schemas } from 'vs/base/common/network';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { toSlashes } from 'vs/base/common/extpath';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';

export const IWorkspacesMainService = createDecorator<IWorkspacesMainService>('workspacesMainService');
export const IWorkspacesService = createDecorator<IWorkspacesService>('workspacesService');

export const WORKSPACE_EXTENSION = 'code-workspace';
export const WORKSPACE_FILTER = [{ name: localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];
export const UNTITLED_WORKSPACE_NAME = 'workspace.json';

/**
 * A single folder workspace identifier is just the path to the folder.
 */
export type ISingleFolderWorkspaceIdentifier = URI;

export interface IWorkspaceIdentifier {
	id: string;
	configPath: URI;
}

export function reviveWorkspaceIdentifier(workspace: { id: string, configPath: UriComponents; }): IWorkspaceIdentifier {
	return { id: workspace.id, configPath: URI.revive(workspace.configPath) };
}

export function isStoredWorkspaceFolder(thing: any): thing is IStoredWorkspaceFolder {
	return isRawFileWorkspaceFolder(thing) || isRawUriWorkspaceFolder(thing);
}

export function isRawFileWorkspaceFolder(thing: any): thing is IRawFileWorkspaceFolder {
	return thing
		&& typeof thing === 'object'
		&& typeof thing.path === 'string'
		&& (!thing.name || typeof thing.name === 'string');
}

export function isRawUriWorkspaceFolder(thing: any): thing is IRawUriWorkspaceFolder {
	return thing
		&& typeof thing === 'object'
		&& typeof thing.uri === 'string'
		&& (!thing.name || typeof thing.name === 'string');
}

export interface IRawFileWorkspaceFolder {
	path: string;
	name?: string;
}

export interface IRawUriWorkspaceFolder {
	uri: string;
	name?: string;
}

export type IStoredWorkspaceFolder = IRawFileWorkspaceFolder | IRawUriWorkspaceFolder;

export interface IResolvedWorkspace extends IWorkspaceIdentifier {
	folders: IWorkspaceFolder[];
	remoteAuthority?: string;
}

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
	remoteAuthority?: string;
}

export interface IWorkspaceSavedEvent {
	workspace: IWorkspaceIdentifier;
	oldConfigPath: string;
}

export interface IWorkspaceFolderCreationData {
	uri: URI;
	name?: string;
}

export interface IUntitledWorkspaceInfo {
	workspace: IWorkspaceIdentifier;
	remoteAuthority?: string;
}

export interface IWorkspacesMainService extends IWorkspacesService {
	_serviceBrand: any;

	onUntitledWorkspaceDeleted: Event<IWorkspaceIdentifier>;

	createUntitledWorkspaceSync(folders?: IWorkspaceFolderCreationData[]): IWorkspaceIdentifier;

	resolveLocalWorkspaceSync(path: URI): IResolvedWorkspace | null;

	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean;

	deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void;

	getUntitledWorkspacesSync(): IUntitledWorkspaceInfo[];
}

export interface IWorkspacesService {
	_serviceBrand: any;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier>;

	deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void>;

	getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier>;
}

export function isSingleFolderWorkspaceIdentifier(obj: any): obj is ISingleFolderWorkspaceIdentifier {
	return obj instanceof URI;
}

export function isWorkspaceIdentifier(obj: any): obj is IWorkspaceIdentifier {
	const workspaceIdentifier = obj as IWorkspaceIdentifier;

	return workspaceIdentifier && typeof workspaceIdentifier.id === 'string' && workspaceIdentifier.configPath instanceof URI;
}

export function toWorkspaceIdentifier(workspace: IWorkspace): IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined {
	if (workspace.configuration) {
		return {
			configPath: workspace.configuration,
			id: workspace.id
		};
	}
	if (workspace.folders.length === 1) {
		return workspace.folders[0].uri;
	}

	// Empty workspace
	return undefined;
}

export type IMultiFolderWorkspaceInitializationPayload = IWorkspaceIdentifier;
export interface ISingleFolderWorkspaceInitializationPayload { id: string; folder: ISingleFolderWorkspaceIdentifier; }
export interface IEmptyWorkspaceInitializationPayload { id: string; }

export type IWorkspaceInitializationPayload = IMultiFolderWorkspaceInitializationPayload | ISingleFolderWorkspaceInitializationPayload | IEmptyWorkspaceInitializationPayload;

export function isSingleFolderWorkspaceInitializationPayload(obj: any): obj is ISingleFolderWorkspaceInitializationPayload {
	return isSingleFolderWorkspaceIdentifier((obj.folder as ISingleFolderWorkspaceIdentifier));
}

const WORKSPACE_SUFFIX = '.' + WORKSPACE_EXTENSION;

export function hasWorkspaceFileExtension(path: string | URI) {
	const ext = (typeof path === 'string') ? extname(path) : resourceExtname(path);

	return ext === WORKSPACE_SUFFIX;
}

const SLASH = '/';

/**
 * Given a folder URI and the workspace config folder, computes the IStoredWorkspaceFolder using
* a relative or absolute path or a uri.
 * Undefined is returned if the folderURI and the targetConfigFolderURI don't have the same schema or authority
 *
 * @param folderURI a workspace folder
 * @param folderName a workspace name
 * @param targetConfigFolderURI the folder where the workspace is living in
 * @param useSlashForPath if set, use forward slashes for file paths on windows
 */
export function getStoredWorkspaceFolder(folderURI: URI, folderName: string | undefined, targetConfigFolderURI: URI, useSlashForPath = !isWindows): IStoredWorkspaceFolder {

	if (folderURI.scheme !== targetConfigFolderURI.scheme) {
		return { name: folderName, uri: folderURI.toString(true) };
	}

	let folderPath: string | undefined;
	if (isEqualOrParent(folderURI, targetConfigFolderURI)) {
		// use relative path
		folderPath = relativePath(targetConfigFolderURI, folderURI) || '.'; // always uses forward slashes
		if (isWindows && folderURI.scheme === Schemas.file && !useSlashForPath) {
			// Windows gets special treatment:
			// - use backslahes unless slash is used by other existing folders
			folderPath = folderPath.replace(/\//g, '\\');
		}
	} else {
		// use absolute path
		if (folderURI.scheme === Schemas.file) {
			folderPath = folderURI.fsPath;
			if (isWindows) {
				// Windows gets special treatment:
				// - normalize all paths to get nice casing of drive letters
				// - use backslahes unless slash is used by other existing folders
				folderPath = normalizeDriveLetter(folderPath);
				if (useSlashForPath) {
					folderPath = toSlashes(folderPath);
				}
			}
		} else {
			if (!isEqualAuthority(folderURI.authority, targetConfigFolderURI.authority)) {
				return { name: folderName, uri: folderURI.toString(true) };
			}
			folderPath = folderURI.path;
		}
	}
	return { name: folderName, path: folderPath };
}

/**
 * Rewrites the content of a workspace file to be saved at a new location.
 * Throws an exception if file is not a valid workspace file
 */
export function rewriteWorkspaceFileForNewLocation(rawWorkspaceContents: string, configPathURI: URI, targetConfigPathURI: URI) {
	let storedWorkspace = doParseStoredWorkspace(configPathURI, rawWorkspaceContents);

	const sourceConfigFolder = dirname(configPathURI);
	const targetConfigFolder = dirname(targetConfigPathURI);

	const rewrittenFolders: IStoredWorkspaceFolder[] = [];
	const slashForPath = useSlashForPath(storedWorkspace.folders);

	// Rewrite absolute paths to relative paths if the target workspace folder
	// is a parent of the location of the workspace file itself. Otherwise keep
	// using absolute paths.
	for (const folder of storedWorkspace.folders) {
		let folderURI = isRawFileWorkspaceFolder(folder) ? resolvePath(sourceConfigFolder, folder.path) : URI.parse(folder.uri);
		rewrittenFolders.push(getStoredWorkspaceFolder(folderURI, folder.name, targetConfigFolder, slashForPath));
	}

	// Preserve as much of the existing workspace as possible by using jsonEdit
	// and only changing the folders portion.
	const formattingOptions: FormattingOptions = { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' };
	const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], rewrittenFolders, formattingOptions);
	let newContent = jsonEdit.applyEdits(rawWorkspaceContents, edits);

	if (storedWorkspace.remoteAuthority === getRemoteAuthority(targetConfigPathURI)) {
		// unsaved remote workspaces have the remoteAuthority set. Remove it when no longer nexessary.
		newContent = jsonEdit.applyEdits(newContent, jsonEdit.removeProperty(newContent, ['remoteAuthority'], formattingOptions));
	}
	return newContent;
}

function doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

	// Parse workspace file
	let storedWorkspace: IStoredWorkspace = json.parse(contents); // use fault tolerant parser

	// Filter out folders which do not have a path or uri set
	if (Array.isArray(storedWorkspace.folders)) {
		storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
	}

	// Validate
	if (!Array.isArray(storedWorkspace.folders)) {
		throw new Error(`${path} looks like an invalid workspace file.`);
	}

	return storedWorkspace;
}

export function useSlashForPath(storedFolders: IStoredWorkspaceFolder[]): boolean {
	if (isWindows) {
		for (const folder of storedFolders) {
			if (isRawFileWorkspaceFolder(folder) && folder.path.indexOf(SLASH) >= 0) {
				return true;
			}
		}
		return false;
	}
	return true;
}