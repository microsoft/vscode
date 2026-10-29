/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import type { Database } from '@vscode/sqlite3';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { canUseWriteAheadLog, enableWriteAheadLog, type ISqliteJournalHost } from '../../node/agentHostSqliteJournal.js';

function host(platform: NodeJS.Platform, fileSystemType: number | Error = 0xef53): ISqliteJournalHost {
	return {
		platform,
		fileSystemType: async () => {
			if (fileSystemType instanceof Error) {
				throw fileSystemType;
			}
			return fileSystemType;
		},
	};
}

function openDatabase(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
		}, reject);
	});
}

function get(database: Database, sql: string): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => database.get(sql, [], (error: Error | null, row: Record<string, unknown> | undefined) => error ? reject(error) : resolve(row)));
}

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

suite('Agent host SQLite journal', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the write-ahead log only for database files on local file systems', async () => {
		const cases: readonly (readonly [string, string, ISqliteJournalHost])[] = [
			['Windows drive', 'C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\agent-host.db', host('win32')],
			['Windows long drive path', '\\\\?\\C:\\data\\agent-host.db', host('win32')],
			['Windows share', '\\\\server\\share\\Code\\User\\globalStorage\\agent-host.db', host('win32')],
			['Windows long share path', '\\\\?\\UNC\\server\\share\\agent-host.db', host('win32')],
			['Linux ext4', '/home/me/.config/Code/User/globalStorage/agent-host.db', host('linux', 0xef53)],
			['Linux tmpfs', '/tmp/agent-host.db', host('linux', 0x01021994)],
			['Linux NFS', '/home/me/.config/Code/User/globalStorage/agent-host.db', host('linux', 0x6969)],
			['Linux CIFS', '/mnt/share/agent-host.db', host('linux', 0xff534d42)],
			['WSL Windows drive', '/mnt/c/Users/me/agent-host.db', host('linux', 0x01021997)],
			['Linux sshfs', '/home/me/remote/agent-host.db', host('linux', 0x65735546)],
			['Linux unknown file system', '/data/agent-host.db', host('linux', new Error('ENOSYS'))],
			['macOS', '/Users/me/Library/Application Support/Code/User/globalStorage/agent-host.db', host('darwin')],
			['in memory', ':memory:', host('darwin')],
		];

		const results = Object.fromEntries(await Promise.all(cases.map(async ([name, path, journalHost]) => [name, await canUseWriteAheadLog(path, journalHost)])));

		assert.deepStrictEqual(results, {
			'Windows drive': true,
			'Windows long drive path': true,
			'Windows share': false,
			'Windows long share path': false,
			'Linux ext4': true,
			'Linux tmpfs': true,
			'Linux NFS': false,
			'Linux CIFS': false,
			'WSL Windows drive': false,
			'Linux sshfs': false,
			'Linux unknown file system': false,
			'macOS': true,
			'in memory': false,
		});
	});

	test('switches a local database to the write-ahead log and leaves a remote one in its rollback journal', async () => {
		const directory = await fs.mkdtemp(join(tmpdir(), 'agent-host-sqlite-journal-'));
		try {
			const describe = async (name: string, journalHost: ISqliteJournalHost) => {
				const path = join(directory, name);
				const database = await openDatabase(path);
				try {
					const enabled = await enableWriteAheadLog(database, path, journalHost);
					return {
						enabled,
						journalMode: (await get(database, 'PRAGMA journal_mode'))?.journal_mode,
						synchronous: (await get(database, 'PRAGMA synchronous'))?.synchronous,
					};
				} finally {
					await close(database);
				}
			};

			assert.deepStrictEqual({
				local: await describe('local.db', host('darwin')),
				remote: await describe('remote.db', host('linux', 0x6969)),
			}, {
				// `synchronous`: 1 is NORMAL, 2 is FULL, SQLite's default.
				local: { enabled: true, journalMode: 'wal', synchronous: 1 },
				remote: { enabled: false, journalMode: 'delete', synchronous: 2 },
			});
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
