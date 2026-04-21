/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, ReferenceCollection } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import { ISessionDatabase, ISessionDataService, SESSION_DB_FILENAME } from '../common/sessionDataService.js';
import { SessionDatabase } from './sessionDatabase.js';

class SessionDatabaseCollection extends ReferenceCollection<ISessionDatabase> {

	/**
	 * The set of currently-open databases. Mirrors what's held by the
	 * underlying ref-counted map, but exposed so {@link SessionDataService.whenIdle}
	 * can iterate without reaching into private state.
	 */
	readonly liveDatabases = new Set<ISessionDatabase>();

	constructor(
		private readonly _getDbPath: (key: string) => string,
		private readonly _logService: ILogService,
	) {
		super();
	}

	protected createReferencedObject(key: string): ISessionDatabase {
		const dbPath = this._getDbPath(key);
		this._logService.trace(`[SessionDataService] Opening database: ${dbPath}`);
		const db = new SessionDatabase(dbPath);
		this.liveDatabases.add(db);
		return db;
	}

	protected destroyReferencedObject(_key: string, object: ISessionDatabase): void {
		this.liveDatabases.delete(object);
		object.dispose();
	}
}

/**
 * Implementation of {@link ISessionDataService} that stores per-session data
 * under `{userDataPath}/agentSessionData/{sessionId}/`.
 */
export class SessionDataService implements ISessionDataService {
	declare readonly _serviceBrand: undefined;

	private readonly _basePath: URI;
	private readonly _databases: SessionDatabaseCollection;

	constructor(
		userDataPath: URI,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		getDbPath?: (key: string) => string, // for testing
	) {
		this._basePath = URI.joinPath(userDataPath, 'agentSessionData');
		this._databases = new SessionDatabaseCollection(
			getDbPath ?? (key => URI.joinPath(this._basePath, key, SESSION_DB_FILENAME).fsPath),
			this._logService,
		);
	}

	getSessionDataDir(session: URI): URI {
		return this.getSessionDataDirById(AgentSession.id(session));
	}

	getSessionDataDirById(sessionId: string): URI {
		const sanitized = sessionId.replace(/[^a-zA-Z0-9_.-]/g, '-');
		return URI.joinPath(this._basePath, sanitized);
	}

	private _sanitizedSessionKey(session: URI): string {
		return AgentSession.id(session).replace(/[^a-zA-Z0-9_.-]/g, '-');
	}

	openDatabase(session: URI): IReference<ISessionDatabase> {
		return this._databases.acquire(this._sanitizedSessionKey(session));
	}

	async tryOpenDatabase(session: URI): Promise<IReference<ISessionDatabase> | undefined> {
		const key = this._sanitizedSessionKey(session);
		const dbPath = URI.joinPath(this._basePath, key, SESSION_DB_FILENAME);
		if (!await this._fileService.exists(dbPath)) {
			return undefined;
		}
		return this._databases.acquire(key);
	}

	async deleteSessionData(session: URI): Promise<void> {
		const dir = this.getSessionDataDir(session);
		try {
			if (await this._fileService.exists(dir)) {
				await this._fileService.del(dir, { recursive: true });
				this._logService.trace(`[SessionDataService] Deleted session data: ${dir.toString()}`);
			}
		} catch (err) {
			this._logService.warn(`[SessionDataService] Failed to delete session data: ${dir.toString()}`, err);
		}
	}

	async cleanupOrphanedData(knownSessionIds: Set<string>): Promise<void> {
		try {
			const exists = await this._fileService.exists(this._basePath);
			if (!exists) {
				return;
			}

			const stat = await this._fileService.resolve(this._basePath);
			if (!stat.children) {
				return;
			}

			const deletions: Promise<void>[] = [];
			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}
				const name = child.name;
				if (!knownSessionIds.has(name)) {
					this._logService.trace(`[SessionDataService] Cleaning up orphaned session data: ${name}`);
					deletions.push(
						this._fileService.del(child.resource, { recursive: true }).catch(err => {
							this._logService.warn(`[SessionDataService] Failed to clean up orphaned data: ${name}`, err);
						})
					);
				}
			}

			await Promise.all(deletions);
		} catch (err) {
			this._logService.warn('[SessionDataService] Failed to run orphan cleanup', err);
		}
	}

	async whenIdle(): Promise<void> {
		// Each `SessionDatabase.whenIdle()` already loops internally until
		// that DB is quiescent, so the outer loop only needs to handle the
		// case where a new DB was opened (and writes queued against it)
		// while we were awaiting an earlier pass.
		while (true) {
			const dbs = [...this._databases.liveDatabases];
			if (dbs.length === 0) {
				return;
			}
			await Promise.all(dbs.map(db => db.whenIdle()));
			const newOnes = [...this._databases.liveDatabases].filter(db => !dbs.includes(db));
			if (newOnes.length === 0) {
				return;
			}
		}
	}
}
