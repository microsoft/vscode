/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';

export const IBackupFileService = createDecorator<IBackupFileService>('backupFileService');

/**
 * Backups are associated with an identifier that is composed
 * of a resource and a type identifier. Combinations of the
 * same resource and type identifier will result in the same
 * backup location.
 */
export type BackupIdentifier = {

	/**
	 * The type identifier of the backup should be
	 * the same for all backups of the same kind.
	 */
	typeId: string;

	/**
	 * The specific resource the backup is about.
	 */
	resource: URI;
};

/**
 * Backup metadata that can be associated with the backup.
 *
 * Some properties may be reserved as outlined here and
 * cannot be used.
 */
export interface IBackupMeta {
	[key: string]: unknown;
	typeId?: never;
}

/**
 * A resolved backup carries the backup value as
 * well as associated metadata with it.
 */
export interface IResolvedBackup<T extends IBackupMeta> {

	/**
	 * The actual backed up value of the entity.
	 */
	readonly value: ITextBufferFactory;

	/**
	 * Additional metadata that is associated with
	 * the entity.
	 */
	readonly meta?: T;
}

/**
 * The backup file service is the main service to handle backups in VS Code.
 * Methods allow to persist and resolve backups from the file system.
 */
export interface IBackupFileService {

	readonly _serviceBrand: undefined;

	/**
	 * Finds out if there are any backups stored.
	 */
	hasBackups(): Promise<boolean>;

	/**
	 * Finds out if a backup with the given identifier and optional version
	 * exists.
	 *
	 * Note: if the backup service has not been initialized yet, this may return
	 * the wrong result. Always use `resolve()` if you can do a long running
	 * operation.
	 */
	hasBackupSync(identifier: BackupIdentifier, versionId?: number): boolean;

	/**
	 * Gets a list of backups for the current workspace.
	 */
	getBackups(): Promise<BackupIdentifier[]>;

	/**
	 * Resolves the backup for the given identifier if that exists.
	 */
	resolve<T extends IBackupMeta>(identifier: BackupIdentifier): Promise<IResolvedBackup<T> | undefined>;

	/**
	 * Stores a new backup for the given identifier.
	 */
	backup(identifier: BackupIdentifier, content?: ITextSnapshot, versionId?: number, meta?: IBackupMeta, token?: CancellationToken): Promise<void>;

	/**
	 * Discards the backup associated with the identifier if it exists.
	 */
	discardBackup(identifier: BackupIdentifier): Promise<void>;

	/**
	 * Discards all backups.
	 */
	discardBackups(): Promise<void>;
}
