/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { isParent } from "vs/platform/files/common/files";
import { localize } from "vs/nls";
import { basename } from "vs/base/common/paths";
import { isLinux } from "vs/base/common/platform";
import { IEnvironmentService } from "vs/platform/environment/common/environment";

export const IWorkspacesMainService = createDecorator<IWorkspacesMainService>('workspacesMainService');
export const IWorkspacesService = createDecorator<IWorkspacesService>('workspacesService');

export const WORKSPACE_EXTENSION = 'code-workspace';

/**
 * A single folder workspace identifier is just the path to the folder.
 */
export type ISingleFolderWorkspaceIdentifier = string;

export interface IWorkspaceIdentifier {
	id: string;
	configPath: string;
}

export interface IStoredWorkspace {
	id: string;
	folders: string[];
}

export interface IWorkspacesMainService extends IWorkspacesService {
	_serviceBrand: any;

	resolveWorkspaceSync(path: string): IWorkspaceIdentifier;
	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean;
}

export interface IWorkspacesService {
	_serviceBrand: any;

	createWorkspace(folders?: string[]): TPromise<IWorkspaceIdentifier>;
	saveWorkspace(workspace: IWorkspaceIdentifier, target: string): TPromise<IWorkspaceIdentifier>;
}

export function getWorkspaceLabel(environmentService: IEnvironmentService, workspace: IWorkspaceIdentifier): string {
	if (isParent(workspace.configPath, environmentService.workspacesHome, !isLinux /* ignore case */)) {
		return localize('untitledWorkspace', "Untitled Workspace");
	}

	const filename = basename(workspace.configPath);
	const workspaceName = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);

	return localize('workspaceName', "{0} (Workspace)", workspaceName);
}

export function isSingleFolderWorkspaceIdentifier(obj: any): obj is ISingleFolderWorkspaceIdentifier {
	return typeof obj === 'string';
}