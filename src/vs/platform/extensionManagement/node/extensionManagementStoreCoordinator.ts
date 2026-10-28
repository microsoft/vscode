/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncLocalStorage } from 'async_hooks';
import { mkdir } from 'fs/promises';
import { userInfo } from 'os';
import { randomUUID } from 'crypto';
import type { Database } from '@vscode/sqlite3';
import { Sequencer } from '../../../base/common/async.js';
import { dirname, join } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';

interface OperationContext {
	readonly database: Database;
	readonly reservationId: string | undefined;
	readonly pending: Set<Promise<unknown>>;
	active: boolean;
	mutationAuthorized: boolean;
}

interface ReservationRow {
	id: string;
	state: 'ACTIVE' | 'RELEASED';
}

interface IntentRow {
	id: string;
	target: string;
	state: 'PENDING' | 'DONE';
}

interface IntentWithOperationRow extends IntentRow {
	operationId: string | null;
	operationState: PreparedOperationRow['state'] | null;
	operationPayload: string | null;
}

interface PreparedOperationRow {
	state: 'PREPARED' | 'TERMINAL' | 'ABORTED';
	payload: string | null;
}

/**
 * Coordinates participating extension-store operations across processes of one OS user.
 * SQLite locks cover running filesystem tasks; durable reservations fence later writers.
 * Filesystem effects are not rolled back when a task fails or its process exits.
 */
export class ExtensionManagementStoreCoordinator {
	private readonly queue = new Sequencer();
	private readonly context = new AsyncLocalStorage<OperationContext>();
	private connection: Promise<Database> | undefined;
	private closed = false;
	private sharedReads = new WeakMap<object, Map<string, Promise<unknown>>>();

	constructor(private readonly databasePath: string, private readonly busyTimeoutMs = 5000) { }

	withRead<T>(task: () => Promise<T>): Promise<T> {
		const context = this.context.getStore();
		if (context && !context.active) {
			return Promise.reject(this.expiredContextError());
		}
		if (context?.active) {
			return this.track(context, task);
		}
		return this.transaction(undefined, task);
	}

	/** Shares only compatible queued/in-flight reads; every independent writer or protocol call is a barrier. */
	withSharedRead<T>(owner: object, key: string, task: () => Promise<T>): Promise<T> {
		if (this.context.getStore()) {
			// Operation-owned reads must retain their own reservation and expiry checks.
			return this.withRead(task);
		}
		let reads = this.sharedReads.get(owner);
		if (!reads) {
			this.sharedReads.set(owner, reads = new Map());
		}
		const existing = reads.get(key);
		if (existing) {
			return existing as Promise<T>;
		}
		const pending = this.transaction(undefined, task, true);
		reads.set(key, pending);
		const evict = () => {
			if (reads.get(key) === pending) {
				reads.delete(key);
			}
		};
		pending.then(evict, evict);
		return pending;
	}

	withMutation<T>(task: () => Promise<T>): Promise<T> {
		const context = this.context.getStore();
		if (context && !context.active) {
			return Promise.reject(this.expiredContextError());
		}
		this.sharedReads = new WeakMap();
		if (context?.active) {
			return this.track(context, async () => {
				await this.authorizeMutation(context);
				return task();
			});
		}
		return this.transaction(undefined, async () => {
			await this.authorizeMutation(this.context.getStore()!);
			return task();
		});
	}

	getIdentity(): Promise<string> {
		return this.transaction(undefined, database => this.identity(database));
	}

	reserve<T>(id: string, read: () => Promise<T>, expectedIdentity?: string): Promise<T> {
		return this.transaction(id, async database => {
			await this.checkIdentity(database, expectedIdentity);
			const row = await this.reservation(database, id);
			if (row?.state === 'RELEASED') {
				throw new Error(localize('extensionReservationReleased', "The extension operation has already been released."));
			}
			await this.checkReservations(database, id);
			await run(database, 'INSERT INTO reservations (id, state) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', [id, 'ACTIVE']);
			this.context.getStore()!.mutationAuthorized = true;
			return read();
		});
	}

	release(id: string, expectedIdentity?: string): Promise<void> {
		return this.transaction(undefined, async database => {
			await this.checkIdentity(database, expectedIdentity);
			await run(database, 'INSERT INTO reservations (id, state) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state', [id, 'RELEASED']);
		});
	}

