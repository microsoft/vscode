/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { URI, UriComponents } from 'vs/base/common/uri';
import { isEqualOrParent, normalizeWithSlashes } from 'vs/base/common/extpath';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { isAbsolute, relative, posix, resolve, extname } from 'vs/base/common/path';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { originalFSPath, dirname } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import * as jsonEdit from 'vs/base/common/jsonEdit';
import * as json from 'vs/base/common/json';

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
}

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
}

export interface IWorkspaceSavedEvent {
	workspace: IWorkspaceIdentifier;
	oldConfigPath: string;
}

export interface IWorkspaceFolderCreationData {
	uri: URI;
	name?: string;
}

export interface IWorkspacesMainService extends IWorkspacesService {
	_serviceBrand: any;

	onUntitledWorkspaceDeleted: Event<IWorkspaceIdentifier>;

	saveWorkspaceAs(workspace: IWorkspaceIdentifier, target: string): Promise<IWorkspaceIdentifier>;

	createUntitledWorkspaceSync(folders?: IWorkspaceFolderCreationData[]): IWorkspaceIdentifier;

	resolveLocalWorkspaceSync(path: URI): IResolvedWorkspace | null;

	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean;

	deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void;

	getUntitledWorkspacesSync(): IWorkspaceIdentifier[];

	getWorkspaceIdentifier(workspacePath: URI): IWorkspaceIdentifier;
}

export interface IWorkspacesService {
	_serviceBrand: any;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[]): Promise<IWorkspaceIdentifier>;
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

export function hasWorkspaceFileExtension(path: string) {
	return extname(path) === WORKSPACE_SUFFIX;
}

const SLASH = '/';

/**
 * Given the absolute path to a folder, massage it in a way that it fits
 * into an existing set of workspace folders of a workspace.
 *
 * @param absoluteFolderPath the absolute path of a workspace folder
 * @param targetConfigFolder the folder where the workspace is living in
 * @param existingFolders a set of existing folders of the workspace
 */
export function massageFolderPathForWorkspace(absoluteFolderPath: string, targetConfigFolderURI: URI, existingFolders: IStoredWorkspaceFolder[]): string {

	if (targetConfigFolderURI.scheme === Schemas.file) {
		const targetFolderPath = originalFSPath(targetConfigFolderURI);
		// Convert path to relative path if the target config folder
		// is a parent of the path.
		if (isEqualOrParent(absoluteFolderPath, targetFolderPath, !isLinux)) {
			absoluteFolderPath = relative(targetFolderPath, absoluteFolderPath) || '.';
		}

		// Windows gets special treatment:
		// - normalize all paths to get nice casing of drive letters
		// - convert to slashes if we want to use slashes for paths
		if (isWindows) {
			if (isAbsolute(absoluteFolderPath)) {
				if (shouldUseSlashForPath(existingFolders)) {
					absoluteFolderPath = normalizeWithSlashes(absoluteFolderPath /* do not use OS path separator */);
				}

				absoluteFolderPath = normalizeDriveLetter(absoluteFolderPath);
			} else if (shouldUseSlashForPath(existingFolders)) {
				absoluteFolderPath = absoluteFolderPath.replace(/[\\]/g, SLASH);
			}
		}
	} else {
		if (isEqualOrParent(absoluteFolderPath, targetConfigFolderURI.path)) {
			absoluteFolderPath = posix.relative(absoluteFolderPath, targetConfigFolderURI.path) || '.';
		}
	}

	return absoluteFolderPath;
}

/**
 * Rewrites the content of a workspace file to be saved at a new location.
 * Throws an exception if file is not a valid workspace file
 */
export function rewriteWorkspaceFileForNewLocation(rawWorkspaceContents: string, configPathURI: URI, targetConfigPathURI: URI) {
	let storedWorkspace = doParseStoredWorkspace(configPathURI, rawWorkspaceContents);

	const sourceConfigFolder = dirname(configPathURI)!;
	const targetConfigFolder = dirname(targetConfigPathURI)!;

	// Rewrite absolute paths to relative paths if the target workspace folder
	// is a parent of the location of the workspace file itself. Otherwise keep
	// using absolute paths.
	for (const folder of storedWorkspace.folders) {
		if (isRawFileWorkspaceFolder(folder)) {
			if (sourceConfigFolder.scheme === Schemas.file) {
				if (!isAbsolute(folder.path)) {
					folder.path = resolve(originalFSPath(sourceConfigFolder), folder.path); // relative paths get resolved against the workspace location
				}
				folder.path = massageFolderPathForWorkspace(folder.path, targetConfigFolder, storedWorkspace.folders);
			}
		}
	}

	// Preserve as much of the existing workspace as possible by using jsonEdit
	// and only changing the folders portion.
	let newRawWorkspaceContents = rawWorkspaceContents;
	const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], storedWorkspace.folders, { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' });
	edits.forEach(edit => {
		newRawWorkspaceContents = jsonEdit.applyEdit(rawWorkspaceContents, edit);
	});
	return newRawWorkspaceContents;
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

function shouldUseSlashForPath(storedFolders: IStoredWorkspaceFolder[]): boolean {

	// Determine which path separator to use:
	// - macOS/Linux: slash
	// - Windows: use slash if already used in that file
	let useSlashesForPath = !isWindows;
	if (isWindows) {
		storedFolders.forEach(folder => {
			if (isRawFileWorkspaceFolder(folder) && !useSlashesForPath && folder.path.indexOf(SLASH) >= 0) {
				useSlashesForPath = true;
			}
		});
	}

	return useSlashesForPath;
}