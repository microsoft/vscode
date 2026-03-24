/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISessionDataService = createDecorator<ISessionDataService>('sessionDataService');

/**
 * Provides persistent, per-session data directories on disk.
 *
 * Each session gets a directory under `{userDataPath}/agentSessionData/{sessionId}/`
 * where internal agent-host code can store arbitrary files (e.g. file snapshots).
 *
 * Directories are created lazily — callers should use {@link IFileService.createFolder}
 * before writing files. Cleanup happens eagerly on session removal and via startup
 * garbage collection for orphaned directories.
 */
export interface ISessionDataService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the root data directory URI for a session.
	 * Does **not** create the directory on disk; callers use
	 * `IFileService.createFolder()` as needed.
	 */
	getSessionDataDir(session: URI): URI;

	/**
	 * Returns the root data directory URI for a session given its raw ID.
	 * Equivalent to {@link getSessionDataDir} but without requiring a full URI.
	 */
	getSessionDataDirById(sessionId: string): URI;

	/**
	 * Recursively deletes the data directory for a session, if it exists.
	 */
	deleteSessionData(session: URI): Promise<void>;

	/**
	 * Deletes data directories that do not correspond to any known session.
	 * Called at startup; safe to call multiple times.
	 */
	cleanupOrphanedData(knownSessionIds: Set<string>): Promise<void>;
}
