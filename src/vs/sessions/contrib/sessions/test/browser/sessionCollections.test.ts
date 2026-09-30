/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { SESSIONS_LIST_COLLECTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionCollection, ISessionCollectionsService, SessionCollectionsUndo } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { type IOpenNewSessionResult, type IOpenSessionOptions, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { buildTestSession, ITestSession } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { SessionCollectionAttention } from '../../browser/sessionCollectionsSwitcher.js';
import { SessionCollectionsController } from '../../browser/sessionCollections.js';

suite('SessionCollections', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestCollectionsService extends Disposable implements ISessionCollectionsService {
		declare readonly _serviceBrand: undefined;

		private readonly collectionsValue = observableValue<readonly ISessionCollection[]>(this, [
			{ id: 'engineering', name: 'Engineering', icon: 'graph', color: SessionPaletteColor.Blue },
			{ id: 'personal', name: 'Personal', icon: 'heart', color: SessionPaletteColor.Pink },
			{ id: 'misc', name: 'Misc', icon: 'layers', color: SessionPaletteColor.Grey },
		]);
		readonly collections = this.collectionsValue;
		readonly defaultCollectionId = constObservable('engineering');
		private readonly activeCollectionValue = observableValue<string>(this, 'engineering');
		readonly activeCollectionId = this.activeCollectionValue;
		private readonly onDidChangeMembershipEmitter = this._register(new Emitter<void>());
		readonly onDidChangeMembership = this.onDidChangeMembershipEmitter.event;
		private readonly sessions = new Map<string, string>();
		private readonly lastSessions = new Map<string, URI>();

		getCollection(collectionId: string): ISessionCollection | undefined {
			return this.collections.get().find(collection => collection.id === collectionId);
		}

		setActiveCollection(collectionId: string): void {
			this.activeCollectionValue.set(collectionId, undefined);
		}

		createCollection(): ISessionCollection {
			const collection: ISessionCollection = { id: 'created', name: 'Created', icon: 'star', color: SessionPaletteColor.Purple };
			this.collectionsValue.set([...this.collections.get(), collection], undefined);
			return collection;
		}

		updateCollection(): void { }
		moveCollection(): void { }
		deleteCollection(): SessionCollectionsUndo | undefined { return undefined; }

		getSessionCollection(session: ISession): string {
			return this.sessions.get(session.sessionId) ?? 'engineering';
		}

		getGroupCollection(): string { return 'engineering'; }
		getWorkspaceCollection(): string { return 'engineering'; }

		moveSessionsToCollection(sessions: readonly ISession[], collectionId: string): SessionCollectionsUndo {
			const snapshot = new Map(this.sessions);
			for (const session of sessions) {
				this.sessions.set(session.sessionId, collectionId);
			}
			this.onDidChangeMembershipEmitter.fire();
			return () => {
				this.sessions.clear();
				for (const [sessionId, value] of snapshot) {
					this.sessions.set(sessionId, value);
				}
				this.onDidChangeMembershipEmitter.fire();
			};
		}

		moveGroupToCollection(): SessionCollectionsUndo { return () => { }; }
		moveWorkspaceToCollection(): SessionCollectionsUndo { return () => { }; }

		getLastSession(collectionId: string): URI | undefined {
			return this.lastSessions.get(collectionId);
		}

		setLastSession(collectionId: string, resource: URI): void {
			this.lastSessions.set(collectionId, resource);
		}

		setSessionCollection(session: ISession, collectionId: string): void {
			this.sessions.set(session.sessionId, collectionId);
			this.onDidChangeMembershipEmitter.fire();
		}
	}

	class TestSessionsManagementService extends mock<ISessionsManagementService>() {
		private sessions: readonly ISession[] = [];
		private readonly onDidChangeSessionsEmitter = new Emitter<ISessionsChangeEvent>();
		override readonly onDidChangeSessions = this.onDidChangeSessionsEmitter.event;

		override getSessions(): ISession[] {
			return [...this.sessions];
		}

		override getSession(resource: URI): ISession | undefined {
			return this.sessions.find(session => isEqual(session.resource, resource));
		}

		setSessions(sessions: readonly ISession[]): void {
			this.sessions = sessions;
			this.onDidChangeSessionsEmitter.fire({ added: [...sessions], removed: [], changed: [] });
		}

		dispose(): void {
			this.onDidChangeSessionsEmitter.dispose();
		}
	}

	class TestSessionsService extends mock<ISessionsService>() {
		override readonly activeSession = observableValue<IActiveSession | undefined>(this, undefined);
		readonly openSessionCalls: URI[] = [];
		openSessionPromise: Promise<void> = Promise.resolve();
		openNewSessionCalls = 0;

		override openSession(resource: URI, _options?: IOpenSessionOptions): Promise<void> {
			this.openSessionCalls.push(resource);
			return this.openSessionPromise;
		}

		override openNewSession(): Promise<IOpenNewSessionResult> {
			this.openNewSessionCalls++;
			return Promise.resolve({ session: undefined, trustDeclined: false });
		}
	}

	function activeSession(testSession: ITestSession): IActiveSession {
		return upcastPartial<IActiveSession>(testSession.session);
	}

	function setup() {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_COLLECTIONS_SETTING]: true });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const collectionsService = store.add(new TestCollectionsService());
		const sessionsManagementService = store.add(new TestSessionsManagementService());
		const sessionsService = new TestSessionsService();
		instantiationService.stub(ISessionCollectionsService, collectionsService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		const controller = store.add(new SessionCollectionsController(
			configurationService,
			contextKeyService,
			collectionsService,
			sessionsService,
			sessionsManagementService,
			instantiationService,
			new NullActionViewItemService(),
			new class extends mock<IViewsService>() { },
			new class extends mock<IContextMenuService>() {
				override readonly onDidShowContextMenu = Event.None;
				override readonly onDidHideContextMenu = Event.None;
				override showContextMenu(): void { }
			},
			upcastPartial<IWorkbenchLayoutService>({}),
			new MockKeybindingService(),
			new NullLogService(),
		));
		return { controller, collectionsService, sessionsManagementService, sessionsService };
	}

	test('switching opens the remembered session or the new-session composer', async () => {
		const { controller, collectionsService, sessionsManagementService, sessionsService } = setup();
		const engineering = buildTestSession({ id: 'engineering-session', title: 'Engineering session' });
		const personal = buildTestSession({ id: 'personal-session', title: 'Personal session' });
		sessionsManagementService.setSessions([engineering.session, personal.session]);
		collectionsService.setSessionCollection(personal.session, 'personal');
		collectionsService.setLastSession('personal', personal.session.resource);

		await controller.switchTo('personal');
		await controller.switchTo('misc');

		assert.deepStrictEqual({
			activeCollection: collectionsService.activeCollectionId.get(),
			openSessionCalls: sessionsService.openSessionCalls.map(resource => resource.toString()),
			openNewSessionCalls: sessionsService.openNewSessionCalls,
		}, {
			activeCollection: 'misc',
			openSessionCalls: [personal.session.resource.toString()],
			openNewSessionCalls: 1,
		});
	});

	test('rapid switches are superseded', async () => {
		const { controller, collectionsService, sessionsManagementService, sessionsService } = setup();
		const personal = buildTestSession({ id: 'personal-session', title: 'Personal session' });
		const misc = buildTestSession({ id: 'misc-session', title: 'Misc session' });
		sessionsManagementService.setSessions([personal.session, misc.session]);
		collectionsService.setSessionCollection(personal.session, 'personal');
		collectionsService.setSessionCollection(misc.session, 'misc');
		collectionsService.setLastSession('personal', personal.session.resource);
		collectionsService.setLastSession('misc', misc.session.resource);
		const first = new DeferredPromise<void>();
		const second = new DeferredPromise<void>();
		sessionsService.openSessionPromise = first.p;
		const firstSwitch = controller.switchTo('personal');
		sessionsService.openSessionPromise = second.p;
		const secondSwitch = controller.switchTo('misc');

		sessionsService.activeSession.set(activeSession(misc), undefined);
		second.complete();
		await secondSwitch;
		first.complete();
		await firstSwitch;

		assert.deepStrictEqual({
			activeCollection: collectionsService.activeCollectionId.get(),
			personalLastSession: collectionsService.getLastSession('personal')?.toString(),
			miscLastSession: collectionsService.getLastSession('misc')?.toString(),
		}, {
			activeCollection: 'misc',
			personalLastSession: personal.session.resource.toString(),
			miscLastSession: misc.session.resource.toString(),
		});
	});

	test('activating a committed session follows its collection, records it, and drafts do not follow', () => {
		const { collectionsService, sessionsManagementService, sessionsService } = setup();
		const engineering = buildTestSession({ id: 'engineering-session', title: 'Engineering session' });
		const personal = buildTestSession({ id: 'personal-session', title: 'Personal session' });
		const draft = buildTestSession({ id: 'draft-session', title: 'Draft session', status: SessionStatus.Untitled });
		sessionsManagementService.setSessions([engineering.session, personal.session, draft.session]);
		collectionsService.setSessionCollection(personal.session, 'personal');
		collectionsService.setSessionCollection(draft.session, 'misc');

		sessionsService.activeSession.set(activeSession(personal), undefined);
		const followed = collectionsService.activeCollectionId.get();
		const recorded = collectionsService.getLastSession('personal')?.toString();
		sessionsService.activeSession.set(activeSession(draft), undefined);

		assert.deepStrictEqual({
			followed,
			recorded,
			afterDraft: collectionsService.activeCollectionId.get(),
		}, {
			followed: 'personal',
			recorded: personal.session.resource.toString(),
			afterDraft: 'personal',
		});
	});

	test('does not follow later collection re-resolution for the same active session', () => {
		const { collectionsService, sessionsManagementService, sessionsService } = setup();
		const session = buildTestSession({ id: 'engineering-session', title: 'Engineering session' });
		sessionsManagementService.setSessions([session.session]);
		sessionsService.activeSession.set(activeSession(session), undefined);

		collectionsService.setSessionCollection(session.session, 'personal');

		assert.deepStrictEqual({
			activeCollection: collectionsService.activeCollectionId.get(),
			lastEngineeringSession: collectionsService.getLastSession('engineering')?.toString(),
		}, {
			activeCollection: 'engineering',
			lastEngineeringSession: session.session.resource.toString(),
		});
	});

	test('moving the session opened by a switch and changing its status keeps the collection', async () => {
		const { controller, collectionsService, sessionsManagementService, sessionsService } = setup();
		const personal = buildTestSession({ id: 'personal-session', title: 'Personal session' });
		sessionsManagementService.setSessions([personal.session]);
		collectionsService.setSessionCollection(personal.session, 'personal');
		collectionsService.setLastSession('personal', personal.session.resource);
		const opened = new DeferredPromise<void>();
		sessionsService.openSessionPromise = opened.p;

		const switching = controller.switchTo('personal');
		sessionsService.activeSession.set(activeSession(personal), undefined);
		opened.complete();
		await switching;
		collectionsService.setSessionCollection(personal.session, 'misc');
		personal.status.set(SessionStatus.InProgress, undefined);

		assert.strictEqual(collectionsService.activeCollectionId.get(), 'personal');
	});

	test('a sent draft that resolves elsewhere before it is assigned keeps the collection', () => {
		const { collectionsService, sessionsManagementService, sessionsService } = setup();
		const draft = buildTestSession({ id: 'draft-session', title: 'Draft', status: SessionStatus.Untitled });
		const committed = buildTestSession({ id: 'committed-session', title: 'Committed', status: SessionStatus.InProgress });
		sessionsManagementService.setSessions([draft.session, committed.session]);
		collectionsService.setActiveCollection('personal');

		sessionsService.activeSession.set(activeSession(draft), undefined);
		// The committed session still resolves to the default collection until it is assigned.
		sessionsService.activeSession.set(activeSession(committed), undefined);

		assert.strictEqual(collectionsService.activeCollectionId.get(), 'personal');
	});

	test('attention prefers needs-input over unread and ignores archived sessions', () => {
		const { controller, collectionsService, sessionsManagementService } = setup();
		const unread = buildTestSession({ id: 'unread', title: 'Unread', isRead: false });
		const needsInput = buildTestSession({ id: 'needs-input', title: 'Needs input', status: SessionStatus.NeedsInput });
		const archivedNeedsInput = buildTestSession({ id: 'archived-needs-input', title: 'Archived', status: SessionStatus.NeedsInput, isArchived: true, isRead: false });
		sessionsManagementService.setSessions([unread.session, needsInput.session, archivedNeedsInput.session]);
		collectionsService.setSessionCollection(unread.session, 'personal');
		collectionsService.setSessionCollection(needsInput.session, 'personal');
		collectionsService.setSessionCollection(archivedNeedsInput.session, 'misc');

		const withNeedsInput = controller.getCollectionAttention('personal');
		needsInput.status.set(SessionStatus.Completed, undefined);
		const withUnread = controller.getCollectionAttention('personal');
		const archivedOnly = controller.getCollectionAttention('misc');

		assert.deepStrictEqual({
			withNeedsInput,
			withUnread,
			archivedOnly,
		}, {
			withNeedsInput: SessionCollectionAttention.NeedsInput,
			withUnread: SessionCollectionAttention.Unread,
			archivedOnly: SessionCollectionAttention.None,
		});
	});
});
