/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export const IWorkspaceEditingService = createDecorator<IWorkspaceEditingService>('workspaceEditingService');

export interface IWorkspaceEditingService {

	readonly _serviceBrand: undefined;

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
	 * Enters the workspace with the provided path.
	 */
	enterWorkspace(path: URI): Promise<void>;

	/**
	 * Creates a new workspace with the provided folders and opens it. if path is provided
	 * the workspace will be saved into that location.
	 */
	createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI): Promise<void>;

	/**
	 * Saves the current workspace to the provided path and opens it. requires a workspace to be opened.
	 */
	saveAndEnterWorkspace(path: URI): Promise<void>;

	/**
	 * Copies current workspace settings to the target workspace.
	 */
	copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void>;

	/**
	 * Picks a new workspace path
	 */
	pickNewWorkspacePath(): Promise<URI | undefined>;
}
