/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AH_META_IS_ARCHIVED_DB_KEY } from '../../common/state/sessionState.js';
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
		requestedAt: 1,
		...overrides,
	};
}

async function importSession(database: AgentHostDatabase, session: string, values: Record<string, string>, chats: readonly IAgentHostSessionChatStateData[] = []): Promise<void> {
	await database.registerSessionV2(session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
	assert.strictEqual(await database.importSessionState(session, { importVersion: 1, importedAt: 1, values, folders: [], chats, legacyMirrorBase: '{}', launchDirsBackfilled: true }), 'imported');
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
		await database.upsertPendingWorktreeRemoval(request({ mode: 'delete', requestedAt: 3 }));
		await read();
		await database.upsertPendingWorktreeRemoval(request({ mode: 'commit', requestedAt: 4 }));
		await read();
		// A failure or a drop of a request that was replaced since does nothing.
		const staleFailure = await database.recordPendingWorktreeRemovalFailure(request({ mode: 'commit', requestedAt: 2 }), 100);
		await database.deletePendingWorktreeRemoval('session', OWNER, { mode: 'commit', requestedAt: 2 });
		await read();
		await database.deletePendingWorktreeRemoval('session', OWNER, { mode: 'delete', requestedAt: 3 });

		assert.deepStrictEqual({ modes, staleFailure, remaining: await database.listPendingWorktreeRemovals() }, {
			modes: ['synced:0', 'synced:1', 'commit:0', 'delete:0', 'delete:0', 'delete:0'],
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
		});
	});
});
