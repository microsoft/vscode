/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, SequencerByKey, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { AH_META_IS_ARCHIVED_DB_KEY } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostWorktreeCleanupService, IAgentHostWorktreeCleanupOptions } from '../../node/agentHostWorktreeCleanupService.js';
import type { WorktreeRemovalMode } from '../../node/agentHostWorktreeRemovalDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { DetachedWorktreeRemovalGuard, IRecordedWorktree, NullAgentHostWorktreeIsolation, WorktreeRemovalOutcome } from '../../node/shared/worktreeIsolation.js';

const SESSION = AgentSession.uri('copilotcli', 'archived');
const OTHER_SESSION = AgentSession.uri('copilotcli', 'other');
const HANDLE = '11111111-1111-4111-8111-111111111111';

function recorded(name: string): IRecordedWorktree {
	return { worktree: URI.file(`/repo.worktrees/${name}`), repositoryRoot: URI.file('/repo'), branchName: `agents/${name}` };
}

/** Records the worktree work the clean-up service asks for, under a real per-key lock. */
class RecordingWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	readonly calls: string[] = [];
	readonly sessions = new Map<string, IRecordedWorktree>([[SESSION.toString(), recorded('archived')]]);
	readonly detached = new Map<string, IRecordedWorktree>([[HANDLE, recorded('detached')]]);
	failures = 0;
	outcome: WorktreeRemovalOutcome = 'removed';
	removal: DeferredPromise<void> | undefined;
	reconcileGuard: DetachedWorktreeRemovalGuard | undefined;
	private readonly _sequencer = new SequencerByKey<string>();

	override runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
		return this._sequencer.queue(key, task);
	}
	override async readSessionWorktreeForRemoval(sessionUri: URI): Promise<IRecordedWorktree | undefined> {
		return this.sessions.get(sessionUri.toString());
	}
	override async readDetachedWorktreeForRemoval(handle: string): Promise<IRecordedWorktree | undefined> {
		return this.detached.get(handle);
	}
	override async markDetachedWorktreeArchived(handle: string, archived: boolean): Promise<boolean> {
		this.calls.push(`mark:${handle}:${archived}`);
		return this.detached.has(handle);
	}
	override async removeRecordedWorktree(key: string, worktree: IRecordedWorktree, mode: WorktreeRemovalMode, canRemove?: () => Promise<boolean>): Promise<WorktreeRemovalOutcome> {
		this.calls.push(`remove:${key}:${mode}:${worktree.branchName}`);
		await this.removal?.p;
		if (this.failures > 0) {
			this.failures--;
			throw new Error('git failed');
		}
		if (canRemove && !await canRemove()) {
			this.calls.push(`inUse:${key}`);
			return 'inUse';
		}
		return this.outcome;
	}
	override async recreateWorktreeOnUnarchive(_sessionUri: URI, sessionId: string): Promise<void> {
		this.calls.push(`recreate:${sessionId}`);
	}
	override async recreateDetachedWorktreeOnUnarchive(handle: string): Promise<void> {
		this.calls.push(`recreate:${handle}`);
	}
	override async deleteDetachedWorktreeRecord(handle: string): Promise<void> {
		this.calls.push(`deleteRecord:${handle}`);
	}
	override async claimDetachedWorktree(handle: string): Promise<void> {
		this.calls.push(`claim:${handle}`);
	}
	override async cleanupUnclaimedDetachedWorktrees(canRemove?: DetachedWorktreeRemovalGuard): Promise<void> {
		this.calls.push('reconcileUnclaimed');
		this.reconcileGuard = canRemove;
	}
}

class RecordingLogService extends NullLogService {
	readonly messages: string[] = [];
	override info(message: string): void { this.messages.push(`info:${message}`); }
	override warn(message: string): void { this.messages.push(`warn:${message}`); }
}

