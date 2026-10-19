/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { SESSION_STATE_TABLES, type IAgentHostSessionStateDatabase, type IAgentHostSessionStateImport } from '../../node/agentHostSessionStateDatabase.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { createLegacySessionFixture, InMemorySessionDataService, readOldBuildView, writeLegacySessionState } from './sessionStateCompatibilityFixtures.js';

/** Tables older builds read; Block 3a never alters them. */
const PROTECTED_TABLES = ['sessions', 'sessions_v2', 'metadata', 'session_chat_catalogs', 'session_chats', 'chats_v2'];

async function openRaw(path: string): Promise<Database> {
	const sqlite3 = await import('@vscode/sqlite3');
	return new Promise((resolve, reject) => {
		const database: Database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
	});
}

function rawAll(database: Database, sql: string, parameters: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => database.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
}

function rawExec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function rawClose(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

async function withRaw<T>(path: string, callback: (database: Database) => Promise<T>): Promise<T> {
	const database = await openRaw(path);
	try {
		return await callback(database);
	} finally {
		await rawClose(database);
	}
}

async function userVersion(database: Database): Promise<number> {
	return (await rawAll(database, 'PRAGMA user_version'))[0].user_version as number;
}

async function protectedSchema(database: Database): Promise<Record<string, unknown>> {
	const schema: Record<string, unknown> = {};
	for (const table of PROTECTED_TABLES) {
		schema[table] = await rawAll(database, `PRAGMA table_info(${table})`);
	}
	return schema;
}

/** Rows {@link importFullState} writes to each table and marker. */
const FULL_STATE_ROWS: Readonly<Record<string, number>> = {
	session_state: 1, session_state_values: 2, session_folder_state: 2, session_chat_state: 2,
	chat_row_mirror: 1,
	'sessionStateImported:': 1, 'sessionStateLegacyMirror:': 1, 'sessionStateLaunchDirsBackfilled:': 1, 'sessionStateRowsMoved:': 1,
};

/** Rows of every session state table and marker that belong to `session`. */
async function sessionStateRowCounts(database: Database, session: string): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const name of Object.keys(FULL_STATE_ROWS)) {
		counts[name] = name.endsWith(':')
			? (await rawAll(database, 'SELECT COUNT(*) AS count FROM metadata WHERE key = ?', [name + session]))[0].count as number
			: (await rawAll(database, `SELECT COUNT(*) AS count FROM ${name} WHERE session_uri = ?`, [session]))[0].count as number;
	}
	return counts;
}

function importData(session: string, chat: string, peer: string): IAgentHostSessionStateImport {
	return {
		importVersion: 1,
		importedAt: 1,
		values: { configValues: '{"isolation":"folder"}', 'agentHost.createdBySession': JSON.stringify({ session }) },
		folders: [
			{ folderKey: '', kind: 'git', value: '{"branchName":"main"}', storageResource: undefined },
			{ folderKey: 'scope', kind: 'baseBranch', value: 'main', storageResource: peer },
		],
		chats: [
			{ chat, isDefault: true, storageResource: session, title: 'Default', titleSource: 'user', isRead: true, workingDirectories: undefined, launchWorkingDirectories: ['file:///app'], changes: '{"files":1}' },
			{ chat: peer, isDefault: false, storageResource: peer, title: 'Peer', titleSource: 'agent', isRead: undefined, workingDirectories: [], launchWorkingDirectories: ['file:///lib'], changes: undefined },
		],
		legacyMirrorBase: '{"v":2}',
		launchDirsBackfilled: true,
	};
}


/** Imports a full session state with rows in every table and every marker. */
async function importFullState(database: IAgentHostSessionStateDatabase, session: string, chat: string, peer: string): Promise<void> {
	assert.strictEqual(await database.importSessionState(session, importData(session, chat, peer)), 'imported');
	assert.strictEqual(await database.writeChatRowMirror(session, peer, 'draft', '{"text":"draft"}'), 'applied');
	assert.strictEqual(await database.markSessionStateRowsMoved(session, '{"v":1,"turnsWatermark":3}'), 'applied');
}

