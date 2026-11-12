/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database } from '@vscode/sqlite3';
import { posix, win32 } from '../../../base/common/path.js';

/**
 * `statfs` types of Linux network and FUSE file systems. SQLite's write-ahead log keeps its index
 * in shared memory, which processes on different machines cannot share.
 */
const LINUX_NETWORK_FILE_SYSTEM_TYPES: ReadonlySet<number> = new Set([
	0x6969, // NFS
	0x517b, // SMB
	0xff534d42, // CIFS
	0xfe534d42, // SMB2
	0x01021997, // 9P, including WSL's mounts of Windows drives
	0x00c36400, // Ceph
	0x5346414f, // AFS
	0x65735546, // FUSE, such as sshfs
]);

/** What {@link canUseWriteAheadLog} needs to know about the machine. */
export interface ISqliteJournalHost {
	readonly platform: NodeJS.Platform;
	/** The `statfs` type of the file system that holds `directory`. */
	fileSystemType(directory: string): Promise<number>;
	/** The canonical path of `directory`, which resolves a mapped Windows network drive to its UNC path. */
	realpath(directory: string): Promise<string>;
}

const nodeSqliteJournalHost: ISqliteJournalHost = {
	platform: process.platform,
	fileSystemType: async directory => (await fs.promises.statfs(directory)).type,
	// `fs.promises.realpath` has the semantics of `fs.realpath.native`.
	realpath: directory => fs.promises.realpath(directory),
};

/** Whether `path` names a database file, as opposed to an in-memory or URI-named database. */
function isDatabaseFile(path: string): boolean {
	return path !== '' && path !== ':memory:' && !path.startsWith('file:');
}

/** Whether a Windows path is remote: `\\server\share` and `\\?\UNC\server\share` are, but `\\?\C:\` is a local drive. */
function isWindowsRemotePath(path: string): boolean {
	return /^[\\/]{2}/.test(path) && !/^[\\/]{2}[?.][\\/][a-z]:/i.test(path);
}

/**
 * Whether the database file at `path` can use SQLite's write-ahead log, which requires a local
 * file system. On Windows, a UNC path, such as a redirected AppData folder, and a drive that
 * resolves to one, such as a mapped network drive, keep the rollback journal; on Linux, so do
 * network and FUSE file systems, and on both, so does a path whose locality cannot be established.
 * Other platforms, such as macOS, have no stable file system type numbers, so their paths count as
 * local.
 */
export async function canUseWriteAheadLog(path: string, host: ISqliteJournalHost = nodeSqliteJournalHost): Promise<boolean> {
	if (!isDatabaseFile(path)) {
		return false;
	}
	try {
		if (host.platform === 'win32') {
			return !isWindowsRemotePath(path) && !isWindowsRemotePath(await host.realpath(win32.dirname(path)));
		}
		if (host.platform === 'linux') {
			return !LINUX_NETWORK_FILE_SYSTEM_TYPES.has(await host.fileSystemType(posix.dirname(path)));
		}
	} catch {
		return false;
	}
	return true;
}

/**
 * Switches the database file at `path` to SQLite's write-ahead log with `synchronous = NORMAL` when
 * it is on a local file system. A commit then appends to the log instead of creating, flushing and
 * deleting a rollback journal, which is slow where disk flushes are slow, such as on Windows. After
 * a power loss or an OS crash, the last commits can roll back, but the database stays consistent,
 * and a crash of the process loses nothing.
 *
 * Elsewhere, a database that is still in the write-ahead log, which persists in the database file,
 * such as one that moved from a local disk to a network share, returns to the rollback journal.
 * Either switch leaves the database in its current mode when another connection's lock prevents it;
 * a later open retries. Returns whether the connection uses the write-ahead log with
 * `synchronous = NORMAL`.
 */
export async function configureSqliteJournal(database: Database, path: string, host: ISqliteJournalHost = nodeSqliteJournalHost): Promise<boolean> {
	if (!isDatabaseFile(path)) {
		return false;
	}
	try {
		if (!await canUseWriteAheadLog(path, host)) {
			if ((await get(database, 'PRAGMA journal_mode'))?.journal_mode === 'wal') {
				await get(database, 'PRAGMA journal_mode = DELETE');
			}
			return false;
		}
		if ((await get(database, 'PRAGMA journal_mode = WAL'))?.journal_mode !== 'wal') {
			return false;
		}
	} catch {
		return false;
	}
	// `synchronous` applies per connection, and `NORMAL` is only free of corruption risk in WAL mode.
	await exec(database, 'PRAGMA synchronous = NORMAL');
	return true;
}

function get(database: Database, sql: string): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => database.get(sql, [], (error: Error | null, row: Record<string, unknown> | undefined) => error ? reject(error) : resolve(row)));
}

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}
