/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatInteractivity } from '../../common/state/protocol/channels-chat/state.js';
import { AH_META_IS_ARCHIVED_DB_KEY } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';

const FOLDER = 'file:///scratch/chat-1';
const OWNER_SESSION = 'copilotcli:/owner';
const OWNER_CHAT = 'ahp-chat:/owner-chat';
const REQUEST = { folder: FOLDER, chatUri: OWNER_CHAT, provider: 'copilotcli', requestedAt: 5 };

function openRaw(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
		}, reject);
	});
}

function execRaw(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function allRaw(database: Database, sql: string): Promise<readonly Record<string, unknown>[]> {
	return new Promise((resolve, reject) => database.all(sql, [], (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
}

function closeRaw(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

async function registerOwner(database: AgentHostDatabase, session: string, peers: readonly { chat: string; archived?: boolean; workingDirectories?: readonly string[] }[]): Promise<void> {
	await database.registerSessionV2(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
	await database.registerChatCatalogV2(session, {
		defaultChat: { chat: `${session}/default`, order: 0 },
		peers: peers.map((peer, index) => ({ ...peer, order: index + 1 })),
		privateDescendants: [],
	});
}

/** Registers a hidden private chat and deletes it, which tombstones it. */
async function deletePrivateChat(database: AgentHostDatabase, session: string, chat: string, workingDirectories: readonly string[] = []): Promise<void> {
	await registerOwner(database, session, []);
	assert.strictEqual((await database.insertPrivateChatV2(session, { chat, workingDirectories, metadata: { interactivity: ChatInteractivity.Hidden } }, 1)).status, 'applied');
	assert.strictEqual((await database.removePrivateChatV2(session, chat, 2)).status, 'applied');
}

suite('AgentHostScratchFolderDatabase', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(): AgentHostDatabase {
		return disposables.add(new AgentHostDatabase(':memory:'));
	}

	test('a folder is recorded allocating, then owned, failed and deleted', async () => {
		const database = create();
		const states: unknown[] = [];

		await database.insertScratchFolder(REQUEST);
		await database.insertScratchFolder({ ...REQUEST, chatUri: 'ahp-chat:/ignored', requestedAt: 9 });
		states.push(await database.listScratchFolders());
		await database.markScratchFolderOwned(FOLDER);
		await database.recordScratchFolderRemovalFailure(FOLDER, 100);
		await database.recordScratchFolderRemovalFailure(FOLDER, 200);
		states.push(await database.listScratchFolders(), await database.hasScratchFolder(FOLDER), await database.hasScratchFolder('/other'));
		await database.deleteScratchFolder(FOLDER);
		states.push(await database.listScratchFolders());

		assert.deepStrictEqual(states, [
			[{ folder: FOLDER, chatUri: OWNER_CHAT, provider: 'copilotcli', state: 'allocating', requestedAt: 5, attempts: 0, nextAttemptAt: 0 }],
			[{ folder: FOLDER, chatUri: OWNER_CHAT, provider: 'copilotcli', state: 'owned', requestedAt: 5, attempts: 2, nextAttemptAt: 200 }],
			true,
			false,
			[],
		]);
	});

	test('deleting a session\'s default chat does not mark the folders of unrelated chats', async () => {
		const database = create();
		await registerOwner(database, OWNER_SESSION, []);
		await registerOwner(database, 'copilotcli:/unrelated', [{ chat: 'ahp-chat:/unrelated' }]);
		await database.insertScratchFolder({ ...REQUEST, chatUri: `${OWNER_SESSION}/default` });
		await database.insertScratchFolder({ ...REQUEST, folder: 'file:///scratch/unrelated', chatUri: 'ahp-chat:/unrelated' });
		await database.insertScratchFolder({ ...REQUEST, folder: 'file:///scratch/unrelated-default', chatUri: 'copilotcli:/unrelated/default' });

		await database.tombstoneAndUnregisterSession(OWNER_SESSION);

		assert.deepStrictEqual((await database.listScratchFolders()).map(row => `${row.folder}:${row.state}`), [
			`${FOLDER}:removing`,
			'file:///scratch/unrelated:allocating',
			'file:///scratch/unrelated-default:allocating',
		]);
	});

	test('the table is created empty by the migration from 20 and the open is idempotent', async () => {
		const path = join(tmpdir(), `agent-host-scratch-${generateUuid()}.db`);
		try {
			let database = new AgentHostDatabase(path);
			await database.registerSessionV2('copilotcli:/s', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await database.close();

			const downgraded = await openRaw(path);
			await execRaw(downgraded, 'DROP TABLE scratch_folders; PRAGMA user_version = 20');
			await closeRaw(downgraded);

			database = new AgentHostDatabase(path);
			const migrated = await database.listScratchFolders();
			await database.insertScratchFolder(REQUEST);
			await database.close();
			database = new AgentHostDatabase(path);
			const reopened = await database.listScratchFolders();
			await database.close();

			const raw = await openRaw(path);
			const version = await allRaw(raw, 'PRAGMA user_version');
			const indexes = (await allRaw(raw, `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scratch_folders' AND name NOT LIKE 'sqlite_%'`)).map(row => row.name);
			await closeRaw(raw);

			assert.deepStrictEqual({ migrated, reopened: reopened.map(row => row.folder), version, indexes }, {
				migrated: [],
				reopened: [FOLDER],
				version: [{ user_version: 21 }],
				indexes: ['scratch_folders_chat'],
			});
		} finally {
			await fs.rm(path, { force: true });
		}
	});

	test('the open-time repair recreates a missing table of a profile already at 21', async () => {
		const path = join(tmpdir(), `agent-host-scratch-repair-${generateUuid()}.db`);
		try {
			let database = new AgentHostDatabase(path);
			await database.registerSessionV2('copilotcli:/s', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await database.close();
			const raw = await openRaw(path);
			await execRaw(raw, 'DROP TABLE scratch_folders');
			await closeRaw(raw);

			database = new AgentHostDatabase(path);
			const rows = await database.listScratchFolders();
			await database.close();

			assert.deepStrictEqual(rows, []);
		} finally {
			await fs.rm(path, { force: true });
		}
	});

	test('a session tombstone marks the scratch folders of all its chats removing, in its transaction', async () => {
		const database = create();
		await registerOwner(database, OWNER_SESSION, [{ chat: OWNER_CHAT }, { chat: 'ahp-chat:/second' }]);
		await registerOwner(database, 'copilotcli:/survivor', [{ chat: 'ahp-chat:/survivor-chat' }]);
		await database.insertScratchFolder(REQUEST);
		await database.insertScratchFolder({ ...REQUEST, folder: 'file:///scratch/chat-2', chatUri: 'ahp-chat:/second' });
		await database.insertScratchFolder({ ...REQUEST, folder: 'file:///scratch/chat-3', chatUri: 'ahp-chat:/survivor-chat' });
		await database.markScratchFolderOwned('file:///scratch/chat-3');

		await database.tombstoneAndUnregisterSession(OWNER_SESSION);

		assert.deepStrictEqual((await database.listScratchFolders()).map(row => `${row.folder}:${row.state}`), [
			`${FOLDER}:removing`,
			'file:///scratch/chat-2:removing',
			'file:///scratch/chat-3:owned',
		]);
	});

	test('deleting a chat marks its scratch folders removing', async () => {
		const database = create();
		await registerOwner(database, OWNER_SESSION, []);
		await database.insertScratchFolder(REQUEST);
		await database.markScratchFolderOwned(FOLDER);
		await database.insertScratchFolder({ ...REQUEST, folder: 'file:///scratch/kept', chatUri: 'ahp-chat:/kept' });
		assert.strictEqual((await database.insertPrivateChatV2(OWNER_SESSION, { chat: OWNER_CHAT, metadata: { interactivity: ChatInteractivity.Hidden } }, 1)).status, 'applied');
		assert.strictEqual((await database.removePrivateChatV2(OWNER_SESSION, OWNER_CHAT, 2)).status, 'applied');

		assert.deepStrictEqual((await database.listScratchFolders()).map(row => `${row.folder}:${row.state}`), [
			`${FOLDER}:removing`,
			'file:///scratch/kept:allocating',
		]);
	});

	test('a live chat that still lists its removing folder does not keep it in use, another does', async () => {
		const path = join(tmpdir(), `agent-host-scratch-owner-${generateUuid()}.db`);
		try {
			let database = new AgentHostDatabase(path);
			await registerOwner(database, OWNER_SESSION, [{ chat: OWNER_CHAT, workingDirectories: [FOLDER] }]);
			await database.insertScratchFolder(REQUEST);
			await database.close();
			const raw = await openRaw(path);
			await execRaw(raw, `UPDATE scratch_folders SET state = 'removing'`);
			await closeRaw(raw);

			database = new AgentHostDatabase(path);
			const ownerOnly = await database.isScratchFolderInUse(FOLDER);
			await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', workingDirectories: [FOLDER] }]);
			const withOther = await database.isScratchFolderInUse(FOLDER);
			await database.close();

			assert.deepStrictEqual({ ownerOnly, withOther }, { ownerOnly: false, withOther: true });
		} finally {
			await fs.rm(path, { force: true });
		}
	});

	test('a folder is in use while a live chat or session lists it, archived or not, but not its own removing owner or a deleted chat', async () => {
		const scenarios: Record<string, (database: AgentHostDatabase) => Promise<void>> = {
			'nothing': async () => { },
			'its owner chat': async database => {
				await registerOwner(database, OWNER_SESSION, [{ chat: OWNER_CHAT, workingDirectories: [FOLDER] }]);
			},
			'its owner chat, removing': async database => {
				await database.insertScratchFolder(REQUEST);
				await deletePrivateChat(database, OWNER_SESSION, OWNER_CHAT, [FOLDER]);
			},
			'another chat': async database => {
				await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', workingDirectories: [FOLDER] }]);
			},
			'another chat, spelled in another case with a trailing slash': async database => {
				await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', workingDirectories: ['file:///SCRATCH/Chat-1/'] }]);
			},
			'an archived chat': async database => {
				await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', archived: true, workingDirectories: [FOLDER] }]);
			},
			'a deleted chat': async database => {
				await deletePrivateChat(database, 'copilotcli:/other', 'ahp-chat:/other', [FOLDER]);
			},
			'a chat inside the folder': async database => {
				await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', workingDirectories: [`${FOLDER}/sub`] }]);
			},
			'a session inside the folder, spelled in another case': async database => {
				await database.registerSessionV2('copilotcli:/other', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
				await database.importSessionState('copilotcli:/other', { importVersion: 1, importedAt: 1, values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(['file:///SCRATCH/Chat-1/sub/deeper']) }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true });
			},
			'a chat in a sibling folder sharing its name as a prefix': async database => {
				await registerOwner(database, 'copilotcli:/other', [{ chat: 'ahp-chat:/other', workingDirectories: [`${FOLDER}-2`] }]);
			},
			'an archived session': async database => {
				await database.registerSessionV2('copilotcli:/other', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
				await database.importSessionState('copilotcli:/other', { importVersion: 1, importedAt: 1, values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([FOLDER]), [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true });
			},
			'a deleted session': async database => {
				await database.registerSessionV2('copilotcli:/other', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
				await database.importSessionState('copilotcli:/other', { importVersion: 1, importedAt: 1, values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([FOLDER]) }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true });
				await database.tombstoneAndUnregisterSession('copilotcli:/other');
			},
		};
		const inUse: Record<string, boolean> = {};
		for (const [name, seed] of Object.entries(scenarios)) {
			const database = create();
			await seed(database);
			inUse[name] = await database.isScratchFolderInUse(FOLDER);
		}

		assert.deepStrictEqual(inUse, {
			'nothing': false,
			'its owner chat': true,
			'its owner chat, removing': false,
			'another chat': true,
			'another chat, spelled in another case with a trailing slash': true,
			'an archived chat': true,
			'a deleted chat': false,
			'a chat inside the folder': true,
			'a session inside the folder, spelled in another case': true,
			'a chat in a sibling folder sharing its name as a prefix': false,
			'an archived session': true,
			'a deleted session': false,
		});
	});
});
