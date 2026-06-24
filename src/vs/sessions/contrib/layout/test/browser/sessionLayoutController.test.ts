/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IPaneComposite } from '../../../../../workbench/common/panecomposite.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { LayoutController } from '../../browser/sessionLayoutController.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';

function makeChange(filePath: string): ISessionFileChange {
	return { uri: URI.file(filePath), insertions: 1, deletions: 0 };
}

function makeSession(resource: URI, opts?: {
	status?: SessionStatus;
	changes?: readonly ISessionFileChange[];
	workspace?: ISessionWorkspace;
}): IActiveSession {
	const chat: IChat = {
		resource,
		createdAt: new Date(),
		title: observableValue('title', 'Test'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', opts?.status ?? SessionStatus.Completed),
		checkpoints: observableValue('checkpoints', undefined),
		changes: observableValue('changes', opts?.changes ?? []),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
	};

	return {
		sessionId: `test:${resource.toString()}`,
		resource,
		providerId: 'test',
		sessionType: 'local',
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('workspace', opts?.workspace ?? {
			uri: URI.file('/repo'),
			label: 'test',
			icon: Codicon.repo,
			folders: [{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo'),
				name: 'repo',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: constObservable([]),
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('loading', false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		chats: observableValue('chats', [chat]),
		activeChat: observableValue('activeChat', chat),
		mainChat: constObservable(chat),
		capabilities: { supportsMultipleChats: false },
		isCreated: observableValue('isCreated', true),
		sticky: observableValue('sticky', false),
	};
}

suite('LayoutController', () => {

	const store = new DisposableStore();
	let activeSessionObs: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	let onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	let onDidChangePartVisibility: Emitter<IPartVisibilityChangeEvent>;
	let storageService: TestStorageService;
	let partVisibility: Map<Parts, boolean>;
	let openedViewContainers: string[];
	let openedViews: string[];
	let setPartHiddenCalls: { hidden: boolean; part: Parts }[];
	let activePaneCompositeId: string | undefined;
	let pinnedAuxiliaryBarContainerIds: string[];
	let visibleEditorsList: readonly unknown[];

	interface ICreateOptions {
		readonly useModal?: 'off' | 'some' | 'all';
		readonly workspaceFolders?: readonly { readonly uri: URI }[];
		readonly layoutState?: readonly object[];
		readonly newSessionViewState?: { readonly auxiliaryBarVisible: boolean };
		readonly newSessionViewStateRaw?: string;
	}

	function createLayoutController(options: ICreateOptions = {}): LayoutController {
		const instaService = store.add(new TestInstantiationService());

		storageService = store.add(new TestStorageService());
		if (options.layoutState) {
			storageService.store('sessions.layoutState', JSON.stringify(options.layoutState), StorageScope.WORKSPACE, 0);
		}
		if (options.newSessionViewState) {
			storageService.store('sessions.newSessionViewState', JSON.stringify(options.newSessionViewState), StorageScope.WORKSPACE, 0);
		}
		if (options.newSessionViewStateRaw !== undefined) {
			storageService.store('sessions.newSessionViewState', options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
		}
		instaService.stub(IStorageService, storageService);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('workbench.editor.useModal', options.useModal ?? 'all');
		instaService.stub(IConfigurationService, configService);

		activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', undefined);
		onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());

		instaService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSessions() { return []; }
		});
		instaService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSessionObs;
			override readonly visibleSessions = constObservable([]);
		});

		partVisibility = new Map<Parts, boolean>([
			[Parts.AUXILIARYBAR_PART, true],
			[Parts.PANEL_PART, false],
			[Parts.EDITOR_PART, true],
		]);
		setPartHiddenCalls = [];
		onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());

		instaService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override isVisible(part: Parts): boolean {
				return partVisibility.get(part) ?? true;
			}
			override setPartHidden(hidden: boolean, part: Parts): void {
				setPartHiddenCalls.push({ hidden, part });
				const wasVisible = partVisibility.get(part) ?? true;
				partVisibility.set(part, !hidden);
				// Mirror production: fire the visibility change synchronously when it actually changes
				if (wasVisible === hidden) {
					onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
				}
			}
			override hasFocus(_part: Parts): boolean { return false; }
			suppressEditorPartAutoVisibility(): IDisposable { return Disposable.None; }
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
		} as Partial<IWorkbenchLayoutService> as IWorkbenchLayoutService);

		openedViewContainers = [];
		openedViews = [];
		instaService.stub(IViewsService, new class extends mock<IViewsService>() {
			override async openViewContainer(id: string) {
				openedViewContainers.push(id);
				return null;
			}
			override closeViewContainer() { }
			override async openView(id: string) {
				openedViews.push(id);
				return null;
			}
		});

		activePaneCompositeId = undefined;
		pinnedAuxiliaryBarContainerIds = [SESSIONS_FILES_CONTAINER_ID, CHANGES_VIEW_CONTAINER_ID];
		instaService.stub(IPaneCompositePartService, new class extends mock<IPaneCompositePartService>() {
			override getActivePaneComposite(_location: ViewContainerLocation): IPaneComposite | undefined {
				if (activePaneCompositeId) {
					return { getId: () => activePaneCompositeId! } as IPaneComposite;
				}
				return undefined;
			}
			override getPinnedPaneCompositeIds(_location: ViewContainerLocation): string[] {
				// Mirrors production: pinned ids only. The active composite is not
				// necessarily pinned (that distinction lives in getVisiblePaneCompositeIds),
				// so tests must add a container to pinnedAuxiliaryBarContainerIds to model it as pinned.
				return [...pinnedAuxiliaryBarContainerIds];
			}
		});

		visibleEditorsList = [];
		instaService.stub(IEditorService, new class extends mock<IEditorService>() {
			override get visibleEditors() { return visibleEditorsList as IEditorService['visibleEditors']; }
		});

		instaService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override saveWorkingSet(name: string): IEditorWorkingSet { return { id: name, name }; }
			override async applyWorkingSet() { return true; }
			override deleteWorkingSet() { }
		});

		instaService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): IWorkspace { return { id: 'test', folders: (options.workspaceFolders ?? []) as IWorkspace['folders'] }; }
		});

		return store.add(instaService.createInstance(LayoutController));
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Auxiliary bar view state ---

	test('hides side pane for existing session without saved state', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'));
		activeSessionObs.set(session, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should be hidden'
		);
		assert.ok(!openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID), 'should not auto-open the Files view');
	});

	test('does not auto-open side pane for existing session with changes', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), {
			changes: [makeChange('/file.ts')],
		});
		activeSessionObs.set(session, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should be hidden'
		);
		assert.ok(!openedViews.includes(CHANGES_VIEW_ID), 'should not auto-open the Changes view');
	});

	test('shows files view for untitled session', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		activeSessionObs.set(session, undefined);

		assert.ok(openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
	});

	test('closes the side pane when an untitled session converts to an existing session', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		activeSessionObs.set(session, undefined);

		assert.ok(openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		setPartHiddenCalls = [];
		(session.status as ISettableObservable<SessionStatus>).set(SessionStatus.InProgress, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should be closed after the session converts to an existing session'
		);
	});

	test('remembers hidden aux bar across new (untitled) sessions', () => {
		createLayoutController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		const existing = makeSession(URI.parse('session:existing'));
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		// Open a new (untitled) session — aux bar shows the Files view.
		activeSessionObs.set(untitled1, undefined);
		assert.ok(openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User hides the aux bar on the new-session view.
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		// Switch to an existing session and back to a brand new (untitled) session.
		activeSessionObs.set(existing, undefined);

		setPartHiddenCalls = [];
		openedViewContainers = [];
		activeSessionObs.set(untitled2, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden on the next new session'
		);
		assert.ok(
			!openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not re-open the Files view on the next new session'
		);
	});

	test('persists hidden new-session aux bar to storage and restores it after reload', () => {
		// First lifetime: user hides the aux bar on the new-session view.
		createLayoutController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		activeSessionObs.set(untitled1, undefined);

		partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		assert.deepStrictEqual(
			JSON.parse(storageService.get('sessions.newSessionViewState', StorageScope.WORKSPACE) ?? ''),
			{ auxiliaryBarVisible: false },
			'state should be persisted to storage'
		);

		store.clear();

		// Second lifetime (reload): a fresh controller with the persisted state.
		createLayoutController({ newSessionViewState: { auxiliaryBarVisible: false } });
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		setPartHiddenCalls = [];
		openedViewContainers = [];
		activeSessionObs.set(untitled2, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden after reload'
		);
		assert.ok(
			!openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not re-open the Files view after reload'
		);
	});

	test('ignores malformed persisted new-session state and does not force-hide the aux bar', () => {
		// Persisted object is missing the `auxiliaryBarVisible` boolean.
		createLayoutController({ newSessionViewStateRaw: JSON.stringify({ foo: 'bar' }) });
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });

		activeSessionObs.set(untitled, undefined);

		assert.ok(
			!setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'malformed state must not force-hide the aux bar'
		);
		assert.ok(
			openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should fall back to the default Files view'
		);
		assert.strictEqual(
			storageService.get('sessions.newSessionViewState', StorageScope.WORKSPACE),
			undefined,
			'malformed state should be removed from storage'
		);
	});

	test('does not open views when session has no workspace', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), {
			workspace: { uri: URI.file('/repo'), label: 'test', icon: Codicon.repo, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false },
		});
		activeSessionObs.set(session, undefined);

		assert.ok(!openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
		assert.ok(!openedViews.includes(CHANGES_VIEW_ID));
	});

	test('remembers aux bar hidden state on session switch', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		activeSessionObs.set(session1, undefined);
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		activeSessionObs.set(session2, undefined);

		setPartHiddenCalls = [];
		activeSessionObs.set(session1, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should be hidden when returning to session 1'
		);
	});

	test('remembers active view container on session switch', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		activeSessionObs.set(session1, undefined);
		activePaneCompositeId = 'some.custom.view';
		pinnedAuxiliaryBarContainerIds = [...pinnedAuxiliaryBarContainerIds, 'some.custom.view'];
		partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		activeSessionObs.set(session2, undefined);

		openedViewContainers = [];
		activeSessionObs.set(session1, undefined);

		assert.ok(
			openedViewContainers.includes('some.custom.view'),
			'should restore active view container when returning to session 1'
		);
	});

	test('restores an explicit Files choice on session switch even when the session has changes', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'), { changes: [makeChange('/file.ts')] });
		const session2 = makeSession(URI.parse('session:2'));

		// The user explicitly opens the (pinned) Files pane for session 1.
		activeSessionObs.set(session1, undefined);
		activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		activeSessionObs.set(session2, undefined);

		openedViewContainers = [];
		openedViews = [];
		activeSessionObs.set(session1, undefined);

		assert.ok(
			openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should restore the user\'s explicit Files choice'
		);
		assert.ok(
			!openedViews.includes(CHANGES_VIEW_ID),
			'should not override the explicit Files choice with Changes'
		);
	});

	test('shows changes for untitled session with changes', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), {
			status: SessionStatus.Untitled,
			changes: [makeChange('/file.ts')],
		});
		activeSessionObs.set(session, undefined);

		assert.ok(openedViews.includes(CHANGES_VIEW_ID));
	});

	test('does not force-open Files when the Files pane is hidden', () => {
		createLayoutController();
		// User has hidden / unpinned the Files pane.
		pinnedAuxiliaryBarContainerIds = [CHANGES_VIEW_CONTAINER_ID];
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });

		activeSessionObs.set(session, undefined);

		assert.ok(
			!openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not open the hidden Files pane'
		);
		assert.ok(
			openedViews.includes(CHANGES_VIEW_ID),
			'should fall back to Changes when Files is hidden'
		);
	});

	test('does not re-reveal aux bar after user hides it when session changes state updates', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'));
		activeSessionObs.set(session, undefined);

		// User hides the aux bar (Side Panel) without switching sessions.
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		openedViews = [];
		openedViewContainers = [];
		setPartHiddenCalls = [];

		// Changes appear, which re-triggers the aux bar sync autorun.
		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);

		assert.ok(
			!openedViews.includes(CHANGES_VIEW_ID) && !openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'aux bar must stay hidden after the user hid it, even when changes appear'
		);
	});

	// --- Editor / auxiliary bar invariant ---

	test('does not force auxiliary bar visible when restoring editor working set on session switch', async () => {
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));
		createLayoutController({
			useModal: 'some',
			workspaceFolders: [{ uri: URI.file('/repo') }],
			layoutState: [{
				sessionResource: 'session:1',
				editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
				viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: undefined },
			}],
		});

		// Start on a different session, then switch to the one with a saved working set.
		activeSessionObs.set(session2, undefined);
		await timeout(0);

		partVisibility.set(Parts.EDITOR_PART, false);
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		setPartHiddenCalls = [];

		activeSessionObs.set(session1, undefined);
		// Flush the working-set sequencer (queued microtasks)
		await timeout(0);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should be revealed by the working set restore'
		);
		assert.ok(
			!setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'auxiliary bar must not be forced visible during working set restore'
		);
	});

	// --- Panel visibility ---

	test('hides panel by default when no record exists', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'));

		setPartHiddenCalls = [];
		activeSessionObs.set(session, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART && c.hidden === true),
			'panel should be hidden by default'
		);
	});

	test('remembers panel visibility per session', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		activeSessionObs.set(session1, undefined);
		onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });

		activeSessionObs.set(session2, undefined);

		setPartHiddenCalls = [];
		activeSessionObs.set(session1, undefined);

		const panelCall = setPartHiddenCalls.find(c => c.part === Parts.PANEL_PART);
		assert.ok(panelCall);
		assert.strictEqual(panelCall!.hidden, false, 'panel should be visible for session 1');
	});

	// --- Storage persistence ---

	test('persists state to sessions.layoutState key', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		activeSessionObs.set(session1, undefined);
		activePaneCompositeId = 'custom.view';

		activeSessionObs.set(session2, undefined);
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const stored = storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'state should be persisted');

		const parsed = JSON.parse(stored!);
		const session1Entry = parsed.find((e: any) => e.sessionResource === 'session:1');
		assert.ok(session1Entry, 'session 1 entry should exist');
		assert.deepStrictEqual(session1Entry.viewState, {
			auxiliaryBarVisible: false,
			auxiliaryBarActiveViewContainerId: 'custom.view',
		});
	});

	test('keeps aux bar hidden after reload when a session with editors closes both editor and aux bar', () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createLayoutController({ useModal: 'some', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		// Session 1 active with an editor open so a working set is saved on switch-away.
		visibleEditorsList = [{}];
		activeSessionObs.set(session1, undefined);
		activeSessionObs.set(session2, undefined);

		// Back to session 1 and hide the aux bar (captured immediately as hidden view state).
		activeSessionObs.set(session1, undefined);
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		// Close all editors, then switch away so the now-empty working set is saved.
		// This deletes the working set; the captured aux view state must survive.
		visibleEditorsList = [];
		activeSessionObs.set(session2, undefined);

		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const stored = storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'state should be persisted');

		// Reload: a fresh controller restores from the persisted state.
		createLayoutController({ useModal: 'some', workspaceFolders, layoutState: JSON.parse(stored!) });
		const reloadedSession1 = makeSession(URI.parse('session:1'));
		setPartHiddenCalls = [];
		openedViews = [];
		openedViewContainers = [];
		activeSessionObs.set(reloadedSession1, undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should remain hidden after reload'
		);
	});

	test('does not reveal the editor part on reload when its working set is restored but the part was hidden', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];

		// Reload: a session has a saved working set (editors were kept open) but the
		// editor part was hidden by the user (e.g. closing the Side Panel). The
		// workbench restores the editor part hidden; the controller must not reveal it.
		const layoutState = [{
			sessionResource: 'session:1',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
			viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: undefined },
		}];
		createLayoutController({ useModal: 'some', workspaceFolders, layoutState });

		partVisibility.set(Parts.EDITOR_PART, false);
		const session1 = makeSession(URI.parse('session:1'));
		setPartHiddenCalls = [];
		activeSessionObs.set(session1, undefined);
		// Flush the working-set sequencer (queued microtasks)
		await timeout(0);

		assert.ok(
			!setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should not be revealed on initial restore'
		);
	});

	test('migrates legacy sessions.workingSets key', () => {
		const legacyData = JSON.stringify([{
			sessionResource: 'session:legacy',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
			auxiliaryBarState: { visible: false, activeViewContainerId: 'legacy.view' },
		}]);

		const tempStorage = store.add(new TestStorageService());
		tempStorage.store('sessions.workingSets', legacyData, StorageScope.WORKSPACE, 0);

		const instaService = store.add(new TestInstantiationService());
		instaService.stub(IStorageService, tempStorage);
		instaService.stub(IConfigurationService, new TestConfigurationService());

		const activeSession = observableValue<IActiveSession | undefined>('active', undefined);
		instaService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSessions() { return []; }
		});
		instaService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly visibleSessions = constObservable([]);
		});
		instaService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override isVisible() { return true; }
			override setPartHidden() { }
			override hasFocus() { return false; }
			override getSize() { return { width: 0, height: 0 }; }
			override setSize() { }
			override readonly onDidChangePartVisibility = Event.None;
		} as Partial<IWorkbenchLayoutService> as IWorkbenchLayoutService);
		instaService.stub(IViewsService, new class extends mock<IViewsService>() {
			override async openViewContainer() { return null; }
			override closeViewContainer() { }
			override async openView() { return null; }
		});
		instaService.stub(IPaneCompositePartService, new class extends mock<IPaneCompositePartService>() {
			override getActivePaneComposite() { return undefined; }
		});
		instaService.stub(IEditorService, new class extends mock<IEditorService>() {
			override get visibleEditors() { return []; }
		});
		instaService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override saveWorkingSet(name: string) { return { id: name, name }; }
			override async applyWorkingSet() { return true; }
			override deleteWorkingSet() { }
		});
		instaService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): IWorkspace { return { id: 'test', folders: [] }; }
		});

		const controller = store.add(instaService.createInstance(LayoutController));

		assert.strictEqual(
			tempStorage.get('sessions.workingSets', StorageScope.WORKSPACE),
			undefined,
			'legacy key should be removed after migration'
		);

		tempStorage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const newStored = tempStorage.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(newStored, 'new key should be written after migration');

		const parsed = JSON.parse(newStored!);
		const entry = parsed.find((e: any) => e.sessionResource === 'session:legacy');
		assert.ok(entry);
		assert.deepStrictEqual(entry.viewState, {
			auxiliaryBarVisible: false,
			auxiliaryBarActiveViewContainerId: 'legacy.view',
		});

		controller.dispose();
	});

	test('no session hides panel', () => {
		createLayoutController();

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART && c.hidden === true),
			'panel should be hidden when no session'
		);
	});
});
