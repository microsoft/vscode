/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';

export const IWorkspaceEditingService = createDecorator<IWorkspaceEditingService>('workspaceEditingService');

export interface IWorkspaceEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Add folders to the existing workspace.
	 * When `donotNotifyError` is `true`, error will be bubbled up otherwise, the service handles the error with proper message and action
	 */
	addFolders(folders: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void>;

	/**
	 * Remove folders from the existing workspace
	 * When `donotNotifyError` is `true`, error will be bubbled up otherwise, the service handles the error with proper message and action
	 */
	removeFolders(folders: URI[], donotNotifyError?: boolean): Promise<void>;

	/**
	 * Allows to add and remove folders to the existing workspace at once.
	 * When `donotNotifyError` is `true`, error will be bubbled up otherwise, the service handles the error with proper message and action
	 */
	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void>;

	/**
	 * enters the workspace with the provided path.
	 */
	enterWorkspace(path: string): Promise<void>;

	/**
	 * creates a new workspace with the provided folders and opens it. if path is provided
	 * the workspace will be saved into that location.
	 */
	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): Promise<void>;

	/**
	 * saves the workspace to the provided path and opens it. requires a workspace to be opened.
	 */
	saveAndEnterWorkspace(path: string): Promise<void>;

	/**
	 * copies current workspace settings to the target workspace.
	 */
	copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void>;
}