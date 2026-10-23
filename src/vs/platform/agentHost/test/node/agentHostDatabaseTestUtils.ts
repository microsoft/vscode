/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { AgentHostDatabase, type IAgentHostDatabaseOptions } from '../../node/agentHostDatabase.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';

/**
 * Tests open many fresh on-disk databases, each running every schema migration as its own transaction. With the
 * default durability each commit creates, syncs and deletes a journal file, so these tests stall whenever the
 * machine's disk is slow to sync. Restarts and old builds are modelled by reopening the file, which needs no
 * durability, so test databases drop it.
 */
const testDatabaseOptions: IAgentHostDatabaseOptions = { durable: false };

/** An {@link AgentHostDatabase} for tests: see {@link testDatabaseOptions}. */
export class NonDurableAgentHostDatabase extends AgentHostDatabase {
	constructor(path: string, onDidRunStatement?: (sql: string) => Promise<void>) {
		super(path, onDidRunStatement, testDatabaseOptions);
	}
}

/** A {@link CompatibleAgentHostDatabase} for tests: see {@link testDatabaseOptions}. */
export class NonDurableCompatibleAgentHostDatabase extends CompatibleAgentHostDatabase {
	constructor(path: string, writeCompatibility = true) {
		super(path, writeCompatibility, testDatabaseOptions);
	}
}

/**
 * A temporary directory holding on-disk agent host databases for one test.
 *
 * Disposing an {@link AgentHostDatabase} only starts closing its SQLite connection, so a teardown that disposes its
 * databases and then deletes the directory races the close. Windows cannot delete a file that is still open
 * (`EBUSY … unlink agent-host.db`). {@link track} every database opened in {@link path}, then call {@link remove}
 * after disposing the test's other objects: it waits until every tracked database has closed before deleting.
 */
export class AgentHostDatabaseTestDirectory {

	static async create(prefix: string): Promise<AgentHostDatabaseTestDirectory> {
		return new AgentHostDatabaseTestDirectory(await mkdtemp(join(tmpdir(), prefix)));
	}

	private readonly _opened: AgentHostDatabase[] = [];

	private constructor(readonly path: string) { }

	/** Records {@link database} so {@link remove} waits for its file to close. Returns it for chaining. */
	track<T extends AgentHostDatabase | CompatibleAgentHostDatabase>(database: T): T {
		// The raw database owns the file.
		this._opened.push(database instanceof CompatibleAgentHostDatabase ? database.raw : database);
		return database;
	}

	/**
	 * Closes every tracked database, then deletes the directory. Call it after disposing whatever could still queue
	 * writes on those databases (stores, schedulers). Retries cover a virus scanner briefly opening a just-closed file.
	 */
	async remove(): Promise<void> {
		await Promise.all(this._opened.splice(0).map(database => database.close()));
		await rm(this.path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	}
}
