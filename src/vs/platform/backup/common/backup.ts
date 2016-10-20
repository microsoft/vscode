/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Uri from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	_serviceBrand: any;

	/**
	 * Gets the set of active workspace backup paths being tracked for restoration.
	 *
	 * @return The set of active workspace backup paths being tracked for restoration.
	 */
	getWorkspaceBackupPaths(): TPromise<string[]>;

	/**
	 * Gets the set of active workspace backup paths being tracked for restoration.
	 *
	 * @return The set of active workspace backup paths being tracked for restoration.
	 */
	getWorkspaceBackupPathsSync(): string[];

	/**
	 * Pushes workspace backup paths to be tracked for restoration.
	 *
	 * @param workspaces The workspaces to add.
	 */
	pushWorkspaceBackupPathsSync(workspaces: Uri[]): void;

	/**
	 * Removes a workspace backup path being tracked for restoration, deregistering all associated
	 * resources for backup.
	 *
	 * @param workspace The absolute workspace path being removed.
	 */
	removeWorkspaceBackupPath(workspace: Uri): TPromise<void>;

	/**
	 * Gets the set of text files that are backed up for a particular workspace.
	 *
	 * @param workspace The workspace to get the backed up files for.
	 * @return The absolute paths for text files _that have backups_.
	 */
	getWorkspaceTextFilesWithBackupsSync(workspace: Uri): string[];

	/**
	 * Gets the set of untitled file backups for a particular workspace.
	 *
	 * @param workspace The workspace to get the backups for for.
	 * @return The absolute paths for all the untitled file _backups_.
	 */
	getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[];

	/**
	 * Registers a resource for backup, flagging it for restoration.
	 *
	 * @param resource The resource that is being backed up.
	 */
	registerResourceForBackup(resource: Uri): TPromise<void>;

	/**
	 * Deregisters a resource for backup, unflagging it for restoration.
	 *
	 * @param resource The resource that is no longer being backed up.
	 */
	deregisterResourceForBackup(resource: Uri): TPromise<void>;

	/**
	 * Gets the backup resource for a particular resource within the current workspace.
	 *
	 * @param resource The resource that is backed up.
	 * @return The backup resource.
	 */
	getBackupResource(resource: Uri): Uri;
}
