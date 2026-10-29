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
import { canUseWriteAheadLog, configureSqliteJournal, type ISqliteJournalHost } from '../../node/agentHostSqliteJournal.js';

function host(platform: NodeJS.Platform, options: { readonly fileSystemType?: number | Error; readonly realpath?: (directory: string) => string } = {}): ISqliteJournalHost {
	const { fileSystemType = 0xef53, realpath = (directory: string) => directory } = options;
	return {
		platform,
		fileSystemType: async () => {
			if (fileSystemType instanceof Error) {
				throw fileSystemType;
			}
			return fileSystemType;
		},
		realpath: async directory => realpath(directory),
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

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
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
			['Windows mapped network drive', 'Z:\\Code\\User\\globalStorage\\agent-host.db', host('win32', { realpath: directory => directory.replace(/^Z:/, '\\\\server\\share') })],
			['Windows substituted drive', 'S:\\Code\\agent-host.db', host('win32', { realpath: () => 'C:\\data\\Code' })],
			['Windows unresolvable drive', 'Y:\\Code\\agent-host.db', host('win32', { realpath: () => { throw new Error('ENOENT'); } })],
			['Linux ext4', '/home/me/.config/Code/User/globalStorage/agent-host.db', host('linux', { fileSystemType: 0xef53 })],
			['Linux tmpfs', '/tmp/agent-host.db', host('linux', { fileSystemType: 0x01021994 })],
			['Linux NFS', '/home/me/.config/Code/User/globalStorage/agent-host.db', host('linux', { fileSystemType: 0x6969 })],
			['Linux CIFS', '/mnt/share/agent-host.db', host('linux', { fileSystemType: 0xff534d42 })],
			['WSL Windows drive', '/mnt/c/Users/me/agent-host.db', host('linux', { fileSystemType: 0x01021997 })],
			['Linux sshfs', '/home/me/remote/agent-host.db', host('linux', { fileSystemType: 0x65735546 })],
			['Linux unknown file system', '/data/agent-host.db', host('linux', { fileSystemType: new Error('ENOSYS') })],
			['macOS', '/Users/me/Library/Application Support/Code/User/globalStorage/agent-host.db', host('darwin')],
			['in memory', ':memory:', host('darwin')],
		];

		const results = Object.fromEntries(await Promise.all(cases.map(async ([name, path, journalHost]) => [name, await canUseWriteAheadLog(path, journalHost)])));

		assert.deepStrictEqual(results, {
			'Windows drive': true,
			'Windows long drive path': true,
			'Windows share': false,
			'Windows long share path': false,
			'Windows mapped network drive': false,
			'Windows substituted drive': true,
			'Windows unresolvable drive': false,
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

	suite('configureSqliteJournal', () => {

		let directory: string;
		const local = host('darwin');
		const network = host('linux', { fileSystemType: 0x6969 });

		setup(async () => {
			directory = await fs.mkdtemp(join(tmpdir(), 'agent-host-sqlite-journal-'));
		});

		teardown(async () => {
			await fs.rm(directory, { recursive: true, force: true });
		});

		async function describeJournal(database: Database) {
			return {
				journalMode: (await get(database, 'PRAGMA journal_mode'))?.journal_mode,
				synchronous: (await get(database, 'PRAGMA synchronous'))?.synchronous,
			};
		}

		async function configure(name: string, journalHost: ISqliteJournalHost) {
			const path = join(directory, name);
			const database = await openDatabase(path);
			try {
				return { usesWriteAheadLog: await configureSqliteJournal(database, path, journalHost), ...await describeJournal(database) };
			} finally {
				await close(database);
			}
		}

		test('uses the write-ahead log locally and the rollback journal on a network file system, including for a database that moved there', async () => {
			assert.deepStrictEqual({
				local: await configure('local.db', local),
				network: await configure('network.db', network),
				movedToNetwork: [await configure('moved.db', local), await configure('moved.db', network)],
			}, {
				// `synchronous`: 1 is NORMAL, 2 is FULL, SQLite's default.
				local: { usesWriteAheadLog: true, journalMode: 'wal', synchronous: 1 },
				network: { usesWriteAheadLog: false, journalMode: 'delete', synchronous: 2 },
				movedToNetwork: [
					{ usesWriteAheadLog: true, journalMode: 'wal', synchronous: 1 },
					{ usesWriteAheadLog: false, journalMode: 'delete', synchronous: 2 },
				],
			});
		});

		test('keeps the write-ahead log while another connection\'s transaction prevents leaving it', async () => {
			const path = join(directory, 'shared.db');
			const reader = await openDatabase(path);
			try {
				await configureSqliteJournal(reader, path, local);
				await exec(reader, 'CREATE TABLE item (id INTEGER); BEGIN; SELECT count(*) FROM item;');
				const database = await openDatabase(path);
				try {
					assert.deepStrictEqual({
						usesWriteAheadLog: await configureSqliteJournal(database, path, network),
						...await describeJournal(database),
					}, { usesWriteAheadLog: false, journalMode: 'wal', synchronous: 2 });
				} finally {
					await close(database);
				}
			} finally {
				await exec(reader, 'COMMIT');
				await close(reader);
			}
		});
	});
});
