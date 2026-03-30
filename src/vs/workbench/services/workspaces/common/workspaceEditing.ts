/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { URI } from '../../../../base/common/uri.js';
import { IAnyWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export const IWorkspaceEditingService = createDecorator<IWorkspaceEditingService>('workspaceEditingService');

/**
 * An event that is fired after entering a workspace. Clients can join the entering
 * by providing a promise from the join method. This allows for long running operations
 * to complete (e.g. to migrate data into the new workspace) before the workspace
 * is fully entered.
 */
export interface IDidEnterWorkspaceEvent {
	readonly oldWorkspace: IAnyWorkspaceIdentifier;
	readonly newWorkspace: IAnyWorkspaceIdentifier;

	join(promise: Promise<void>): void;
}

/**
 * Options that control workspace entry behavior.
 */
export interface IEnterWorkspaceOptions {
	/**
	 * When `true`, the extension host restart confirmation dialog is
	 * suppressed. Extension hosts are still stopped and restarted
	 * cleanly; only the user-facing veto dialog is bypassed.
	 *
	 * Callers should only set this when the user has already consented
	 * to the operation that triggers the workspace transition.
	 */
	readonly suppressConfirmation?: boolean;
}

export interface IWorkspaceEditingService {

	readonly _serviceBrand: undefined;

	/**
	 * Fired after the workspace is entered. Allows listeners to join the
	 * entering with a promise to migrate data into this new workspace.
	 */
	readonly onDidEnterWorkspace: Event<IDidEnterWorkspaceEvent>;

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
	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean, options?: IEnterWorkspaceOptions): Promise<void>;

	/**
	 * Enters the workspace with the provided path.
	 */
	enterWorkspace(path: URI, options?: IEnterWorkspaceOptions): Promise<void>;

	/**
	 * Creates a new workspace with the provided folders and opens it. if path is provided
	 * the workspace will be saved into that location.
	 */
	createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI, options?: IEnterWorkspaceOptions): Promise<void>;

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
