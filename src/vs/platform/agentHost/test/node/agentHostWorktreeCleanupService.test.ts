/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { DeferredPromise, SequencerByKey, timeout } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { AH_META_IS_ARCHIVED_DB_KEY } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostWorktreeCleanupService, IAgentHostWorktreeCleanupOptions } from '../../node/agentHostWorktreeCleanupService.js';
import type { WorktreeRemovalMode } from '../../node/agentHostWorktreeRemovalDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
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
	/** Completes when the first removal starts. */
	readonly removalStarted = new DeferredPromise<void>();
	/** Completes with the key of the first task queued while another task holds that key's lock. */
	readonly queuedBehindLock = new DeferredPromise<string>();
	reconcileGuard: DetachedWorktreeRemovalGuard | undefined;
	private readonly _sequencer = new SequencerByKey<string>();

	override runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
		if (this._sequencer.peek(key)) {
			this.queuedBehindLock.complete(key);
		}
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
		this.removalStarted.complete();
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
	override async recreateSharedWorktree(worktree: IRecordedWorktree): Promise<void> {
		await this.runExclusive(worktree.worktree.toString(), async () => {
			this.calls.push(`recreateShared:${worktree.worktree.toString()}:${worktree.branchName}`);
		});
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

	/** Waits for a pass the service runs on its own (at start, debounced or periodic) to start a removal, then for that pass to complete. */
	async function scheduledPassRemoval(worktree: RecordingWorktreeIsolation, cleanup: AgentHostWorktreeCleanupService): Promise<void> {
		await worktree.removalStarted.p;
		// The pass is still running, so runPass() returns that pass's promise.
		await cleanup.runPass();
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
		await worktree.removalStarted.p;
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
		await scheduledPassRemoval(worktree, cleanup);

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
		await scheduledPassRemoval(worktree, cleanup);

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
		await worktree.removalStarted.p;
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
		await scheduledPassRemoval(worktree, cleanup);

		assert.deepStrictEqual({ whileInUse, calls: worktree.calls, pending: await pending(database) }, {
			whileInUse: ['reconcileUnclaimed'],
			calls: ['reconcileUnclaimed', `remove:${sessionId}:commit:agents/archived`],
			pending: [],
		});
	});
	function sql(database: AgentHostDatabase, statement: string, parameters: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
		return (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase().then(raw => new Promise((resolve, reject) => raw.all(statement, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows))));
	}

	/** What a committed move records (Block 5): the session shares the worktree. */
	function share(database: AgentHostDatabase, session: URI, worktree: IRecordedWorktree): Promise<unknown> {
		return sql(database, 'INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [worktree.worktree.toString(), session.toString(), worktree.repositoryRoot.toString(), worktree.branchName]);
	}

	async function archive(database: AgentHostDatabase, session: URI): Promise<void> {
		const state = await database.readSessionState(session.toString());
		assert.ok(state);
		await database.writeSessionState(session.toString(), state.header.revision, { values: { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, folders: [], chats: [], markPayloadDirty: false });
	}

	suite('shared worktrees (Block 5)', () => {
		const shared = recorded('archived');
		const sharedKey = shared.worktree.toString();

		test('a shared worktree is kept while a live co-owner works in it, also only through a chat it archived, also after a restart, and removed once every co-owner is archived', async () => {
			const path = join(tmpdir(), `agent-host-shared-worktree-${generateUuid()}.db`);
			try {
				let database = disposables.add(new AgentHostDatabase(path));
				let worktree = new RecordingWorktreeIsolation();
				let cleanup = disposables.add(new AgentHostWorktreeCleanupService(undefined, database, worktree, new NullLogService()));
				// SESSION records the worktree; OTHER_SESSION's moved chat works in it, archived on its own.
				await useWorktree(database, SESSION, shared, true);
				await useWorktree(database, OTHER_SESSION, recorded('unrelated'));
				await sql(database, `INSERT INTO chats_v2 (chat_uri, owner_session_uri, working_directories, metadata, metadata_hash, archived) VALUES ('ahp-chat://moved', ?, ?, '{}', 'hash', 1)`, [OTHER_SESSION.toString(), JSON.stringify([sharedKey])]);
				await share(database, SESSION, shared);
				await share(database, OTHER_SESSION, shared);

				await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
				await cleanup.runPass();
				const kept = { calls: [...worktree.calls], pending: await pending(database) };
				cleanup.dispose();
				await database.close();
				database = disposables.add(new AgentHostDatabase(path));
				worktree = new RecordingWorktreeIsolation();
				cleanup = disposables.add(new AgentHostWorktreeCleanupService(undefined, database, worktree, new NullLogService()));
				await cleanup.runPass();
				const keptAfterRestart = { calls: [...worktree.calls], pending: await pending(database) };
				await archive(database, OTHER_SESSION);
				await cleanup.requestSessionWorktreeRemoval(OTHER_SESSION, 'commit');
				await cleanup.runPass();

				assert.deepStrictEqual({ kept, keptAfterRestart, calls: worktree.calls, pending: await pending(database) }, {
					// One removal per folder: SESSION's own removal covers its share of its worktree.
					kept: { calls: [], pending: ['session:commit:0'] },
					keptAfterRestart: { calls: [], pending: ['session:commit:0'] },
					// Each co-owner's removal runs; the folder is gone after the first, so the other only prunes it.
					calls: [`remove:${sessionId}:commit:agents/archived`, `remove:${sharedKey}:commit:agents/archived`],
					pending: [],
				});
				cleanup.dispose();
				await database.close();
			} finally {
				await fs.rm(path, { force: true });
			}
		});

		test('rows of sessions an older build deleted are pruned by a pass, and a shared folder\'s removal (in commit mode) leaves no row a deleted or departed session kept; an archived co-owner still in it keeps its row (real-data D1)', async () => {
			const rows = async (database: AgentHostDatabase) => (await database.readWorktreeCoOwners(sharedKey)).map(row => row.session === SESSION.toString() ? 'source' : row.session === OTHER_SESSION.toString() ? 'coOwner' : row.session);
			const outcomes: Record<string, unknown> = {};
			for (const last of ['deleted', 'archivedStaying'] as const) {
				const { database, worktree, cleanup } = create();
				// SESSION records the worktree and shared it with OTHER_SESSION; an older build then deleted SESSION.
				await useWorktree(database, SESSION, shared);
				await useWorktree(database, OTHER_SESSION, shared, last === 'archivedStaying');
				await share(database, SESSION, shared);
				await share(database, OTHER_SESSION, shared);
				// What is left of it: its co-owner row, which older builds don't know.
				await sql(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [SESSION.toString()]);
				await sql(database, 'DELETE FROM session_state_values WHERE session_uri = ?', [SESSION.toString()]);
				if (last === 'archivedStaying') {
					await cleanup.runPass();
				}
				const beforeRemoval = await rows(database);
				if (last === 'deleted') {
					// The lift deletes the last co-owner before any pass ran (as on real data): the source's row is still there.
					await database.tombstoneAndUnregisterSession(OTHER_SESSION.toString(), await cleanup.prepareSessionDeletion(OTHER_SESSION, [], 'delete'));
				} else {
					// The source's own removal runs while its archived co-owner still works in the folder (archived chats included).
					await database.upsertPendingWorktreeRemoval({ kind: 'session', owner: SESSION.toString(), ownerSession: SESSION.toString(), worktreePath: sharedKey, repositoryRoot: shared.repositoryRoot.toString(), branch: shared.branchName, mode: 'delete', ownerDeleted: true, requestedAt: 1 });
				}
				await cleanup.runPass();
				outcomes[last] = { beforeRemoval, calls: worktree.calls, pending: await pending(database), rows: await rows(database) };
			}

			assert.deepStrictEqual(outcomes, {
				deleted: { beforeRemoval: ['source', 'coOwner'], calls: [`remove:${sharedKey}:commit:agents/archived`], pending: [], rows: [] },
				// A pass prunes the deleted source's row while its co-owner is live.
				archivedStaying: { beforeRemoval: ['coOwner'], calls: [`remove:${sessionId}:commit:agents/archived`], pending: [], rows: ['coOwner'] },
			});
		});

		test('a session records one removal per folder: its own worktree\'s removal covers its share of it, its other shares get their own (G3)', async () => {
			const { database, cleanup } = create();
			const other = recorded('other');
			await share(database, SESSION, shared);
			await share(database, SESSION, other);
			await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
			const archived = (await database.listPendingWorktreeRemovals()).map(removal => `${removal.kind}:${removal.worktreePath}`);
			const deleted = (await cleanup.prepareSessionDeletion(SESSION, [], 'delete')).map(request => `${request.kind}:${request.worktreePath}`);

			assert.deepStrictEqual({ archived, deleted }, {
				archived: [`session:${sharedKey}`, `coOwned:${other.worktree.toString()}`],
				deleted: [`session:${sharedKey}`, `coOwned:${other.worktree.toString()}`],
			});
		});

		test('a co-owner that no longer works in the folder doesn\'t keep it: once its moved chat is gone, deleting the original owner removes the worktree (M1)', async () => {
			const { database, worktree, cleanup } = create();
			// The moved chat was deleted in OTHER_SESSION, which lives on working elsewhere; its share row stays.
			await useWorktree(database, OTHER_SESSION, recorded('unrelated'));
			await share(database, SESSION, shared);
			await share(database, OTHER_SESSION, shared);
			await database.tombstoneAndUnregisterSession(SESSION.toString(), await cleanup.prepareSessionDeletion(SESSION, [], 'delete'));
			await cleanup.runPass();

			assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database), marker: (await database.readWorktreeCoOwners(sharedKey)).map(row => `${row.session}:${row.live}`) }, {
				calls: [`remove:${sessionId}:commit:agents/archived`],
				pending: [],
				// The marker row only forced commit mode; once the folder is removed, it goes too (real-data D1).
				marker: [],
			});
		});

		test('deleting a session whose worktree was ever shared commits it rather than force-removing it, when requested and when the removal runs', async () => {
			const { database, worktree, cleanup } = create();
			await share(database, SESSION, shared);
			await share(database, OTHER_SESSION, shared);
			const requested = (await cleanup.prepareSessionDeletion(SESSION, [], 'delete')).map(request => `${request.kind}:${request.mode}`);
			// A deletion recorded before its folder was shared: only the marker row of a co-owner since deleted is left.
			const earlier = AgentSession.uri('copilotcli', 'earlier');
			const earlierWorktree = recorded('earlier');
			await database.upsertPendingWorktreeRemoval({ kind: 'session', owner: earlier.toString(), ownerSession: earlier.toString(), worktreePath: earlierWorktree.worktree.toString(), repositoryRoot: earlierWorktree.repositoryRoot.toString(), branch: earlierWorktree.branchName, mode: 'delete', ownerDeleted: true, requestedAt: 1 });
			await share(database, AgentSession.uri('copilotcli', 'gone'), earlierWorktree);
			await cleanup.runPass();

			assert.deepStrictEqual({ requested, calls: worktree.calls }, {
				requested: ['session:commit'],
				calls: [`remove:${AgentSession.id(earlier)}:commit:agents/earlier`],
			});
		});

		test('a co-owner\'s removal removes the worktree once its original owner was deleted by an older build', async () => {
			const { database, worktree, cleanup } = create();
			await useWorktree(database, SESSION, shared);
			await useWorktree(database, OTHER_SESSION, shared);
			await share(database, SESSION, shared);
			await share(database, OTHER_SESSION, shared);
			// 1.142 deletes SESSION: tombstone and registry rows, recording no removal; the garbage sweep drops its state.
			await sql(database, `INSERT INTO metadata (key, value) VALUES ('sessionTombstone:' || ?, 'true')`, [SESSION.toString()]);
			await sql(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [SESSION.toString()]);
			await database.deleteSessionStateGarbage(SESSION.toString());
			await archive(database, OTHER_SESSION);
			await cleanup.requestSessionWorktreeRemoval(OTHER_SESSION, 'commit');
			await cleanup.runPass();

			assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database), coOwners: (await database.readWorktreeCoOwners(sharedKey)).map(row => row.session) }, {
				calls: [`remove:${sharedKey}:commit:agents/archived`],
				pending: [],
				// Its co-owner's row stays while it is archived: unarchiving it recreates the folder from it.
				coOwners: [OTHER_SESSION.toString()],
			});
		});

		test('unarchiving a co-owner drops its removal and recreates the shared folder from the branch it recorded', async () => {
			const { database, worktree, cleanup } = create();
			await useWorktree(database, OTHER_SESSION, shared, true);
			await share(database, OTHER_SESSION, shared);
			await cleanup.requestSessionWorktreeRemoval(OTHER_SESSION, 'commit');
			const recordedRemovals = await pending(database);
			await cleanup.restoreSessionWorktree(OTHER_SESSION);

			assert.deepStrictEqual({ recordedRemovals, calls: worktree.calls, pending: await pending(database) }, {
				recordedRemovals: ['coOwned:commit:0'],
				calls: [`recreate:${AgentSession.id(OTHER_SESSION)}`, `recreateShared:${sharedKey}:agents/archived`],
				pending: [],
			});
		});

		test('archiving a session records no co-owned removal for a shared folder that is its own additional worktree: the handle\'s removal covers it, and unarchive recreates it once (re-review LOW 2)', async () => {
			const { database, worktree, cleanup } = create();
			const additional = recorded('additional');
			await database.registerSessionV2(SESSION.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await database.importSessionState(SESSION.toString(), {
				importVersion: 1, importedAt: 1, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true,
				values: {
					[SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([shared.worktree.toString(), additional.worktree.toString()]),
					[ADDITIONAL_WORKTREES_METADATA_KEY]: JSON.stringify([{ handle: HANDLE, workingDirectory: additional.worktree.toString(), repositoryRoot: additional.repositoryRoot.toString() }]),
					[AH_META_IS_ARCHIVED_DB_KEY]: 'true',
				},
			});
			await share(database, SESSION, shared);
			await share(database, SESSION, additional);
			worktree.detached.set(HANDLE, additional);
			await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
			await cleanup.setDetachedWorktreeArchived(HANDLE, true, false, SESSION);
			const archived = (await database.listPendingWorktreeRemovals()).map(removal => `${removal.kind}:${removal.worktreePath}`).sort();
			await cleanup.restoreSessionWorktree(SESSION);

			assert.deepStrictEqual({ archived, recreated: worktree.calls.filter(call => call.startsWith('recreate')) }, {
				archived: [`detached:${additional.worktree.toString()}`, `session:${sharedKey}`],
				recreated: [`recreate:${sessionId}`],
			});
		});

		test('a co-owner\'s recreate of a shared folder waits for its original owner\'s running removal, which holds the folder\'s lock (L5)', async () => {
			const { database, worktree, cleanup } = create();
			await useWorktree(database, SESSION, shared, true);
			await useWorktree(database, OTHER_SESSION, shared, true);
			await share(database, SESSION, shared);
			await share(database, OTHER_SESSION, shared);
			await cleanup.requestSessionWorktreeRemoval(SESSION, 'commit');
			worktree.removal = new DeferredPromise<void>();

			const pass = cleanup.runPass();
			await worktree.removalStarted.p;
			const restore = cleanup.restoreSessionWorktree(OTHER_SESSION);
			// The unarchive recreates its own worktree first, then its share, which only the folder's lock (held by the running
			// removal) holds back: wait until it queues behind a held lock, or completes if nothing holds it back.
			const waitingOnLock = await Promise.race([worktree.queuedBehindLock.p, restore]);
			const callsWhileRemoving = [...worktree.calls];
			worktree.removal.complete();
			await Promise.all([pass, restore]);

			assert.deepStrictEqual({ waitingOnLock, callsWhileRemoving, calls: worktree.calls }, {
				waitingOnLock: sharedKey,
				callsWhileRemoving: [`remove:${sessionId}:commit:agents/archived`, `recreate:${AgentSession.id(OTHER_SESSION)}`],
				calls: [`remove:${sessionId}:commit:agents/archived`, `recreate:${AgentSession.id(OTHER_SESSION)}`, `recreateShared:${sharedKey}:agents/archived`],
			});
		});

		test('unarchiving a session doesn\'t recreate the folder of a share it no longer works in (L3)', async () => {
			const { database, worktree, cleanup } = create();
			// OTHER_SESSION's chat left the shared folder: its row is stale, kept only as the folder's forced-commit marker.
			await useWorktree(database, OTHER_SESSION, recorded('unrelated'), true);
			await share(database, OTHER_SESSION, shared);
			await cleanup.requestSessionWorktreeRemoval(OTHER_SESSION, 'commit');
			await cleanup.restoreSessionWorktree(OTHER_SESSION);

			assert.deepStrictEqual({ calls: worktree.calls, pending: await pending(database), marker: (await database.readWorktreeCoOwners(sharedKey)).map(row => `${row.session}:${row.live}`) }, {
				calls: [`recreate:${AgentSession.id(OTHER_SESSION)}`],
				pending: [],
				marker: [`${OTHER_SESSION.toString()}:false`],
			});
		});
	});
});