suite('AgentHostDatabase session state', () => {
	const store = new DisposableStore();
	let directory: string;
	let path: string;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'ah-session-state-'));
		path = join(directory, 'agent-host.db');
	});
	teardown(async () => {
		store.clear();
		await rm(directory, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function open(): Promise<AgentHostDatabase> {
		return store.add(new AgentHostDatabase(path));
	}

	test('migrates a Block 2b database without changing the tables older builds read, other than adding chat origins', async () => {
		const fixture = createLegacySessionFixture('2b');
		const sessionData = store.add(new InMemorySessionDataService());
		const written = await open();
		await writeLegacySessionState(sessionData.createService(), written, fixture);
		const viewBefore = await readOldBuildView(sessionData.createService(), written, fixture);
		await written.close();
		// What a Block 2b build leaves: the same tables at version 14, without the session state tables or chat origins.
		const before = await withRaw(path, async database => {
			await rawExec(database, `${SESSION_STATE_TABLES.map(table => `DROP TABLE ${table};`).join('\n')}\nALTER TABLE chats_v2 DROP COLUMN origin_session_uri;\nPRAGMA user_version = 14;`);
			return { version: await userVersion(database), schema: await protectedSchema(database) };
		});

		const migrated = await open();
		const viewAfter = await readOldBuildView(sessionData.createService(), migrated, fixture);
		await migrated.close();
		const after = await withRaw(path, async database => ({
			version: await userVersion(database),
			schema: await protectedSchema(database),
			tables: (await rawAll(database, `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${SESSION_STATE_TABLES.map(() => '?').join(', ')}) ORDER BY name`, [...SESSION_STATE_TABLES])).map(row => row.name),
			// Checkpoints are chat data, kept in the chats' own databases only.
			centralCheckpointState: [
				...(await rawAll(database, `SELECT name FROM sqlite_master WHERE name LIKE '%checkpoint%'`)).map(row => row.name),
				...(await rawAll(database, `SELECT name FROM pragma_table_info('session_state') WHERE name LIKE '%checkpoint%'`)).map(row => `session_state.${row.name}`),
			],
			// Branch changes are computed live, never stored centrally.
			centralBranchChangesets: (await rawAll(database, `SELECT name FROM sqlite_master WHERE name LIKE '%branch_changeset%'`)).map(row => row.name),
		}));
		const reopened = await open();
		const reopenedState = await reopened.readSessionState(fixture.session);
		await reopened.close();

		assert.deepStrictEqual({
			versions: [before.version, after.version, await withRaw(path, userVersion)],
			// Only `chats_v2` gains a nullable column, which older builds neither write nor read.
			addedColumns: (after.schema.chats_v2 as readonly Record<string, unknown>[]).filter(column => !(before.schema.chats_v2 as readonly Record<string, unknown>[]).some(previous => previous.name === column.name)).map(column => [column.name, column.type, column.notnull]),
			protectedSchemaUnchanged: JSON.stringify({ ...after.schema, chats_v2: (after.schema.chats_v2 as readonly Record<string, unknown>[]).filter(column => column.name !== 'origin_session_uri') }) === JSON.stringify(before.schema),
			oldBuildViewUnchanged: JSON.stringify(viewAfter) === JSON.stringify(viewBefore),
			tables: after.tables,
			centralCheckpointState: after.centralCheckpointState,
			centralBranchChangesets: after.centralBranchChangesets,
			reopenedState,
		}, {
			versions: [14, 20, 20],
			addedColumns: [['origin_session_uri', 'TEXT', 0]],
			protectedSchemaUnchanged: true,
			oldBuildViewUnchanged: true,
			tables: [...SESSION_STATE_TABLES].sort(),
			centralCheckpointState: [],
			centralBranchChangesets: [],
			reopenedState: undefined,
		});
	});

	test('imports once, writes with compare-and-set revisions and acknowledges mirrors', async () => {
		const database = await open();
		const session = 'copilotcli:/state';
		const chat = 'ahp-chat://default/c2Vzc2lvbg';
		const peer = 'ahp-chat://peer/c2Vzc2lvbg';
		await database.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const beforeImport = await database.writeSessionState(session, 0, { values: {}, folders: [], chats: [], markPayloadDirty: false });
		const imported = await database.importSessionState(session, importData(session, chat, peer));
		const again = await database.importSessionState(session, importData(session, chat, peer));
		const write = await database.writeSessionState(session, 1, {
			values: { configValues: '{"isolation":"worktree"}', 'agentHost.workspaceless': null },
			folders: [{ folderKey: 'scope', kind: 'git', value: '{"branchName":"docs"}', storageResource: null }],
			chats: [{ chat: peer, isDefault: false, fields: { title: 'Renamed', workingDirectories: null, isRead: false } }],
			markPayloadDirty: false,
		});
		const stale = await database.writeSessionState(session, 1, { values: { configValues: 'stale' }, folders: [], chats: [], markPayloadDirty: false });
		const mirroredStale = await database.markSessionStateLegacyMirrored(session, 1, '{"base":"stale"}');
		const mirrored = await database.markSessionStateLegacyMirrored(session, 2, '{"base":2}');
		const rows = await database.bumpSessionStateRowsRevision(session);
		const rowsMirrored = await database.markSessionStateRowsMirrored(session, 1);
		const state = await database.readSessionState(session);

		assert.deepStrictEqual({
			beforeImport, imported, again, write, stale, mirroredStale, mirrored, rows, rowsMirrored,
			header: state?.header,
			values: state?.values,
			folders: state?.folders,
			peer: state?.chats.find(entry => entry.chat === peer),
			base: state?.legacyMirrorBase,
			markers: [state?.launchDirsBackfilled, state?.rowsMoved],
			values2: [...(await database.readSessionStateValues([session, 'copilotcli:/other'], ['configValues', 'agentHost.workspaceless'])).entries()].map(([key, entry]) => [key, entry.imported, [...entry.values]]),
		}, {
			beforeImport: { status: 'notImported' },
			imported: 'imported',
			again: 'alreadyImported',
			write: { status: 'applied', revision: 2 },
			stale: { status: 'conflict' },
			mirroredStale: false,
			mirrored: true,
			rows: { status: 'applied', revision: 1 },
			rowsMirrored: true,
			header: { revision: 2, legacyMirroredRevision: 2, rowsRevision: 1, rowsMirroredRevision: 1, importVersion: 1 },
			values: [
				{ key: 'agentHost.createdBySession', value: JSON.stringify({ session }), revision: 1 },
				{ key: 'agentHost.workspaceless', value: undefined, revision: 2 },
				{ key: 'configValues', value: '{"isolation":"worktree"}', revision: 2 },
			],
			folders: [
				{ folderKey: '', kind: 'git', value: '{"branchName":"main"}', storageResource: undefined, revision: 1 },
				{ folderKey: 'scope', kind: 'baseBranch', value: 'main', storageResource: peer, revision: 1 },
				{ folderKey: 'scope', kind: 'git', value: '{"branchName":"docs"}', storageResource: undefined, revision: 2 },
			],
			peer: { chat: peer, isDefault: false, storageResource: peer, title: 'Renamed', titleSource: 'agent', isRead: false, workingDirectories: undefined, launchWorkingDirectories: ['file:///lib'], changes: undefined, revision: 2 },
			base: '{"base":2}',
			markers: [true, undefined],
			values2: [[session, true, [['configValues', '{"isolation":"worktree"}']]], ['copilotcli:/other', false, []]],
		});
	});

	test('a projected write marks the catalog payload dirty in the same transaction', async () => {
		const database = await open();
		const session = 'copilotcli:/projected';
		await database.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState(session, importData(session, 'ahp-chat://default/cA', 'ahp-chat://peer/cA'));
		const before = await database.getSessionV2PayloadDirty(session);
		await database.writeSessionState(session, 1, { values: { isArchived: 'true' }, folders: [], chats: [], markPayloadDirty: true });
		assert.deepStrictEqual([before, await database.getSessionV2PayloadDirty(session)], [undefined, 1]);
	});

	for (const [cleanup, remove] of [
		['tombstone', (database: AgentHostDatabase, session: string) => database.tombstoneAndUnregisterSession(session)],
		['exclusion', async (database: AgentHostDatabase, session: string) => { await database.excludeSessionV2({ provider: 'copilotcli', session, reason: 'backing', fingerprint: 'f' }, { identity: await database.getSessionV2Registration(session), catalog: undefined }); }],
		['runtime unregistration', (database: AgentHostDatabase, session: string) => database.unregisterRuntimeSession(session)],
		['sessions_v2 unregistration', (database: AgentHostDatabase, session: string) => database.unregisterSessionV2(session)],
		['provider-absent exclusion', async (database: AgentHostDatabase, session: string) => { await database.excludeSessionV2({ provider: 'copilotcli', session, reason: 'providerAbsent', fingerprint: 'f' }, { identity: await database.getSessionV2Registration(session), catalog: undefined }); }],
	] as const) {
		test(`${cleanup} ${cleanup === 'provider-absent exclusion' ? 'keeps' : 'removes'} every session state row and marker`, async () => {
			const database = await open();
			const session = 'copilotcli:/removed';
			const other = 'copilotcli:/kept';
			for (const entry of [session, other]) {
				await database.registerRuntimeSession(entry, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
				await importFullState(database, entry, `ahp-chat://default/${entry}`, `ahp-chat://peer/${entry}`);
			}
			await remove(database, session);
			await database.close();
			const counts = await withRaw(path, async raw => ({ removed: await sessionStateRowCounts(raw, session), other: await sessionStateRowCounts(raw, other) }));
			const full = { ...FULL_STATE_ROWS };
			assert.deepStrictEqual(counts, { removed: cleanup === 'provider-absent exclusion' ? full : Object.fromEntries(Object.keys(full).map(key => [key, 0])), other: full });
		});
	}

	test('storage references count live chats and registered sessions of other sessions only', async () => {
		const database = await open();
		const shared = 'ahp-chat://peer/shared';
		for (const session of ['copilotcli:/a', 'copilotcli:/b', 'copilotcli:/tombstoned']) {
			await database.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await database.importSessionState(session, importData(session, `ahp-chat://default/${session}`, shared));
		}
		await database.tombstoneAndUnregisterSession('copilotcli:/tombstoned');
		// An older build deleted this session without knowing the session state tables.
		await database.registerRuntimeSession('copilotcli:/orphan', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState('copilotcli:/orphan', importData('copilotcli:/orphan', 'ahp-chat://default/orphan', shared));
		await database.close();
		await withRaw(path, raw => rawExec(raw, `DELETE FROM sessions WHERE session_uri = 'copilotcli:/orphan'; DELETE FROM sessions_v2 WHERE session_uri = 'copilotcli:/orphan';`));
		const reopened = await open();

		assert.deepStrictEqual({
			sharedFromA: await reopened.countStorageReferences(shared, 'copilotcli:/a'),
			sessionStorage: await reopened.countStorageReferences('copilotcli:/b', 'copilotcli:/a'),
			ownSession: await reopened.countStorageReferences('copilotcli:/a', 'copilotcli:/a'),
			garbage: await reopened.listSessionStateGarbage(10),
			deleteLive: await reopened.deleteSessionStateGarbage('copilotcli:/a'),
			deleteOrphan: await reopened.deleteSessionStateGarbage('copilotcli:/orphan'),
			garbageAfter: await reopened.listSessionStateGarbage(10),
		}, {
			// Session b's peer only: the tombstoned and the orphaned sessions are not live.
			sharedFromA: 1,
			// b is registered, and b's default chat is stored at b.
			sessionStorage: 2,
			ownSession: 0,
			garbage: ['copilotcli:/orphan'],
			deleteLive: false,
			deleteOrphan: true,
			garbageAfter: [],
		});
	});

	test('a tombstoned session neither imports nor accepts writes', async () => {
		const database = await open();
		const session = 'copilotcli:/deleted';
		await database.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState(session, importData(session, 'ahp-chat://default/d', 'ahp-chat://peer/d'));
		await database.tombstoneAndUnregisterSession(session);
		assert.deepStrictEqual({
			import: await database.importSessionState(session, importData(session, 'ahp-chat://default/d', 'ahp-chat://peer/d')),
			write: await database.writeSessionState(session, 1, { values: {}, folders: [], chats: [], markPayloadDirty: false }),
			rowMirror: await database.writeChatRowMirror(session, 'ahp-chat://peer/d', 'draft', '{}'),
		}, { import: 'tombstoned', write: { status: 'tombstoned' }, rowMirror: 'tombstoned' });
	});

	test('the compatibility database stores session state in storage spelling and reads it in runtime spelling', async () => {
		const compatible = store.add(new CompatibleAgentHostDatabase(path));
		await compatible.initialize();
		const session = 'ahp-session:/compat';
		await compatible.prepareSessionStorage(session, 'copilotcli');
		await compatible.registerRuntimeSession(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const runtimeChat = buildDefaultChatUri(session);
		const runtimePeer = buildChatUri(session, 'peer');
		await compatible.importSessionState(session, importData(session, runtimeChat, runtimePeer));
		await compatible.writeSessionState(session, 1, {
			values: { 'agentHost.createdBySession': JSON.stringify({ session }) },
			folders: [], chats: [{ chat: runtimePeer, isDefault: false, fields: { storageResource: runtimePeer } }], markPayloadDirty: false,
		});
		const raw = await compatible.raw.readSessionState('copilotcli:/compat');
		const runtime = await compatible.readSessionState(session);

		const storageChat = buildDefaultChatUri('copilotcli:/compat');
		const storagePeer = buildChatUri('copilotcli:/compat', 'peer');
		assert.deepStrictEqual({
			rawChats: raw?.chats.map(entry => [entry.chat, entry.storageResource]),
			rawFolders: raw?.folders.map(entry => entry.storageResource),
			rawCreatedBy: raw?.values.find(entry => entry.key === 'agentHost.createdBySession')?.value,
			runtimeChats: runtime?.chats.map(entry => [entry.chat, entry.storageResource]),
			runtimeCreatedBy: runtime?.values.find(entry => entry.key === 'agentHost.createdBySession')?.value,
			references: await compatible.countStorageReferences(runtimePeer, 'ahp-session:/other'),
			values: [...(await compatible.readSessionStateValues([session], ['agentHost.createdBySession'])).entries()].map(([key, entry]) => [key, [...entry.values]]),
		}, {
			rawChats: [[storageChat, 'copilotcli:/compat'], [storagePeer, storagePeer]],
			rawFolders: [undefined, storagePeer],
			rawCreatedBy: JSON.stringify({ session: 'copilotcli:/compat' }),
			runtimeChats: [[runtimeChat, session], [runtimePeer, runtimePeer]],
			runtimeCreatedBy: JSON.stringify({ session }),
			references: 1,
			values: [[session, [['agentHost.createdBySession', JSON.stringify({ session })]]]],
		});
	});
});
