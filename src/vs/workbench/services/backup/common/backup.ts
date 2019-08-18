/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { joinPath, relativePath } from 'vs/base/common/resources';

export const IBackupFileService = createDecorator<IBackupFileService>('backupFileService');

export interface IResolvedBackup<T extends object> {
	value: ITextBufferFactory;
	meta?: T;
}

/**
 * A service that handles any I/O and state associated with the backup system.
 */
export interface IBackupFileService {

	_serviceBrand: ServiceIdentifier<IBackupFileService>;

	/**
	 * Finds out if there are any backups stored.
	 */
	hasBackups(): Promise<boolean>;

	/**
	 * Finds out if the provided resource with the given version is backed up.
	 */
	hasBackupSync(resource: URI, versionId?: number): boolean;

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
	 * @param meta The (optional) meta data of the resource to backup. This information
	 * can be restored later when loading the backup again.
	 */
	backupResource<T extends object>(resource: URI, content: ITextSnapshot, versionId?: number, meta?: T): Promise<void>;

	/**
	 * Gets a list of file backups for the current workspace.
	 *
	 * @return The list of backups.
	 */
	getWorkspaceFileBackups(): Promise<URI[]>;

	/**
	 * Resolves the backup for the given resource.
	 *
	 * @param resource The resource to get the backup for.
	 * @return The backup file's backed up content and metadata if available.
	 */
	resolveBackupContent<T extends object>(resource: URI): Promise<IResolvedBackup<T>>;

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

export function toBackupWorkspaceResource(backupWorkspacePath: string, environmentService: IEnvironmentService): URI {
	return joinPath(environmentService.userRoamingDataHome, relativePath(URI.file(environmentService.userDataPath), URI.file(backupWorkspacePath))!);
}