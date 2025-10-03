/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { VSBufferReadable, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IWorkingCopyBackupMeta, IWorkingCopyIdentifier } from './workingCopy.js';

export const IWorkingCopyBackupService = createDecorator<IWorkingCopyBackupService>('workingCopyBackupService');

/**
 * A resolved working copy backup carries the backup value
 * as well as associated metadata with it.
 */
export interface IResolvedWorkingCopyBackup<T extends IWorkingCopyBackupMeta> {

	/**
	 * The content of the working copy backup.
	 */
	readonly value: VSBufferReadableStream;

	/**
	 * Additional metadata that is associated with
	 * the working copy backup.
	 */
	readonly meta?: T;
}

/**
 * The working copy backup service is the main service to handle backups
 * for working copies.
 * Methods allow to persist and resolve working copy backups from the file
 * system.
 */
export interface IWorkingCopyBackupService {

	readonly _serviceBrand: undefined;

	/**
	 * Finds out if a working copy backup with the given identifier
	 * and optional version exists.
	 *
	 * Note: if the backup service has not been initialized yet, this may return
	 * the wrong result. Always use `resolve()` if you can do a long running
	 * operation.
	 */
	hasBackupSync(identifier: IWorkingCopyIdentifier, versionId?: number): boolean;

	/**
	 * Gets a list of working copy backups for the current workspace.
	 */
	getBackups(): Promise<readonly IWorkingCopyIdentifier[]>;

	/**
	 * Resolves the working copy backup for the given identifier if that exists.
	 */
	resolve<T extends IWorkingCopyBackupMeta>(identifier: IWorkingCopyIdentifier): Promise<IResolvedWorkingCopyBackup<T> | undefined>;

	/**
	 * Stores a new working copy backup for the given identifier.
	 */
	backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadable | VSBufferReadableStream, versionId?: number, meta?: IWorkingCopyBackupMeta, token?: CancellationToken): Promise<void>;

	/**
	 * Discards the working copy backup associated with the identifier if it exists.
	 */
	discardBackup(identifier: IWorkingCopyIdentifier, token?: CancellationToken): Promise<void>;

	/**
	 * Discards all working copy backups.
	 *
	 * The optional set of identifiers in the filter can be
	 * provided to discard all but the provided ones.
	 */
	discardBackups(filter?: { except: IWorkingCopyIdentifier[] }): Promise<void>;
}
