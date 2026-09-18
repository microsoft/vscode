/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database } from '@vscode/sqlite3';
import type { Stats } from 'fs';
import { lstat, unlink } from 'fs/promises';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { hasKey } from '../../../base/common/types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { getAgentSessionSearchTerms, type IAgentChatSearchResult } from '../common/agentHostSessionSearch.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { SessionSearchDatabase, type ISessionSearchChat, type ISessionSearchSource } from './sessionSearchDatabase.js';
import type { ISessionSemanticRequest, ISessionSemanticResult } from '../common/sessionSemanticSearch.js';

export const IAgentHostSessionSearchIndex = createDecorator<IAgentHostSessionSearchIndex>('agentHostSessionSearchIndex');

export interface IAgentHostSessionSearchIndex {
	readonly _serviceBrand: undefined;
	searchChat(chat: ISessionSearchChat, query: string, readSource: () => Promise<ISessionSearchSource>): Promise<IAgentChatSearchResult>;
	semanticSearch(sessionUri: string, chatUris: readonly string[], request: ISessionSemanticRequest): Promise<ISessionSemanticResult>;
}

/** Owns the derived search cache, independently of provider and session-history databases. */
export class AgentHostSessionSearchIndex extends Disposable implements IAgentHostSessionSearchIndex {
	declare readonly _serviceBrand: undefined;
	private readonly database: SessionSearchDatabase | undefined;

	constructor(
		databasePath: string | undefined,
		@ISessionDataService private readonly sessionDataService: ISessionDataService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.database = databasePath ? new SessionSearchDatabase(databasePath) : undefined;
		this._register(sessionDataService.onWillDeleteSessionData(event => {
			if (this.database) {
				event.waitUntil(this.database.deleteScope(event.session.toString()));
			}
		}));
	}

	async searchChat(chat: ISessionSearchChat, query: string, readSource: () => Promise<ISessionSearchSource>): Promise<IAgentChatSearchResult> {
		if (this._store.isDisposed) {
			throw new Error('Agent Host search cache has been disposed');
		}
		if (getAgentSessionSearchTerms(query).length === 0) {
			return { matches: [], hasMore: false };
		}
		if (!this.database) {
			throw new Error('Agent Host search cache storage is unavailable');
		}
		const result = await this.database.searchChat(chat, query, readSource);
		const legacy = URI.joinPath(this.sessionDataService.getSessionDataDir(URI.parse(chat.storageUri)), 'session-search.db');
		try {
			await removeLegacySearchIndex(legacy.fsPath);
		} catch (error) {
			this.logService.warn('[AgentHostSessionSearchIndex] Could not remove legacy search cache', error);
		}
		return result;
	}

	async semanticSearch(sessionUri: string, chatUris: readonly string[], request: ISessionSemanticRequest): Promise<ISessionSemanticResult> {
		if (this._store.isDisposed || !this.database) {
			throw new Error('Agent Host search cache storage is unavailable');
		}
		return this.database.semanticSearch(sessionUri, chatUris, request);
	}
}

async function removeLegacySearchIndex(path: string): Promise<void> {
	let info: Stats;
	try {
		info = await lstat(path);
	} catch (error) {
		if (hasKey(error, { code: true }) && error.code === 'ENOENT') {
			return;
		}
		throw error;
	}
	if (!info.isFile()) {
		throw new Error('Legacy search cache is not a regular file');
	}
	const sqlite3 = await import('@vscode/sqlite3');
	const db = await new Promise<Database>((resolve, reject) => {
		const database = new sqlite3.default.Database(path, sqlite3.default.OPEN_READONLY, error => error ? reject(error) : resolve(database));
	});
	try {
		const metadata = await new Promise<{ version: number; source: string; messageSchema: string } | undefined>((resolve, reject) => {
			db.get(`SELECT version, source, (SELECT sql FROM sqlite_master WHERE name = 'messages' AND type = 'table') AS messageSchema FROM search_metadata LIMIT 1`,
				(error: Error | null, row: { version: number; source: string; messageSchema: string } | undefined) => error ? reject(error) : resolve(row));
		});
		if (metadata?.version !== 1 || typeof metadata.source !== 'string'
			|| typeof metadata.messageSchema !== 'string' || !/USING\s+fts5\s*\(\s*turn_id\s+UNINDEXED,\s*role\s+UNINDEXED,\s*content\s*\)/i.test(metadata.messageSchema)) {
			throw new Error('File is not the expected legacy search cache');
		}
	} finally {
		await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
	}
	const current = await lstat(path);
	if (current.ino !== info.ino || current.size !== info.size || current.mtimeMs !== info.mtimeMs) {
		throw new Error('Legacy search cache changed during migration');
	}
	await unlink(path);
}