suite('AgentHostWorktreeCleanupService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionId = AgentSession.id(SESSION);

	function create(options?: IAgentHostWorktreeCleanupOptions, logService = new NullLogService()) {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const worktree = new RecordingWorktreeIsolation();
		const cleanup = disposables.add(new AgentHostWorktreeCleanupService(options, database, worktree, logService));
		return { database, worktree, cleanup };
	}

	async function pending(database: AgentHostDatabase): Promise<string[]> {
		return (await database.listPendingWorktreeRemovals()).map(removal => `${removal.kind}:${removal.mode}:${removal.attempts}`);
	}

	async function useWorktree(database: AgentHostDatabase, session: URI, worktree: IRecordedWorktree, archived = false): Promise<void> {
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState(session.toString(), {
			importVersion: 1, importedAt: 1, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true,
			values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([URI.joinPath(worktree.worktree, 'src').toString()]), [AH_META_IS_ARCHIVED_DB_KEY]: archived ? 'true' : '' },
		});
	}

	test('archive and delete only record the removal, and a pass removes each worktree by its mode', async () => {
		const { database, worktree, cleanup } = create();
		const synced = AgentSession.uri('copilotcli', 'synced');
		worktree.sessions.set(synced.toString(), recorded('synced'));
		const deleted = AgentSession.uri('copilotcli', 'deleted');
		worktree.sessions.set(deleted.toString(), recorded('deleted'));

		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.requestSessionWorktreeRemoval(synced, 'synced');
		await cleanup.setDetachedWorktreeArchived(HANDLE, true, true, SESSION);
		await database.tombstoneAndUnregisterSession(deleted.toString(), await cleanup.prepareSessionDeletion(deleted, [], 'delete'));
		const recordedBeforePass = { calls: [...worktree.calls], pending: (await pending(database)).sort() };
		await cleanup.runPass();
		await cleanup.deleteDetachedWorktree(HANDLE);
		await cleanup.runPass();

		assert.deepStrictEqual({ recordedBeforePass, calls: worktree.calls.slice(1), pending: await pending(database) }, {
			recordedBeforePass: { calls: [`mark:${HANDLE}:true`], pending: ['detached:synced:0', 'session:commit:0', 'session:delete:0', 'session:synced:0'] },
			calls: [
				`remove:${sessionId}:commit:agents/archived`,
				`remove:${AgentSession.id(synced)}:synced:agents/synced`,
				`remove:${HANDLE}:synced:agents/detached`,
				`remove:${AgentSession.id(deleted)}:delete:agents/deleted`,
				`remove:${HANDLE}:delete:agents/detached`,
				`deleteRecord:${HANDLE}`,
			],
			pending: [],
		});
	});

	test('unarchive drops the pending removal and recreates the worktree', async () => {
		const { database, worktree, cleanup } = create();

		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.setDetachedWorktreeArchived(HANDLE, true);
		await cleanup.restoreSessionWorktree(SESSION);
		await cleanup.setDetachedWorktreeArchived(HANDLE, false);
		await cleanup.runPass();

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [`mark:${HANDLE}:true`, `recreate:${sessionId}`, `mark:${HANDLE}:false`, `recreate:${HANDLE}`],
			pending: [],
		});
	});

	test('a removal its owner unarchived after the pass listed it is skipped, and an unarchive waits for a running removal', async () => {
		const { database, worktree, cleanup } = create();
		const second = AgentSession.uri('copilotcli', 'second');
		worktree.sessions.set(second.toString(), recorded('second'));
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.requestSessionWorktreeRemoval(second, 'commit');
		worktree.removal = new DeferredPromise<void>();

		const pass = cleanup.runPass();
		while (!worktree.calls.length) {
			await timeout(0);
		}
		// The second session is unarchived while the first one's removal runs.
		await cleanup.restoreSessionWorktree(second);
		// The first session's unarchive waits for its running removal, then recreates the worktree.
		const restoreFirst = cleanup.restoreSessionWorktree(SESSION);
		await timeout(0);
		const callsWhileRemoving = [...worktree.calls];
		worktree.removal.complete();
		await Promise.all([pass, restoreFirst]);

		assert.deepStrictEqual({ callsWhileRemoving, calls: worktree.calls, pending: await pending(database) }, {
			callsWhileRemoving: [`remove:${sessionId}:commit:agents/archived`, `recreate:${AgentSession.id(second)}`],
			calls: [`remove:${sessionId}:commit:agents/archived`, `recreate:${AgentSession.id(second)}`, `recreate:${sessionId}`],
			pending: [],
		});
	});

	test('a worktree another non-archived session uses is kept and re-checked until that session is archived', async () => {
		const { database, worktree, cleanup } = create({ debounceMs: 1, periodicMs: 10 });
		await useWorktree(database, OTHER_SESSION, recorded('archived'));
		cleanup.start();
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.runPass();
		const whileInUse = { calls: [...worktree.calls], pending: await pending(database) };

		const state = await database.readSessionState(OTHER_SESSION.toString());
		assert.ok(state);
		await database.writeSessionState(OTHER_SESSION.toString(), state.header.revision, { values: { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], markPayloadDirty: false });
		// The periodic re-check removes it without another request.
		for (let attempt = 0; attempt < 400 && (await database.listPendingWorktreeRemovals()).length; attempt++) {
			await timeout(5);
		}

		assert.deepStrictEqual({ whileInUse, calls: worktree.calls, pending: await pending(database) }, {
			whileInUse: { calls: ['reconcileUnclaimed'], pending: ['session:commit:0'] },
			calls: ['reconcileUnclaimed', `remove:${sessionId}:commit:agents/archived`],
			pending: [],
		});
	});

	test('a worktree an archived session uses is removed', async () => {
		const { database, worktree, cleanup } = create();
		await useWorktree(database, OTHER_SESSION, recorded('archived'), true);

		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.runPass();

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [`remove:${sessionId}:commit:agents/archived`],
			pending: [],
		});
	});

	test('failed removals are retried with exponential backoff and warned about after five attempts', async () => {
		let now = 1_000;
		const logService = new RecordingLogService();
		const { database, worktree, cleanup } = create({ backoffMs: 100, maxBackoffMs: 500, now: () => now }, logService);
		worktree.failures = 6;
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');

		const attempts: { readonly at: number; readonly removals: number; readonly nextAttemptAt: number | undefined }[] = [];
		for (const at of [1_000, 1_099, 1_100, 1_299, 1_300, 1_700, 2_200, 2_700, 3_200]) {
			now = at;
			await cleanup.runPass();
			attempts.push({ at, removals: worktree.calls.length, nextAttemptAt: (await database.readPendingWorktreeRemoval('session', SESSION.toString()))?.nextAttemptAt });
		}

		assert.deepStrictEqual({ attempts, levels: logService.messages.map(message => message.split(':')[0]) }, {
			attempts: [
				{ at: 1_000, removals: 1, nextAttemptAt: 1_100 },
				{ at: 1_099, removals: 1, nextAttemptAt: 1_100 },
				{ at: 1_100, removals: 2, nextAttemptAt: 1_300 },
				{ at: 1_299, removals: 2, nextAttemptAt: 1_300 },
				{ at: 1_300, removals: 3, nextAttemptAt: 1_700 },
				{ at: 1_700, removals: 4, nextAttemptAt: 2_200 },
				{ at: 2_200, removals: 5, nextAttemptAt: 2_700 },
				{ at: 2_700, removals: 6, nextAttemptAt: 3_200 },
				{ at: 3_200, removals: 7, nextAttemptAt: undefined },
			],
			levels: ['info', 'info', 'info', 'info', 'warn', 'warn'],
		});
	});

	test('nothing is removed before start; start reconciles unclaimed detached worktrees, then removes', async () => {
		const { database, worktree, cleanup } = create({ debounceMs: 1 });

		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.deleteDetachedWorktree(HANDLE);
		await timeout(20);
		const beforeStart = { calls: [...worktree.calls], pending: (await pending(database)).sort() };
		cleanup.start();
		for (let attempt = 0; attempt < 200 && (await database.listPendingWorktreeRemovals()).length; attempt++) {
			await timeout(5);
		}

		assert.deepStrictEqual({ beforeStart, calls: worktree.calls }, {
			beforeStart: { calls: [], pending: ['detached:delete:0', 'session:commit:0'] },
			calls: ['reconcileUnclaimed', `remove:${sessionId}:commit:agents/archived`, `remove:${HANDLE}:delete:agents/detached`, `deleteRecord:${HANDLE}`],
		});
	});

	test('a detached worktree pending deletion stays deleted: archive and unarchive keep the deletion and its handle is unknown', async () => {
		const { database, worktree, cleanup } = create();

		await cleanup.deleteDetachedWorktree(HANDLE);
		await cleanup.setDetachedWorktreeArchived(HANDLE, true);
		await cleanup.setDetachedWorktreeArchived(HANDLE, false);
		await assert.rejects(cleanup.claimDetachedWorktree(HANDLE), /Unknown detached worktree handle/);

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [],
			pending: ['detached:delete:0'],
		});
	});

	test('a detached worktree without a recorded folder is deleted at once', async () => {
		const { database, worktree, cleanup } = create();
		worktree.detached.clear();

		await cleanup.deleteDetachedWorktree(HANDLE);

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [`deleteRecord:${HANDLE}`],
			pending: [],
		});
	});

	test('a deletion waits for a worktree still being created and records its removal', async () => {
		const { worktree, cleanup } = create();
		const deleted = AgentSession.uri('copilotcli', 'creating');
		const created = new DeferredPromise<void>();
		const creation = worktree.runExclusive(AgentSession.id(deleted), async () => {
			await created.p;
			worktree.sessions.set(deleted.toString(), recorded('creating'));
		});

		const preparing = cleanup.prepareSessionDeletion(deleted, [], 'delete');
		await timeout(0);
		created.complete();
		await creation;

		assert.deepStrictEqual((await preparing).map(request => `${request.kind}:${request.mode}:${request.branch}`), ['session:delete:agents/creating']);
	});

	test('an archive request whose session is unarchived in its state is dropped without removing the worktree', async () => {
		const { database, worktree, cleanup } = create();
		// The unarchive was persisted, but the agent host stopped before it dropped the request.
		await useWorktree(database, SESSION, recorded('elsewhere'));
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.runPass();

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, { calls: [], pending: [] });
	});

	test('a deleted session\'s removal does not depend on its archived state, and also deletes its detached worktree record', async () => {
		const { database, worktree, cleanup } = create();
		await useWorktree(database, SESSION, recorded('elsewhere'));

		await database.tombstoneAndUnregisterSession(SESSION.toString(), await cleanup.prepareSessionDeletion(SESSION, [HANDLE], 'synced'));
		await cleanup.setDetachedWorktreeArchived(HANDLE, false);
		await cleanup.runPass();

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [`remove:${sessionId}:synced:agents/archived`, `remove:${HANDLE}:synced:agents/detached`, `deleteRecord:${HANDLE}`],
			pending: [],
		});
	});

	test('a removal its Git checks skip is kept and retried later without a warning', async () => {
		const logService = new RecordingLogService();
		const { database, worktree, cleanup } = create({ backoffMs: 100, now: () => 1_000 }, logService);
		worktree.outcome = 'skipped';

		await cleanup.requestSessionWorktreeRemoval(SESSION, 'synced');
		await cleanup.runPass();

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database), nextAttemptAt: (await database.readPendingWorktreeRemoval('session', SESSION.toString()))?.nextAttemptAt, messages: logService.messages }, {
			calls: [`remove:${sessionId}:synced:agents/archived`],
			pending: ['session:synced:1'],
			nextAttemptAt: 1_100,
			messages: [],
		});
	});

	test('a worktree that comes into use while its removal runs is kept for a later pass', async () => {
		const { database, worktree, cleanup } = create();
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		worktree.removal = new DeferredPromise<void>();

		const pass = cleanup.runPass();
		while (!worktree.calls.length) {
			await timeout(0);
		}
		// Another session attaches the folder after the in-use query, while Git commits its changes.
		await useWorktree(database, OTHER_SESSION, recorded('archived'));
		worktree.removal.complete();
		await pass;

		assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database) }, {
			calls: [`remove:${sessionId}:commit:agents/archived`, `inUse:${sessionId}`],
			pending: ['session:commit:0'],
		});
	});

	test('start reconciles detached worktrees without removing one that is pending clean-up or that another session uses', async () => {
		const { database, worktree, cleanup } = create();
		await useWorktree(database, OTHER_SESSION, recorded('borrowed'));
		await cleanup.setDetachedWorktreeArchived(HANDLE, true, false, SESSION);
		cleanup.start();
		const guard = worktree.reconcileGuard;
		assert.ok(guard);

		assert.deepStrictEqual({
			pending: await guard(HANDLE, recorded('detached').worktree, SESSION.toString()),
			borrowed: await guard('other', recorded('borrowed').worktree, SESSION.toString()),
			ownerOnly: await guard('other', recorded('borrowed').worktree, OTHER_SESSION.toString()),
			unused: await guard('other', recorded('unused').worktree, undefined),
		}, { pending: false, borrowed: false, ownerOnly: true, unused: true });
	});

	test('archiving the session that kept a worktree in use removes it without waiting for the periodic re-check', async () => {
		const { database, worktree, cleanup } = create({ debounceMs: 1, periodicMs: 60 * 60 * 1000 });
		await useWorktree(database, OTHER_SESSION, recorded('archived'));
		cleanup.start();
		await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
		await cleanup.runPass();
		const whileInUse = [...worktree.calls];

		const state = await database.readSessionState(OTHER_SESSION.toString());
		assert.ok(state);
		await database.writeSessionState(OTHER_SESSION.toString(), state.header.revision, { values: { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], markPayloadDirty: false });
		// The other session has no worktree of its own, yet its archive triggers a pass.
		await cleanup.requestSessionWorktreeRemoval(OTHER_SESSION, 'commit');
		for (let attempt = 0; attempt < 400 && (await database.listPendingWorktreeRemovals()).length; attempt++) {
			await timeout(5);
		}

		assert.deepStrictEqual({ whileInUse, calls: worktree.calls, pending: await pending(database) }, {
			whileInUse: ['reconcileUnclaimed'],
			calls: ['reconcileUnclaimed', `remove:${sessionId}:commit:agents/archived`],
			pending: [],
		});
	});
});
