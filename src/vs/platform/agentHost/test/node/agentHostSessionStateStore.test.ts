/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionStateDeletedError, SessionStateMirrorFlush, SessionStateReentrancyError, sessionStatePatch } from '../../common/agentHostSessionStateStore.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostDatabase, type IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { mirrorEntryId } from '../../node/agentHostSessionStateMirror.js';
import { AgentHostSessionStateStore } from '../../node/agentHostSessionStateStore.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
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
			missionControl: snapshot.values.get(`missionControl.sdkSequence.${fixture.missionControlEnvironment}`),
			folders: [...snapshot.folders.keys()].sort(),
			chats: fixture.chats.map(({ uri }) => snapshot.chats.get(uri)).map(entry => entry && [entry.isDefault, entry.storage, entry.title, entry.isRead, entry.workingDirectories, entry.changes]),
			blob: (await first.readBranchChangeset(session, getWorkingDirectoryScopeId(otherFolder.workingDirectories)))?.length,
			oldBuildViewUnchanged: JSON.stringify(await readOldBuildView(sessionData.createService(), database, fixture)) === JSON.stringify(before),
			header: (await database.readSessionState(fixture.session))?.header,
		}, {
			imports: 1,
			authority: 1,
			configValues: legacySessionMetadata(fixture).configValues,
			missionControl: '42',
			folders: ['', getWorkingDirectoryScopeId(otherFolder.workingDirectories), 'file:///workspace/app'].sort(),
			chats: [
				// The default chat's changes are the session's aggregate value, not a per-chat key.
				[true, fixture.session, defaultChat.title, true, undefined, undefined],
				[false, sameFolder.uri, sameFolder.title, undefined, undefined, JSON.stringify(sameFolder.changes)],
				[false, otherFolder.uri, otherFolder.title, undefined, otherFolder.workingDirectories, JSON.stringify(otherFolder.changes)],
			],
			blob: legacySessionMetadata(fixture)[`agentHost.changeset.branch.${getWorkingDirectoryScopeId(otherFolder.workingDirectories)}`].length,
			oldBuildViewUnchanged: true,
			header: { revision: 1, legacyMirroredRevision: 1, rowsRevision: 0, rowsMirroredRevision: 0, importVersion: 1, checkpointSequence: 0 },
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

	test('the store refuses re-entrant calls for a session it holds', async () => {
		const { session } = await oldBuildSession();
		const sessionStore = createStore();
		const other = URI.parse('copilotcli:/other');
		const result = await sessionStore.runExclusive(session, async () => {
			const reentrant = await sessionStore.load(session).then(() => 'loaded', error => error instanceof SessionStateReentrancyError ? 'refused' : String(error));
			await sessionStore.load(other);
			return reentrant;
		});
		assert.strictEqual(result, 'refused');
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
		await timeout(50);
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
		await oldBuildEdit(fixture.session, { 'agentHost.ehcliAdopted': 'true' });
		const mirrorWrites = sinon.spy(SessionDatabase.prototype, 'applyMetadataChanges');
		await sessionStore.refreshFromMirror(session, ['agentHost.ehcliAdopted']);
		const state = await database.readSessionState(fixture.session);
		assert.deepStrictEqual({
			value: sessionStore.peek(session)?.values.get('agentHost.ehcliAdopted'),
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
		const owned = Object.fromEntries(Object.entries(written).filter(([key]) => !rendered.unowned.includes(key)));
		assert.deepStrictEqual({
			matches: Object.fromEntries(Object.entries(owned).map(([key, value]) => [key, rendered.values[key] === value])),
			retired: rendered.values.isDone,
			unowned: [...rendered.unowned].sort(),
		}, {
			matches: Object.fromEntries(Object.keys(owned).map(key => [key, true])),
			retired: undefined,
			// Provider-owned keys of the default chat, blobs (read lazily), membership, and the legacy GitHub key (C4).
			unowned: ['agentHost.changeset.branch', `agentHost.changeset.branch.${getWorkingDirectoryScopeId(fixture.chats[2].workingDirectories)}`, 'agentHost.changeset.session', 'agentHost.github',
				'copilot.customizationDirectory', 'copilot.model', 'copilot.project.displayName', 'copilot.project.resolved', 'copilot.project.uri', 'copilot.sharedCustomizationDirectories',
				'copilot.workingDirectories', 'copilot.workingDirectory', 'defaultChatProviderData', 'peerChats', 'vscode.scheduleCursors'].sort(),
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
});
