/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as sinon from 'sinon';
import type { Database } from '@vscode/sqlite3';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ChatInteractivity, MessageKind } from '../../common/state/sessionState.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionStateDeletedError, SessionStateMirrorFlush, readSessionBaseBranch, sessionStatePatch } from '../../common/agentHostSessionStateStore.js';
import { type ISessionDatabase, type ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostCatalogSyncService } from '../../node/agentHostCatalogSyncService.js';
import { AgentHostDatabase, type IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { mirrorEntryId, OLDER_BUILD_WORKTREE_WITHHELD_KEY } from '../../node/agentHostSessionStateMirror.js';
import { AgentHostWorktreeCoOwnership } from '../../node/agentHostWorktreeCoOwnership.js';
import { NullAgentHostWorktreeIsolation, WORKTREE_META_PATH, WORKTREE_META_REPOSITORY_ROOT } from '../../node/shared/worktreeIsolation.js';
import { AgentHostSessionStateStore } from '../../node/agentHostSessionStateStore.js';
import { AH_CHAT_CONFIG_VALUES_DB_KEY } from '../../node/agentHostChatRowStore.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from '../../node/shared/persistSessionMetadata.js';
import { WORKTREE_FOLDERS_KEY } from '../../node/shared/sessionWorktreeFolders.js';
import { createLegacySessionFixture, InMemorySessionDataService, legacySessionMetadata, readOldBuildView, writeLegacySessionState, type ILegacySessionFixture } from './sessionStateCompatibilityFixtures.js';

/** Long enough that no mirror flush runs unless a test asks for it. */
const MANUAL_FLUSH = 60_000;

suite('AgentHostSessionStateStore', () => {
	const store = new DisposableStore();
	let database: AgentHostDatabase;
	let sessionData: InMemorySessionDataService;

	setup(() => {
		database = store.add(new AgentHostDatabase(':memory:'));
		sessionData = store.add(new InMemorySessionDataService());
	});
	teardown(() => {
		sinon.restore();
		store.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function createStore(flushDelay = MANUAL_FLUSH, service: ISessionDataService = sessionData.createService(), db: IAgentHostDatabase = database): AgentHostSessionStateStore {
		return store.add(new AgentHostSessionStateStore(flushDelay, db, service, new NullLogService()));
	}

	async function oldBuildSession(build: ILegacySessionFixture['build'] = '1.143'): Promise<{ fixture: ILegacySessionFixture; session: URI }> {
		const fixture = createLegacySessionFixture(build, { historical: true });
		await writeLegacySessionState(sessionData.createService(), database, fixture);
		return { fixture, session: URI.parse(fixture.session) };
	}

	async function sessionDb(session: URI, keys: readonly string[]): Promise<Record<string, string | undefined>> {
		const reference = sessionData.createService().openDatabase(session);
		try {
			return await reference.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])));
		} finally {
			reference.dispose();
		}
	}

	async function oldBuildEdit(resource: string, set: Record<string, string>, remove: readonly string[] = []): Promise<void> {
		const reference = sessionData.createService().openDatabase(URI.parse(resource));
		try {
			await reference.object.applyMetadataChanges(set, remove);
		} finally {
			reference.dispose();
		}
	}

	test('a shared worktree\'s branch is withheld from older builds until it is no longer shared; an older build writing it back keeps the value and has it withheld again (Block 5)', async () => {
		const session = URI.parse('copilotcli:/shared-owner');
		const coOwner = 'copilotcli:/co-owner';
		const worktree = 'file:///repo.worktrees/shared';
		const branchKey = 'copilot.worktree.branchName';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.registerSessionV2(coOwner, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState(coOwner, { importVersion: 1, importedAt: 1, values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([worktree]) }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true });
		const first = createStore();
		await first.writeMetadata(session, session, {
			[WORKTREE_META_PATH]: worktree, [branchKey]: 'agents/shared', [WORKTREE_META_REPOSITORY_ROOT]: 'file:///repo', [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([worktree]),
		}, SessionStateMirrorFlush.Immediate);
		const raw = await (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		for (const owner of [session.toString(), coOwner]) {
			await new Promise<void>((resolve, reject) => raw.run('INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [worktree, owner, 'file:///repo', 'agents/shared'], error => error ? reject(error) : resolve()));
		}
		// What 1.140-1.142 resolve as the session's worktree: nothing without its branch, so they never remove it.
		const olderBuildWorktree = async () => {
			const values = await sessionDb(session, [WORKTREE_META_PATH, branchKey]);
			return values[branchKey] === undefined ? undefined : values[WORKTREE_META_PATH];
		};
		const central = async (sessionStore: AgentHostSessionStateStore) => (await sessionStore.readWithoutImport(session, [branchKey, OLDER_BUILD_WORKTREE_WITHHELD_KEY])).get(branchKey);
		const states: Record<string, unknown> = {};

		states.before = await olderBuildWorktree();
		const coOwnership = new AgentHostWorktreeCoOwnership(database, first, new NullAgentHostWorktreeIsolation(), new NullLogService());
		(await coOwnership.withhold(session)).done();
		await coOwnership.releaseWithholding(session);
		states.shared = { olderBuild: await olderBuildWorktree(), central: await central(first) };
		// An older build writes the branch back; the next import keeps its (same) value and withholds it again.
		await oldBuildEdit(session.toString(), { [branchKey]: 'agents/shared' });
		const second = createStore();
		await second.load(session);
		states.writtenBack = { olderBuild: await olderBuildWorktree(), central: await central(second) };
		// The co-owner is deleted by an older build: once published, older builds see the branch again.
		await new Promise<void>((resolve, reject) => raw.run('DELETE FROM sessions_v2 WHERE session_uri = ?', [coOwner], error => error ? reject(error) : resolve()));
		await new AgentHostWorktreeCoOwnership(database, second, new NullAgentHostWorktreeIsolation(), new NullLogService()).releaseWithholding(session);
		states.released = { olderBuild: await olderBuildWorktree(), central: await central(second), withheld: (await second.readWithoutImport(session, [OLDER_BUILD_WORKTREE_WITHHELD_KEY])).get(OLDER_BUILD_WORKTREE_WITHHELD_KEY) };

		assert.deepStrictEqual(states, {
			before: worktree,
			shared: { olderBuild: undefined, central: 'agents/shared' },
			writtenBack: { olderBuild: undefined, central: 'agents/shared' },
			released: { olderBuild: worktree, central: 'agents/shared', withheld: undefined },
		});
	});

	test('withholding and a transfer\'s target publication need older builds\' copy written: a failed mirror write refuses them, keeps the record\'s owner, and is retried (PR review)', async () => {
		const session = URI.parse('copilotcli:/unmirrored');
		const target = URI.parse('copilotcli:/unmirrored-target');
		const worktree = 'file:///repo.worktrees/unmirrored';
		const branchKey = 'copilot.worktree.branchName';
		const transfer = { handle: '33333333-3333-4333-8333-333333333333', workingDirectory: 'file:///repo.worktrees/own', repositoryRoot: 'file:///repo' };
		for (const registered of [session, target]) {
			await database.registerSessionV2(registered.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		}
		const sessionStore = createStore();
		await sessionStore.writeMetadata(session, session, { [WORKTREE_META_PATH]: worktree, [branchKey]: 'agents/unmirrored', [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([worktree]) }, SessionStateMirrorFlush.Immediate);
		// The move's transaction listed the transferred worktree centrally; older builds' copy of the target doesn't yet.
		await sessionStore.writeMetadata(target, target, { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([transfer.workingDirectory]) }, SessionStateMirrorFlush.Immediate);
		await sessionStore.update(target, 'agentHost.additionalWorktrees', () => JSON.stringify([transfer]), SessionStateMirrorFlush.Coalesced);
		const owners: string[] = [];
		const isolation = new class extends NullAgentHostWorktreeIsolation {
			override async setDetachedWorktreeOwner(handle: string, owner: URI): Promise<void> {
				owners.push(`${handle}:${owner.toString()}`);
			}
		}();
		const coOwnership = new AgentHostWorktreeCoOwnership(database, sessionStore, isolation, new NullLogService());
		const olderBuild = async () => ({ branch: (await sessionDb(session, [branchKey]))[branchKey], targetLists: (await sessionDb(target, ['agentHost.additionalWorktrees']))['agentHost.additionalWorktrees'] !== undefined });

		const failing = sinon.stub(SessionDatabase.prototype, 'applyMetadataChanges').rejects(new Error('disk full'));
		const whileFailing = {
			withhold: await coOwnership.withhold(session).then(() => 'withheld', () => 'refused'),
			transfer: await coOwnership.completeTransfers(session, target, [transfer], undefined, false).then(() => 'transferred', () => 'refused'),
			olderBuild: await olderBuild(),
			owners: [...owners],
		};
		failing.restore();
		await sessionStore.whenIdle(undefined);

		assert.deepStrictEqual({ whileFailing, retried: await olderBuild() }, {
			whileFailing: { withhold: 'refused', transfer: 'refused', olderBuild: { branch: 'agents/unmirrored', targetLists: false }, owners: [] },
			// The flag stays set centrally, the safe side: its copy follows once writes succeed again, as does the target's list.
			retried: { branch: undefined, targetLists: true },
		});
	});

	test('withholding is never released while a share of the session is in flight: a publish in the window and a concurrent refused move keep it, the committed share keeps it after (H1, Block 5)', async () => {
		const session = URI.parse('copilotcli:/in-flight');
		const worktree = 'file:///repo.worktrees/in-flight';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.registerSessionV2('copilotcli:/target', { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await database.importSessionState('copilotcli:/target', { importVersion: 1, importedAt: 1, values: { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([worktree]) }, folders: [], chats: [], legacyMirrorBase: '{}', launchDirsBackfilled: true });
		const sessionStore = createStore();
		await sessionStore.writeMetadata(session, session, { [WORKTREE_META_PATH]: worktree, 'copilot.worktree.branchName': 'agents/in-flight', [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify([worktree]) }, SessionStateMirrorFlush.Immediate);
		const coOwnership = new AgentHostWorktreeCoOwnership(database, sessionStore, new NullAgentHostWorktreeIsolation(), new NullLogService());
		const withheld = async () => (await sessionStore.readWithoutImport(session, [OLDER_BUILD_WORKTREE_WITHHELD_KEY])).get(OLDER_BUILD_WORKTREE_WITHHELD_KEY);
		const states: Record<string, unknown> = {};

		const committing = await coOwnership.withhold(session);
		// A publish of the session before the move commits: there are no co-owner rows yet.
		await coOwnership.releaseWithholding(session);
		states.publishInWindow = await withheld();
		// A second move shares it too and is refused: its undo leaves the first move's share withheld.
		await (await coOwnership.withhold(session)).undo();
		states.refusedConcurrentMove = await withheld();
		const raw = await (database as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		for (const owner of [session.toString(), 'copilotcli:/target']) {
			await new Promise<void>((resolve, reject) => raw.run('INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, \'file:///repo\', \'agents/in-flight\')', [worktree, owner], error => error ? reject(error) : resolve()));
		}
		committing.done();
		await coOwnership.releaseWithholding(session);
		states.committed = await withheld();
		// A refused move with no share left releases by the same rule.
		await new Promise<void>((resolve, reject) => raw.run('DELETE FROM worktree_co_owners', [], error => error ? reject(error) : resolve()));
		await (await coOwnership.withhold(session)).undo();
		states.refusedAlone = await withheld();

		assert.deepStrictEqual(states, { publishInWindow: 'true', refusedConcurrentMove: 'true', committed: 'true', refusedAlone: undefined });
	});

	test('a session\'s worktree folders are central only: never written to older builds\' copy, read back as written, and a rebuilt catalog payload (Block 5)', async () => {
		const session = URI.parse('copilotcli:/worktree-folders');
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const folders = JSON.stringify([{ workingDirectory: 'file:///repo.worktrees/shared', repositoryRoot: 'file:///repo', branch: 'agents/shared' }]);
		const first = createStore();
		await first.write(session, sessionStatePatch({ values: { [WORKTREE_FOLDERS_KEY]: folders, configValues: '{}' } }), SessionStateMirrorFlush.Immediate);
		const prefetched = await createStore().prefetchWithoutImport([session]);

		assert.deepStrictEqual({
			olderBuildCopy: await sessionDb(session, [WORKTREE_FOLDERS_KEY, 'configValues']),
			central: (await first.readWithoutImport(session, [WORKTREE_FOLDERS_KEY])).get(WORKTREE_FOLDERS_KEY),
			prefetched: prefetched.get(session.toString())?.values.get(WORKTREE_FOLDERS_KEY),
			payloadDirty: await database.getSessionV2PayloadDirty(session.toString()) !== undefined,
		}, {
			olderBuildCopy: { [WORKTREE_FOLDERS_KEY]: undefined, configValues: '{}' },
			central: folders,
			prefetched: folders,
			payloadDirty: true,
		});
	});

	test('imports an older build\'s session once, without changing what older builds read', async () => {
		const { fixture, session } = await oldBuildSession();
		const before = await readOldBuildView(sessionData.createService(), database, fixture);
		const imports = sinon.spy(database, 'importSessionState');
		const first = createStore();
		const [snapshot] = await Promise.all([first.load(session), first.load(session)]);
		const second = createStore();
		await second.load(session);
		const [defaultChat, sameFolder, otherFolder] = fixture.chats;

		assert.deepStrictEqual({
			imports: imports.callCount,
			authority: snapshot.authority,
			configValues: snapshot.values.get('configValues'),
			folders: [...snapshot.folders.keys()].sort(),
			chats: fixture.chats.map(({ uri }) => snapshot.chats.get(uri)).map(entry => entry && [entry.isDefault, entry.storage, entry.title, entry.isRead, entry.workingDirectories, entry.changes]),
			oldBuildViewUnchanged: JSON.stringify(await readOldBuildView(sessionData.createService(), database, fixture)) === JSON.stringify(before),
			header: (await database.readSessionState(fixture.session))?.header,
		}, {
			imports: 1,
			authority: 1,
			configValues: legacySessionMetadata(fixture).configValues,
			folders: ['', getWorkingDirectoryScopeId(otherFolder.workingDirectories), 'file:///workspace/app'].sort(),
			chats: [
				// The default chat's changes are the session's aggregate value, not a per-chat key.
				[true, fixture.session, defaultChat.title, true, undefined, undefined],
				[false, sameFolder.uri, sameFolder.title, undefined, undefined, JSON.stringify(sameFolder.changes)],
				[false, otherFolder.uri, otherFolder.title, undefined, otherFolder.workingDirectories, JSON.stringify(otherFolder.changes)],
			],
			oldBuildViewUnchanged: true,
			header: { revision: 1, legacyMirroredRevision: 1, rowsRevision: 0, rowsMirroredRevision: 0, importVersion: 1 },
		});
	});

	test('a session without any stored state imports empty and creates no storage', async () => {
		const session = URI.parse('copilotcli:/new');
		const snapshot = await createStore().load(session);
		assert.deepStrictEqual({ values: snapshot.values.size, chats: [...snapshot.chats.keys()], databases: sessionData.resources }, {
			values: 0,
			// The creation rule names the default chat of a session that records none.
			chats: ['ahp-chat://default/Y29waWxvdGNsaTovbmV3'],
			databases: [],
		});
	});

	test('an import that fails before committing is retried on the next load', async () => {
		const { session } = await oldBuildSession();
		const importSessionState = database.importSessionState.bind(database);
		const imports = sinon.stub(database, 'importSessionState');
		imports.callsFake(importSessionState);
		imports.onFirstCall().rejects(new Error('crash'));
		const sessionStore = createStore();
		await assert.rejects(() => sessionStore.load(session), /crash/);
		const snapshot = await sessionStore.load(session);
		assert.deepStrictEqual({ calls: imports.callCount, configValues: snapshot.values.has('configValues') }, { calls: 2, configValues: true });
	});

	test('older builds\' mirror edits win per entry; otherwise central state wins and stale mirrors are repaired', async () => {
		const { fixture, session } = await oldBuildSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		const otherScope = getWorkingDirectoryScopeId(otherFolder.workingDirectories);
		const first = createStore();
		await first.load(session);
		await first.write(session, sessionStatePatch({ values: { configValues: '{"central":true}' } }), SessionStateMirrorFlush.Immediate);
		// The process ends between the central write and its mirror.
		const mirrorWrites = sinon.stub(SessionDatabase.prototype, 'applyMetadataChanges').rejects(new Error('crash'));
		await first.write(session, sessionStatePatch({ values: { customizationEnablement: '{"central":"unmirrored"}' } }), SessionStateMirrorFlush.Immediate);
		mirrorWrites.restore();
		const crashed = (await database.readSessionState(fixture.session))!.header;
		first.dispose();

		// An older build then edits the mirrors.
		const gitData = JSON.parse(legacySessionMetadata(fixture)['agentHost.gitData']);
		await oldBuildEdit(fixture.session, {
			isArchived: 'true',
			'agentHost.gitData': JSON.stringify({ ...gitData, [otherScope]: { branchName: 'old-build' } }),
			[`customChatTitle:${sameFolder.uri}`]: 'Renamed by an older build',
		}, ['sessionArtifacts']);

		const second = createStore();
		const snapshot = await second.load(session);
		const state = await database.readSessionState(fixture.session);
		assert.deepStrictEqual({
			configValues: snapshot.values.get('configValues'),
			customizationEnablement: snapshot.values.get('customizationEnablement'),
			isArchived: snapshot.values.get('isArchived'),
			artifacts: snapshot.values.has('sessionArtifacts'),
			otherFolderGit: snapshot.folders.get(otherScope)?.git,
			sessionFolderGit: snapshot.folders.get('')?.git === legacySessionMetadata(fixture)['agentHost.git'],
			peerTitle: snapshot.chats.get(sameFolder.uri)?.title,
			mirror: await sessionDb(session, ['configValues', 'customizationEnablement', 'isArchived', 'sessionArtifacts']),
			crashed: [crashed.revision, crashed.legacyMirroredRevision],
			acknowledged: state?.header.legacyMirroredRevision === state?.header.revision,
		}, {
			// The mirror is recorded as behind the unmirrored write.
			crashed: [3, 2],
			configValues: '{"central":true}',
			customizationEnablement: '{"central":"unmirrored"}',
			isArchived: 'true',
			artifacts: false,
			otherFolderGit: '{"branchName":"old-build"}',
			sessionFolderGit: true,
			peerTitle: 'Renamed by an older build',
			mirror: { configValues: '{"central":true}', customizationEnablement: '{"central":"unmirrored"}', isArchived: 'true', sessionArtifacts: undefined },
			acknowledged: true,
		});
	});

	test('a mirror flush timer armed inside a section runs after it, without deadlocking it', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore(1);
		const seen = await sessionStore.runExclusive(session, async exclusive => {
			await exclusive.write(sessionStatePatch({ values: { configValues: 'timed' } }), SessionStateMirrorFlush.Coalesced);
			// The timer fires while the section still runs; its flush waits for the section instead of entering it.
			await timeout(20);
			return (await sessionDb(session, ['configValues'])).configValues;
		});
		await sessionStore.whenIdle(session);
		assert.deepStrictEqual({ duringSection: seen !== 'timed', afterSection: (await sessionDb(session, ['configValues'])).configValues }, { duringSection: true, afterSection: 'timed' });
	});

	test('a catalog synchronization whose request factory uses the store for the same session completes', async () => {
		const { fixture, session } = await oldBuildSession();
		const sessionStore = createStore();
		await database.registerSessionV2(fixture.session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const sync = new AgentHostCatalogSyncService(sessionData.createService(), database, sessionStore, new NullLogService());
		await sync.synchronizeWithFactory(session, async () => {
			// The factory runs outside the store's sections: loading and writing the same session must not wait for itself.
			await sessionStore.load(session);
			await sessionStore.writeMetadata(session, session, { configValues: 'from factory' }, SessionStateMirrorFlush.Immediate);
			return {
				data: { modifiedTime: 2, summary: 'Conversation', isRead: true, isArchived: false, workingDirectories: [], chats: [{ uri: fixture.chats[0].uri, order: 0, kind: 'default' }] },
				legacyMetadata: {},
			};
		});
		assert.strictEqual((await sessionStore.load(session)).values.get('configValues'), 'from factory');
	});

	test('a section may use the store for another session', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore();
		const other = URI.parse('copilotcli:/other');
		const result = await sessionStore.runExclusive(session, async exclusive => {
			await sessionStore.load(other);
			return exclusive.snapshot.session;
		});
		assert.strictEqual(result, session.toString());
	});

	test('entries the caller mirrored are not rewritten, and the revision is acknowledged only once every entry is mirrored', async () => {
		const { fixture, session } = await oldBuildSession();
		const sessionStore = createStore();
		const header = async () => (await database.readSessionState(fixture.session))!.header;
		await sessionStore.runExclusive(session, async exclusive => {
			await exclusive.write(sessionStatePatch({ values: { configValues: 'noted' } }), SessionStateMirrorFlush.Coalesced);
			const revision = await exclusive.write(sessionStatePatch({ values: { customizationEnablement: 'pending' } }), SessionStateMirrorFlush.Coalesced);
			exclusive.noteMirrored(revision, [mirrorEntryId({ kind: 'value', key: 'configValues' })]);
		});
		const afterSection = { header: await header(), mirror: await sessionDb(session, ['configValues', 'customizationEnablement']) };
		await sessionStore.whenIdle(session);
		const original = legacySessionMetadata(fixture);
		assert.deepStrictEqual({ afterSection, afterIdle: { header: await header(), mirror: await sessionDb(session, ['configValues', 'customizationEnablement']) } }, {
			afterSection: { header: { ...afterSection.header, revision: 3, legacyMirroredRevision: 1 }, mirror: { configValues: original.configValues, customizationEnablement: original.customizationEnablement } },
			afterIdle: { header: { ...afterSection.header, revision: 3, legacyMirroredRevision: 3 }, mirror: { configValues: original.configValues, customizationEnablement: 'pending' } },
		});
	});

	test('writes within the coalescing window reach session.db in one transaction', async () => {
		const { session } = await oldBuildSession();
		const coalesced = createStore();
		await coalesced.load(session);
		const mirrorWrites = sinon.spy(SessionDatabase.prototype, 'applyMetadataChanges');
		for (let i = 0; i < 50; i++) {
			await coalesced.update(session, 'agentHost.autoArchivedAt', () => String(i), SessionStateMirrorFlush.Coalesced);
		}
		const beforeIdle = mirrorWrites.callCount;
		await coalesced.whenIdle(session);
		const manual = mirrorWrites.callCount;
		const timed = createStore(5);
		await timed.update(session, 'agentHost.autoArchivedAt', () => 'timed', SessionStateMirrorFlush.Coalesced);
		// The timer, not a drain, flushes this store: wait until its write starts, then for that write itself.
		for (let attempt = 0; attempt < 1000 && mirrorWrites.callCount < 2; attempt++) {
			await timeout(5);
		}
		await mirrorWrites.lastCall.returnValue;
		assert.deepStrictEqual({ beforeIdle, manual, timed: mirrorWrites.callCount, mirror: await sessionDb(session, ['agentHost.autoArchivedAt']) }, {
			beforeIdle: 0, manual: 1, timed: 2, mirror: { 'agentHost.autoArchivedAt': 'timed' },
		});
	});

	test('a crash after the central commit but before the mirror flush is repaired by the next load', async () => {
		const { session } = await oldBuildSession();
		const crashing = createStore();
		await crashing.update(session, 'agentHost.autoArchivedAt', () => 'central-only', SessionStateMirrorFlush.Coalesced);
		const beforeRestart = await sessionDb(session, ['agentHost.autoArchivedAt']);
		const restarted = createStore();
		const loaded = await restarted.load(session);
		await restarted.whenIdle(session);
		assert.deepStrictEqual({ beforeRestart, loaded: loaded.values.get('agentHost.autoArchivedAt'), repaired: await sessionDb(session, ['agentHost.autoArchivedAt']) }, {
			beforeRestart: { 'agentHost.autoArchivedAt': undefined },
			loaded: 'central-only',
			repaired: { 'agentHost.autoArchivedAt': 'central-only' },
		});
	});

	test('whenIdle without a session waits for writes still queued, then their mirrors, as shutdown needs', async () => {
		const { session } = await oldBuildSession();
		const writer = createStore();
		// Fire-and-forget, as config persistence is, for a session the store has not loaded yet.
		const write = writer.update(session, 'configValues', () => '{"branch":"release"}', SessionStateMirrorFlush.Coalesced);

		await writer.whenIdle(undefined);

		assert.deepStrictEqual({
			central: (await createStore().readWithoutImport(session, ['configValues'])).get('configValues'),
			mirror: (await sessionDb(session, ['configValues'])).configValues,
		}, { central: '{"branch":"release"}', mirror: '{"branch":"release"}' });
		await write;
	});

	test('a page prefetch stops answering for a session the store writes after it was read', async () => {
		const { session } = await oldBuildSession();
		const store = createStore();
		await store.write(session, sessionStatePatch({ values: { configValues: 'before' } }), SessionStateMirrorFlush.Immediate);
		await store.evict(session);
		const prefetch = await store.prefetchWithoutImport([session]);
		const prefetched = (await store.readWithoutImport(session, ['configValues'], prefetch)).get('configValues');
		await store.write(session, sessionStatePatch({ values: { configValues: 'after' } }), SessionStateMirrorFlush.Immediate);
		await store.evict(session);
		assert.deepStrictEqual({
			prefetched,
			afterWrite: (await store.readWithoutImport(session, ['configValues'], prefetch)).get('configValues'),
			covers: prefetch.has(session.toString()),
		}, { prefetched: 'before', afterWrite: 'after', covers: false });
	});

	test('reads without importing use central values once imported and the mirror before', async () => {
		const { fixture, session } = await oldBuildSession();
		const imports = sinon.spy(database, 'importSessionState');
		const before = await createStore().readWithoutImport(session, ['configValues', 'agentHost.autoArchivedAt']);
		const importing = createStore();
		await importing.write(session, sessionStatePatch({ values: { configValues: 'central' } }), SessionStateMirrorFlush.Coalesced);
		const after = await createStore().readWithoutImport(session, ['configValues']);
		assert.deepStrictEqual({ before: [...before], after: [...after], imports: imports.callCount }, {
			before: [['configValues', legacySessionMetadata(fixture).configValues]],
			after: [['configValues', 'central']],
			imports: 1,
		});
	});

	test('values a provider wrote to session.db itself are refreshed into central state without rewriting them', async () => {
		const { fixture, session } = await oldBuildSession();
		const sessionStore = createStore();
		await sessionStore.load(session);
		await oldBuildEdit(fixture.session, { 'agentHost.workspaceless': 'true' });
		const mirrorWrites = sinon.spy(SessionDatabase.prototype, 'applyMetadataChanges');
		await sessionStore.refreshFromMirror(session, ['agentHost.workspaceless']);
		const state = await database.readSessionState(fixture.session);
		assert.deepStrictEqual({
			value: sessionStore.peek(session)?.values.get('agentHost.workspaceless'),
			mirrorWrites: mirrorWrites.callCount,
			acknowledged: state?.header.legacyMirroredRevision === state?.header.revision,
		}, { value: 'true', mirrorWrites: 0, acknowledged: true });
	});

	test('a session being deleted refuses writes until the deletion ends', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore();
		await sessionStore.load(session);
		const deletion = sessionStore.beginDeletion(session);
		await deletion.whenDrained;
		await assert.rejects(() => sessionStore.write(session, sessionStatePatch({ values: { configValues: 'late' } }), SessionStateMirrorFlush.Immediate), SessionStateDeletedError);
		deletion.dispose();
		assert.strictEqual(sessionStore.peek(session), undefined);
	});

	test('renders exactly the old format older builds wrote, and names the keys it does not own', async () => {
		const { fixture, session } = await oldBuildSession();
		const sessionStore = createStore();
		await sessionStore.load(session);
		const written = legacySessionMetadata(fixture);
		const rendered = sessionStore.legacyMetadata(session, [...Object.keys(written), 'isDone', 'agentHost.github']);
		const blobKeys = ['agentHost.changeset.branch', `agentHost.changeset.branch.${getWorkingDirectoryScopeId(fixture.chats[2].workingDirectories)}`];
		const owned = Object.fromEntries(Object.entries(written).filter(([key]) => !rendered.unowned.includes(key)));
		assert.deepStrictEqual({
			matches: Object.fromEntries(Object.entries(owned).map(([key, value]) => [key, rendered.values[key] === value])),
			retired: rendered.values.isDone,
			// Branch-changes blobs are not owned any more: nothing renders them.
			blobsRendered: blobKeys.map(key => rendered.values[key]),
			unowned: [...rendered.unowned].sort(),
		}, {
			matches: Object.fromEntries(Object.keys(owned).map(key => [key, true])),
			retired: undefined,
			blobsRendered: [undefined, undefined],
			// Provider-owned keys of the default chat, membership, and the retained legacy GitHub key.
			unowned: ['agentHost.changeset.session', ...blobKeys,
				'copilot.model',
				'copilot.workingDirectories', 'copilot.workingDirectory', 'defaultChatProviderData', 'peerChats', 'vscode.scheduleCursors',
				// Default-chat data in its own db (Mission Control cursors), never store-owned.
				`missionControl.sdkSequence.${fixture.missionControlEnvironment}`, `missionControl.sdkJournalCursor.${fixture.missionControlEnvironment}`].sort(),
		});
	});

	test('reads without importing render central state for imported sessions that are not loaded', async () => {
		const { fixture, session } = await oldBuildSession();
		const imports = sinon.spy(database, 'importSessionState');
		const keys = ['configValues', 'agentHost.gitData', `customChatTitle:${fixture.chats[1].uri}`];
		const before = await createStore().readWithoutImport(session, keys);
		const writer = createStore();
		const mirrorWrites = sinon.stub(SessionDatabase.prototype, 'applyMetadataChanges').rejects(new Error('crash'));
		await writer.write(session, sessionStatePatch({ values: { configValues: 'central' }, chats: [{ chat: fixture.chats[1].uri, isDefault: false, fields: { title: 'Central title' } }] }), SessionStateMirrorFlush.Immediate);
		mirrorWrites.restore();
		const after = await createStore().readWithoutImport(session, keys);
		const written = legacySessionMetadata(fixture);
		assert.deepStrictEqual({ imports: imports.callCount, before: Object.fromEntries(before), after: Object.fromEntries(after) }, {
			imports: 1,
			before: Object.fromEntries(keys.map(key => [key, written[key]])),
			after: { ...Object.fromEntries(keys.map(key => [key, written[key]])), configValues: 'central', [`customChatTitle:${fixture.chats[1].uri}`]: 'Central title' },
		});
	});

	test('a sweep over many unimported sessions reads central state once and imports none', async () => {
		const { fixture, session } = await oldBuildSession();
		await createStore().write(session, sessionStatePatch({ values: { 'agentHost.autoArchivedAt': '7' } }), SessionStateMirrorFlush.Immediate);
		const sessions = [session, ...Array.from({ length: 999 }, (_, index) => URI.parse(`copilotcli:/unimported-${index}`))];
		const imports = sinon.spy(database, 'importSessionState');
		const centralReads = sinon.spy(database, 'readSessionStateValues');
		const values = await createStore().readValuesWithoutImport(sessions, ['agentHost.autoArchivedAt', 'configValues']);
		assert.deepStrictEqual({
			imports: imports.callCount,
			centralReads: centralReads.callCount,
			imported: Object.fromEntries(values.get(fixture.session)!),
			unimported: values.get('copilotcli:/unimported-0')?.size,
			databases: sessionData.resources.length,
		}, {
			imports: 0,
			centralReads: 1,
			imported: { 'agentHost.autoArchivedAt': '7', configValues: legacySessionMetadata(fixture).configValues },
			unimported: 0,
			databases: 3,
		});
	});

	test('the catalog projection reads owned keys centrally and other keys from session.db', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore();
		const mirrorWrites = sinon.stub(SessionDatabase.prototype, 'applyMetadataChanges').rejects(new Error('crash'));
		await sessionStore.write(session, sessionStatePatch({ values: { isArchived: 'true' } }), SessionStateMirrorFlush.Immediate);
		mirrorWrites.restore();
		await sessionData.createService().openDatabase(session).object.setMetadata('peerChatBacking', 'backing');
		const read = await sessionStore.runExclusive(session, exclusive => sessionStore.catalogMetadataReference(exclusive).object.getMetadataObject({ isArchived: true, peerChatBacking: true }));
		assert.deepStrictEqual(read, { isArchived: 'true', peerChatBacking: 'backing' });
	});

	test('a Block 2b session imports in runtime spelling and mirrors in storage spelling', async () => {
		const fixture = createLegacySessionFixture('2b');
		const compatible = store.add(new CompatibleAgentHostDatabase(':memory:'));
		await writeLegacySessionState(sessionData.createService(), compatible.raw, fixture);
		await compatible.initialize();
		const before = await readOldBuildView(sessionData.createService(), compatible.raw, fixture);
		const sessionStore = createStore(MANUAL_FLUSH, sessionData.createService(compatible.identity), compatible);
		const session = URI.parse(fixture.runtimeSession);
		const snapshot = await sessionStore.load(session);
		await sessionStore.write(session, sessionStatePatch({ chats: [{ chat: fixture.chats[1].runtimeUri, isDefault: false, fields: { title: 'Renamed' } }] }), SessionStateMirrorFlush.Immediate);
		const after = await readOldBuildView(sessionData.createService(), compatible.raw, fixture);

		assert.deepStrictEqual({
			chats: fixture.chats.map(chat => snapshot.chats.has(chat.runtimeUri)),
			storage: fixture.chats.map(chat => snapshot.chats.get(chat.runtimeUri)?.storage),
			renamed: after.sessionDb[`customChatTitle:${fixture.chats[1].uri}`],
			unchangedOtherwise: JSON.stringify({ ...after, sessionDb: { ...after.sessionDb, [`customChatTitle:${fixture.chats[1].uri}`]: undefined }, agentHost: undefined })
				=== JSON.stringify({ ...before, sessionDb: { ...before.sessionDb, [`customChatTitle:${fixture.chats[1].uri}`]: undefined }, agentHost: undefined }),
		}, {
			chats: [true, true, true],
			storage: [fixture.runtimeSession, ...fixture.chats.slice(1).map(chat => chat.runtimeUri)],
			renamed: 'Renamed',
			unchangedOtherwise: true,
		});
	});
	for (const [historical, sessionWorkingDirectories] of [[false, true], [false, false], [true, false]] as const) {
		test(`import records the launch folder each chat resumes in today (${historical ? 'copilotcli:' : 'ahp-session:'}, ${sessionWorkingDirectories ? 'with' : 'without'} agentHost.sessionWorkingDirectories)`, async () => {
			// Without the session-wide key, the session db's Copilot pin is the folder of the default chat and of every peer without its own.
			const fixture = createLegacySessionFixture('2b', { historical, sessionWorkingDirectories });
			const compatible = store.add(new CompatibleAgentHostDatabase(':memory:'));
			await writeLegacySessionState(sessionData.createService(), compatible.raw, fixture);
			await compatible.initialize();
			const sessionStore = createStore(MANUAL_FLUSH, sessionData.createService(compatible.identity), compatible);
			const snapshot = await sessionStore.load(URI.parse(fixture.runtimeSession));
			assert.deepStrictEqual(fixture.chats.map(chat => ({ name: chat.name, pinned: chat.pinnedWorkingDirectory, launch: snapshot.chats.get(chat.runtimeUri)?.launchWorkingDirectories })), [
				{ name: 'default', pinned: true, launch: ['file:///workspace/app'] },
				{ name: 'same-folder', pinned: false, launch: ['file:///workspace/app'] },
				{ name: 'other-folder', pinned: true, launch: ['file:///workspace/lib'] },
			]);
		});
	}

	test('a session imported without its Copilot launch folders gets them on its next load, once', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'ah-session-state-repair-'));
		const path = join(directory, 'agent-host.db');
		const fixture = createLegacySessionFixture('2b', { historical: true, sessionWorkingDirectories: false });
		const session = URI.parse(fixture.session);
		const marker = `sessionStateLaunchDirsBackfilled:${fixture.session}`;
		const sql = async <T>(run: (db: Database) => Promise<T>): Promise<T> => {
			const sqlite3 = await import('@vscode/sqlite3');
			const db = await new Promise<Database>((resolve, reject) => { const opened = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(opened)); });
			try {
				return await run(db);
			} finally {
				await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
			}
		};
		const loadWith = async (setup?: (db: AgentHostDatabase) => void) => {
			const db = new AgentHostDatabase(path);
			setup?.(db);
			const sessionStore = new AgentHostSessionStateStore(MANUAL_FLUSH, db, sessionData.createService(), new NullLogService());
			try {
				const snapshot = await sessionStore.load(session);
				return fixture.chats.map(chat => snapshot.chats.get(chat.runtimeUri)?.launchWorkingDirectories);
			} finally {
				sessionStore.dispose();
				await db.close();
			}
		};
		try {
			const oldBuild = new AgentHostDatabase(path);
			await writeLegacySessionState(sessionData.createService(), oldBuild, fixture);
			await oldBuild.close();
			// What a build that read the Copilot pin only for `copilot:` sessions imported, and marked as resolved.
			const buggy = await loadWith(db => {
				const importSessionState = db.importSessionState.bind(db);
				sinon.stub(db, 'importSessionState').callsFake((key, data) => importSessionState(key, { ...data, chats: data.chats.map(chat => ({ ...chat, launchWorkingDirectories: undefined })) }));
			});
			await sql(db => new Promise<void>((resolve, reject) => db.run('UPDATE metadata SET value = ? WHERE key = ?', ['1', marker], error => error ? reject(error) : resolve())));

			let repairs = 0;
			const repaired = await loadWith(db => {
				const mark = db.markSessionStateLaunchDirsBackfilled.bind(db);
				sinon.stub(db, 'markSessionStateLaunchDirsBackfilled').callsFake(key => { repairs++; return mark(key); });
			});
			const repairedMarker = await sql(db => new Promise<unknown>((resolve, reject) => db.get('SELECT value FROM metadata WHERE key = ?', [marker], (error: Error | null, row: { value: string } | undefined) => error ? reject(error) : resolve(row?.value))));
			const reloaded = await loadWith(db => {
				const mark = db.markSessionStateLaunchDirsBackfilled.bind(db);
				sinon.stub(db, 'markSessionStateLaunchDirsBackfilled').callsFake(key => { repairs++; return mark(key); });
			});

			assert.deepStrictEqual({ buggy, repaired, repairedMarker, reloaded, repairs }, {
				buggy: [undefined, undefined, undefined],
				repaired: [['file:///workspace/app'], ['file:///workspace/app'], ['file:///workspace/lib']],
				repairedMarker: '2',
				reloaded: [['file:///workspace/app'], ['file:///workspace/app'], ['file:///workspace/lib']],
				repairs: 1,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test('a session loaded before its catalog is normalized stops mirroring its chats the legacy way once normalized', async () => {
		const session = URI.parse('copilotcli:/late-normalized');
		const defaultChat = 'ahp-chat://late-normalized/default';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const sessionStore = createStore();
		sessionStore.noteCreatedSession(session, URI.parse(defaultChat));
		const before = await sessionStore.load(session);
		await sessionStore.writeMetadata(session, session, { customTitle: 'Before normalization', customTitleSource: 'user' }, SessionStateMirrorFlush.Coalesced);
		const registered = await database.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, storageResource: session.toString(), metadata: { summary: 'Before normalization', titleSource: 'user' } },
			peers: [],
			privateDescendants: [],
		});
		assert.strictEqual(registered.status, 'applied');

		await sessionStore.noteCatalogNormalized(session);
		await sessionStore.writeMetadata(session, session, { customTitle: 'Renamed', customTitleSource: 'agent' }, SessionStateMirrorFlush.Immediate);
		await sessionStore.whenIdle(session);

		assert.deepStrictEqual({
			before: before.authority,
			after: (await sessionStore.load(session)).authority,
			sessionDb: await sessionDb(session, ['customTitle', 'customTitleSource', `customChatTitle:${defaultChat}`, `customChatTitleSource:${defaultChat}`]),
		}, {
			before: 1,
			after: 2,
			// The write made while the catalog was a legacy one is mirrored the legacy way; the later one only to the key its writer wrote.
			sessionDb: {
				customTitle: 'Renamed',
				customTitleSource: 'agent',
				[`customChatTitle:${defaultChat}`]: 'Before normalization',
				[`customChatTitleSource:${defaultChat}`]: 'user',
			},
		});
	});

	test('a failed catalog authority refresh never fails its caller and is retried by the next load', async () => {
		const session = URI.parse('copilotcli:/late-normalized-retry');
		const defaultChat = 'ahp-chat://late-normalized-retry/default';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const sessionStore = createStore();
		sessionStore.noteCreatedSession(session, URI.parse(defaultChat));
		await sessionStore.load(session);
		const registered = await database.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, storageResource: session.toString(), metadata: {} },
			peers: [],
			privateDescendants: [],
		});
		assert.strictEqual(registered.status, 'applied');
		const readSessionState = sinon.stub(database, 'readSessionState');
		readSessionState.onFirstCall().rejects(new Error('read failed'));
		readSessionState.callThrough();

		await sessionStore.noteCatalogNormalized(session);
		const afterFailure = sessionStore.peek(session)?.authority;
		const reloaded = (await sessionStore.load(session)).authority;

		assert.deepStrictEqual({ afterFailure, reloaded }, { afterFailure: 1, reloaded: 2 });
	});

	test('import records the storage a normalized catalog records for its chats, not the creation-time one', async () => {
		const session = URI.parse('copilotcli:/recorded-storage');
		const defaultChat = 'ahp-chat://recorded-storage/default';
		const peer = 'ahp-chat://recorded-storage/peer';
		const moved = 'ahp-chat://recorded-storage/moved-storage';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const registered = await database.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, storageResource: session.toString(), metadata: { summary: 'Default', titleSource: 'user' } },
			peers: [{ chat: peer, order: 1, storageResource: moved, metadata: { summary: 'Peer', titleSource: 'user' } }],
			privateDescendants: [],
		});
		assert.strictEqual(registered.status, 'applied');
		await oldBuildEdit(session.toString(), { 'agentHost.sessionWorkingDirectories': JSON.stringify(['file:///workspace/app']) });
		const store = createStore();

		const snapshot = await store.load(session);
		await store.chatRows.setDraft(session, URI.parse(peer), { text: 'Peer draft', origin: { kind: MessageKind.User } });
		const draftIn = async (resource: string) => {
			const reference = await sessionData.createService().tryOpenDatabase(URI.parse(resource));
			return reference && (await reference.object.getChatDraft(URI.parse(peer)))?.text;
		};

		assert.deepStrictEqual({
			snapshot: [defaultChat, peer].map(chat => snapshot.chats.get(chat)?.storage),
			central: (await database.readSessionState(session.toString()))?.chats.filter(chat => chat.chat === peer).map(chat => chat.storageResource),
			storageOf: (await store.chatRows.storageOf(session, URI.parse(peer)))?.storage.toString(),
			draftInMovedStorage: await draftIn(moved),
			draftUnderChatUri: await draftIn(peer),
			// The delete guard keeps the moved storage: the catalog and the imported central entry both record it.
			references: await database.countStorageReferences(moved, 'copilotcli:/another-session'),
		}, {
			snapshot: [session.toString(), moved],
			central: [moved],
			storageOf: moved,
			draftInMovedStorage: 'Peer draft',
			draftUnderChatUri: undefined,
			references: 2,
		});
	});

	test('import records launch folders for the chats of a normalized-catalog session in session_chat_state only', async () => {
		const session = URI.parse('copilotcli:/normalized-launch');
		const defaultChat = 'ahp-chat://normalized-launch/default';
		const sameFolder = 'ahp-chat://normalized-launch/same';
		const otherFolder = 'ahp-chat://normalized-launch/other';
		const tool = 'ahp-chat://normalized-launch/tool';
		await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const registered = await database.registerChatCatalogV2(session.toString(), {
			defaultChat: { chat: defaultChat, order: 0, metadata: { summary: 'Default', titleSource: 'user' } },
			peers: [
				{ chat: sameFolder, order: 1, metadata: { summary: 'Same', titleSource: 'user' } },
				{ chat: otherFolder, order: 2, workingDirectories: ['file:///workspace/lib'], metadata: { summary: 'Other', titleSource: 'user' } },
				{ chat: tool, order: 3, origin: JSON.stringify({ kind: 'tool' }), metadata: { summary: 'Tool', titleSource: 'user' } },
			],
			privateDescendants: [],
		});
		assert.strictEqual(registered.status, 'applied');
		await oldBuildEdit(session.toString(), { 'agentHost.sessionWorkingDirectories': JSON.stringify(['file:///workspace/app']) });

		const snapshot = await createStore().load(session);
		assert.deepStrictEqual({
			authority: snapshot.authority,
			chats: [defaultChat, sameFolder, otherFolder, tool].map(chat => {
				const entry = snapshot.chats.get(chat);
				return { chat: chat.slice(chat.lastIndexOf('/') + 1), isDefault: entry?.isDefault, visible: entry?.workingDirectories, title: entry?.title, launch: entry?.launchWorkingDirectories };
			}),
		}, {
			authority: 2,
			chats: [
				{ chat: 'default', isDefault: true, visible: undefined, title: undefined, launch: ['file:///workspace/app'] },
				{ chat: 'same', isDefault: false, visible: undefined, title: undefined, launch: ['file:///workspace/app'] },
				{ chat: 'other', isDefault: false, visible: undefined, title: undefined, launch: ['file:///workspace/lib'] },
				{ chat: 'tool', isDefault: false, visible: undefined, title: undefined, launch: undefined },
			],
		});
	});

	suite('writeMetadata', () => {
		const owned = 'isArchived';
		const unowned = 'someUnownedKey';

		test('an owned key updates central state and is mirrored to the session database before returning', async () => {
			const { session } = await oldBuildSession();
			const writer = createStore();
			await writer.writeMetadata(session, session, { [owned]: 'true' }, SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				mirrored: (await sessionDb(session, [owned]))[owned],
				central: (await writer.load(session)).values.get(owned),
			}, { mirrored: 'true', central: 'true' });
		});

		test('an unowned key is written straight to the session database and leaves central state untouched', async () => {
			const { session } = await oldBuildSession();
			const writer = createStore();
			const before = await writer.load(session);
			await writer.writeMetadata(session, session, { [unowned]: 'value' }, SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				stored: (await sessionDb(session, [unowned]))[unowned],
				centralRevisionUnchanged: (await writer.load(session)).revision === before.revision,
				centralHasKey: (await writer.load(session)).values.has(unowned),
			}, { stored: 'value', centralRevisionUnchanged: true, centralHasKey: false });
		});

		test('null deletes owned and unowned keys', async () => {
			const { session } = await oldBuildSession();
			const writer = createStore();
			await writer.writeMetadata(session, session, { [owned]: 'true', [unowned]: 'value' }, SessionStateMirrorFlush.Immediate);
			await writer.writeMetadata(session, session, { [owned]: null, [unowned]: null }, SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				stored: await sessionDb(session, [owned, unowned]),
				central: (await writer.load(session)).values.has(owned),
			}, { stored: { [owned]: undefined, [unowned]: undefined }, central: false });
		});

		test('a whole folder map write sets its folders, removes the ones it dropped and mirrors the map', async () => {
			const { session } = await oldBuildSession();
			const writer = createStore();
			const mapKey = 'agentHost.githubData';
			await writer.writeMetadata(session, session, { [mapKey]: JSON.stringify({ 'file:///a': { owner: 'o', repo: 'a' }, 'file:///b': { owner: 'o', repo: 'b' } }) }, SessionStateMirrorFlush.Immediate);
			await writer.writeMetadata(session, session, { [mapKey]: JSON.stringify({ 'file:///b': { owner: 'o', repo: 'b' } }) }, SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				central: [...(await writer.load(session)).folders].filter(([, folder]) => folder.github !== undefined).map(([key]) => key),
				mirrored: JSON.parse((await sessionDb(session, [mapKey]))[mapKey] ?? 'null'),
			}, { central: ['file:///b'], mirrored: { 'file:///b': { owner: 'o', repo: 'b' } } });
		});
	});
	suite('per-folder git and GitHub state and base branches', () => {
		const gitDataKey = 'agentHost.gitData';
		const githubDataKey = 'agentHost.githubData';
		const baseBranchKey = 'agentHost.diffBaseBranch';

		test('multi-folder state is held in per-folder rows and mirrored to the old maps exactly as an older build wrote them', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			const snapshot = await writer.load(session);
			const written = legacySessionMetadata(fixture);
			const rendered = writer.legacyMetadata(session, [gitDataKey, githubDataKey, baseBranchKey]);
			assert.deepStrictEqual({
				gitFolders: [...snapshot.folders].filter(([, folder]) => folder.git !== undefined).map(([key]) => key).sort(),
				githubFolders: [...snapshot.folders].filter(([, folder]) => folder.github !== undefined).map(([key]) => key).sort(),
				rendered: [gitDataKey, githubDataKey, baseBranchKey].map(key => rendered.values[key]),
			}, {
				gitFolders: ['', ...Object.keys(JSON.parse(written[gitDataKey]))].sort(),
				githubFolders: Object.keys(JSON.parse(written[githubDataKey])).sort(),
				rendered: [gitDataKey, githubDataKey, baseBranchKey].map(key => written[key]),
			});
		});

		test('rewriting unchanged folder maps changes nothing and writes nothing to session.db', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			const written = legacySessionMetadata(fixture);
			const refresh = () => writer.writeMetadata(session, session, { [gitDataKey]: written[gitDataKey], [githubDataKey]: written[githubDataKey] }, SessionStateMirrorFlush.Immediate);
			await refresh();
			const before = await writer.load(session);
			const applied = sinon.spy(SessionDatabase.prototype, 'applyMetadataChanges');
			await refresh();
			assert.deepStrictEqual({
				revision: (await writer.load(session)).revision === before.revision,
				mirrorWrites: applied.callCount,
			}, { revision: true, mirrorWrites: 0 });
		});

		test('the session base branch is session state mirrored to session.db', async () => {
			const { session } = await oldBuildSession();
			const writer = createStore();
			await writer.writeMetadata(session, session, { [baseBranchKey]: 'release' }, SessionStateMirrorFlush.Immediate);
			const snapshot = await writer.load(session);
			assert.deepStrictEqual({
				central: readSessionBaseBranch(snapshot, undefined),
				mirrored: (await sessionDb(session, [baseBranchKey]))[baseBranchKey],
			}, { central: 'release', mirrored: 'release' });
		});

		test('a peer chat with its own folders keeps its base branch per scope, mirrored to its own database', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[2];
			const writer = createStore();
			await writer.writeMetadata(session, URI.parse(peer.uri), { [baseBranchKey]: 'peer-base' }, SessionStateMirrorFlush.Immediate);
			const snapshot = await writer.load(session);
			const reloaded = await createStore().load(session);
			assert.deepStrictEqual({
				peer: readSessionBaseBranch(snapshot, peer.uri),
				session: readSessionBaseBranch(snapshot, undefined),
				sameFolderPeer: readSessionBaseBranch(snapshot, fixture.chats[1].uri),
				peerDb: (await sessionDb(URI.parse(peer.uri), [baseBranchKey]))[baseBranchKey],
				sessionDb: (await sessionDb(session, [baseBranchKey]))[baseBranchKey],
				reloaded: readSessionBaseBranch(reloaded, peer.uri),
			}, { peer: 'peer-base', session: 'main', sameFolderPeer: undefined, peerDb: 'peer-base', sessionDb: 'main', reloaded: 'peer-base' });
		});

		/** A store whose service records every database it opens, and a second peer in the folder of `fixture.chats[2]`. */
		async function folderPeers(): Promise<{ fixture: ILegacySessionFixture; session: URI; writer: AgentHostSessionStateStore; opened: string[]; peer: string; next: string; folderKey: string }> {
			const { fixture, session } = await oldBuildSession();
			const opened: string[] = [];
			const base = sessionData.createService();
			const writer = createStore(MANUAL_FLUSH, {
				...base,
				openDatabase: resource => { opened.push(resource.toString()); return base.openDatabase(resource); },
				tryOpenDatabase: async resource => {
					const reference = await base.tryOpenDatabase(resource);
					if (reference) {
						opened.push(resource.toString());
					}
					return reference;
				},
			});
			const peer = fixture.chats[2];
			const next = `${fixture.session}#next-peer`.replace('#', '/');
			// The next peer already has its own database, as a peer that has run does.
			await oldBuildEdit(next, { 'copilot.model': 'model' });
			await writer.write(session, sessionStatePatch({ chats: [{ chat: next, isDefault: false, fields: { storage: next, workingDirectories: peer.workingDirectories } }] }), SessionStateMirrorFlush.Immediate);
			await writer.writeMetadata(session, URI.parse(peer.uri), { [baseBranchKey]: 'peer-base' }, SessionStateMirrorFlush.Immediate);
			return { fixture, session, writer, opened, peer: peer.uri, next, folderKey: getWorkingDirectoryScopeId(peer.workingDirectories!) };
		}

		/** Adds a peer the legacy chat catalog records but central state does not (one created after the import), with its own database. */
		async function addLatePeer(sessionKey: string, chat: string, workingDirectories: readonly string[] | undefined): Promise<void> {
			const catalog = await database.getSessionChatCatalog(sessionKey);
			const rows = (catalog?.chats ?? []).map(({ ownerSession: _ownerSession, ...row }) => row);
			const result = await database.replaceSessionChatCatalog(sessionKey, [...rows, { chat, order: rows.length }], catalog?.revision);
			assert.strictEqual(result.status, 'applied');
			// Older builds keep a legacy peer's folders in its own database.
			await oldBuildEdit(chat, { 'copilot.model': 'model', ...(workingDirectories ? { 'agentHost.chatWorkingDirectories': JSON.stringify(workingDirectories) } : {}) });
		}

		test('a peer only the chat catalog records becomes the source of a folder whose recorded chat is deleted, and gets its value right away', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			const peer = fixture.chats[2];
			const folderKey = getWorkingDirectoryScopeId(peer.workingDirectories!);
			await writer.writeMetadata(session, URI.parse(peer.uri), { [baseBranchKey]: 'peer-base' }, SessionStateMirrorFlush.Immediate);
			const late = `${fixture.session}/late-peer`;
			await addLatePeer(fixture.session, late, peer.workingDirectories);

			await writer.deleteChat(session, URI.parse(peer.uri));
			const row = (await database.readSessionState(fixture.session))?.folders.find(folder => folder.folderKey === folderKey && folder.kind === 'baseBranch');

			assert.deepStrictEqual({
				central: [row?.value, row?.storageResource],
				lateDb: (await sessionDb(URI.parse(late), [baseBranchKey]))[baseBranchKey],
			}, {
				central: ['peer-base', late],
				lateDb: 'peer-base',
			});
		});

		test('a base branch recorded for a peer only the chat catalog records is mirrored into that peer\'s database', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			const peer = fixture.chats[2];
			const folderKey = getWorkingDirectoryScopeId(peer.workingDirectories!);
			const late = `${fixture.session}/late-peer`;
			await addLatePeer(fixture.session, late, peer.workingDirectories);
			await writer.load(session);

			await writer.write(session, sessionStatePatch({ folders: [{ folderKey, kind: 'baseBranch', value: 'late-base', storage: late }] }), SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				lateDb: (await sessionDb(URI.parse(late), [baseBranchKey]))[baseBranchKey],
				recordedPeerDb: (await sessionDb(URI.parse(peer.uri), [baseBranchKey]))[baseBranchKey],
			}, { lateDb: 'late-base', recordedPeerDb: undefined });
		});

		test('deleting the chat a folder\'s base branch is mirrored into moves it to the folder\'s next chat and writes it there right away', async () => {
			const { session, writer, opened, peer, next, folderKey } = await folderPeers();
			opened.length = 0;

			await writer.deleteChat(session, URI.parse(peer));
			const afterDelete = [...opened];
			const redirected = (await database.readSessionState(session.toString()))?.folders.find(row => row.folderKey === folderKey && row.kind === 'baseBranch');
			const nextDbAfterDelete = (await sessionDb(URI.parse(next), [baseBranchKey]))[baseBranchKey];
			await writer.writeMetadata(session, URI.parse(next), { [baseBranchKey]: 'next-base' }, SessionStateMirrorFlush.Immediate);
			await writer.writeMetadata(session, session, { [baseBranchKey]: 'release' }, SessionStateMirrorFlush.Immediate);

			const folder = (await writer.load(session)).folders.get(folderKey);
			assert.deepStrictEqual({
				// The delete opens the session database (row copies) and the next chat's database: the folder's value lands there at once.
				afterDelete,
				redirected: [redirected?.value, redirected?.storageResource],
				nextDbAfterDelete,
				baseBranch: [folder?.baseBranch, folder?.baseBranchStorage],
				nextDb: (await sessionDb(URI.parse(next), [baseBranchKey]))[baseBranchKey],
				deletedChatOpened: opened.includes(peer),
			}, {
				afterDelete: [session.toString(), next],
				redirected: ['peer-base', next],
				nextDbAfterDelete: 'peer-base',
				baseBranch: ['next-base', next],
				nextDb: 'next-base',
				deletedChatOpened: false,
			});
		});

		test('deleting the last chat in a folder deletes the folder\'s base branch row and a later write creates no database for that chat', async () => {
			const { session, writer, opened, peer, next, folderKey } = await folderPeers();
			await writer.deleteChat(session, URI.parse(next));
			opened.length = 0;

			await writer.deleteChat(session, URI.parse(peer));
			await writer.writeMetadata(session, session, { [baseBranchKey]: 'release' }, SessionStateMirrorFlush.Immediate);
			const reloaded = await createStore().load(session);

			const folder = (await writer.load(session)).folders.get(folderKey);
			assert.deepStrictEqual({
				baseBranch: [folder?.baseBranch, folder?.baseBranchStorage],
				centralRow: (await database.readSessionState(session.toString()))?.folders.some(row => row.folderKey === folderKey && row.kind === 'baseBranch'),
				reloaded: reloaded.folders.get(folderKey)?.baseBranch,
				opened,
			}, {
				baseBranch: [undefined, undefined],
				centralRow: false,
				reloaded: undefined,
				// The delete's row-copy cleanup and the later session write; never the deleted chat's database.
				opened: [session.toString(), session.toString()],
			});
		});

		test('a base branch recorded for a chat that is gone is mirrored into a live chat of its folder, never into the gone chat\'s database', async () => {
			const { session, writer, opened, peer, next, folderKey } = await folderPeers();
			const gone = `${session.toString()}/gone-peer`;
			opened.length = 0;

			await writer.write(session, sessionStatePatch({ folders: [{ folderKey, kind: 'baseBranch', value: 'stale-target', storage: gone }] }), SessionStateMirrorFlush.Immediate);

			assert.deepStrictEqual({
				opened,
				firstLiveChatDb: (await sessionDb(URI.parse(peer), [baseBranchKey]))[baseBranchKey],
				nextDb: (await sessionDb(URI.parse(next), [baseBranchKey]))[baseBranchKey],
			}, {
				opened: [peer],
				firstLiveChatDb: 'stale-target',
				nextDb: undefined,
			});
		});

		test('agentHost.github is retained and never deleted by a restore', async () => {
			const { session } = await oldBuildSession();
			await oldBuildEdit(session.toString(), { 'agentHost.github': JSON.stringify({ owner: 'o', repo: 'r' }) });
			const writer = createStore();
			await writer.load(session);
			await writer.writeMetadata(session, session, { [githubDataKey]: JSON.stringify({ 'file:///a': { owner: 'o', repo: 'r' } }) }, SessionStateMirrorFlush.Immediate);
			assert.deepStrictEqual({
				kept: (await sessionDb(session, ['agentHost.github']))['agentHost.github'],
			}, { kept: JSON.stringify({ owner: 'o', repo: 'r' }) });
		});

		test('agentHost.github shows an older build the current GitHub state of the session folder', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			await writer.load(session);
			const folder = getWorkingDirectoryKey(fixture.folder);
			const state = { owner: 'octo', repo: 'updated', pullRequest: { number: 7, url: 'https://github.com/octo/updated/pull/7' } };
			await writer.writeMetadata(session, session, { [githubDataKey]: JSON.stringify({ [folder]: state }) }, SessionStateMirrorFlush.Immediate);
			assert.deepStrictEqual({
				rendered: JSON.parse(writer.legacyMetadata(session, ['agentHost.github']).values['agentHost.github'] ?? 'null'),
				oldBuild: JSON.parse((await sessionDb(session, ['agentHost.github']))['agentHost.github'] ?? 'null'),
			}, { rendered: state, oldBuild: state });
		});

		test('branch-changes blob keys are not owned: a write goes to session.db only and nothing is imported or rendered', async () => {
			const { fixture, session } = await oldBuildSession();
			const scopedKey = `agentHost.changeset.branch.${getWorkingDirectoryScopeId(fixture.chats[2].workingDirectories)}`;
			const writer = createStore();
			await writer.load(session);
			await writer.writeMetadata(session, session, { [scopedKey]: '[]', 'agentHost.changeset.branch': '[1]' }, SessionStateMirrorFlush.Immediate);
			assert.deepStrictEqual({
				unowned: writer.legacyMetadata(session, ['agentHost.changeset.branch', scopedKey]).unowned,
				central: (await database.readSessionState(fixture.session))?.values.filter(value => value.key.startsWith('agentHost.changeset')),
			}, {
				unowned: ['agentHost.changeset.branch', scopedKey],
				central: [],
			});
		});
	});

	test('storageOf resolves the recorded default chat and recorded peers, and nothing for a chat central state does not know', async () => {
		const { fixture, session } = await oldBuildSession();
		const [defaultChat, peer] = fixture.chats;
		const rows = createStore().chatRows;

		assert.deepStrictEqual(await Promise.all([defaultChat.runtimeUri, peer.runtimeUri, `${peer.runtimeUri}-unrecorded`].map(async chat => {
			const owner = await rows.storageOf(session, URI.parse(chat));
			return owner && [owner.storage.toString(), owner.isDefault];
		})), [[fixture.session, true], [peer.uri, false], undefined]);
	});

	test('a chat is never loaded as a session: a chat URI, or a resource another session records as its chat, is rejected without importing', async () => {
		const { fixture, session } = await oldBuildSession();
		const peer = fixture.chats[1].uri;
		const recorded = 'copilot:/recorded-as-chat';
		const catalog = await database.getSessionChatCatalog(session.toString());
		const rows = (catalog?.chats ?? []).map(({ ownerSession: _ownerSession, ...row }) => row);
		assert.strictEqual((await database.replaceSessionChatCatalog(session.toString(), [...rows, { chat: recorded, order: rows.length }], catalog?.revision)).status, 'applied');
		const store = createStore();
		const outcome = (resource: string) => store.load(URI.parse(resource)).then(() => 'loaded', (error: Error) => error.message);

		assert.deepStrictEqual({
			peer: await outcome(peer),
			recorded: await outcome(recorded),
			central: await Promise.all([peer, recorded].map(async resource => (await database.readSessionState(resource)) !== undefined)),
		}, {
			peer: `${peer} is a chat, not a session`,
			recorded: `${recorded} is a chat of ${session.toString()}, not a session`,
			central: [false, false],
		});
	});

	test('a just-created session without a catalog imports the default chat the host minted, not the legacy derivation', async () => {
		const session = URI.parse('copilot:/created-without-catalog');
		const minted = URI.parse('ahp-chat:/minted-default');
		const store = createStore();
		store.noteCreatedSession(session, minted);

		const snapshot = await store.load(session);

		assert.deepStrictEqual({
			chats: [...snapshot.chats].map(([chat, entry]) => [chat, entry.isDefault]),
			owner: await store.chatRows.storageOf(session, minted).then(owner => owner && { storage: owner.storage.toString(), isDefault: owner.isDefault }),
		}, {
			chats: [[minted.toString(), true]],
			owner: { storage: session.toString(), isDefault: true },
		});
	});

	test('a mirror flush never creates a chat database: a chat whose storage was deleted outside the store gets no database back', async () => {
		const { fixture, session } = await oldBuildSession();
		const peer = fixture.chats[2];
		const writer = createStore();
		await writer.load(session);
		await writer.write(session, sessionStatePatch({ chats: [{ chat: peer.uri, isDefault: false, fields: { title: 'Renamed', workingDirectories: ['file:///workspace/moved'] } }] }), SessionStateMirrorFlush.Coalesced);
		sessionData.remove(peer.uri);

		await writer.whenIdle(session);

		assert.deepStrictEqual({
			peerDb: sessionData.resources.includes(peer.uri),
			sessionTitle: (await sessionDb(session, [`customChatTitle:${peer.uri}`]))[`customChatTitle:${peer.uri}`],
		}, { peerDb: false, sessionTitle: 'Renamed' });
	});

	test('a session being deleted is not mirrored, also by a scheduled flush', async () => {
		const { session } = await oldBuildSession();
		const writer = createStore(1);
		await writer.load(session);
		const before = (await sessionDb(session, ['configValues'])).configValues;
		await writer.write(session, sessionStatePatch({ values: { configValues: 'pending' } }), SessionStateMirrorFlush.Coalesced);
		const deletion = writer.beginDeletion(session);

		await deletion.whenDrained;
		await timeout(10);
		const after = (await sessionDb(session, ['configValues'])).configValues;
		deletion.dispose();

		assert.deepStrictEqual({ unchanged: after === before, pendingNotWritten: after !== 'pending' }, { unchanged: true, pendingNotWritten: true });
	});

	test('an Immediate write whose section then throws still reaches session.db, and the error propagates', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore();
		await assert.rejects(() => sessionStore.runExclusive(session, async exclusive => {
			await exclusive.write(sessionStatePatch({ values: { configValues: 'written' } }), SessionStateMirrorFlush.Immediate);
			throw new Error('section failed');
		}), /section failed/);
		assert.deepStrictEqual(await sessionDb(session, ['configValues']), { configValues: 'written' });
	});

	test('a failed mirror flush stays dirty and a retry timer completes it without another write', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore(5);
		await sessionStore.load(session);
		const failing = sinon.stub(SessionDatabase.prototype, 'applyMetadataChanges').rejects(new Error('disk full'));
		await sessionStore.update(session, 'agentHost.autoArchivedAt', () => 'retry', SessionStateMirrorFlush.Coalesced);
		await timeout(40);
		const failedAttempts = failing.callCount;
		failing.restore();
		await timeout(300);
		assert.deepStrictEqual({ retried: failedAttempts >= 1, mirror: await sessionDb(session, ['agentHost.autoArchivedAt']) }, {
			retried: true, mirror: { 'agentHost.autoArchivedAt': 'retry' },
		});
	});

	test('unarchiving leaves no stale legacy isDone for older builds', async () => {
		const { session } = await oldBuildSession();
		await oldBuildEdit(session.toString(), { isDone: 'true' });
		const sessionStore = createStore();
		await sessionStore.write(session, sessionStatePatch({ values: { isArchived: '' } }), SessionStateMirrorFlush.Immediate);
		const mirror = await sessionDb(session, ['isArchived', 'isDone']);
		assert.strictEqual((mirror.isArchived ?? mirror.isDone) === 'true', false, JSON.stringify(mirror));
	});
	test('the catalog is projected from central state, not session.db, and older builds\' edits win after re-upgrade', async () => {
		const { fixture, session } = await oldBuildSession();
		const [, sameFolder, otherFolder] = fixture.chats;
		const otherScope = getWorkingDirectoryScopeId(otherFolder.workingDirectories);
		const first = createStore();
		await first.load(session);
		first.dispose();
		const gitData = JSON.parse(legacySessionMetadata(fixture)['agentHost.gitData']);
		await oldBuildEdit(fixture.session, {
			isArchived: 'true',
			configValues: '{"old":true}',
			defaultChatIsRead: 'true',
			'agentHost.gitData': JSON.stringify({ ...gitData, [otherScope]: { branchName: 'old-build' } }),
			[`customChatTitle:${sameFolder.uri}`]: 'Renamed by an older build',
		});

		const second = createStore();
		await database.registerSessionV2(fixture.session, { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		const sync = new AgentHostCatalogSyncService(sessionData.createService(), database, second, new NullLogService());
		// A central-only value that session.db does not hold yet tells the two sources apart.
		await second.write(session, sessionStatePatch({ values: { customizationEnablement: '{"central":"only"}' } }), SessionStateMirrorFlush.Coalesced);
		let projected: Record<string, string | undefined> | undefined;
		await sync.synchronizeWithFactory(session, async catalog => {
			projected = await catalog.object.getMetadataObject({ isArchived: true, configValues: true, defaultChatIsRead: true, customizationEnablement: true, [`customChatTitle:${sameFolder.uri}`]: true, 'agentHost.gitData': true });
			return {
				data: { modifiedTime: 2, summary: 'Conversation', isRead: true, isArchived: false, workingDirectories: [], chats: [{ uri: fixture.chats[0].uri, order: 0, kind: 'default' }] },
				legacyMetadata: {},
			};
		});
		const snapshot = await second.load(session);
		const reference = sessionData.createService().openDatabase(session);
		const outbox = await reference.object.getCatalogSyncSnapshot().finally(() => reference.dispose());
		assert.deepStrictEqual({
			projected: projected && { ...projected, 'agentHost.gitData': JSON.parse(projected['agentHost.gitData'] ?? '{}')[otherScope] },
			peerTitle: snapshot.chats.get(sameFolder.uri)?.title,
			outbox: outbox?.state,
		}, {
			projected: {
				isArchived: 'true',
				configValues: '{"old":true}',
				defaultChatIsRead: 'true',
				customizationEnablement: '{"central":"only"}',
				[`customChatTitle:${sameFolder.uri}`]: 'Renamed by an older build',
				'agentHost.gitData': { branchName: 'old-build' },
			},
			peerTitle: 'Renamed by an older build',
			// The outbox is still written inside the mirror transaction, for older builds.
			outbox: 'acknowledged',
		});
	});
	suite('per-chat rows', () => {
		interface IRows {
			readonly draft: string | undefined;
			readonly turns: readonly string[];
		}

		async function rowsIn(storage: string, chat: string): Promise<IRows> {
			const reference = sessionData.createService().openDatabase(URI.parse(storage));
			try {
				return {
					draft: (await reference.object.getChatDraft(URI.parse(chat)))?.text,
					turns: (await reference.object.getPersistedTurnsForChat(chat)).map(record => `${record.kind}:${record.turnId}`),
				};
			} finally {
				reference.dispose();
			}
		}

		test('the first load copies every chat\'s rows into its own database and leaves the originals for older builds', async () => {
			const { fixture, session } = await oldBuildSession();
			const [defaultChat, sameFolder, otherFolder] = fixture.chats;
			const before = await Promise.all(fixture.chats.map(chat => rowsIn(fixture.session, chat.uri)));

			await createStore().load(session);

			assert.deepStrictEqual({
				sessionDb: await Promise.all(fixture.chats.map(chat => rowsIn(fixture.session, chat.uri))),
				sameFolder: await rowsIn(sameFolder.uri, sameFolder.uri),
				otherFolder: await rowsIn(otherFolder.uri, otherFolder.uri),
				// The default chat's rows already live in the session database.
				defaultChatOwnDb: await rowsIn(defaultChat.uri, defaultChat.uri),
			}, {
				sessionDb: before,
				sameFolder: before[1],
				otherFolder: before[2],
				defaultChatOwnDb: { draft: undefined, turns: [] },
			});
			assert.deepStrictEqual(before[1], { draft: 'Peer draft', turns: ['local:same-folder-local-1', 'failed:same-folder-failed-1'] });
		});

		test('the copy runs once and does not resurrect rows deleted afterwards', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[1];
			const first = createStore();
			await first.load(session);
			await first.chatRows.deletePersistedTurns(session, URI.parse(peer.runtimeUri), ['same-folder-local-1']);

			await createStore().load(session);

			assert.deepStrictEqual({
				own: (await rowsIn(peer.uri, peer.uri)).turns,
				mirror: (await rowsIn(fixture.session, peer.uri)).turns,
			}, {
				own: ['failed:same-folder-failed-1'],
				mirror: ['failed:same-folder-failed-1'],
			});
		});

		test('writes land in the chat\'s own database and are mirrored into the session database keyed by chat', async () => {
			const { fixture, session } = await oldBuildSession();
			const [defaultChat, peer] = fixture.chats;
			const rows = createStore().chatRows;
			await rows.getDraft(session, URI.parse(peer.runtimeUri));

			await rows.setDraft(session, URI.parse(peer.runtimeUri), { text: 'New peer draft', origin: { kind: MessageKind.User } });
			await rows.insertPersistedTurn(session, { kind: 'local', turnId: 'peer-local-2', chatUri: peer.runtimeUri, anchorTurnId: undefined, payload: '{}' });
			await rows.setDraft(session, URI.parse(defaultChat.runtimeUri), { text: 'New default draft', origin: { kind: MessageKind.User } });
			const revisions = (await database.readSessionState(session.toString()))!.header;

			assert.deepStrictEqual({
				own: await rowsIn(peer.uri, peer.uri),
				mirror: await rowsIn(fixture.session, peer.uri),
				defaultDraft: (await rowsIn(fixture.session, defaultChat.uri)).draft,
				defaultOwn: await rowsIn(defaultChat.uri, defaultChat.uri),
				acknowledged: revisions.rowsRevision === revisions.rowsMirroredRevision && revisions.rowsRevision > 0,
			}, {
				own: { draft: 'New peer draft', turns: ['local:same-folder-local-1', 'failed:same-folder-failed-1', 'local:peer-local-2'] },
				mirror: { draft: 'New peer draft', turns: ['local:same-folder-local-1', 'failed:same-folder-failed-1', 'local:peer-local-2'] },
				defaultDraft: 'New default draft',
				defaultOwn: { draft: undefined, turns: [] },
				acknowledged: true,
			});
		});

		test('a chat\'s own config lives only in its own database, tagged with the chat', async () => {
			const { fixture, session } = await oldBuildSession();
			const [defaultChat, peer, other] = fixture.chats;
			const rows = createStore().chatRows;
			await rows.setChatConfig(session, URI.parse(peer.runtimeUri), { autoApprove: 'autoApprove' });
			await rows.setChatConfig(session, URI.parse(defaultChat.runtimeUri), { mode: 'plan' });
			// A copy of the peer's database (as a fork's `VACUUM INTO` makes) is not the other chat's config.
			const reference = sessionData.createService().openDatabase(URI.parse(other.uri));
			try {
				await reference.object.setMetadata(AH_CHAT_CONFIG_VALUES_DB_KEY, JSON.stringify({ chat: peer.runtimeUri, values: { autoApprove: 'autoApprove' } }));
			} finally {
				reference.dispose();
			}

			const metadata = async (storage: string, key: string) => {
				const db = sessionData.createService().openDatabase(URI.parse(storage));
				try {
					return await db.object.getMetadata(key);
				} finally {
					db.dispose();
				}
			};
			assert.deepStrictEqual({
				peer: await rows.getChatConfig(session, URI.parse(peer.runtimeUri)),
				defaultChat: await rows.getChatConfig(session, URI.parse(defaultChat.runtimeUri)),
				other: await rows.getChatConfig(session, URI.parse(other.runtimeUri)),
				peerOwnDb: JSON.parse((await metadata(peer.uri, AH_CHAT_CONFIG_VALUES_DB_KEY))!),
				sessionDb: JSON.parse((await metadata(fixture.session, AH_CHAT_CONFIG_VALUES_DB_KEY))!),
				sessionConfigValues: await metadata(fixture.session, 'configValues'),
			}, {
				peer: { autoApprove: 'autoApprove' },
				defaultChat: { mode: 'plan' },
				other: undefined,
				peerOwnDb: { chat: peer.runtimeUri, values: { autoApprove: 'autoApprove' } },
				// Only the default chat's own value; nothing is mirrored for older builds.
				sessionDb: { chat: defaultChat.runtimeUri, values: { mode: 'plan' } },
				// The session's own config is a separate key, untouched.
				sessionConfigValues: legacySessionMetadata(fixture).configValues,
			});
		});

		/** Edits the session database mirror the way an older build does after a downgrade, then signals it with a new turn row. */
		async function oldBuildEdits(fixtureSession: string, edit: (db: ISessionDatabase) => Promise<void>): Promise<void> {
			const reference = sessionData.createService().openDatabase(URI.parse(fixtureSession));
			try {
				await edit(reference.object);
				await reference.object.createTurn('old-build-turn');
			} finally {
				reference.dispose();
			}
		}

		test('rows an older build added to the mirror are imported, a changed draft wins and deletions are not imported', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[1];
			await createStore().load(session);
			await oldBuildEdits(fixture.session, async db => {
				await db.setChatDraft(URI.parse(peer.runtimeUri), { text: 'Edited by an old build', origin: { kind: MessageKind.User } });
				await db.insertPersistedTurn({ kind: 'failed', turnId: 'old-build-failed', chatUri: peer.runtimeUri, anchorTurnId: undefined, payload: '{}' });
				await db.deletePersistedTurns(['same-folder-local-1']);
			});

			await createStore().load(session);

			assert.deepStrictEqual(await rowsIn(peer.uri, peer.uri), {
				draft: 'Edited by an old build',
				turns: ['local:same-folder-local-1', 'failed:same-folder-failed-1', 'failed:old-build-failed'],
			});
		});

		/** Records a peer the way this build creates one: in the chat catalog, and in central state (when `titled`) without its storage. */
		async function addPeerCreatedByThisBuild(writer: AgentHostSessionStateStore, session: URI, chat: string, titled: boolean): Promise<void> {
			const catalog = await database.getSessionChatCatalog(session.toString());
			const rows = (catalog?.chats ?? []).map(({ ownerSession: _ownerSession, ...row }) => row);
			assert.strictEqual((await database.replaceSessionChatCatalog(session.toString(), [...rows, { chat, order: rows.length }], catalog?.revision)).status, 'applied');
			if (titled) {
				await writer.write(session, sessionStatePatch({ chats: [{ chat, isDefault: false, fields: { title: 'Created by this build' } }] }), SessionStateMirrorFlush.Immediate);
			}
		}

		async function writeOwnRows(writer: AgentHostSessionStateStore, session: URI, chat: string): Promise<void> {
			await writer.chatRows.setDraft(session, URI.parse(chat), { text: 'Draft of this build', origin: { kind: MessageKind.User } });
			await writer.chatRows.insertPersistedTurn(session, { kind: 'failed', turnId: `this-build-failed:${chat}`, chatUri: chat, anchorTurnId: undefined, payload: '{}' });
		}

		function editRows(chat: string): (db: ISessionDatabase) => Promise<void> {
			return async db => {
				await db.setChatDraft(URI.parse(chat), { text: 'Edited by an old build', origin: { kind: MessageKind.User } });
				await db.insertPersistedTurn({ kind: 'failed', turnId: `old-build-failed:${chat}`, chatUri: chat, anchorTurnId: undefined, payload: '{}' });
			};
		}

		test('older-build edits of peers this build created are reconciled although central state records no storage for them', async () => {
			const { fixture, session } = await oldBuildSession();
			const writer = createStore();
			await writer.load(session);
			const titled = `${fixture.session}/created-titled`;
			const untitled = `${fixture.session}/created-untitled`;
			await addPeerCreatedByThisBuild(writer, session, titled, true);
			await addPeerCreatedByThisBuild(writer, session, untitled, false);
			const rowless = `${fixture.session}/created-rowless`;
			await addPeerCreatedByThisBuild(writer, session, rowless, true);
			await writeOwnRows(writer, session, titled);
			await writeOwnRows(writer, session, untitled);
			await writer.whenIdle(session);
			const recorded = (await database.readSessionState(fixture.session))?.chats.filter(chat => chat.chat === titled || chat.chat === rowless).map(chat => chat.storageResource);
			await oldBuildEdits(fixture.session, async db => {
				await editRows(titled)(db);
				await editRows(untitled)(db);
			});

			await createStore().load(session);

			const reconciled = (chat: string) => ({ draft: 'Edited by an old build', turns: [`failed:this-build-failed:${chat}`, `failed:old-build-failed:${chat}`] });
			assert.deepStrictEqual({
				recorded,
				titled: await rowsIn(titled, titled),
				untitled: await rowsIn(untitled, untitled),
				// Reconciling never creates the database of a peer with no rows.
				rowlessDb: sessionData.resources.includes(rowless) ? 'created' : 'absent',
			}, { recorded: [undefined, undefined], titled: reconciled(titled), untitled: reconciled(untitled), rowlessDb: 'absent' });
		});

		test('older-build edits of a normalized session\'s peers are reconciled into the storage its catalog records', async () => {
			const session = URI.parse('copilotcli:/normalized-rows');
			const defaultChat = 'ahp-chat://normalized-rows/default';
			const created = 'ahp-chat://normalized-rows/created';
			const privateChat = 'ahp-chat://normalized-rows/private';
			const privateStorage = 'ahp-chat://normalized-rows/moved-storage';
			await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			const registered = await database.registerChatCatalogV2(session.toString(), {
				defaultChat: { chat: defaultChat, order: 0, metadata: { summary: 'Default', titleSource: 'user' } },
				peers: [],
				privateDescendants: [],
			});
			assert.strictEqual(registered.status, 'applied');
			await oldBuildEdit(session.toString(), { 'agentHost.sessionWorkingDirectories': JSON.stringify(['file:///workspace/app']) });
			const writer = createStore();
			await writer.load(session);
			await addPeerCreatedByThisBuild(writer, session, created, true);
			const catalogRevision = (await database.getSessionChatCatalog(session.toString()))!.revision;
			assert.strictEqual((await database.insertPrivateChatV2(session.toString(), { chat: privateChat, storageResource: privateStorage, metadata: { interactivity: ChatInteractivity.Hidden } }, catalogRevision)).status, 'applied');
			// Central state learns the private chat too, without its storage: its rows follow the catalog's recorded storage.
			await writer.write(session, sessionStatePatch({ chats: [{ chat: privateChat, isDefault: false, fields: { title: 'Private' } }] }), SessionStateMirrorFlush.Immediate);
			await writeOwnRows(writer, session, created);
			await writeOwnRows(writer, session, privateChat);
			await writer.whenIdle(session);
			await oldBuildEdits(session.toString(), async db => {
				await editRows(created)(db);
				await editRows(privateChat)(db);
			});

			await createStore().load(session);

			const reconciled = (chat: string) => ({ draft: 'Edited by an old build', turns: [`failed:this-build-failed:${chat}`, `failed:old-build-failed:${chat}`] });
			assert.deepStrictEqual({
				recorded: (await database.readSessionState(session.toString()))?.chats.find(chat => chat.chat === created)?.storageResource,
				created: await rowsIn(created, created),
				private: await rowsIn(privateStorage, privateChat),
				privateUnderChatUri: await rowsIn(privateChat, privateChat),
			}, { recorded: undefined, created: reconciled(created), private: reconciled(privateChat), privateUnderChatUri: { draft: undefined, turns: [] } });
		});

		test('a draft an older build cleared is cleared in the chat\'s own database', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[1];
			await createStore().load(session);
			await oldBuildEdits(fixture.session, db => db.setChatDraft(URI.parse(peer.runtimeUri), undefined));

			await createStore().load(session);

			assert.strictEqual((await rowsIn(peer.uri, peer.uri)).draft, undefined);
		});

		test('mirror rows are only imported on an old-build signal', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[1];
			await createStore().load(session);
			await createStore().load(session);
			const mirror = sessionData.createService().openDatabase(URI.parse(fixture.session));
			await mirror.object.insertPersistedTurn({ kind: 'local', turnId: 'unsignalled', chatUri: peer.runtimeUri, anchorTurnId: undefined, payload: '{}' });
			mirror.dispose();

			await createStore().load(session);
			const unsignalled = (await rowsIn(peer.uri, peer.uri)).turns;
			await oldBuildEdits(fixture.session, async () => { });
			await createStore().load(session);

			assert.deepStrictEqual({ unsignalled, signalled: (await rowsIn(peer.uri, peer.uri)).turns }, {
				unsignalled: ['local:same-folder-local-1', 'failed:same-folder-failed-1'],
				signalled: ['local:same-folder-local-1', 'failed:same-folder-failed-1', 'local:unsignalled'],
			});
		});

		test('a crash between the own write and the mirror is repaired by the next load', async () => {
			const { fixture, session } = await oldBuildSession();
			const peer = fixture.chats[1];
			await createStore().load(session);
			// The own write of a draft landed, then the process died before the mirror.
			const own = sessionData.createService().openDatabase(URI.parse(peer.uri));
			await own.object.setChatDraft(URI.parse(peer.runtimeUri), { text: 'Written before the crash', origin: { kind: MessageKind.User } });
			own.dispose();
			await database.bumpSessionStateRowsRevision(session.toString());

			await createStore().load(session);
			const revisions = (await database.readSessionState(session.toString()))!.header;

			assert.deepStrictEqual({
				mirror: (await rowsIn(fixture.session, peer.uri)).draft,
				acknowledged: revisions.rowsRevision === revisions.rowsMirroredRevision,
			}, { mirror: 'Written before the crash', acknowledged: true });
		});
	});

	suite('checkpoint rows', () => {
		/** Seeds the peer chats' databases the way a provider leaves them: their turns carry event ids. */
		async function seedPeerTurns(fixture: ILegacySessionFixture): Promise<void> {
			for (const chat of fixture.chats.filter(candidate => !candidate.isDefault)) {
				const reference = sessionData.createService().openDatabase(URI.parse(chat.uri));
				for (const turnId of chat.checkpointTurns) {
					await reference.object.createTurn(turnId);
					await reference.object.setTurnEventId(turnId, `event-${turnId}`);
				}
				reference.dispose();
			}
		}

		async function refsIn(storage: string): Promise<{ readonly all: readonly string[]; readonly own: readonly string[] }> {
			const reference = sessionData.createService().openDatabase(URI.parse(storage));
			try {
				return {
					all: await reference.object.getAllCheckpointRefs(),
					own: (await reference.object.getTurnsWithCheckpointRefs()).filter(record => !record.foreign).map(record => record.turnId),
				};
			} finally {
				reference.dispose();
			}
		}

		/** What an older build computes as the next checkpoint number of the session. */
		function oldBuildNextNumber(refs: readonly string[]): number {
			return Math.max(0, ...refs.map(ref => Number(/\/(\d+)$/.exec(ref)?.[1] ?? 0))) + 1;
		}

		test('legacy peer checkpoint rows are copied into the peer database under their names and kept for older builds', async () => {
			const { fixture, session } = await oldBuildSession();
			await seedPeerTurns(fixture);
			const [, sameFolder, otherFolder] = fixture.chats;
			const before = await refsIn(fixture.session);

			await createStore().load(session);

			assert.deepStrictEqual({
				sessionDb: await refsIn(fixture.session),
				sameFolder: (await refsIn(sameFolder.uri)).all,
				otherFolder: (await refsIn(otherFolder.uri)).all,
			}, {
				// Nothing is deleted or renamed; the copied rows are only flagged foreign for this build.
				sessionDb: { all: before.all, own: ['default-turn-1', 'default-turn-2'] },
				sameFolder: [before.all[2]],
				otherFolder: [before.all[3]],
			});
		});

		test('a checkpoint row without an event id that no peer database knows belongs to the default chat and is not flagged foreign', async () => {
			const { fixture, session } = await oldBuildSession();
			// Codex-style provider: the row has no event id, yet no peer owns the turn.
			const old = sessionData.createService().openDatabase(session);
			await old.object.createTurn('codex-turn');
			await old.object.setTurnCheckpointRef('codex-turn', 'refs/agents/session/checkpoints/turn/9');
			old.dispose();
			await seedPeerTurns(fixture);

			await createStore().load(session);

			const peers = await Promise.all(fixture.chats.filter(chat => !chat.isDefault).map(async chat => (await refsIn(chat.uri)).all.includes('refs/agents/session/checkpoints/turn/9')));
			assert.deepStrictEqual({
				own: (await refsIn(fixture.session)).own.includes('codex-turn'),
				peers,
			}, {
				own: true,
				peers: [false, false],
			});
		});

		test('an older build after the copy still counts every legacy number, so a new number cannot collide', async () => {
			const { fixture, session } = await oldBuildSession();
			await seedPeerTurns(fixture);
			await createStore().load(session);

			assert.strictEqual(oldBuildNextNumber((await refsIn(fixture.session)).all), 5);
		});

		test('rows an older build wrote after the copy are claimed by the next load', async () => {
			const { fixture, session } = await oldBuildSession();
			await seedPeerTurns(fixture);
			await createStore().load(session);
			const peer = fixture.chats[1];
			const own = sessionData.createService().openDatabase(URI.parse(peer.uri));
			await own.object.createTurn('same-folder-turn-2');
			await own.object.setTurnEventId('same-folder-turn-2', 'event-same-folder-turn-2');
			own.dispose();
			const old = sessionData.createService().openDatabase(session);
			await old.object.createTurn('same-folder-turn-2');
			await old.object.setTurnCheckpointRef('same-folder-turn-2', 'refs/agents/session/checkpoints/turn/5');
			old.dispose();

			await createStore().load(session);

			assert.deepStrictEqual({
				sessionDb: (await refsIn(fixture.session)).own,
				peer: (await refsIn(peer.uri)).all.length,
			}, { sessionDb: ['default-turn-1', 'default-turn-2'], peer: 2 });
		});
	});

	suite('chat moves (Block 4)', () => {
		const app = 'file:///workspace/app';
		const lib = 'file:///workspace/lib';

		async function registerSession(id: string, folders: readonly string[], peers: readonly { readonly name: string; readonly workingDirectories?: readonly string[] }[]): Promise<{ readonly session: URI; readonly chat: (name: string) => string }> {
			const session = URI.parse(`copilotcli:/${id}`);
			const chat = (name: string) => `ahp-chat://${id}/${name}`;
			await database.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			const registered = await database.registerChatCatalogV2(session.toString(), {
				defaultChat: { chat: chat('default'), order: 0, storageResource: session.toString(), metadata: { summary: 'Default', titleSource: 'user' } },
				peers: peers.map((peer, index) => ({ chat: chat(peer.name), order: index + 1, storageResource: chat(peer.name), workingDirectories: peer.workingDirectories, metadata: { summary: peer.name, titleSource: 'user' as const } })),
				privateDescendants: [],
			});
			assert.strictEqual(registered.status, 'applied');
			await oldBuildEdit(session.toString(), { 'agentHost.sessionWorkingDirectories': JSON.stringify(folders) });
			return { session, chat };
		}

		async function revisionOf(session: URI): Promise<number> {
			return (await database.readCatalogSnapshot([session.toString()]))[0].header!.revision;
		}

		test('moves a chat\'s central row and the folder state only it used, and writes no mirror', async () => {
			const a = await registerSession('move-a', [app, lib], [{ name: 'mover', workingDirectories: [lib] }, { name: 'stays' }]);
			const b = await registerSession('move-b', [app, lib], []);
			const store = createStore();
			await store.load(a.session);
			await store.load(b.session);
			const libKey = getWorkingDirectoryKey(lib);
			const libScope = getWorkingDirectoryScopeId([lib]);
			await store.write(a.session, sessionStatePatch({
				folders: [
					{ folderKey: libKey, kind: 'git', value: '{"branch":"lib-a"}', storage: null },
					{ folderKey: libKey, kind: 'github', value: '{"pr":"lib-a"}', storage: null },
					{ folderKey: libScope, kind: 'baseBranch', value: 'lib-base', storage: a.chat('mover') },
					{ folderKey: '', kind: 'git', value: '{"branch":"app-a"}', storage: null },
				],
			}), SessionStateMirrorFlush.Immediate);
			const mirrorsBefore = { a: await sessionDb(a.session, ['agentHost.gitData', 'agentHost.githubData']), b: await sessionDb(b.session, ['agentHost.gitData', 'agentHost.githubData']) };

			const result = await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: URI.parse(b.chat('default')),
				expectedSourceCatalogRevision: await revisionOf(a.session), expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app, lib], target: [app, lib], chat: [lib], chatHadOwnFolders: true, remaining: [[app, lib], [app, lib]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			const snapshotA = await store.load(a.session);
			const snapshotB = await store.load(b.session);
			const folders = (snapshot: typeof snapshotA) => Object.fromEntries([...snapshot.folders.entries()].map(([key, entry]) => [key, [entry.git, entry.github, entry.baseBranch]]));
			assert.deepStrictEqual({
				result,
				chatsA: [...snapshotA.chats.keys()],
				chatsB: Object.fromEntries([...snapshotB.chats.entries()].map(([chat, entry]) => [chat, [entry.isDefault, entry.workingDirectories, entry.storage]])),
				foldersA: folders(snapshotA),
				foldersB: folders(snapshotB),
				catalogB: (await database.readCatalogSnapshot([b.session.toString()]))[0].chats.map(chat => [chat.chat, chat.order, chat.originSession]),
				// Older builds read the move through the catalog; no session.db changes.
				mirrorsAfter: { a: await sessionDb(a.session, ['agentHost.gitData', 'agentHost.githubData']), b: await sessionDb(b.session, ['agentHost.gitData', 'agentHost.githubData']) },
			}, {
				result: { status: 'applied', moved: [a.chat('mover')], targetOrder: [b.chat('default'), a.chat('mover')] },
				chatsA: [a.chat('default'), a.chat('stays')],
				chatsB: { [a.chat('mover')]: [false, [lib], a.chat('mover')], [b.chat('default')]: [true, undefined, b.session.toString()] },
				// A's other chats still use lib, so its git and GitHub state are copied; no other chat has the [lib] scope, so its base branch is re-keyed.
				foldersA: { '': ['{"branch":"app-a"}', undefined, undefined], [libKey]: ['{"branch":"lib-a"}', '{"pr":"lib-a"}', undefined] },
				foldersB: { [libKey]: ['{"branch":"lib-a"}', '{"pr":"lib-a"}', undefined], [libScope]: [undefined, undefined, 'lib-base'] },
				catalogB: [[b.chat('default'), 0, b.session.toString()], [a.chat('mover'), 1, a.session.toString()]],
				mirrorsAfter: mirrorsBefore,
			});
		});

		test('promotes a chat into a new session that older builds read from the catalog only', async () => {
			const a = await registerSession('promote-a', [app, lib], [{ name: 'promoted', workingDirectories: [lib] }, { name: 'stays' }]);
			const store = createStore();
			await store.load(a.session);
			const libKey = getWorkingDirectoryKey(lib);
			await store.write(a.session, sessionStatePatch({
				folders: [
					{ folderKey: libKey, kind: 'git', value: '{"branch":"lib-a"}', storage: null },
					{ folderKey: getWorkingDirectoryScopeId([lib]), kind: 'baseBranch', value: 'lib-base', storage: a.chat('promoted') },
				],
			}), SessionStateMirrorFlush.Immediate);
			const n = URI.parse('ahp-session:/promoted-n');

			const result = await store.promoteChat({
				source: a.session, target: n, chat: URI.parse(a.chat('promoted')), provider: 'copilotcli', startTime: 5,
				expectedSourceCatalogRevision: await revisionOf(a.session),
				values: { 'agentHost.sessionWorkingDirectories': JSON.stringify([lib]) },
				folders: { source: [app, lib], chat: [lib], chatHadOwnFolders: true, remaining: [[app, lib]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			const snapshotN = await store.load(n);
			await store.write(n, sessionStatePatch({ values: { 'agentHost.sessionWorkingDirectories': JSON.stringify([lib, app]) } }), SessionStateMirrorFlush.Immediate);
			await store.chatRows.setDraft(n, URI.parse(a.chat('promoted')), { text: 'Draft in N', origin: { kind: MessageKind.User } });
			const snapshotA = await store.load(a.session);

			assert.deepStrictEqual({
				result,
				chatsN: Object.fromEntries([...snapshotN.chats.entries()].map(([chat, entry]) => [chat, [entry.isDefault, entry.workingDirectories, entry.storage]])),
				foldersN: Object.fromEntries([...snapshotN.folders.entries()].map(([key, entry]) => [key, [entry.git, entry.baseBranch]])),
				valuesN: snapshotN.values.get('agentHost.sessionWorkingDirectories'),
				chatsA: [...snapshotA.chats.keys()],
				// The new session's default chat stores in its own database, so nothing creates one at the session URI.
				databases: sessionData.resources.filter(resource => resource === n.toString()),
				draft: (await store.chatRows.getDraft(n, URI.parse(a.chat('promoted'))))?.text,
			}, {
				result: { status: 'applied', moved: [a.chat('promoted')] },
				chatsN: { [a.chat('promoted')]: [true, [lib], a.chat('promoted')] },
				// The promoted chat's folder is the new session's primary folder; A still uses lib, so A keeps a copy.
				// The promoted chat is the new session's default chat: its base branch is the session folder's (G1, Block 5).
				foldersN: { '': ['{"branch":"lib-a"}', 'lib-base'] },
				valuesN: JSON.stringify([lib]),
				chatsA: [a.chat('default'), a.chat('stays')],
				databases: [],
				draft: 'Draft in N',
			});
		});

		test('a late row write or read addressed to a chat\'s previous session follows it to its new one', async () => {
			const a = await registerSession('late-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('late-b', [app], []);
			const store = createStore();
			await store.load(a.session);
			await store.load(b.session);
			await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined,
				expectedSourceCatalogRevision: await revisionOf(a.session), expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			const mover = URI.parse(a.chat('mover'));
			const draftIn = async (resource: string) => {
				const reference = sessionData.createService().openDatabase(URI.parse(resource));
				try {
					return (await reference.object.getChatDraft(mover))?.text;
				} finally {
					reference.dispose();
				}
			};

			await store.chatRows.setDraft(a.session, mover, { text: 'Written for A', origin: { kind: MessageKind.User } });

			assert.deepStrictEqual({
				own: await draftIn(a.chat('mover')),
				sourceCopy: await draftIn(a.session.toString()),
				readThroughSource: (await store.chatRows.getDraft(a.session, mover))?.text,
				sourceMirrorBase: await database.readChatRowMirror(a.session.toString(), mover.toString(), 'draft'),
			}, {
				own: 'Written for A',
				// Older builds list the chat in B now, so A's database gets no copy and A keeps no mirror bookkeeping for it.
				sourceCopy: undefined,
				readThroughSource: 'Written for A',
				sourceMirrorBase: undefined,
			});
		});

		test('a row access of a chat deleted between finding it moved and finding its new owner is dropped', async () => {
			const a = await registerSession('gone-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('gone-b', [app], []);
			const store = createStore();
			await store.load(a.session);
			await store.load(b.session);
			await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined,
				expectedSourceCatalogRevision: await revisionOf(a.session), expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			const mover = URI.parse(a.chat('mover'));
			// Each access first finds the chat moved, then looks up its owner: the chat is deleted in between.
			const findOwners = sinon.stub(database, 'findCentralChatOwners');
			findOwners.callThrough();
			for (const call of [1, 3, 5]) {
				findOwners.onCall(call).resolves(new Map());
			}

			const draft = await store.chatRows.getDraft(a.session, mover);
			await store.chatRows.setDraft(a.session, mover, { text: 'Late', origin: { kind: MessageKind.User } });
			await store.chatRows.setChatConfig(a.session, mover, { mode: 'plan' });
			const lookups = findOwners.callCount;
			findOwners.restore();

			assert.deepStrictEqual({ draft, lookups }, { draft: undefined, lookups: 6 });
		});

		test('a stale catalog revision changes nothing', async () => {
			const a = await registerSession('stale-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('stale-b', [app], []);
			const store = createStore();
			const before = { a: await store.load(a.session), b: await store.load(b.session) };
			const result = await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined,
				expectedSourceCatalogRevision: (await revisionOf(a.session)) + 1, expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			assert.deepStrictEqual({ result, a: [...(await store.load(a.session)).chats.keys()], b: [...(await store.load(b.session)).chats.keys()] },
				{ result: { status: 'conflict' }, a: [...before.a.chats.keys()], b: [...before.b.chats.keys()] });
		});

		test('a committed move whose reload fails still reports applied and reloads on next use', async () => {
			const a = await registerSession('reload-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('reload-b', [app], []);
			const store = createStore();
			await store.load(a.session);
			await store.load(b.session);
			const moveChatV2 = database.moveChatV2.bind(database);
			const readSessionState = database.readSessionState.bind(database);
			let failReads = false;
			sinon.stub(database, 'moveChatV2').callsFake(async move => {
				const result = await moveChatV2(move);
				failReads = true;
				return result;
			});
			sinon.stub(database, 'readSessionState').callsFake(async session => failReads ? Promise.reject(new Error('read failed')) : readSessionState(session));

			const result = await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined,
				expectedSourceCatalogRevision: await revisionOf(a.session), expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			failReads = false;

			assert.deepStrictEqual({ result, a: [...(await store.load(a.session)).chats.keys()], b: [...(await store.load(b.session)).chats.keys()].sort() }, {
				result: { status: 'applied', moved: [a.chat('mover')], targetOrder: [a.chat('mover'), b.chat('default')] },
				a: [a.chat('default')],
				b: [a.chat('mover'), b.chat('default')].sort(),
			});
		});

		test('moves in both directions between two sessions at once never deadlock', async () => {
			const a = await registerSession('both-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('both-b', [app], [{ name: 'mover' }]);
			const store = createStore();
			const revisions = { a: await revisionOf(a.session), b: await revisionOf(b.session) };
			const folders = { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] };

			const results = await Promise.all([
				store.moveChat({ source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined, expectedSourceCatalogRevision: revisions.a, expectedTargetCatalogRevision: revisions.b, folders, coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] } }),
				store.moveChat({ source: b.session, target: a.session, chat: URI.parse(b.chat('mover')), after: undefined, expectedSourceCatalogRevision: revisions.b, expectedTargetCatalogRevision: revisions.a, folders, coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] } }),
			]);

			// The second move saw revisions the first one changed, so it changes nothing.
			assert.deepStrictEqual({ statuses: results.map(result => result.status), a: [...(await store.load(a.session)).chats.keys()], b: [...(await store.load(b.session)).chats.keys()].sort() }, {
				statuses: ['applied', 'conflict'],
				a: [a.chat('default')],
				b: [a.chat('mover'), b.chat('default'), b.chat('mover')].sort(),
			});
		});

		test('a moved peer\'s later edits write no older-build copies and create no database', async () => {
			const a = await registerSession('later-a', [app], [{ name: 'mover' }]);
			const b = await registerSession('later-b', [app], []);
			// The peer's own database exists, so a copy written for older builds would land there.
			await oldBuildEdit(a.chat('mover'), { marker: '1' });
			const store = createStore();
			await store.load(a.session);
			await store.load(b.session);
			await store.moveChat({
				source: a.session, target: b.session, chat: URI.parse(a.chat('mover')), after: undefined,
				expectedSourceCatalogRevision: await revisionOf(a.session), expectedTargetCatalogRevision: await revisionOf(b.session),
				folders: { source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] },
				coOwnedWorktrees: [], worktreeLists: { fromSource: [], toTarget: [], targetFolders: [] },
			});
			const databases = [...sessionData.resources];
			const all = async (resource: string) => {
				const reference = sessionData.createService().openDatabase(URI.parse(resource));
				try {
					return Object.values(await reference.object.getMetadataByPrefix('')).filter(value => value === 'Renamed in B').length;
				} finally {
					reference.dispose();
				}
			};

			await store.write(b.session, sessionStatePatch({ chats: [{ chat: a.chat('mover'), isDefault: false, fields: { title: 'Renamed in B' } }] }), SessionStateMirrorFlush.Immediate);

			// Both sessions are normalized (moves require it), and older builds read a normalized session's chats from its catalog.
			assert.deepStrictEqual({ chat: await all(a.chat('mover')), a: await all(a.session.toString()), b: await all(b.session.toString()), databases: sessionData.resources }, {
				chat: 0,
				a: 0,
				b: 0,
				databases,
			});
		});
	});
});
