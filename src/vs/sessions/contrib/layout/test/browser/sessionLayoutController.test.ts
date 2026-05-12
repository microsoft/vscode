/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IPaneComposite } from '../../../../../workbench/common/panecomposite.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { LayoutController } from '../../browser/sessionLayoutController.js';
import { CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
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
		changesets: observableValue('changesets', []),
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
			label: 'test',
			icon: Codicon.repo,
			repositories: [{ uri: URI.file('/repo'), workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
			requiresWorkspaceTrust: false,
		}),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: chat.changesets,
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('loading', false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		gitHubInfo: observableValue('gitHubInfo', undefined),
		chats: observableValue('chats', [chat]),
		activeChat: observableValue('activeChat', chat),
		mainChat: chat,
		capabilities: { supportsMultipleChats: false },
	};
}

suite('LayoutController', () => {

	const store = new DisposableStore();
	let activeSessionObs: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	let onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	let onDidChangePartVisibility: Emitter<IPartVisibilityChangeEvent>;
	let onDidSubmitRequest: Emitter<{ chatSessionResource: URI }>;
	let storageService: TestStorageService;
	let partVisibility: Map<Parts, boolean>;
	let openedViewContainers: string[];
	let openedViews: string[];
	let setPartHiddenCalls: { hidden: boolean; part: Parts }[];
	let activePaneCompositeId: string | undefined;

	function createLayoutController(): LayoutController {
		const instaService = store.add(new TestInstantiationService());

		storageService = store.add(new TestStorageService());
		instaService.stub(IStorageService, storageService);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('workbench.editor.useModal', 'all');
		instaService.stub(IConfigurationService, configService);

		activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', undefined);
		onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());

		instaService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = activeSessionObs;
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSessions() { return []; }
		});

		onDidSubmitRequest = store.add(new Emitter<{ chatSessionResource: URI }>());
		instaService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = onDidSubmitRequest.event;
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
				partVisibility.set(part, !hidden);
			}
			override hasFocus(_part: Parts): boolean { return false; }
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
		instaService.stub(IPaneCompositePartService, new class extends mock<IPaneCompositePartService>() {
			override getActivePaneComposite(_location: ViewContainerLocation): IPaneComposite | undefined {
				if (activePaneCompositeId) {
					return { getId: () => activePaneCompositeId! } as IPaneComposite;
				}
				return undefined;
			}
		});

		instaService.stub(IEditorService, new class extends mock<IEditorService>() {
			override get visibleEditors() { return []; }
		});

		instaService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override saveWorkingSet(name: string): IEditorWorkingSet { return { id: name, name }; }
			override async applyWorkingSet() { return true; }
			override deleteWorkingSet() { }
		});

		instaService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): IWorkspace { return { id: 'test', folders: [] }; }
		});

		return store.add(instaService.createInstance(LayoutController));
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Auxiliary bar view state ---

	test('shows files view for session with workspace and no changes', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'));
		activeSessionObs.set(session, undefined);

		assert.ok(openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
	});

	test('shows changes view for session with changes', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), {
			changes: [makeChange('/file.ts')],
		});
		activeSessionObs.set(session, undefined);

		assert.ok(openedViews.includes(CHANGES_VIEW_ID));
	});

	test('shows files view for untitled session', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		activeSessionObs.set(session, undefined);

		assert.ok(openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
	});

	test('does not open views when session has no workspace', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'), {
			workspace: { label: 'test', icon: Codicon.repo, repositories: [], requiresWorkspaceTrust: false },
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

		activeSessionObs.set(session2, undefined);

		openedViewContainers = [];
		activeSessionObs.set(session1, undefined);

		assert.ok(
			openedViewContainers.includes('some.custom.view'),
			'should restore active view container when returning to session 1'
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

	// --- Turn completion ---

	test('shows aux bar when turn completes with new changes', () => {
		createLayoutController();
		const session = makeSession(URI.parse('session:1'));
		activeSessionObs.set(session, undefined);

		onDidSubmitRequest.fire({ chatSessionResource: session.resource });

		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(), undefined);

		assert.ok(
			setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'aux bar should be shown after turn with new changes'
		);
	});

	test('clears saved state when turn produces new changes', () => {
		createLayoutController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		activeSessionObs.set(session1, undefined);
		partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		activeSessionObs.set(session2, undefined);
		activeSessionObs.set(session1, undefined);

		onDidSubmitRequest.fire({ chatSessionResource: session1.resource });
		(session1.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/new.ts')], undefined);
		(session1.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(), undefined);

		activeSessionObs.set(session2, undefined);

		setPartHiddenCalls = [];
		openedViews = [];
		activeSessionObs.set(session1, undefined);

		assert.ok(
			openedViews.includes(CHANGES_VIEW_ID),
			'should show changes view since saved state was cleared after turn with new changes'
		);
		assert.ok(
			!setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should not be hidden since saved state was cleared'
		);
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
			auxiliaryBarVisible: true,
			auxiliaryBarActiveViewContainerId: 'custom.view',
		});
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
			override activeSession = activeSession;
			override readonly onDidChangeSessions = Event.None;
			override getSessions() { return []; }
		});
		instaService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
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