	prepareOperation(id: string, payload: string, recoveryTarget?: string): Promise<void> {
		return this.transaction(undefined, async database => {
			if (recoveryTarget !== undefined && !recoveryTarget.length) {
				throw this.corruptError();
			}
			const operation = await this.operation(database, id);
			const intent = await this.intent(database, id);
			if (operation) {
				if (operation.state === 'PREPARED' && operation.payload === payload && intent?.target === recoveryTarget && (!intent || intent.state === 'PENDING')) {
					return;
				}
				throw new Error(localize('extensionOperationAlreadyPrepared', "The extension operation cannot be prepared again."));
			}
			if (intent) {
				throw this.corruptError();
			}
			await run(database, 'INSERT INTO operations (id, state, payload) VALUES (?, ?, ?)', [id, 'PREPARED', payload]);
			if (recoveryTarget !== undefined) {
				await run(database, 'INSERT INTO intents (id, target, state) VALUES (?, ?, ?)', [id, recoveryTarget, 'PENDING']);
			}
		});
	}

	pendingOperations(target: string): Promise<string[]> {
		return this.transaction(undefined, async database => {
			if (!target.length) {
				throw this.corruptError();
			}
			const rows = await all<IntentWithOperationRow>(database, `SELECT intents.id, intents.target, intents.state,
				operations.id AS operationId, operations.state AS operationState, operations.payload AS operationPayload
				FROM intents LEFT JOIN operations ON operations.id = intents.id`);
			const pending: string[] = [];
			for (const row of rows) {
				this.validateIntent(row);
				if (row.operationId === null) {
					throw this.corruptError();
				}
				this.validateOperation({ state: row.operationState!, payload: row.operationPayload });
				if (row.target === target && row.state === 'PENDING') {
					pending.push(row.id);
				}
			}
			return pending;
		});
	}

	/** Call only after the remote release has been confirmed. */
	acknowledgeOperation(id: string): Promise<void> {
		return this.transaction(undefined, async database => {
			const operation = await this.operation(database, id);
			const intent = await this.intent(database, id);
			if (!operation || operation.state === 'PREPARED' || (await this.reservation(database, id))?.state === 'ACTIVE') {
				throw new Error(localize('extensionOperationNotFinished', "The extension operation must finish and release its reservation before recovery can be acknowledged."));
			}
			if (intent) {
				await run(database, 'UPDATE intents SET state = ? WHERE id = ?', ['DONE', id]);
			}
		});
	}

	async commitOperation(id: string, task: (payload: string) => Promise<void>): Promise<void> {
		const outcome = await this.transaction(id, async database => {
			const operation = await this.operation(database, id);
			if (!operation || operation.state !== 'PREPARED' || operation.payload === null) {
				throw new Error(localize('extensionOperationNotPrepared', "The extension operation is not prepared or has already finished."));
			}
			await this.authorizeMutation(this.context.getStore()!);
			if ((await this.reservation(database, id))?.state === 'RELEASED') {
				throw new Error(localize('extensionReservationReleased', "The extension operation has already been released."));
			}
			let outcome: { ok: true } | { ok: false; error: unknown };
			try {
				await task(operation.payload);
				await this.drain(this.context.getStore()!);
				outcome = { ok: true };
			} catch (error) {
				// Wait for nested work before recording its terminal result or releasing the SQL lock.
				await this.drain(this.context.getStore()!).catch(() => { });
				outcome = { ok: false, error };
			}
			// Commit this marker even on task failure: partial filesystem effects must never be replayed.
			await run(database, 'UPDATE operations SET state = ?, payload = NULL WHERE id = ?', ['TERMINAL', id]);
			return outcome;
		});
		if (!outcome.ok) {
			throw outcome.error;
		}
	}

	abortOperation(id: string): Promise<void> {
		return this.transaction(undefined, database => run(database,
			'INSERT INTO operations (id, state, payload) VALUES (?, ?, NULL) ON CONFLICT(id) DO UPDATE SET state = excluded.state, payload = NULL', [id, 'ABORTED']));
	}

	/** Closes this instance after its queued operations, without deleting durable fencing state. */
	close(): Promise<void> {
		if (this.context.getStore()) {
			return Promise.reject(new Error(localize('extensionCoordinatorNestedClose', "Cannot close extension coordination during an operation.")));
		}
		this.sharedReads = new WeakMap();
		return this.queue.queue(async () => {
			this.closed = true;
			if (this.connection) {
				// Opening failures already close their handle and must not prevent cleanup.
				const database = await this.connection.catch(() => undefined);
				if (!database) {
					return;
				}
				await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
				this.connection = undefined;
			}
		});
	}

