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
	 * Removes a workspace backup path being tracked for restoration, deregistering all associated
	 * resources for backup.
	 *
	 * @param workspace The absolute workspace path being removed.
	 */
	removeWorkspaceBackupPath(workspace: Uri): TPromise<void>;

	/**
	 * Gets whether a text file has a backup to restore.
	 *
	 * @param resource The resource to check.
	 * @returns Whether the file has a backup.
	 */
	doesTextFileHaveBackup(resource: Uri): TPromise<boolean>;

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
