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
import { AH_META_IS_ARCHIVED_DB_KEY } from '../../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import type { IAgentHostSessionChatStateData } from '../../node/agentHostSessionStateDatabase.js';
import type { IWorktreeRemovalRequest } from '../../node/agentHostWorktreeRemovalDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';

const WORKTREE = 'file:///repo.worktrees/session';
const OWNER = 'copilotcli:/owner';

function request(overrides: Partial<IWorktreeRemovalRequest> = {}): IWorktreeRemovalRequest {
	return {
		kind: 'session',
		owner: OWNER,
		ownerSession: OWNER,
		worktreePath: WORKTREE,
		repositoryRoot: 'file:///repo',
		branch: 'agents/session',
		mode: 'commit',
		ownerDeleted: false,
		requestedAt: 1,
		...overrides,
	};
}

async function importSession(database: AgentHostDatabase, session: string, values: Record<string, string>, chats: readonly IAgentHostSessionChatStateData[] = []): Promise<void> {
	await database.registerSessionV2(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
	assert.strictEqual(await database.importSessionState(session, { importVersion: 1, importedAt: 1, values, folders: [], chats, legacyMirrorBase: '{}', launchDirsBackfilled: true }), 'imported');
}

async function listSession(database: AgentHostDatabase, session: string, workingDirectories: readonly string[], isArchived: boolean, isChatBacking?: boolean): Promise<void> {
	await database.registerSessionV2(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
	const encoded = encodeAgentHostCatalogPayload({ modifiedTime: 1, isRead: true, isArchived, workingDirectories: [...workingDirectories], chats: [], ...(isChatBacking ? { isChatBacking } : {}) });
	assert.ok(encoded.ok);
	assert.strictEqual(await database.upsertSessionV2({
		session, sessionGeneration: 'generation', sourceRevision: 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
		payloadHash: encoded.value.payloadHash, verified: true, payload: encoded.value.payload,
	}, undefined), 'applied');
}

function legacyChat(chat: string, workingDirectories: readonly string[]): IAgentHostSessionChatStateData {
	return { chat, isDefault: false, storageResource: undefined, title: undefined, titleSource: undefined, isRead: undefined, workingDirectories, launchWorkingDirectories: undefined, changes: undefined };
}

suite('AgentHostWorktreeRemovalDatabase', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a removal is replaced by a later request, and an archive never replaces a pending deletion', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const modes: string[] = [];
		const read = async () => {
			const removal = await database.readPendingWorktreeRemoval('session', OWNER);
			modes.push(`${removal?.mode}:${removal?.attempts}`);
		};

		await database.upsertPendingWorktreeRemoval(request({ mode: 'synced' }));
		await read();
		assert.strictEqual(await database.recordPendingWorktreeRemovalFailure(request({ mode: 'synced' }), 100), 1);
		await read();
		await database.upsertPendingWorktreeRemoval(request({ mode: 'commit', requestedAt: 2 }));
		await read();
		// A lifecycle deletion keeps its owner's `synced` mode.
		await database.upsertPendingWorktreeRemoval(request({ mode: 'synced', ownerDeleted: true, requestedAt: 3 }));
		await read();
		await database.upsertPendingWorktreeRemoval(request({ mode: 'commit', requestedAt: 4 }));
		await read();
		// A failure or a drop of a request that was replaced since does nothing.
		const staleFailure = await database.recordPendingWorktreeRemovalFailure(request({ mode: 'commit', requestedAt: 2 }), 100);
		await database.deletePendingWorktreeRemoval('session', OWNER, { mode: 'commit', requestedAt: 2 });
		await read();
		await database.upsertPendingWorktreeRemoval(request({ mode: 'delete', ownerDeleted: true, requestedAt: 5 }));
		await read();
		await database.deletePendingWorktreeRemoval('session', OWNER, { mode: 'delete', requestedAt: 5 });

		assert.deepStrictEqual({ modes, staleFailure, remaining: await database.listPendingWorktreeRemovals() }, {
			modes: ['synced:0', 'synced:1', 'commit:0', 'synced:0', 'synced:0', 'synced:0', 'delete:0'],
			staleFailure: undefined,
			remaining: [],
		});
	});

	test('a deleted session records its removals in the same transaction as its tombstone', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const deleted = 'copilotcli:/deleted';
		const failed = 'copilotcli:/failed';
		for (const session of [deleted, failed]) {
			await database.registerSessionV2(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		}

		await database.tombstoneAndUnregisterSession(deleted, [
			request({ owner: deleted, ownerSession: deleted, mode: 'delete' }),
			request({ kind: 'detached', owner: 'handle', ownerSession: deleted, worktreePath: 'file:///repo.worktrees/detached', mode: 'delete' }),
		]);
		// An invalid removal fails the whole transaction: the session is neither tombstoned nor unregistered.
		await assert.rejects(database.tombstoneAndUnregisterSession(failed, [
			request({ owner: failed, ownerSession: failed, mode: 'delete' }),
			request({ owner: 'second', mode: 'unknown' as IWorktreeRemovalRequest['mode'] }),
		]));

		assert.deepStrictEqual({
			removals: (await database.listPendingWorktreeRemovals()).map(removal => `${removal.kind}:${removal.owner}:${removal.mode}`),
			deletedTombstoned: await database.isSessionTombstoned(deleted),
			failedTombstoned: await database.isSessionTombstoned(failed),
			failedRegistered: !!await database.getSessionV2Registration(failed),
		}, {
			removals: ['detached:handle:delete', `session:${deleted}:delete`],
			deletedTombstoned: true,
			failedTombstoned: false,
			failedRegistered: true,
		});
	});

	test('only a non-archived, non-deleted other session or chat with a folder at or inside the worktree keeps it in use', async () => {
		const scenarios: Record<string, (database: AgentHostDatabase) => Promise<void>> = {
			'nothing': async () => { },
			'the owner session itself': database => importSession(database, OWNER, { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([WORKTREE]) }),
			'another session at the worktree': database => importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([WORKTREE]) }),
			'another session inside the worktree, spelled in another case': database => importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(['file:///REPO.worktrees/Session/src']) }),
			'another session in a sibling folder sharing the prefix': database => importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([`${WORKTREE}-2`]) }),
			'an archived session inside the worktree': database => importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([`${WORKTREE}/src`]), [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }),
			'a deleted session inside the worktree': async database => {
				await importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([`${WORKTREE}/src`]) });
				await database.tombstoneAndUnregisterSession('copilotcli:/other');
			},
			'a chat of another session inside the worktree': async database => {
				await importSession(database, 'copilotcli:/other', {});
				await database.registerChatCatalogV2('copilotcli:/other', { defaultChat: { chat: 'ahp-chat:/default', order: 0 }, peers: [{ chat: 'ahp-chat:/moved', order: 1, workingDirectories: [`${WORKTREE}/src`] }], privateDescendants: [] });
			},
			'an archived chat inside the worktree': async database => {
				await importSession(database, 'copilotcli:/other', {});
				await database.registerChatCatalogV2('copilotcli:/other', { defaultChat: { chat: 'ahp-chat:/default', order: 0 }, peers: [{ chat: 'ahp-chat:/moved', order: 1, archived: true, workingDirectories: [`${WORKTREE}/src`] }], privateDescendants: [] });
			},
			'a chat of an archived session inside the worktree': async database => {
				await importSession(database, 'copilotcli:/other', { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' });
				await database.registerChatCatalogV2('copilotcli:/other', { defaultChat: { chat: 'ahp-chat:/default', order: 0 }, peers: [{ chat: 'ahp-chat:/moved', order: 1, workingDirectories: [`${WORKTREE}/src`] }], privateDescendants: [] });
			},
			'a chat of a deleted session inside the worktree': async database => {
				await importSession(database, 'copilotcli:/other', {});
				await database.registerChatCatalogV2('copilotcli:/other', { defaultChat: { chat: 'ahp-chat:/default', order: 0 }, peers: [{ chat: 'ahp-chat:/moved', order: 1, workingDirectories: [`${WORKTREE}/src`] }], privateDescendants: [] });
				await database.tombstoneAndUnregisterSession('copilotcli:/other');
			},
			'a legacy-catalog chat of another session inside the worktree': database => importSession(database, 'copilotcli:/other', {}, [legacyChat('copilotcli:/other-peer', [`${WORKTREE}/src`])]),
			'another listed session inside the worktree': database => listSession(database, 'copilotcli:/other', [`${WORKTREE}/src`], false),
			'another listed session archived in its list entry': database => listSession(database, 'copilotcli:/other', [`${WORKTREE}/src`], true),
			'another listed session unarchived in its session state but still archived in its list entry': async database => {
				await listSession(database, 'copilotcli:/other', [`${WORKTREE}/src`], true);
				assert.strictEqual(await database.importSessionState('copilotcli:/other', { importVersion: 1, importedAt: 1, values: { [AH_META_IS_ARCHIVED_DB_KEY]: '' }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true }), 'imported');
			},
			'another listed session archived in its session state': async database => {
				await listSession(database, 'copilotcli:/other', [`${WORKTREE}/src`], false);
				assert.strictEqual(await database.importSessionState('copilotcli:/other', { importVersion: 1, importedAt: 1, values: { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true }), 'imported');
			},
			'a chat without folders of a listed session inside the worktree': async database => {
				await listSession(database, 'copilotcli:/other', [`${WORKTREE}/src`], false);
				await database.registerChatCatalogV2('copilotcli:/other', { defaultChat: { chat: 'ahp-chat:/default', order: 0 }, peers: [{ chat: 'ahp-chat:/fork', order: 1 }], privateDescendants: [] });
			},
			'the owner listed inside its own worktree': database => listSession(database, OWNER, [WORKTREE], false),
			'a peer chat backing provider session inside the worktree': database => listSession(database, 'copilotcli:/peer-backing', [WORKTREE], false, true),
		};
		const inUse: Record<string, boolean> = {};
		for (const [name, seed] of Object.entries(scenarios)) {
			const database = disposables.add(new AgentHostDatabase(':memory:'));
			await seed(database);
			inUse[name] = await database.isWorktreeInUse(WORKTREE, OWNER);
		}

		assert.deepStrictEqual(inUse, {
			'nothing': false,
			'the owner session itself': false,
			'another session at the worktree': true,
			'another session inside the worktree, spelled in another case': true,
			'another session in a sibling folder sharing the prefix': false,
			'an archived session inside the worktree': false,
			'a deleted session inside the worktree': false,
			'a chat of another session inside the worktree': true,
			'an archived chat inside the worktree': false,
			'a chat of an archived session inside the worktree': false,
			'a chat of a deleted session inside the worktree': false,
			'a legacy-catalog chat of another session inside the worktree': true,
			'another listed session inside the worktree': true,
			'another listed session archived in its list entry': false,
			'another listed session unarchived in its session state but still archived in its list entry': true,
			'another listed session archived in its session state': false,
			'a chat without folders of a listed session inside the worktree': true,
			'the owner listed inside its own worktree': false,
			'a peer chat backing provider session inside the worktree': false,
		});
	});

	test('a session\'s archived state comes from its session state first, then its list entry', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		await listSession(database, 'copilotcli:/listed-archived', [], true);
		await listSession(database, 'copilotcli:/unarchived', [], true);
		await importSession(database, 'copilotcli:/unarchived', { [AH_META_IS_ARCHIVED_DB_KEY]: '' });
		await importSession(database, 'copilotcli:/archived', { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' });

		assert.deepStrictEqual({
			listedArchived: await database.readSessionArchived('copilotcli:/listed-archived'),
			unarchived: await database.readSessionArchived('copilotcli:/unarchived'),
			archived: await database.readSessionArchived('copilotcli:/archived'),
			unknown: await database.readSessionArchived('copilotcli:/unknown'),
		}, { listedArchived: true, unarchived: false, archived: true, unknown: undefined });
	});

	test('a folder with non-ASCII letters keeps its worktree in use', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const worktree = 'file:///repo.worktrees/Élise';
		await importSession(database, 'copilotcli:/other', { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([`${worktree}/src`]) });

		assert.deepStrictEqual({
			sameSpelling: await database.isWorktreeInUse(worktree, OWNER),
			otherAsciiCase: await database.isWorktreeInUse('file:///REPO.worktrees/Élise/', OWNER),
		}, { sameSpelling: true, otherAsciiCase: true });
	});
	function sql(database: AgentHostDatabase, statement: string, parameters: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
		return (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase().then(raw => new Promise((resolve, reject) => raw.all(statement, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows))));
	}

	/** What a committed move records: the session shares the worktree. */
	function share(database: AgentHostDatabase, session: string, worktree = WORKTREE): Promise<unknown> {
		return sql(database, 'INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [worktree, session, 'file:///repo', 'agents/session']);
	}

	test('a live co-owner keeps a shared worktree in use, also through a chat archived there, until it is archived or deleted; pruning keeps one row (Block 5)', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const coOwner = 'copilotcli:/co-owner';
		const stale = 'copilotcli:/moved-away';
		await importSession(database, OWNER, { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([WORKTREE]) });
		await importSession(database, coOwner, {});
		await importSession(database, stale, {});
		// The co-owner works in the worktree only through a chat it archived: no listed folder keeps the worktree, its share does.
		await sql(database, `INSERT INTO chats_v2 (chat_uri, owner_session_uri, working_directories, metadata, metadata_hash, archived) VALUES ('ahp-chat://moved', ?, ?, '{}', 'hash', 1)`, [coOwner, JSON.stringify([`${WORKTREE}/src`])]);
		for (const session of [OWNER, coOwner, stale]) {
			await share(database, session);
		}
		const coOwners = async () => (await database.readWorktreeCoOwners(WORKTREE)).map(row => `${row.session}:${row.live}`);
		const states: Record<string, unknown> = {};
		states.live = { inUse: await database.isWorktreeInUse(WORKTREE, OWNER), coOwners: await coOwners() };
		// A co-owner that no longer works there (its chat moved on) is pruned.
		states.pruned = (await database.pruneWorktreeCoOwners(WORKTREE)).map(row => row.session);
		const revision = (await database.readSessionState(coOwner))!.header.revision;
		await database.writeSessionState(coOwner, revision, { values: { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], markPayloadDirty: false });
		states.archived = { inUse: await database.isWorktreeInUse(WORKTREE, OWNER), coOwners: await coOwners() };
		// Deleted by an older build: its registration is gone and its tombstone written, its share stays behind.
		await sql(database, `INSERT INTO metadata (key, value) VALUES ('sessionTombstone:' || ?, 'true')`, [coOwner]);
		await sql(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [coOwner]);
		states.deletedByOlderBuild = { inUse: await database.isWorktreeInUse(WORKTREE, OWNER), pruned: (await database.pruneWorktreeCoOwners(WORKTREE)).map(row => row.session) };
		// Without any live co-owner the last row stays: the worktree was shared, so its removal commits.
		await sql(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [OWNER]);
		states.lastRow = (await database.pruneWorktreeCoOwners(WORKTREE)).map(row => `${row.session}:${row.live}`);

		assert.deepStrictEqual(states, {
			live: { inUse: true, coOwners: [`${coOwner}:true`, `${stale}:false`, `${OWNER}:true`] },
			pruned: [coOwner, OWNER],
			archived: { inUse: false, coOwners: [`${coOwner}:true`, `${OWNER}:true`] },
			deletedByOlderBuild: { inUse: false, pruned: [OWNER] },
			lastRow: [`${OWNER}:false`],
		});
	});

	test('a normalized chat that left a shared worktree no longer keeps its share live through the folders its move recorded (PR review)', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const coOwner = 'copilotcli:/co-owner';
		await importSession(database, coOwner, {});
		// The move recorded the chat's folders in its session-state row; the chat then left the worktree, which only its
		// normalized row (`chats_v2`) records.
		await sql(database, `INSERT INTO session_chat_state (session_uri, chat_uri, is_default, working_directories, revision) VALUES (?, 'ahp-chat://moved', 0, ?, 1)`, [coOwner, JSON.stringify([WORKTREE])]);
		await share(database, coOwner);
		const live = async () => (await database.readWorktreeCoOwners(WORKTREE)).map(row => row.live);
		const legacyOnly = await live();
		await sql(database, `INSERT INTO chats_v2 (chat_uri, owner_session_uri, working_directories, metadata, metadata_hash) VALUES ('ahp-chat://moved', ?, ?, '{}', 'hash')`, [coOwner, JSON.stringify(['file:///elsewhere'])]);

		assert.deepStrictEqual({ legacyOnly, normalized: await live() }, { legacyOnly: [true], normalized: [false] });
	});

	test('the sessions whose central list names a detached worktree are found for the startup repair; deleted ones are not (Block 5)', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const handle = '33333333-3333-4333-8333-333333333333';
		const list = JSON.stringify([{ handle, workingDirectory: WORKTREE, repositoryRoot: 'file:///repo' }]);
		await importSession(database, OWNER, { 'agentHost.additionalWorktrees': list });
		await importSession(database, 'copilotcli:/deleted', { 'agentHost.additionalWorktrees': list });
		await importSession(database, 'copilotcli:/other', { 'agentHost.additionalWorktrees': JSON.stringify([{ handle: '44444444-4444-4444-8444-444444444444', workingDirectory: WORKTREE, repositoryRoot: 'file:///repo' }]) });
		await sql(database, `INSERT INTO metadata (key, value) VALUES ('sessionTombstone:copilotcli:/deleted', 'true')`);
		assert.deepStrictEqual(await database.findAdditionalWorktreeOwners(handle), [OWNER]);
	});

	test('a profile without the removal table migrates to 20, and one already at 20 with the old kind check is repaired (M4, Block 5)', async () => {
		const outcomes: Record<string, unknown> = {};
		for (const [name, prepare] of [
			// A pre-release build that skipped the removal table.
			['missingTable', ['DROP TABLE worktree_co_owners', 'DROP TABLE pending_worktree_removals', 'PRAGMA user_version = 19']],
			// Another numbering reached 20 without widening the check.
			['oldCheck', ['DROP TABLE pending_worktree_removals', `CREATE TABLE pending_worktree_removals (kind TEXT NOT NULL CHECK (kind IN ('session', 'detached')), owner TEXT NOT NULL, owner_session TEXT, worktree_path TEXT NOT NULL, repository_root TEXT NOT NULL, branch TEXT,
				mode TEXT NOT NULL CHECK (mode IN ('commit', 'synced', 'delete')), owner_deleted INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, owner)) WITHOUT ROWID`]],
		] as const) {
			const path = join(tmpdir(), `agent-host-m4-${generateUuid()}.db`);
			try {
				let database = new AgentHostDatabase(path);
				await database.upsertPendingWorktreeRemoval(request());
				for (const statement of prepare) {
					await sql(database, statement);
				}
				await database.close();
				database = new AgentHostDatabase(path);
				try {
					await database.upsertPendingWorktreeRemoval(request({ kind: 'coOwned', owner: `${OWNER}|${WORKTREE}`, requestedAt: 2 }));
					outcomes[name] = {
						version: (await sql(database, 'PRAGMA user_version'))[0].user_version,
						removals: (await database.listPendingWorktreeRemovals()).map(removal => removal.kind),
					};
				} finally {
					await database.close();
				}
			} catch (error) {
				outcomes[name] = String(error);
			} finally {
				await fs.rm(path, { force: true });
			}
		}
		assert.deepStrictEqual(outcomes, {
			missingTable: { version: 20, removals: ['coOwned'] },
			oldCheck: { version: 20, removals: ['coOwned'] },
		});
	});

	test('a database at version 19 keeps its pending removals and accepts co-owner removals after migrating to 20 (Block 5)', async () => {
		const path = join(tmpdir(), `agent-host-co-owners-${generateUuid()}.db`);
		try {
			let database = new AgentHostDatabase(path);
			await database.upsertPendingWorktreeRemoval(request());
			await sql(database, 'DROP TABLE worktree_co_owners');
			await sql(database, `CREATE TABLE pending_old (kind TEXT NOT NULL CHECK (kind IN ('session', 'detached')), owner TEXT NOT NULL, owner_session TEXT, worktree_path TEXT NOT NULL, repository_root TEXT NOT NULL, branch TEXT,
					mode TEXT NOT NULL CHECK (mode IN ('commit', 'synced', 'delete')), owner_deleted INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, owner)) WITHOUT ROWID`);
			await sql(database, 'INSERT INTO pending_old SELECT * FROM pending_worktree_removals');
			await sql(database, 'DROP TABLE pending_worktree_removals');
			await sql(database, 'ALTER TABLE pending_old RENAME TO pending_worktree_removals');
			await sql(database, 'PRAGMA user_version = 19');
			await database.close();
			database = new AgentHostDatabase(path);
			try {
				await database.upsertPendingWorktreeRemoval(request({ kind: 'coOwned', owner: `${OWNER}|${WORKTREE}`, requestedAt: 2 }));
				assert.deepStrictEqual({
					version: await sql(database, 'PRAGMA user_version'),
					removals: (await database.listPendingWorktreeRemovals()).map(removal => `${removal.kind}:${removal.owner}`),
					coOwners: await database.readWorktreeCoOwners(WORKTREE),
				}, {
					version: [{ user_version: 20 }],
					removals: [`session:${OWNER}`, `coOwned:${OWNER}|${WORKTREE}`],
					coOwners: [],
				});
			} finally {
				await database.close();
			}
		} finally {
			await fs.rm(path, { force: true });
		}
	});
});
