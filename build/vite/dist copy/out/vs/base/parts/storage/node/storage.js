/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { timeout } from '../../../common/async.js';
import { Event } from '../../../common/event.js';
import { mapToString, setToString } from '../../../common/map.js';
import { basename } from '../../../common/path.js';
import { Promises } from '../../../node/pfs.js';
export class SQLiteStorageDatabase {
    static { this.IN_MEMORY_PATH = ':memory:'; }
    get onDidChangeItemsExternal() { return Event.None; } // since we are the only client, there can be no external changes
    static { this.BUSY_OPEN_TIMEOUT = 2000; } // timeout in ms to retry when opening DB fails with SQLITE_BUSY
    static { this.MAX_HOST_PARAMETERS = 256; } // maximum number of parameters within a statement
    constructor(path, options = Object.create(null)) {
        this.path = path;
        this.name = basename(this.path);
        this.logger = new SQLiteStorageDatabaseLogger(options.logging);
        this.whenConnected = this.connect(this.path);
    }
    async getItems() {
        const connection = await this.whenConnected;
        const items = new Map();
        const rows = await this.all(connection, 'SELECT * FROM ItemTable');
        rows.forEach(row => items.set(row.key, row.value));
        if (this.logger.isTracing) {
            this.logger.trace(`[storage ${this.name}] getItems(): ${items.size} rows`);
        }
        return items;
    }
    async updateItems(request) {
        const connection = await this.whenConnected;
        return this.doUpdateItems(connection, request);
    }
    doUpdateItems(connection, request) {
        if (this.logger.isTracing) {
            this.logger.trace(`[storage ${this.name}] updateItems(): insert(${request.insert ? mapToString(request.insert) : '0'}), delete(${request.delete ? setToString(request.delete) : '0'})`);
        }
        return this.transaction(connection, () => {
            const toInsert = request.insert;
            const toDelete = request.delete;
            // INSERT
            if (toInsert && toInsert.size > 0) {
                const keysValuesChunks = [];
                keysValuesChunks.push([]); // seed with initial empty chunk
                // Split key/values into chunks of SQLiteStorageDatabase.MAX_HOST_PARAMETERS
                // so that we can efficiently run the INSERT with as many HOST parameters as possible
                let currentChunkIndex = 0;
                toInsert.forEach((value, key) => {
                    let keyValueChunk = keysValuesChunks[currentChunkIndex];
                    if (keyValueChunk.length > SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
                        currentChunkIndex++;
                        keyValueChunk = [];
                        keysValuesChunks.push(keyValueChunk);
                    }
                    keyValueChunk.push(key, value);
                });
                keysValuesChunks.forEach(keysValuesChunk => {
                    this.prepare(connection, `INSERT INTO ItemTable VALUES ${new Array(keysValuesChunk.length / 2).fill('(?,?)').join(',')} ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`, stmt => stmt.run(keysValuesChunk), () => {
                        const keys = [];
                        let length = 0;
                        toInsert.forEach((value, key) => {
                            keys.push(key);
                            length += value.length;
                        });
                        return `Keys: ${keys.join(', ')} Length: ${length}`;
                    });
                });
            }
            // DELETE
            if (toDelete?.size) {
                const keysChunks = [];
                keysChunks.push([]); // seed with initial empty chunk
                // Split keys into chunks of SQLiteStorageDatabase.MAX_HOST_PARAMETERS
                // so that we can efficiently run the DELETE with as many HOST parameters
                // as possible
                let currentChunkIndex = 0;
                toDelete.forEach(key => {
                    let keyChunk = keysChunks[currentChunkIndex];
                    if (keyChunk.length > SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
                        currentChunkIndex++;
                        keyChunk = [];
                        keysChunks.push(keyChunk);
                    }
                    keyChunk.push(key);
                });
                keysChunks.forEach(keysChunk => {
                    this.prepare(connection, `DELETE FROM ItemTable WHERE key IN (${new Array(keysChunk.length).fill('?').join(',')})`, stmt => stmt.run(keysChunk), () => {
                        const keys = [];
                        toDelete.forEach(key => {
                            keys.push(key);
                        });
                        return `Keys: ${keys.join(', ')}`;
                    });
                });
            }
        });
    }
    async optimize() {
        this.logger.trace(`[storage ${this.name}] vacuum()`);
        const connection = await this.whenConnected;
        return this.exec(connection, 'VACUUM');
    }
    async close(recovery) {
        this.logger.trace(`[storage ${this.name}] close()`);
        const connection = await this.whenConnected;
        return this.doClose(connection, recovery);
    }
    doClose(connection, recovery) {
        return new Promise((resolve, reject) => {
            connection.db.close(closeError => {
                if (closeError) {
                    this.handleSQLiteError(connection, `[storage ${this.name}] close(): ${closeError}`);
                }
                // Return early if this storage was created only in-memory
                // e.g. when running tests we do not need to backup.
                if (this.path === SQLiteStorageDatabase.IN_MEMORY_PATH) {
                    return resolve();
                }
                // If the DB closed successfully and we are not running in-memory
                // and the DB did not get errors during runtime, make a backup
                // of the DB so that we can use it as fallback in case the actual
                // DB becomes corrupt in the future.
                if (!connection.isErroneous && !connection.isInMemory) {
                    return this.backup().then(resolve, error => {
                        this.logger.error(`[storage ${this.name}] backup(): ${error}`);
                        return resolve(); // ignore failing backup
                    });
                }
                // Recovery: if we detected errors while using the DB or we are using
                // an inmemory DB (as a fallback to not being able to open the DB initially)
                // and we have a recovery function provided, we recreate the DB with this
                // data to recover all known data without loss if possible.
                if (typeof recovery === 'function') {
                    // Delete the existing DB. If the path does not exist or fails to
                    // be deleted, we do not try to recover anymore because we assume
                    // that the path is no longer writeable for us.
                    return fs.promises.unlink(this.path).then(() => {
                        // Re-open the DB fresh
                        return this.doConnect(this.path).then(recoveryConnection => {
                            const closeRecoveryConnection = () => {
                                return this.doClose(recoveryConnection, undefined /* do not attempt to recover again */);
                            };
                            // Store items
                            return this.doUpdateItems(recoveryConnection, { insert: recovery() }).then(() => closeRecoveryConnection(), error => {
                                // In case of an error updating items, still ensure to close the connection
                                // to prevent SQLITE_BUSY errors when the connection is reestablished
                                closeRecoveryConnection();
                                return Promise.reject(error);
                            });
                        });
                    }).then(resolve, reject);
                }
                // Finally without recovery we just reject
                return reject(closeError || new Error('Database has errors or is in-memory without recovery option'));
            });
        });
    }
    backup() {
        const backupPath = this.toBackupPath(this.path);
        return Promises.copy(this.path, backupPath, { preserveSymlinks: false });
    }
    toBackupPath(path) {
        return `${path}.backup`;
    }
    async checkIntegrity(full) {
        this.logger.trace(`[storage ${this.name}] checkIntegrity(full: ${full})`);
        const connection = await this.whenConnected;
        const row = await this.get(connection, full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check');
        const integrity = full ? row.integrity_check : row.quick_check;
        if (connection.isErroneous) {
            return `${integrity} (last error: ${connection.lastError})`;
        }
        if (connection.isInMemory) {
            return `${integrity} (in-memory!)`;
        }
        return integrity;
    }
    async connect(path, retryOnBusy = true) {
        this.logger.trace(`[storage ${this.name}] open(${path}, retryOnBusy: ${retryOnBusy})`);
        try {
            return await this.doConnect(path);
        }
        catch (error) {
            this.logger.error(`[storage ${this.name}] open(): Unable to open DB due to ${error}`);
            // SQLITE_BUSY should only arise if another process is locking the same DB we want
            // to open at that time. This typically never happens because a DB connection is
            // limited per window. However, in the event of a window reload, it may be possible
            // that the previous connection was not properly closed while the new connection is
            // already established.
            //
            // In this case we simply wait for some time and retry once to establish the connection.
            //
            if (error.code === 'SQLITE_BUSY' && retryOnBusy) {
                await timeout(SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT);
                return this.connect(path, false /* not another retry */);
            }
            // Otherwise, best we can do is to recover from a backup if that exists, as such we
            // move the DB to a different filename and try to load from backup. If that fails,
            // a new empty DB is being created automatically.
            //
            // The final fallback is to use an in-memory DB which should only happen if the target
            // folder is really not writeable for us.
            //
            try {
                await fs.promises.unlink(path);
                try {
                    await Promises.rename(this.toBackupPath(path), path, false /* no retry */);
                }
                catch {
                    // ignore
                }
                return await this.doConnect(path);
            }
            catch (error) {
                this.logger.error(`[storage ${this.name}] open(): Unable to use backup due to ${error}`);
                // In case of any error to open the DB, use an in-memory
                // DB so that we always have a valid DB to talk to.
                return this.doConnect(SQLiteStorageDatabase.IN_MEMORY_PATH);
            }
        }
    }
    handleSQLiteError(connection, msg) {
        connection.isErroneous = true;
        connection.lastError = msg;
        this.logger.error(msg);
    }
    doConnect(path) {
        return new Promise((resolve, reject) => {
            import('@vscode/sqlite3').then(sqlite3 => {
                const ctor = (this.logger.isTracing ? sqlite3.default.verbose().Database : sqlite3.default.Database);
                const connection = {
                    db: new ctor(path, (error) => {
                        if (error) {
                            return (connection.db && error.code !== 'SQLITE_CANTOPEN' /* https://github.com/TryGhost/node-sqlite3/issues/1617 */) ? connection.db.close(() => reject(error)) : reject(error);
                        }
                        // The following exec() statement serves two purposes:
                        // - create the DB if it does not exist yet
                        // - validate that the DB is not corrupt (the open() call does not throw otherwise)
                        return this.exec(connection, [
                            'PRAGMA user_version = 1;',
                            'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)'
                        ].join('')).then(() => {
                            return resolve(connection);
                        }, error => {
                            return connection.db.close(() => reject(error));
                        });
                    }),
                    isInMemory: path === SQLiteStorageDatabase.IN_MEMORY_PATH
                };
                // Errors
                connection.db.on('error', error => this.handleSQLiteError(connection, `[storage ${this.name}] Error (event): ${error}`));
                // Tracing
                if (this.logger.isTracing) {
                    connection.db.on('trace', sql => this.logger.trace(`[storage ${this.name}] Trace (event): ${sql}`));
                }
            }, reject);
        });
    }
    exec(connection, sql) {
        return new Promise((resolve, reject) => {
            connection.db.exec(sql, error => {
                if (error) {
                    this.handleSQLiteError(connection, `[storage ${this.name}] exec(): ${error}`);
                    return reject(error);
                }
                return resolve();
            });
        });
    }
    get(connection, sql) {
        return new Promise((resolve, reject) => {
            connection.db.get(sql, (error, row) => {
                if (error) {
                    this.handleSQLiteError(connection, `[storage ${this.name}] get(): ${error}`);
                    return reject(error);
                }
                return resolve(row);
            });
        });
    }
    all(connection, sql) {
        return new Promise((resolve, reject) => {
            connection.db.all(sql, (error, rows) => {
                if (error) {
                    this.handleSQLiteError(connection, `[storage ${this.name}] all(): ${error}`);
                    return reject(error);
                }
                return resolve(rows);
            });
        });
    }
    transaction(connection, transactions) {
        return new Promise((resolve, reject) => {
            connection.db.serialize(() => {
                connection.db.run('BEGIN TRANSACTION');
                transactions();
                connection.db.run('END TRANSACTION', error => {
                    if (error) {
                        this.handleSQLiteError(connection, `[storage ${this.name}] transaction(): ${error}`);
                        return reject(error);
                    }
                    return resolve();
                });
            });
        });
    }
    prepare(connection, sql, runCallback, errorDetails) {
        const stmt = connection.db.prepare(sql);
        const statementErrorListener = (error) => {
            this.handleSQLiteError(connection, `[storage ${this.name}] prepare(): ${error} (${sql}). Details: ${errorDetails()}`);
        };
        stmt.on('error', statementErrorListener);
        runCallback(stmt);
        stmt.finalize(error => {
            if (error) {
                statementErrorListener(error);
            }
            stmt.removeListener('error', statementErrorListener);
        });
    }
}
class SQLiteStorageDatabaseLogger {
    // to reduce lots of output, require an environment variable to enable tracing
    // this helps when running with --verbose normally where the storage tracing
    // might hide useful output to look at
    static { this.VSCODE_TRACE_STORAGE = 'VSCODE_TRACE_STORAGE'; }
    constructor(options) {
        if (options && typeof options.logTrace === 'function' && process.env[SQLiteStorageDatabaseLogger.VSCODE_TRACE_STORAGE]) {
            this.logTrace = options.logTrace;
        }
        if (options && typeof options.logError === 'function') {
            this.logError = options.logError;
        }
    }
    get isTracing() {
        return !!this.logTrace;
    }
    trace(msg) {
        this.logTrace?.(msg);
    }
    error(error) {
        this.logError?.(error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvcGFydHMvc3RvcmFnZS9ub2RlL3N0b3JhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFxQmhELE1BQU0sT0FBTyxxQkFBcUI7YUFFakIsbUJBQWMsR0FBRyxVQUFVLENBQUM7SUFFNUMsSUFBSSx3QkFBd0IsS0FBc0MsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLGlFQUFpRTthQUVoSSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsR0FBQyxnRUFBZ0U7YUFDMUYsd0JBQW1CLEdBQUcsR0FBRyxDQUFDLEdBQUMsa0RBQWtEO0lBUXJHLFlBQ2tCLElBQVksRUFDN0IsVUFBeUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFEM0MsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUc3QixJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLDJCQUEyQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMs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