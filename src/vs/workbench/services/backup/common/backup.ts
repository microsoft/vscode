/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';

export const IBackupFileService = createDecorator<IBackupFileService>('backupFileService');

/**
 * A service that handles any I/O and state associated with the backup system.
 */
export interface IBackupFileService {
	_serviceBrand: any;

	/**
	 * Finds out if there are any backups stored.
	 */
	hasBackups(): Promise<boolean>;

	/**
	 * Loads the backup resource for a particular resource within the current workspace.
	 *
	 * @param resource The resource that is backed up.
	 * @return The backup resource if any.
	 */
	loadBackupResource(resource: URI): Promise<URI | undefined>;

	/**
	 * Given a resource, returns the associated backup resource.
	 *
	 * @param resource The resource to get the backup resource for.
	 * @return The backup resource.
	 */
	toBackupResource(resource: URI): URI;

	/**
	 * Backs up a resource.
	 *
	 * @param resource The resource to back up.
	 * @param content The content of the resource as snapshot.
	 * @param versionId The version id of the resource to backup.
	 */
	backupResource(resource: URI, content: ITextSnapshot, versionId?: number): Promise<void>;

	/**
	 * Gets a list of file backups for the current workspace.
	 *
	 * @return The list of backups.
	 */
	getWorkspaceFileBackups(): Promise<URI[]>;

	/**
	 * Resolves the backup for the given resource.
	 *
	 * @param value The contents from a backup resource as stream.
	 * @return The backup file's backed up content as text buffer factory.
	 */
	resolveBackupContent(backup: URI): Promise<ITextBufferFactory | undefined>;

	/**
	 * Discards the backup associated with a resource if it exists..
	 *
	 * @param resource The resource whose backup is being discarded discard to back up.
	 */
	discardResourceBackup(resource: URI): Promise<void>;

	/**
	 * Discards all backups associated with the current workspace and prevents further backups from
	 * being made.
	 */
	discardAllWorkspaceBackups(): Promise<void>;
}