	private transaction<T>(reservationId: string | undefined, task: (database: Database) => Promise<T>, sharedRead = false): Promise<T> {
		const inherited = this.context.getStore();
		if (inherited && !inherited.active) {
			return Promise.reject(this.expiredContextError());
		}
		if (inherited) {
			return Promise.reject(new Error(localize('extensionCoordinatorNestedProtocol', "Cannot change extension operation state from inside another operation.")));
		}
		if (!sharedRead) {
			this.sharedReads = new WeakMap();
		}
		return this.queue.queue(async () => {
			if (this.closed) {
				throw new Error(localize('extensionCoordinatorClosed', "Extension coordination has been closed."));
			}
			const database = await (this.connection ??= this.open());
			await exec(database, 'BEGIN IMMEDIATE');
			const context: OperationContext = { database, reservationId, pending: new Set(), active: true, mutationAuthorized: false };
			try {
				const result = await this.context.run(context, () => task(database));
				await this.drain(context);
				context.active = false;
				await this.identity(database);
				await exec(database, 'COMMIT');
				return result;
			} catch (error) {
				await this.drain(context).catch(() => { });
				context.active = false;
				await exec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	private expiredContextError(): Error {
		return new Error(localize('extensionOperationExpired', "The extension operation has already finished. Its delayed work cannot access extension storage."));
	}

	private track<T>(context: OperationContext, task: () => Promise<T>): Promise<T> {
		const pending = Promise.resolve().then(task);
		context.pending.add(pending);
		// Observe both branches without creating another rejected promise.
		pending.then(() => context.pending.delete(pending), () => context.pending.delete(pending));
		return pending;
	}

	private async drain(context: OperationContext): Promise<void> {
		let failure: PromiseRejectedResult | undefined;
		while (context.pending.size) {
			const results = await Promise.allSettled([...context.pending]);
			failure ??= results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
		}
		if (failure) {
			throw failure.reason;
		}
	}

	private async checkReservations(database: Database, ownId?: string): Promise<void> {
		const rows = await all<ReservationRow>(database, 'SELECT id, state FROM reservations');
		for (const row of rows) {
			this.validateReservation(row);
			if (row.state === 'ACTIVE' && row.id !== ownId) {
				throw new Error(localize('extensionStoreReserved', "Extensions cannot be changed while another extension operation is reserved. Complete or cancel that operation and try again."));
			}
		}
	}

	private async authorizeMutation(context: OperationContext): Promise<void> {
		if (!context.mutationAuthorized) {
			await this.checkReservations(context.database, context.reservationId);
			// BEGIN IMMEDIATE excludes other writers, and protocol calls cannot nest in this context.
			context.mutationAuthorized = true;
		}
	}

	private async reservation(database: Database, id: string): Promise<ReservationRow | undefined> {
		const rows = await all<ReservationRow>(database, 'SELECT id, state FROM reservations WHERE id = ?', [id]);
		const row = rows[0];
		if (row) {
			this.validateReservation(row);
		}
		return row;
	}

	private validateReservation(row: ReservationRow): void {
		if (typeof row.id !== 'string' || (row.state !== 'ACTIVE' && row.state !== 'RELEASED')) {
			throw new Error(localize('extensionCoordinationCorrupt', "Extension coordination data is invalid. Extension changes have been stopped."));
		}
	}

	private async operation(database: Database, id: string): Promise<PreparedOperationRow | undefined> {
		const rows = await all<PreparedOperationRow>(database, 'SELECT state, payload FROM operations WHERE id = ?', [id]);
		const row = rows[0];
		if (row) {
			this.validateOperation(row);
		}
		return row;
	}

	private validateOperation(row: PreparedOperationRow): void {
		if (!['PREPARED', 'TERMINAL', 'ABORTED'].includes(row.state) || (row.state === 'PREPARED' ? typeof row.payload !== 'string' : row.payload !== null)) {
			throw this.corruptError();
		}
	}

	private corruptError(): Error {
		return new Error(localize('extensionCoordinationCorrupt', "Extension coordination data is invalid. Extension changes have been stopped."));
	}

	private async identity(database: Database): Promise<string> {
		const rows = await all<{ key: string; value: string }>(database, 'SELECT key, value FROM metadata');
		if (rows.length !== 1 || rows[0].key !== 'identity' || typeof rows[0].value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rows[0].value)) {
			throw this.corruptError();
		}
		return rows[0].value;
	}

	private async checkIdentity(database: Database, expectedIdentity: string | undefined): Promise<void> {
		const identity = await this.identity(database);
		if (expectedIdentity !== undefined && identity !== expectedIdentity) {
			throw new Error(localize('extensionStoreIdentityChanged', "The extension storage identity has changed. The operation has been stopped without changing its reservation."));
		}
	}

	private validateIntent(row: IntentRow): void {
		if (typeof row.id !== 'string' || typeof row.target !== 'string' || !row.target.length || !['PENDING', 'DONE'].includes(row.state)) {
			throw this.corruptError();
		}
	}

	private async intent(database: Database, id: string): Promise<IntentRow | undefined> {
		const rows = await all<IntentRow>(database, 'SELECT id, target, state FROM intents WHERE id = ?', [id]);
		if (rows[0]) {
			this.validateIntent(rows[0]);
		}
		return rows[0];
	}

	private async open(): Promise<Database> {
		await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 });
		const sqlite3 = await import('@vscode/sqlite3');
		const database = await new Promise<Database>((resolve, reject) => {
			const connection = new sqlite3.default.Database(this.databasePath, error => error ? reject(error) : resolve(connection));
		});
		try {
			database.configure('busyTimeout', this.busyTimeoutMs);
			await exec(database, 'PRAGMA synchronous = FULL');
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const versions = await all<{ user_version: number }>(database, 'PRAGMA user_version');
				if (versions[0]?.user_version !== 0 && versions[0]?.user_version !== 2) {
					throw new Error(localize('extensionCoordinationVersion', "The extension coordination database version is unsupported."));
				}
				const checks = await all<{ quick_check: string }>(database, 'PRAGMA quick_check');
				if (checks.length !== 1 || checks[0].quick_check !== 'ok') {
					throw new Error(localize('extensionCoordinationCorrupt', "Extension coordination data is invalid. Extension changes have been stopped."));
				}
				const tables = await all<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`);
				if (versions[0].user_version === 0) {
					if (tables.length) {
						throw new Error(localize('extensionCoordinationCorrupt', "Extension coordination data is invalid. Extension changes have been stopped."));
					}
					await exec(database, `CREATE TABLE reservations (id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'RELEASED')));
						CREATE TABLE operations (id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL CHECK (state IN ('PREPARED', 'TERMINAL', 'ABORTED')), payload TEXT, CHECK ((state = 'PREPARED' AND payload IS NOT NULL) OR (state != 'PREPARED' AND payload IS NULL)));
						CREATE TABLE intents (id TEXT PRIMARY KEY NOT NULL, target TEXT NOT NULL CHECK (length(target) > 0), state TEXT NOT NULL CHECK (state IN ('PENDING', 'DONE')));
						CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
						PRAGMA user_version = 2;`);
					await run(database, 'INSERT INTO metadata (key, value) VALUES (?, ?)', ['identity', randomUUID()]);
				} else if (tables.map(table => table.name).join(',') !== 'intents,metadata,operations,reservations') {
					// Never recreate missing tables: doing so would erase durable fences.
					throw new Error(localize('extensionCoordinationCorrupt', "Extension coordination data is invalid. Extension changes have been stopped."));
				}
				await this.identity(database);
				await exec(database, 'COMMIT');
			} catch (error) {
				await exec(database, 'ROLLBACK');
				throw error;
			}
			return database;
		} catch (error) {
			await new Promise<void>(resolve => database.close(() => resolve()));
			throw error;
		}
	}
}

let coordinator: ExtensionManagementStoreCoordinator | undefined;

export function getExtensionManagementStoreCoordinator(): ExtensionManagementStoreCoordinator {
	return coordinator ??= new ExtensionManagementStoreCoordinator(process.env['VSCODE_EXTENSION_STORE_COORDINATION_PATH'] || join(userInfo().homedir, '.vscode-extension-store', 'coordination.sqlite'));
}

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function run(database: Database, sql: string, parameters: readonly string[]): Promise<void> {
	return new Promise((resolve, reject) => database.run(sql, parameters, error => error ? reject(error) : resolve()));
}

function all<T>(database: Database, sql: string, parameters: readonly string[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => database.all(sql, parameters, (error: Error | null, rows: T[]) => error ? reject(error) : resolve(rows)));
}
