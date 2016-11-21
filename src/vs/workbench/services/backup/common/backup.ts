/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Uri from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textfiles';
import { IResolveContentOptions, IUpdateContentOptions } from 'vs/platform/files/common/files';

export const IBackupService = createDecorator<IBackupService>('backupService');
export const IBackupFileService = createDecorator<IBackupFileService>('backupFileService');

export const BACKUP_FILE_RESOLVE_OPTIONS: IResolveContentOptions = { acceptTextOnly: true, encoding: 'utf-8' };
export const BACKUP_FILE_UPDATE_OPTIONS: IUpdateContentOptions = { encoding: 'utf-8' };

export interface IBackupResult {
	didBackup: boolean;
}

/**
 * A service that handles the lifecycle of backups, eg. listening for file changes and acting
 * appropriately on shutdown.
 */
export interface IBackupService {
	_serviceBrand: any;

	isHotExitEnabled: boolean;
	backupBeforeShutdown(dirtyToBackup: Uri[], textFileEditorModelManager: ITextFileEditorModelManager, quitRequested: boolean): TPromise<IBackupResult>;
	cleanupBackupsBeforeShutdown(): TPromise<void>;
}

/**
 * A service that handles any I/O and state associated with the backup system.
 */
export interface IBackupFileService {
	_serviceBrand: any;

	/**
	 * Gets whether a text file has a backup to restore.
	 *
	 * @param resource The resource to check.
	 * @returns Whether the file has a backup.
	 */
	hasBackup(resource: Uri): TPromise<boolean>;

	/**
	 * Gets the backup resource for a particular resource within the current workspace.
	 *
	 * @param resource The resource that is backed up.
	 * @return The backup resource.
	 */
	getBackupResource(resource: Uri): Uri;

	/**
	 * Backs up a resource.
	 *
	 * @param resource The resource to back up.
	 * @param content THe content of the resource.
	 */
	backupResource(resource: Uri, content: string): TPromise<void>;

	/**
	 * Discards the backup associated with a resource if it exists..
	 *
	 * @param resource The resource whose backup is being discarded discard to back up.
	 */
	discardResourceBackup(resource: Uri): TPromise<void>;

	/**
	 * Discards all backups associated with the current workspace.
	 */
	discardAllWorkspaceBackups(): TPromise<void>;
}
