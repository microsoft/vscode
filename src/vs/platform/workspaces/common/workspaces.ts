/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { URI, UriComponents } from 'vs/base/common/uri';
import { extname } from 'vs/base/common/paths';

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
