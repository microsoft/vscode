/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { SessionWorkTrackingService } from '../../browser/sessionWorkTrackingService.js';
import { ChatInteractivity, ChatOriginKind, ISession } from '../../common/session.js';
import { ISendRequestSentEvent, ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { readSessionWorkResultVersion, readSessionWorkSummary } from '../../common/sessionWorkSummary.js';
import { createWorkTestSession } from '../common/sessionWorkTestUtils.js';

const storageKey = 'sessions.workTracking';
const resource = URI.parse('test:/session');

class ExternalStorageService extends InMemoryStorageService {
	setExternal(value: string | undefined): void {
		if (value === undefined) {
			this.remove(storageKey, StorageScope.WORKSPACE);
		} else {
			this.store(storageKey, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		this.emitDidChangeValue(StorageScope.WORKSPACE, { key: storageKey, external: true });
	}
}

suite('SessionWorkTrackingService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(storage = store.add(new ExternalStorageService())) {
		const sent = store.add(new Emitter<ISendRequestSentEvent>());
		const replaced = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const draftReplaced = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const deleted = store.add(new Emitter<ISession>());
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const discarded = store.add(new Emitter<ISession>());
		const warnings: string[] = [];
		let now = 1000;
		let modelAcquisitions = 0;
		const log = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		});
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(ILogService, log);
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession(): never { modelAcquisitions++; throw new Error('Unexpected chat model acquisition'); }
			override acquireOrLoadSession(): never { modelAcquisitions++; throw new Error('Unexpected chat model load'); }
		});
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidSendRequest = sent.event;
			override readonly onDidReplaceSession = replaced.event;
			override readonly onDidReplaceNewDraftSession = draftReplaced.event;
			override readonly onDidDeleteSession = deleted.event;
			override readonly onDidChangeSessions = changed.event;
			override readonly onDidDiscardNewSession = discarded.event;
			override getSessions(): never { throw new Error('Tracking must not scan the provider catalog'); }
		});
		const service = store.add(instantiation.createInstance(SessionWorkTrackingService, () => now));
		return { service, storage, warnings, sent, replaced, draftReplaced, deleted, changed, discarded, now: (value: number) => now = value, modelAcquisitions: () => modelAcquisitions };
	}

	test('reading is sparse, stable, and does not acquire chat models or claim use', () => {
		const { service, storage, modelAcquisitions } = setup();
		const state = service.getState(resource);
		assert.deepStrictEqual({
			state: state.get(), same: state === service.getState(URI.parse(resource.toString())),
			persisted: storage.get(storageKey, StorageScope.WORKSPACE), modelAcquisitions: modelAcquisitions(),
		}, { state: {}, same: true, persisted: undefined, modelAcquisitions: 0 });
	});

	test('explicit opens record local time but do not mark results or provider state reviewed', () => {
		const { service, storage } = setup();
		const { session, chat } = createWorkTestSession(resource);
		chat.lastTurnEnd.set(new Date(100), undefined);
		service.markOpened(resource);
		const summary = readSessionWorkSummary(session, service.getState(resource).get(), { now: 100000, inactivityDays: 1, pinned: false, active: false });
		assert.deepStrictEqual({
			state: service.getState(resource).get(), unreviewed: summary.hasUnreviewedResults,
			sessionRead: session.isRead.get(), chatRead: chat.isRead.get(),
			workspaceKeys: storage.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE),
			profileKeys: storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
		}, {
			state: { lastOpenedAt: 1000 }, unreviewed: true, sessionRead: false, chatRead: false,
			workspaceKeys: [storageKey], profileKeys: [],
		});
	});

	test('review checkpoints are explicit, do not acquire models, and become stale after a new result', () => {
		const { service, modelAcquisitions } = setup();
		const { session, chat } = createWorkTestSession(resource);
		chat.lastTurnEnd.set(new Date(100), undefined);
		service.markReviewed(session);
		const checkpoint = service.getState(resource).get();
		const before = readSessionWorkSummary(session, checkpoint, { now: 100000, inactivityDays: 1, pinned: false, active: false });
		chat.lastTurnEnd.set(new Date(200), undefined);
		const after = readSessionWorkSummary(session, checkpoint, { now: 100000, inactivityDays: 1, pinned: false, active: false });
		assert.deepStrictEqual({
			checkpoint: checkpoint.reviewedResult === before.resultVersion, opened: checkpoint.lastOpenedAt,
			before: before.hasUnreviewedResults, after: after.hasUnreviewedResults,
			sessionRead: session.isRead.get(), chatRead: chat.isRead.get(), modelAcquisitions: modelAcquisitions(),
		}, { checkpoint: true, opened: undefined, before: false, after: true, sessionRead: false, chatRead: false, modelAcquisitions: 0 });
	});

	test('kept and explicitly unkept flags survive restart without changing last-opened time or review', () => {
		const { service, storage } = setup();
		const { session } = createWorkTestSession(resource);
		service.markOpened(resource);
		service.markReviewed(session);
		service.keep(resource, true);
		const restored = setup(storage).service;
		const kept = restored.getState(resource).get();
		restored.keep(resource, false);
		assert.deepStrictEqual({
			kept, unkept: setup(storage).service.getState(resource).get(),
		}, {
			kept: { lastOpenedAt: 1000, reviewedResult: readSessionWorkResultVersion(session), keepArchiveSuggestion: true },
			unkept: { lastOpenedAt: 1000, reviewedResult: readSessionWorkResultVersion(session), keepArchiveSuggestion: false },
		});
	});

	test('unattributed foreground sends leave unknown openings inspect-only', () => {
		const { service, sent, now, storage } = setup();
		const { session, chat } = createWorkTestSession(URI.parse('test:/canonical'));
		now(5000);
		sent.fire({ session, chat, isNewSession: false, isNewChat: false, options: { query: 'Continue' } });
		const summary = readSessionWorkSummary(session, service.getState(session.resource).get(), {
			now: 5000, inactivityDays: 1, pinned: false, active: false, pendingRequestCount: 0,
		});
		assert.deepStrictEqual({
			canonical: service.getState(session.resource).get(), other: service.getState(resource).get(),
			persisted: storage.get(storageKey, StorageScope.WORKSPACE),
			archiveKind: summary.archiveKind, lastOpenedAt: summary.lastOpenedAt, archiveReason: summary.archiveReason,
		}, {
			canonical: {}, other: {}, persisted: undefined,
			archiveKind: 'inspect', lastOpenedAt: undefined, archiveReason: 'The time this session was last opened here is unknown.',
		});
	});

	test('an explicit view-layer opening records only the supplied canonical session', () => {
		const { service, now } = setup();
		const { session, chat } = createWorkTestSession(URI.parse('test:/canonical'));
		now(5000);
		service.markOpened(session.resource);
		assert.deepStrictEqual({
			canonical: service.getState(session.resource).get(), other: service.getState(resource).get(),
			chatState: service.getState(chat.resource).get(), chatRead: chat.isRead.get(),
		}, {
			canonical: { lastOpenedAt: 5000 }, other: {}, chatState: {}, chatRead: false,
		});
	});

	test('send notifications cannot refresh last-opened time', () => {
		const { service, sent, now, storage } = setup();
		const { session, chat } = createWorkTestSession(resource);
		service.markOpened(resource);
		now(5000);
		sent.fire({ session, chat, isNewSession: false, isNewChat: false, options: { query: 'Programmatic foreground request' } });
		sent.fire({ session, chat, isNewSession: false, isNewChat: false, options: { query: 'Background request', background: true } });
		assert.deepStrictEqual({
			current: service.getState(resource).get(), persisted: setup(storage).service.getState(resource).get(),
		}, {
			current: { lastOpenedAt: 1000 }, persisted: { lastOpenedAt: 1000 },
		});
	});

	test('unattributed background and hidden sends do not establish a local opening', () => {
		const { service, sent } = setup();
		const { session, chat } = createWorkTestSession(resource);
		sent.fire({ session, chat, isNewSession: true, isNewChat: true, options: { query: 'Scheduled prompt', background: true } });
		sent.fire({ session, chat, isNewSession: true, isNewChat: true, options: { query: 'System context', hideFromTranscript: true } });
		assert.deepStrictEqual(service.getState(resource).get(), {});
	});

	test('known automation or tool-owned sends do not establish a local opening', () => {
		const { service, sent } = setup();
		const { session, chat } = createWorkTestSession(resource);
		session.isAutomation.set(true, undefined);
		sent.fire({ session, chat, isNewSession: true, isNewChat: true, options: { query: 'Scheduled prompt' } });
		session.isAutomation.set(false, undefined);
		sent.fire({ session, chat: { ...chat, origin: { kind: ChatOriginKind.Tool } }, isNewSession: false, isNewChat: true, options: { query: 'Tool prompt' } });
		chat.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		sent.fire({ session, chat, isNewSession: false, isNewChat: true, options: { query: 'Worker prompt' } });
		assert.deepStrictEqual(service.getState(resource).get(), {});
	});

	test('provider catalog removal, activity changes, and draft discard preserve tracked metadata', () => {
		const { service, changed, discarded, storage } = setup();
		const { session } = createWorkTestSession(resource);
		service.markOpened(resource);
		service.keep(resource, true);
		changed.fire({ added: [], changed: [], removed: [session] });
		discarded.fire(session);
		session.updatedAt.set(new Date(100000), undefined);
		changed.fire({ added: [session], changed: [], removed: [] });
		assert.deepStrictEqual({ current: service.getState(resource).get(), restored: setup(storage).service.getState(resource).get() }, {
			current: { lastOpenedAt: 1000, keepArchiveSuggestion: true },
			restored: { lastOpenedAt: 1000, keepArchiveSuggestion: true },
		});
	});

	for (const replacementKind of ['replaced', 'draftReplaced'] as const) {
		test(`${replacementKind} migrates sparse metadata and existing handles to the new resource`, () => {
			const harness = setup();
			const { service, storage, now } = harness;
			const { session: from } = createWorkTestSession(resource);
			const { session: to } = createWorkTestSession(URI.parse('other-provider:/canonical'));
			const handle = service.getState(resource);
			const targetHandle = service.getState(to.resource);
			service.markOpened(resource);
			service.markReviewed(from);
			service.keep(resource, true);
			const initial = handle.get();
			harness[replacementKind].fire({ from, to });
			now(2000);
			service.markOpened(from.resource);
			const restored = setup(storage).service;
			assert.deepStrictEqual({
				old: handle.get(), target: targetHandle.get(), stored: restored.getState(to.resource).get(),
				retired: restored.getState(from.resource).get(),
			}, {
				old: { ...initial, lastOpenedAt: 2000 }, target: { ...initial, lastOpenedAt: 2000 },
				stored: { ...initial, lastOpenedAt: 2000 }, retired: {},
			});
		});
	}

	test('a replacement with no prior state still redirects a late explicit opening', () => {
		const { service, replaced } = setup();
		const { session: from } = createWorkTestSession(resource);
		const { session: to } = createWorkTestSession(URI.parse('test:/canonical'));
		const handle = service.getState(resource);
		replaced.fire({ from, to });
		service.markOpened(resource);
		assert.deepStrictEqual({ old: handle.get(), canonical: service.getState(to.resource).get() }, {
			old: { lastOpenedAt: 1000 }, canonical: { lastOpenedAt: 1000 },
		});
	});

	test('migration keeps the most recent use, the target review, and any keep protection atomically', () => {
		const { service, replaced, now } = setup();
		const { session: from } = createWorkTestSession(resource);
		const { session: to, chat } = createWorkTestSession(URI.parse('test:/canonical'));
		service.markOpened(from.resource);
		service.keep(from.resource, true);
		service.markReviewed(from);
		now(2000);
		chat.lastTurnEnd.set(new Date(50), undefined);
		service.markOpened(to.resource);
		service.keep(to.resource, false);
		service.markReviewed(to);
		const values: boolean[] = [];
		store.add(autorun(reader => values.push(
			service.getState(from.resource).read(reader) === service.getState(to.resource).read(reader),
		)));
		replaced.fire({ from, to });
		assert.deepStrictEqual({
			state: service.getState(to.resource).get(), aliasesAgree: values,
		}, {
			state: { lastOpenedAt: 2000, reviewedResult: readSessionWorkResultVersion(to), keepArchiveSuggestion: true },
			aliasesAgree: [false, true],
		});
	});

	test('successive migrations preserve aliases without redirect cycles', () => {
		const { service, replaced, draftReplaced } = setup();
		const { session: from } = createWorkTestSession(resource);
		const { session: middle } = createWorkTestSession(URI.parse('test:/middle'));
		const { session: final } = createWorkTestSession(URI.parse('test:/final'));
		const handle = service.getState(resource);
		service.keep(resource, true);
		replaced.fire({ from, to: middle });
		draftReplaced.fire({ from: middle, to: final });
		replaced.fire({ from: final, to: from });
		service.keep(resource, false);
		assert.deepStrictEqual([handle.get(), service.getState(middle.resource).get(), service.getState(final.resource).get()], [
			{ keepArchiveSuggestion: false }, { keepArchiveSuggestion: false }, { keepArchiveSuggestion: false },
		]);
	});

	test('only definitive deletion removes persisted metadata and invalidates old handles', () => {
		const { service, storage, replaced, deleted } = setup();
		const { session: from } = createWorkTestSession(resource);
		const { session: to } = createWorkTestSession(URI.parse('test:/canonical'));
		const handle = service.getState(resource);
		service.markOpened(resource);
		replaced.fire({ from, to });
		deleted.fire(to);
		assert.deepStrictEqual({
			old: handle.get(), canonical: service.getState(to.resource).get(),
			persisted: storage.get(storageKey, StorageScope.WORKSPACE), restored: setup(storage).service.getState(to.resource).get(),
		}, { old: {}, canonical: {}, persisted: undefined, restored: {} });
	});

	test('validates stored records, preserves valid entries, and logs malformed records', () => {
		const storage = store.add(new ExternalStorageService());
		storage.store(storageKey, JSON.stringify({
			version: 1,
			entries: [
				{ resource: resource.toString(), lastOpenedAt: 3000, reviewedResult: '1:recorded', keepArchiveSuggestion: true },
				{ resource: 'not a URI', lastOpenedAt: 3000 },
				{ resource: 'test:/negative', lastOpenedAt: -1 },
				{ resource: 'test:/wrong-flag', keepArchiveSuggestion: 'true' },
				{ resource: 'test:/wrong-review', reviewedResult: 42 },
				{ resource: 'test:/empty' },
				{ resource: resource.toString(), lastOpenedAt: 1 },
				null,
			],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service, warnings } = setup(storage);
		assert.deepStrictEqual({
			state: service.getState(resource).get(), invalid: service.getState(URI.parse('test:/negative')).get(),
			warnings,
		}, {
			state: { lastOpenedAt: 3000, reviewedResult: '1:recorded', keepArchiveSuggestion: true }, invalid: {},
			warnings: ['[SessionWorkTracking] Ignored 7 invalid work tracking records.'],
		});
	});

	for (const raw of ['{', 'null', '[]', '{"version":2,"entries":[]}', '{"version":1,"entries":{}}']) {
		test(`logs and leaves malformed storage untouched: ${raw}`, () => {
			const storage = store.add(new ExternalStorageService());
			storage.store(storageKey, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			const { service, warnings } = setup(storage);
			assert.deepStrictEqual({
				state: service.getState(resource).get(), warnings: warnings.length,
				persisted: storage.get(storageKey, StorageScope.WORKSPACE),
			}, { state: {}, warnings: 1, persisted: raw });
		});
	}

	test('external storage updates reach existing observable handles and retain other records on the next write', () => {
		const { service, storage } = setup();
		const handle = service.getState(resource);
		const snapshots: Array<number | undefined> = [];
		store.add(autorun(reader => snapshots.push(handle.read(reader).lastOpenedAt)));
		storage.setExternal(JSON.stringify({
			version: 1, entries: [
				{ resource: resource.toString(), lastOpenedAt: 6000, keepArchiveSuggestion: true },
				{ resource: 'test:/other', lastOpenedAt: 7000 },
			]
		}));
		service.keep(resource, false);
		const restored = setup(storage).service;
		assert.deepStrictEqual({
			snapshots, state: handle.get(), other: restored.getState(URI.parse('test:/other')).get(),
		}, {
			snapshots: [undefined, 6000, 6000],
			state: { lastOpenedAt: 6000, keepArchiveSuggestion: false }, other: { lastOpenedAt: 7000 },
		});
	});

	test('malformed external storage cannot erase the current valid state', () => {
		const { service, storage, warnings } = setup();
		service.keep(resource, true);
		const handle = service.getState(resource);
		storage.setExternal('{');
		assert.deepStrictEqual({ state: handle.get(), warnings: warnings.length }, { state: { keepArchiveSuggestion: true }, warnings: 1 });
	});

	test('external updates using a retired URI preserve the canonical binding and merge keep protection', () => {
		const { service, storage, replaced } = setup();
		const { session: from } = createWorkTestSession(resource);
		const { session: to } = createWorkTestSession(URI.parse('test:/canonical'));
		const handle = service.getState(resource);
		replaced.fire({ from, to });
		storage.setExternal(JSON.stringify({
			version: 1, entries: [
				{ resource: from.resource.toString(), lastOpenedAt: 4000, keepArchiveSuggestion: true },
				{ resource: to.resource.toString(), lastOpenedAt: 5000, keepArchiveSuggestion: false },
			]
		}));
		assert.deepStrictEqual([handle.get(), service.getState(to.resource).get()], [
			{ lastOpenedAt: 5000, keepArchiveSuggestion: true }, { lastOpenedAt: 5000, keepArchiveSuggestion: true },
		]);
	});

	test('external removal clears existing state without reseeding it from the catalog', () => {
		const { service, storage } = setup();
		service.markOpened(resource);
		const handle = service.getState(resource);
		storage.setExternal(undefined);
		assert.deepStrictEqual(handle.get(), {});
	});

	test('clock rollback cannot make recent work older, and invalid clock values are logged', () => {
		const { service, now, warnings } = setup();
		service.markOpened(resource);
		now(500);
		service.markOpened(resource);
		now(NaN);
		service.markOpened(resource);
		assert.deepStrictEqual({ state: service.getState(resource).get(), warnings }, {
			state: { lastOpenedAt: 1000 }, warnings: ['[SessionWorkTracking] Cannot record a local opening with an invalid clock value.'],
		});
	});
});
