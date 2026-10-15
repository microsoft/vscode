/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
});
