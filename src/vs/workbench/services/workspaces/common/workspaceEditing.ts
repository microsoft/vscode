/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { URI } from '../../../../base/common/uri.js';
import { IAnyWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { FolderLocationChangeReason } from '../../../../platform/workspace/common/folderLocations.js';

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
	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void>;

	/**
	 * Moves the folder to `location`; pass the `uri` of the workspace's single-folder identifier
	 * (`toWorkspaceIdentifier`) to return it to its own location. The workspace identity (id, storage, extension state) is unchanged. Any other
	 * `location` must be resolved by a registered `IWorkspaceFolderLocationProvider`.
	 * Only supported for single local folder workspaces.
	 * If the workspace is trusted and the destination is not (and no built-in provider vouches for it),
	 * the user is asked once; declining still switches, in Restricted Mode. Returning to the primary location
	 * follows the same rule with the primary's own trust. A request superseded before its trust grant starts
	 * persists no trust; a grant that already started completes, but the superseded switch is not applied.
	 * `options.folder` optionally names the folder to move by its current `uri`; it must match
	 * the folder of the workspace. Multi-root workspaces are not supported yet.
	 *
	 * When `options.ifIdle` is `true`, the call does nothing if another switch is still in flight,
	 * so that background callers never override a switch requested by the user.
	 */
	setFolderLocation(location: URI, options?: { readonly ifIdle?: boolean; readonly reason?: FolderLocationChangeReason; readonly folder?: URI }): Promise<void>;

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
