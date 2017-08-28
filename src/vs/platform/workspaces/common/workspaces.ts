/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { isParent } from 'vs/platform/files/common/files';
import { localize } from 'vs/nls';
import { basename, dirname, join } from 'vs/base/common/paths';
import { isLinux } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import Event from 'vs/base/common/event';
import { tildify, getPathLabel } from 'vs/base/common/labels';

export const IWorkspacesMainService = createDecorator<IWorkspacesMainService>('workspacesMainService');
export const IWorkspacesService = createDecorator<IWorkspacesService>('workspacesService');

export const WORKSPACE_EXTENSION = 'code-workspace';
export const WORKSPACE_FILTER = [{ name: localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];
export const UNTITLED_WORKSPACE_NAME = 'workspace.json';

/**
 * A single folder workspace identifier is just the path to the folder.
 */
export type ISingleFolderWorkspaceIdentifier = string;

export interface IWorkspaceIdentifier {
	id: string;
	configPath: string;
}

export interface IStoredWorkspaceFolder {
	path: string;
}

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
}

export interface IResolvedWorkspace extends IWorkspaceIdentifier, IStoredWorkspace { }

export interface IWorkspaceSavedEvent {
	workspace: IWorkspaceIdentifier;
	oldConfigPath: string;
}

export interface IWorkspacesMainService extends IWorkspacesService {
	_serviceBrand: any;

	onWorkspaceSaved: Event<IWorkspaceSavedEvent>;
	onUntitledWorkspaceDeleted: Event<IWorkspaceIdentifier>;

	saveWorkspace(workspace: IWorkspaceIdentifier, target: string): TPromise<IWorkspaceIdentifier>;
	createWorkspaceSync(folders?: string[]): IWorkspaceIdentifier;

	resolveWorkspace(path: string): TPromise<IResolvedWorkspace>;
	resolveWorkspaceSync(path: string): IResolvedWorkspace;

	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean;

	deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void;

	getUntitledWorkspacesSync(): IWorkspaceIdentifier[];

	getWorkspaceId(workspacePath: string): string;
}

export interface IWorkspacesService {
	_serviceBrand: any;

	createWorkspace(folders?: string[]): TPromise<IWorkspaceIdentifier>;
}

export function getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier), environmentService: IEnvironmentService, options?: { verbose: boolean }): string {

	// Workspace: Single Folder
	if (isSingleFolderWorkspaceIdentifier(workspace)) {
		return tildify(workspace, environmentService.userHome);
	}

	// Workspace: Untitled
	if (isParent(workspace.configPath, environmentService.workspacesHome, !isLinux /* ignore case */)) {
		return localize('untitledWorkspace', "Untitled (Workspace)");
	}

	// Workspace: Saved
	const filename = basename(workspace.configPath);
	const workspaceName = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
	if (options && options.verbose) {
		return localize('workspaceNameVerbose', "{0} (Workspace)", getPathLabel(join(dirname(workspace.configPath), workspaceName), null, environmentService));
	}

	return localize('workspaceName', "{0} (Workspace)", workspaceName);
}

export function isSingleFolderWorkspaceIdentifier(obj: any): obj is ISingleFolderWorkspaceIdentifier {
	return typeof obj === 'string';
}

export function isWorkspaceIdentifier(obj: any): obj is IWorkspaceIdentifier {
	const workspaceIdentifier = obj as IWorkspaceIdentifier;

	return workspaceIdentifier && typeof workspaceIdentifier.id === 'string' && typeof workspaceIdentifier.configPath === 'string';
}