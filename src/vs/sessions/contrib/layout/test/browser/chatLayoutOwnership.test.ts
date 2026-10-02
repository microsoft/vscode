/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IActiveSession, IChatDeletedEvent } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { addPeerChat, createTestHarness, ICreateOptions, ITestLayoutHarness, makePaneComposite, makeSession, setActiveChat, TestStubEditorInput } from './layoutControllerTestUtils.js';

const SIDE_PANE_COMPOSITION_STORAGE_KEY = 'sessions.chatLayout.sidePaneComposition';
const SIDE_PANE_PRE_HIDE_COMPOSITION_STORAGE_KEY = 'sessions.chatLayout.sidePanePreHideComposition';
const CHAT_LAYOUT_STATE_STORAGE_KEY = 'sessions.singlePane.chatLayoutState';

suite('Chat-owned layout (R1/R5/R8/R13)', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class RecordingLogService extends NullLogService {
		readonly errors: unknown[] = [];
		override error(message: unknown): void {
			this.errors.push(message);
		}
	}

	class TestDesktopController extends DesktopLayoutController {
		ownerKeyFor(session: IActiveSession): URI {
			const key = this._ownerKeyFor(session);
			assert.ok(key, 'expected an owner key while chat layout is active');
			return key;
		}
		composition(ownerKey: URI) {
			return this._compositionStore?.get(ownerKey);
		}
		capturedPanelVisibility(ownerKey: URI): boolean | undefined {
			return this._panelVisibilityBySession.get(ownerKey);
		}
		capturedPanelView(ownerKey: URI): string | undefined {
			return this._panelViewBySession.get(ownerKey);
		}
		capturedWorkingSet(ownerKey: URI) {
			return this._workingSets.get(ownerKey);
		}
		preHideComposition(ownerKey: URI) {
			return super.preHideComposition(ownerKey);
		}
	}

	function createDesktopController(options: ICreateOptions = {}): TestDesktopController {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], ...options });
		return store.add(harness.instaService.createInstance(TestDesktopController));
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 6; i++) {
			await timeout(0);
		}
	}

	function visible(): { readonly editor: boolean; readonly auxiliaryBar: boolean } {
		return {
			editor: harness.layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
			auxiliaryBar: harness.layoutService.isVisible(Parts.AUXILIARYBAR_PART),
		};
	}

	function setVisible(editor: boolean, auxiliaryBar: boolean): void {
		harness.layoutService.setPartHidden(!editor, Parts.EDITOR_PART);
		harness.layoutService.setPartHidden(!auxiliaryBar, Parts.AUXILIARYBAR_PART);
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('[R1] disabled: a same-session chat switch never affects the shared composition', async () => {
		createDesktopController({ chatLayoutEnabled: false });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, false);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false });

		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'disabled mode ignores the active chat identity');

		setActiveChat(session, session.mainChat.get());
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false });
	});

	test('[R-seed] enabling chat layout for the first time inherits the existing per-session state from the disabled key, and leaves it intact', async () => {
		const layoutState = [{
			sessionResource: 'session:a',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
		}];
		createDesktopController({ chatLayoutEnabled: true, layoutState });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			[{ id: 'ws-1', name: 'ws-1' }],
			'the main chat (session-keyed owner) must inherit the working set seeded under the disabled-mode key'
		);

		const legacyRaw = harness.storageService.get('sessions.singlePane.layoutState', StorageScope.WORKSPACE);
		assert.notStrictEqual(legacyRaw, undefined, 'the legacy disabled-mode key must survive the one-time copy-forward read');
		assert.deepStrictEqual(JSON.parse(legacyRaw!), layoutState, 'the legacy key\'s content must be unchanged by the read');
	});

	test('[R-seed] a peer chat does not inherit the legacy session-keyed working set on its first visit', async () => {
		const layoutState = [{
			sessionResource: 'session:a',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
		}];
		createDesktopController({ useModal: 'some', chatLayoutEnabled: true, layoutState });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		harness.applyWorkingSetCalls = [];

		setActiveChat(session, peer);
		await settle();

		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			['empty'],
			'a peer chat\'s first visit must not inherit the legacy session-keyed working set'
		);
	});

	test('[R-seed] a fresh controller restores a saved peer chat\'s own composition, working set and panel view, without pruning its entry or touching the main chat\'s legacy state', async () => {
		const layoutState = [{
			sessionResource: 'session:a',
			editorWorkingSet: { id: 'ws-legacy', name: 'ws-legacy' },
		}];
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true, layoutState });
		const firstRunStore = new DisposableStore();
		const controllerA = firstRunStore.add(harness.instaService.createInstance(TestDesktopController));

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		assert.deepStrictEqual(harness.applyWorkingSetCalls, [{ id: 'ws-legacy', name: 'ws-legacy' }], 'the main chat must still inherit the legacy session-keyed working set exactly once');

		setActiveChat(session, peer);
		await settle();
		setVisible(true, true);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.peer'), viewContainerLocation: ViewContainerLocation.Panel });
		await settle();
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/peer-a.txt'))), store.add(new TestStubEditorInput(URI.file('/peer-b.txt')))];
		harness.activeEditorInput = harness.activeGroupEditors[1];
		const peerKey = controllerA.ownerKeyFor(session);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const peerWorkingSetName = harness.saveWorkingSetCalls.at(-1);
		assert.notStrictEqual(peerWorkingSetName, undefined, 'the peer chat\'s own editor working set must be captured while it is the active chat');

		setActiveChat(session, session.mainChat.get());
		await settle();

		const legacyRawBefore = harness.storageService.get('sessions.singlePane.layoutState', StorageScope.WORKSPACE);
		assert.notStrictEqual(legacyRawBefore, undefined, 'the legacy session-keyed key must still exist after a peer chat is visited and switched away from');
		const chatLayoutStateRaw = harness.storageService.get(CHAT_LAYOUT_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.notStrictEqual(chatLayoutStateRaw, undefined, 'the peer chat\'s own working set and panel view must be serialized under the per-chat key before reconstructing storage');
		const compositionRaw = harness.storageService.get(SIDE_PANE_COMPOSITION_STORAGE_KEY, StorageScope.WORKSPACE);
		firstRunStore.dispose();

		const reconstructedStorageService = store.add(new TestStorageService());
		reconstructedStorageService.store('sessions.singlePane.layoutState', legacyRawBefore!, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		reconstructedStorageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, chatLayoutStateRaw!, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		if (compositionRaw !== undefined) {
			reconstructedStorageService.store(SIDE_PANE_COMPOSITION_STORAGE_KEY, compositionRaw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		harness.instaService.set(IStorageService, reconstructedStorageService);
		harness.storageService = reconstructedStorageService;

		const controllerB = store.add(harness.instaService.createInstance(TestDesktopController));
		harness.openPaneCompositeCalls = [];
		harness.applyWorkingSetCalls = [];
		harness.partVisibility.set(Parts.PANEL_PART, false);
		harness.activeGroupEditors = [];
		harness.activeEditorInput = undefined;

		harness.activeSessionObs.set(session, undefined);
		await settle();
		harness.applyWorkingSetCalls = [];
		setActiveChat(session, peer);
		await settle();

		assert.deepStrictEqual(
			{ editor: harness.layoutService.isVisible(Parts.EDITOR_PART, mainWindow), auxiliaryBar: harness.layoutService.isVisible(Parts.AUXILIARYBAR_PART) },
			{ editor: true, auxiliaryBar: true },
			'a fresh controller must restore the saved peer chat\'s own composition, independent of the main chat'
		);
		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			[{ id: peerWorkingSetName, name: peerWorkingSetName }],
			'a fresh controller must restore the saved peer chat\'s own distinct editor working set'
		);
		assert.deepStrictEqual(
			harness.activeGroupEditors.map(editor => editor.resource?.toString()),
			[URI.file('/peer-a.txt').toString(), URI.file('/peer-b.txt').toString()],
			'a fresh controller restoring the peer\'s working set must reopen its exact saved editor resources, not just replay an opaque working-set id'
		);
		assert.strictEqual(
			harness.activeEditorInput?.resource?.toString(),
			URI.file('/peer-b.txt').toString(),
			'a fresh controller restoring the peer\'s working set must also restore its own active tab'
		);
		assert.strictEqual(harness.layoutService.isVisible(Parts.PANEL_PART), true, 'the peer\'s own persisted bottomVisible must be restored once it becomes the active chat');
		assert.deepStrictEqual(
			harness.openPaneCompositeCalls,
			[{ id: 'view.peer', location: ViewContainerLocation.Panel }],
			'restoring the peer\'s persisted bottomVisible must also restore its own panel view, not force it open merely to restore it'
		);
		assert.notStrictEqual(controllerB.composition(peerKey), undefined, 'the peer\'s composition catalog entry must not be pruned by a fresh controller restoring the main chat first');

		const legacyRawAfter = harness.storageService.get('sessions.singlePane.layoutState', StorageScope.WORKSPACE);
		assert.deepStrictEqual(legacyRawAfter, legacyRawBefore, 'restoring a saved peer chat on a fresh controller must not touch the legacy session-keyed key');
	});

	test('[R7] a fresh controller restores a saved peer chat\'s own bottomVisible independently of the main chat and of its panel view', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		const firstRunStore = new DisposableStore();
		const controllerA = firstRunStore.add(harness.instaService.createInstance(TestDesktopController));

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setActiveChat(session, peer);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.peer'), viewContainerLocation: ViewContainerLocation.Panel });
		await settle();
		const peerKey = controllerA.ownerKeyFor(session);

		setActiveChat(session, session.mainChat.get());
		await settle();

		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const chatLayoutStateRaw = harness.storageService.get(CHAT_LAYOUT_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.notStrictEqual(chatLayoutStateRaw, undefined, 'the peer chat\'s own bottomVisible must be serialized under the per-chat key before reconstructing storage');
		assert.ok((JSON.parse(chatLayoutStateRaw!) as { entries: { panelVisible?: boolean }[] }).entries.some(entry => entry.panelVisible === true), 'the serialized per-chat entries must include the peer\'s captured panelVisible');
		firstRunStore.dispose();

		const reconstructedStorageService = store.add(new TestStorageService());
		reconstructedStorageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, chatLayoutStateRaw!, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		harness.instaService.set(IStorageService, reconstructedStorageService);
		harness.storageService = reconstructedStorageService;

		const controllerB = store.add(harness.instaService.createInstance(TestDesktopController));
		harness.partVisibility.set(Parts.PANEL_PART, false);
		harness.setPartHiddenCalls = [];
		harness.openPaneCompositeCalls = [];

		harness.activeSessionObs.set(session, undefined);
		await settle();
		assert.strictEqual(harness.partVisibility.get(Parts.PANEL_PART), false, 'the main chat has no saved bottomVisible and must stay hidden on a fresh restart');
		assert.strictEqual(controllerB.capturedPanelVisibility(peerKey), true, 'the peer\'s own persisted bottomVisible must be loaded from storage even before it becomes the active chat, like its other per-chat state');

		setActiveChat(session, peer);
		await settle();

		assert.strictEqual(harness.partVisibility.get(Parts.PANEL_PART), true, 'switching to the saved peer chat on a fresh controller must restore its own persisted bottomVisible, independent of the main chat');
		assert.deepStrictEqual(
			harness.openPaneCompositeCalls,
			[{ id: 'view.peer', location: ViewContainerLocation.Panel }],
			'restoring bottomVisible must independently also restore the peer\'s own panel view, not just reveal the panel'
		);
	});

	test('[R7] a fresh controller keeps a saved peer\'s hidden bottom hidden without opening its remembered view, then restores that exact view once the bottom is shown', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		const firstRunStore = new DisposableStore();
		const controllerA = firstRunStore.add(harness.instaService.createInstance(TestDesktopController));

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setActiveChat(session, peer);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.custom'), viewContainerLocation: ViewContainerLocation.Panel });
		await settle();
		harness.layoutService.setPartHidden(true, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: false });
		await settle();
		const peerKey = controllerA.ownerKeyFor(session);
		assert.strictEqual(controllerA.capturedPanelView(peerKey), 'view.custom', 'the peer\'s own remembered view must survive re-hiding the panel');

		setActiveChat(session, session.mainChat.get());
		await settle();
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const chatLayoutStateRaw = harness.storageService.get(CHAT_LAYOUT_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.ok((JSON.parse(chatLayoutStateRaw!) as { entries: { panelVisible?: boolean; panelViewContainerId?: string }[] }).entries.some(entry => entry.panelVisible === false && entry.panelViewContainerId === 'view.custom'), 'the serialized per-chat entry must keep bottomVisible false alongside its remembered view, not discard either');
		firstRunStore.dispose();

		const reconstructedStorageService = store.add(new TestStorageService());
		reconstructedStorageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, chatLayoutStateRaw!, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		harness.instaService.set(IStorageService, reconstructedStorageService);
		harness.storageService = reconstructedStorageService;

		const controllerB = store.add(harness.instaService.createInstance(TestDesktopController));
		harness.partVisibility.set(Parts.PANEL_PART, false);
		harness.setPartHiddenCalls = [];
		harness.openPaneCompositeCalls = [];

		harness.activeSessionObs.set(session, undefined);
		await settle();
		setActiveChat(session, peer);
		await settle();

		assert.strictEqual(harness.partVisibility.get(Parts.PANEL_PART), false, 'a fresh controller restoring a peer whose bottom was saved hidden must keep it hidden, not open it to restore the view');
		assert.deepStrictEqual(harness.openPaneCompositeCalls, [], 'the remembered view must not be opened while the bottom stays hidden');
		assert.strictEqual(controllerB.capturedPanelView(peerKey), 'view.custom', 'the peer\'s remembered view must still be loaded from storage even while the bottom is hidden');

		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });
		await settle();

		assert.deepStrictEqual(
			harness.openPaneCompositeCalls,
			[{ id: 'view.custom', location: ViewContainerLocation.Panel }],
			'showing the bottom after a fresh restart must restore the peer\'s exact remembered view that survived reconstruction'
		);
	});

	test('[R7] a well-formed entry followed by a malformed entry discards the whole saved layout record rather than half-applying it', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		harness.storageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, JSON.stringify({
			version: 1,
			entries: [
				{ sessionResource: 'session:a', panelVisible: true },
				{ sessionResource: 'session:b', panelVisible: 'not-a-boolean' },
			],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const logService = new RecordingLogService();
		harness.instaService.set(ILogService, logService);

		const controller = store.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		assert.strictEqual(controller.capturedPanelVisibility(URI.parse('session:a')), undefined, 'a record with any malformed entry must not leave an earlier valid entry partially applied');
		assert.strictEqual(logService.errors.length, 1, 'the malformed entry must be reported, not silently discarded while its valid sibling is kept');
		assert.strictEqual(harness.storageService.get(CHAT_LAYOUT_STATE_STORAGE_KEY, StorageScope.WORKSPACE), undefined, 'the unreadable record must be cleared so it does not keep failing to load');
	});

	test('[R7] a malformed panelVisible value discards the saved layout record instead of silently misreading it', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		harness.storageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, JSON.stringify({
			version: 1,
			entries: [{ sessionResource: 'session:a', panelVisible: 'yes' }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const logService = new RecordingLogService();
		harness.instaService.set(ILogService, logService);

		const controller = store.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		assert.strictEqual(controller.capturedPanelVisibility(URI.parse('session:a')), undefined, 'a non-boolean panelVisible must not be interpreted as valid data');
		assert.strictEqual(logService.errors.length, 1, 'a non-boolean panelVisible must be reported, not coerced or silently accepted');
	});

	test('[R7] a malformed editorWorkingSet shape discards the saved layout record instead of silently misreading it', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		harness.storageService.store(CHAT_LAYOUT_STATE_STORAGE_KEY, JSON.stringify({
			version: 1,
			entries: [{ sessionResource: 'session:a', editorWorkingSet: { id: 'missing-name-field' } }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const logService = new RecordingLogService();
		harness.instaService.set(ILogService, logService);

		const controller = store.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		assert.strictEqual(controller.capturedWorkingSet(URI.parse('session:a')), undefined, 'an editorWorkingSet missing its required name field must not be accepted as valid');
		assert.strictEqual(logService.errors.length, 1, 'a malformed editorWorkingSet shape must be reported, not silently discarded');
	});

	test('[R5] enabled: same-session A/B/A keeps each chat\'s own composition distinct', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const main = session.mainChat.get();
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, true);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true });
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(session)), { editor: true, auxiliaryBar: true });

		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'a peer chat never inherits the main chat\'s composition on first visit');

		setVisible(false, true);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(session)), { editor: false, auxiliaryBar: true });

		setActiveChat(session, main);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true });

		setActiveChat(session, peer);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });

	});

	test('[R5] enabled: toggling the side pane closed on A, visiting B, then reopening the side pane on A restores A\'s own composition', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		setVisible(true, true);
		await settle();
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(sessionA)), { editor: true, auxiliaryBar: true });

		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'toggling closed hides both parts');

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		setVisible(false, true);
		await settle();
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(sessionB)), { editor: false, auxiliaryBar: true });

		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'toggling closed on B hides both parts');

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true }, 'reopening via the real toggle must restore A\'s own composition, not B\'s legacy pre-hide state');
	});

	test('[R5] a fresh controller backed by an independently reconstructed storage service restores A\'s own normal-toggle last-open composition, not B\'s, with no geometry involved', async () => {
		harness = createTestHarness(store, { desktopLayout: true, workspaceFolders: [{ uri: URI.file('/repo') }], chatLayoutEnabled: true });
		const firstRunStore = new DisposableStore();
		const controllerA = firstRunStore.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));
		const ownerKeyA = controllerA.ownerKeyFor(sessionA);
		const ownerKeyB = controllerA.ownerKeyFor(sessionB);
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		setVisible(true, true);
		await settle();
		assert.deepStrictEqual(controllerA.composition(ownerKeyA), { editor: true, auxiliaryBar: true });

		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'closing A via the real toggle hides both parts');
		assert.deepStrictEqual(controllerA.preHideComposition(ownerKeyA), { editor: true, auxiliaryBar: true }, 'A\'s own normal-toggle last-open composition must be captured before the controller is recreated');

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		setVisible(false, true);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'closing B via the real toggle hides both parts and overwrites the shared legacy before-hide cache with B\'s own state, not A\'s');

		const rawCurrent = harness.storageService.get(SIDE_PANE_COMPOSITION_STORAGE_KEY, StorageScope.WORKSPACE);
		const rawPreHide = harness.storageService.get(SIDE_PANE_PRE_HIDE_COMPOSITION_STORAGE_KEY, StorageScope.WORKSPACE);
		assert.notStrictEqual(rawPreHide, undefined, 'a serialized pre-hide composition entry must exist before reconstructing storage');
		firstRunStore.dispose();

		const reconstructedStorageService = store.add(new TestStorageService());
		if (rawCurrent !== undefined) {
			reconstructedStorageService.store(SIDE_PANE_COMPOSITION_STORAGE_KEY, rawCurrent, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		if (rawPreHide !== undefined) {
			reconstructedStorageService.store(SIDE_PANE_PRE_HIDE_COMPOSITION_STORAGE_KEY, rawPreHide, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		harness.instaService.set(IStorageService, reconstructedStorageService);
		harness.storageService = reconstructedStorageService;

		const controllerB = store.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'A\'s own composition at the time it was hidden must be reapplied unchanged by a fresh controller reading the reconstructed storage');

		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true }, 'a fresh controller reading an independently reconstructed storage service must restore A\'s own persisted normal-toggle last-open composition, not B\'s and not a default');
		assert.deepStrictEqual(controllerB.preHideComposition(ownerKeyB), { editor: false, auxiliaryBar: true }, 'B\'s own persisted normal-toggle last-open composition must also survive the reconstruction, unaffected by A\'s restore');
	});

	test('[R5] enabled: all four Editor/Details compositions round-trip per owner', async () => {
		createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const both = addPeerChat(session, URI.parse('chat:both'));
		const editorOnly = addPeerChat(session, URI.parse('chat:editorOnly'));
		const auxOnly = addPeerChat(session, URI.parse('chat:auxOnly'));
		const neither = addPeerChat(session, URI.parse('chat:neither'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		const cases: readonly { readonly chat: IChat; readonly editor: boolean; readonly auxiliaryBar: boolean }[] = [
			{ chat: both, editor: true, auxiliaryBar: true },
			{ chat: editorOnly, editor: true, auxiliaryBar: false },
			{ chat: auxOnly, editor: false, auxiliaryBar: true },
			{ chat: neither, editor: false, auxiliaryBar: false },
		];

		for (const c of cases) {
			setActiveChat(session, c.chat);
			await settle();
			setVisible(c.editor, c.auxiliaryBar);
			await settle();
		}

		for (const c of cases) {
			setActiveChat(session, c.chat);
			await settle();
			assert.deepStrictEqual(visible(), { editor: c.editor, auxiliaryBar: c.auxiliaryBar }, `composition for ${c.chat.resource.toString()} did not round-trip`);
		}
	});

	test('[R5] enabled: focused owner composition round-trips while two sessions are simultaneously visible', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		setVisible(true, true);
		await settle();
		const keyA = controller.ownerKeyFor(sessionA);
		assert.deepStrictEqual(controller.composition(keyA), { editor: true, auxiliaryBar: true });

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		setVisible(false, false);
		await settle();
		const keyB = controller.ownerKeyFor(sessionB);
		assert.deepStrictEqual(controller.composition(keyB), { editor: false, auxiliaryBar: false });

		harness.visibleSessionsObs.set([sessionA, sessionB], undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'becoming multi-visible while B is focused must keep B\'s own composition on screen');

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: true }, 'focusing A while both remain visible must show A\'s own composition');

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: false }, 'focusing B again while both remain visible must hide what A showed and restore B\'s own composition, not merely reveal a superset');
	});

	test('[R5] enabled: focused owner editor working set round-trips while two sessions are simultaneously visible', async () => {
		createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.visibleEditorsList = [{} as never];

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		assert.deepStrictEqual(harness.applyWorkingSetCalls, ['empty'], 'B\'s first visit starts with an empty working set');
		assert.deepStrictEqual(harness.saveWorkingSetCalls, ['session-working-set:session:a'], 'switching away from A must save A\'s working set');
		harness.visibleEditorsList = [{} as never];

		harness.visibleSessionsObs.set([sessionA, sessionB], undefined);
		await settle();
		harness.applyWorkingSetCalls = [];
		harness.saveWorkingSetCalls = [];

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual(harness.saveWorkingSetCalls, ['session-working-set:session:b'], 'switching focus to A while both remain visible must still save B\'s outgoing working set');
		assert.deepStrictEqual(harness.applyWorkingSetCalls, [{ id: 'session-working-set:session:a', name: 'session-working-set:session:a' }], 'switching focus to A while both remain visible must apply A\'s own saved working set');
		harness.visibleEditorsList = [{} as never];
		harness.applyWorkingSetCalls = [];
		harness.saveWorkingSetCalls = [];

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		assert.deepStrictEqual(harness.saveWorkingSetCalls, ['session-working-set:session:a'], 'switching focus back to B while both remain visible must still save A\'s outgoing working set');
		assert.deepStrictEqual(harness.applyWorkingSetCalls, [{ id: 'session-working-set:session:b', name: 'session-working-set:session:b' }], 'switching focus back to B while both remain visible must apply B\'s own saved working set, not A\'s');
	});

	test('[R5] enabled: focused owner panel visibility and view round-trip while two sessions are simultaneously visible', async () => {
		createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });
		await settle();

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		harness.layoutService.setPartHidden(true, Parts.PANEL_PART);
		await settle();

		harness.visibleSessionsObs.set([sessionA, sessionB], undefined);
		await settle();
		assert.strictEqual(harness.layoutService.isVisible(Parts.PANEL_PART), false, 'becoming multi-visible while B is focused must keep B\'s own (hidden) panel state');

		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.strictEqual(harness.layoutService.isVisible(Parts.PANEL_PART), true, 'focusing A while both remain visible must show A\'s own panel');
		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }], 'focusing A while both remain visible must restore A\'s own panel view');

		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		assert.strictEqual(harness.layoutService.isVisible(Parts.PANEL_PART), false, 'focusing B again while both remain visible must hide the panel A showed and restore B\'s own (hidden) state');
	});

	test('[R5] enabled: panel visibility and view changes made while two sessions are simultaneously visible are captured to the focused owner only', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		harness.visibleSessionsObs.set([sessionA, sessionB], undefined);
		await settle();

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		await settle();
		harness.layoutService.setPartHidden(true, Parts.PANEL_PART);
		await settle();
		const aKey = controller.ownerKeyFor(sessionA);
		assert.strictEqual(controller.capturedPanelVisibility(aKey), false, 'hiding the panel while focused on A during multi-visible must capture to A\'s own owner');

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.b'), viewContainerLocation: ViewContainerLocation.Panel });
		await settle();
		const bKey = controller.ownerKeyFor(sessionB);
		assert.strictEqual(controller.capturedPanelVisibility(bKey), true, 'showing the panel while focused on B during multi-visible must capture to B\'s own owner');
		assert.strictEqual(controller.capturedPanelView(bKey), 'view.b', 'opening a panel view while focused on B during multi-visible must capture to B\'s own owner');
		assert.strictEqual(controller.capturedPanelVisibility(aKey), false, 'B\'s captured panel changes while multi-visible must not overwrite A\'s own owner');

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.strictEqual(harness.layoutService.isVisible(Parts.PANEL_PART), false, 'focusing A again after multi-visible capture must restore A\'s own (hidden) panel, not B\'s');
	});

	test('[R8] a confirmed peer-chat deletion clears only that owner\'s composition', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, true);
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		assert.notStrictEqual(controller.composition(mainKey), undefined, 'the main chat\'s composition must be captured before the peer deletion');

		setActiveChat(session, peer);
		await settle();
		setVisible(false, true);
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		assert.notStrictEqual(controller.composition(peerKey), undefined, 'the peer chat\'s composition must be captured before deletion');

		const event: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: peer.resource };
		harness.onDidDeleteChat.fire(event);
		await settle();

		assert.strictEqual(controller.composition(peerKey), undefined, 'a confirmed chat deletion clears its owner composition');
		assert.notStrictEqual(controller.composition(mainKey), undefined, 'the main chat\'s composition is unaffected by a peer deletion');
	});

	test('[R8] a confirmed peer-chat deletion also forgets its captured editor working set and panel visibility/view', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setActiveChat(session, peer);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.peer'), viewContainerLocation: ViewContainerLocation.Panel });
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/peer-handle.txt')))];
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		assert.notStrictEqual(controller.capturedWorkingSet(peerKey), undefined, 'the peer chat\'s editor working set must be captured before deletion');
		assert.strictEqual(controller.capturedPanelVisibility(peerKey), true, 'the peer chat\'s panel visibility must be captured before deletion');
		assert.strictEqual(controller.capturedPanelView(peerKey), 'view.peer', 'the peer chat\'s panel view must be captured before deletion');

		setActiveChat(session, session.mainChat.get());
		await settle();

		const event: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: peer.resource };
		harness.onDidDeleteChat.fire(event);
		await settle();

		assert.strictEqual(controller.capturedWorkingSet(peerKey), undefined, 'a confirmed chat deletion must forget the deleted chat\'s own editor working set, not only its composition');
		assert.strictEqual(controller.capturedPanelVisibility(peerKey), undefined, 'a confirmed chat deletion must forget the deleted chat\'s own panel visibility');
		assert.strictEqual(controller.capturedPanelView(peerKey), undefined, 'a confirmed chat deletion must forget the deleted chat\'s own panel view');
	});

	test('[R8] a confirmed peer-chat deletion deletes only that peer\'s real working-set handle, leaving the main chat\'s handle untouched and still applicable', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/main-handle.txt')))];
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const mainWorkingSet = controller.capturedWorkingSet(mainKey);
		assert.notStrictEqual(mainWorkingSet, undefined, 'the main chat\'s editor working set must be captured before the peer deletion');

		setActiveChat(session, peer);
		await settle();
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/peer-handle.txt')))];
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const peerWorkingSet = controller.capturedWorkingSet(peerKey);
		assert.notStrictEqual(peerWorkingSet, undefined, 'the peer chat\'s editor working set must be captured before its own deletion');

		harness.deleteWorkingSetCalls = [];
		const event: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: peer.resource };
		harness.onDidDeleteChat.fire(event);
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [peerWorkingSet!.id], 'only the deleted peer\'s own working-set handle must reach the real editor-groups deleteWorkingSet call');
		assert.deepStrictEqual(controller.capturedWorkingSet(mainKey), mainWorkingSet, 'the main chat\'s working-set handle must remain untouched by the sibling peer\'s deletion');

		setActiveChat(session, session.mainChat.get());
		harness.applyWorkingSetCalls = [];
		await settle();

		assert.deepStrictEqual(harness.applyWorkingSetCalls, [mainWorkingSet], 'returning to the main chat after the peer\'s deletion must still apply the main chat\'s original, still-live working-set handle');
	});

	test('[R8] a draft promotion carries a peer chat\'s editor working set and panel visibility/view to its new owner key', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Completed });
		const draftPeer = addPeerChat(draft, URI.parse('chat:draftPeer'));
		harness.activeSessionObs.set(draft, undefined);
		await settle();

		setActiveChat(draft, draftPeer);
		await settle();
		harness.layoutService.setPartHidden(false, Parts.PANEL_PART);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.draftPeer'), viewContainerLocation: ViewContainerLocation.Panel });
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/draft-peer-handle.txt')))];
		await settle();
		const oldKey = controller.ownerKeyFor(draft);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const oldWorkingSet = controller.capturedWorkingSet(oldKey);
		assert.notStrictEqual(oldWorkingSet, undefined, 'the draft peer chat\'s editor working set must be captured before promotion');

		const committed = makeSession(URI.parse('session:committed'));
		const committedPeer = addPeerChat(committed, draftPeer.resource);
		harness.onDidReplaceSession.fire({ from: draft, to: committed });
		harness.activeSessionObs.set(committed, undefined);
		await settle();
		setActiveChat(committed, committedPeer);
		await settle();

		const newKey = controller.ownerKeyFor(committed);
		assert.deepStrictEqual(controller.capturedWorkingSet(newKey), oldWorkingSet, 'the promoted peer chat keeps its pre-commit editor working set under its new owner key');
		assert.strictEqual(controller.capturedPanelVisibility(newKey), true, 'the promoted peer chat keeps its pre-commit panel visibility under its new owner key');
		assert.strictEqual(controller.capturedPanelView(newKey), 'view.draftPeer', 'the promoted peer chat keeps its pre-commit panel view under its new owner key');
		assert.strictEqual(controller.capturedWorkingSet(oldKey), undefined, 'the stale draft owner key\'s editor working set is forgotten');
		assert.strictEqual(controller.capturedPanelVisibility(oldKey), undefined, 'the stale draft owner key\'s panel visibility is forgotten');
		assert.strictEqual(controller.capturedPanelView(oldKey), undefined, 'the stale draft owner key\'s panel view is forgotten');
	});

	test('[R8] a confirmed peer-chat deletion also forgets its normal-toggle last-open composition cache', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		setVisible(true, true);
		await settle();

		setActiveChat(session, peer);
		await settle();
		setVisible(true, false);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		assert.deepStrictEqual(controller.preHideComposition(peerKey), { editor: true, auxiliaryBar: false }, 'closing the side pane on the peer chat must capture its last-open composition');

		const event: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: peer.resource };
		harness.onDidDeleteChat.fire(event);
		await settle();

		assert.strictEqual(controller.preHideComposition(peerKey), undefined, 'a confirmed chat deletion must also forget its last-open toggle cache, not only its composition catalog entry');
	});

	test('[R8] a draft promotion carries a peer chat\'s normal-toggle last-open composition to its new owner key', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Completed });
		const draftPeer = addPeerChat(draft, URI.parse('chat:draftPeer'));
		harness.activeSessionObs.set(draft, undefined);
		await settle();
		setActiveChat(draft, draftPeer);
		await settle();
		setVisible(false, true);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		const oldKey = controller.ownerKeyFor(draft);
		assert.deepStrictEqual(controller.preHideComposition(oldKey), { editor: false, auxiliaryBar: true }, 'closing the side pane on the draft peer chat must capture its last-open composition');

		const committed = makeSession(URI.parse('session:committed'));
		const committedPeer = addPeerChat(committed, draftPeer.resource);
		harness.onDidReplaceSession.fire({ from: draft, to: committed });
		harness.activeSessionObs.set(committed, undefined);
		await settle();
		setActiveChat(committed, committedPeer);
		await settle();

		const newKey = controller.ownerKeyFor(committed);
		assert.deepStrictEqual(controller.preHideComposition(newKey), { editor: false, auxiliaryBar: true }, 'the promoted peer chat keeps its last-open toggle cache under its new owner key');
		assert.strictEqual(controller.preHideComposition(oldKey), undefined, 'the stale draft owner key\'s toggle cache is forgotten');
	});

	test('[R8] a draft promotion carries a peer chat\'s composition to its new owner key', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Completed });
		const draftPeer = addPeerChat(draft, URI.parse('chat:draftPeer'));
		harness.activeSessionObs.set(draft, undefined);
		await settle();

		setActiveChat(draft, draftPeer);
		await settle();
		setVisible(true, true);
		await settle();
		const oldKey = controller.ownerKeyFor(draft);
		assert.notStrictEqual(controller.composition(oldKey), undefined);

		const committed = makeSession(URI.parse('session:committed'));
		const committedPeer = addPeerChat(committed, draftPeer.resource);
		harness.onDidReplaceSession.fire({ from: draft, to: committed });
		harness.activeSessionObs.set(committed, undefined);
		await settle();
		setActiveChat(committed, committedPeer);
		await settle();

		const newKey = controller.ownerKeyFor(committed);
		assert.notStrictEqual(newKey.toString(), oldKey.toString());
		assert.deepStrictEqual(controller.composition(newKey), { editor: true, auxiliaryBar: true }, 'the promoted peer chat keeps its pre-commit composition under its new owner key');
		assert.strictEqual(controller.composition(oldKey), undefined, 'the stale draft owner key is forgotten');
	});

	test('[R8] toggling the side pane while a Quick Chat is active does not capture its composition into the durable owner catalog', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const quickChat = makeSession(URI.parse('session:quick'), { isQuickChat: true });
		harness.activeSessionObs.set(quickChat, undefined);
		await settle();
		setVisible(true, true);
		await settle();

		setVisible(true, false);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();

		const quickChatKey = controller.ownerKeyFor(quickChat);
		assert.strictEqual(controller.preHideComposition(quickChatKey), undefined, 'a Quick Chat side-pane toggle must not populate the durable owner last-open cache');
		assert.strictEqual(controller.composition(quickChatKey), undefined, 'a Quick Chat side-pane toggle must not populate the durable owner composition catalog');
	});

	test('[R13] entering a phone layout freezes the on-screen composition; exiting resumes the focused chat\'s own composition', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const main = session.mainChat.get();
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, true);
		await settle();
		setVisible(true, false);
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		setActiveChat(session, peer);
		await settle();
		setVisible(false, true);
		await settle();
		const peerKey = controller.ownerKeyFor(session);
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true });

		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'suspension must not apply the shared session composition on entry');

		setActiveChat(session, main);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'a focus change while suspended must not trigger a restore');

		setVisible(true, true);
		await settle();
		assert.deepStrictEqual(controller.composition(mainKey), { editor: true, auxiliaryBar: false }, 'a toggle while suspended must not overwrite the focused owner\'s stored composition');
		assert.deepStrictEqual(controller.composition(peerKey), { editor: false, auxiliaryBar: true }, 'a toggle while suspended must not overwrite the other owner\'s stored composition either');

		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'resuming applies the focused owner\'s own composition, not the transient suspended state');
	});

	test('[R13] a normal toggle while suspended neither writes a stale last-open cache entry nor loses the one captured before suspension', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const main = session.mainChat.get();
		harness.activeSessionObs.set(session, undefined);
		await settle();
		setVisible(true, false);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		assert.deepStrictEqual(controller.preHideComposition(mainKey), { editor: true, auxiliaryBar: false }, 'closing the side pane before suspension must capture the focused owner\'s last-open composition');

		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		setVisible(true, true);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(controller.preHideComposition(mainKey), { editor: true, auxiliaryBar: false }, 'toggles made while suspended must not overwrite the pre-suspension last-open cache, even when the on-screen composition differs while suspended');

		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();
		setActiveChat(session, main);
		await settle();
		harness.layoutService.toggleSidePane();
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'resuming and reopening must still restore the pre-suspension last-open composition, not a stale state leaked from the suspension');
	});

	test('[R13] a phone transition while B is focused never reads or writes under A\'s (the main chat\'s) owner key', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		const peer = addPeerChat(session, URI.parse('chat:peer'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		setVisible(true, true);
		await settle();
		const mainKey = controller.ownerKeyFor(session);
		const mainComposition = controller.composition(mainKey);

		setActiveChat(session, peer);
		await settle();
		setVisible(false, false);
		await settle();

		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();
		setVisible(true, false);
		await settle();
		setVisible(false, true);
		await settle();
		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();

		assert.deepStrictEqual(controller.composition(mainKey), mainComposition, 'the main chat\'s own composition must be unaffected by a suspension that occurred while a peer chat was focused');
	});

	test('[R13] a session switch while suspended does not apply any composition, and resumes with the newly focused session\'s own composition', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		setVisible(true, false);
		await settle();
		const keyA = controller.ownerKeyFor(sessionA);
		const compositionA = controller.composition(keyA);

		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		setVisible(false, true);
		await settle();
		const keyB = controller.ownerKeyFor(sessionB);
		const compositionB = controller.composition(keyB);

		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'suspension must not change the on-screen composition on entry');

		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: false, auxiliaryBar: true }, 'a session switch while suspended must not apply the newly focused session\'s composition');
		assert.deepStrictEqual(controller.composition(keyA), compositionA, 'a session switch while suspended must not overwrite the switched-to session\'s stored composition');
		assert.deepStrictEqual(controller.composition(keyB), compositionB, 'a session switch while suspended must not overwrite the switched-from session\'s stored composition');

		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();
		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'resuming applies the now-focused session A\'s own composition, not the transient suspended on-screen state');
	});

	test('[R13] resuming re-applies the focused owner\'s own composition even when the owner key is unchanged across the suspension', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const session = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		setVisible(true, true);
		await settle();
		setVisible(true, false);
		await settle();
		const ownerKey = controller.ownerKeyFor(session);
		assert.deepStrictEqual(controller.composition(ownerKey), { editor: true, auxiliaryBar: false });

		harness.chatLayoutIsPhoneObs.set(true, undefined);
		await settle();

		setVisible(false, true);
		await settle();
		assert.deepStrictEqual(controller.composition(ownerKey), { editor: true, auxiliaryBar: false }, 'suspension must not overwrite the stored composition');

		harness.chatLayoutIsPhoneObs.set(false, undefined);
		await settle();

		assert.deepStrictEqual(visible(), { editor: true, auxiliaryBar: false }, 'resuming with the same owner still focused must re-apply its own composition, not leave the stale phone-era on-screen state');
	});

	test('[R8] a working-set handle still referenced by the frozen legacy (disabled-mode) storage key survives an ordinary outgoing save that overwrites the enabled-mode owner\'s copy, and the fresh replacement handle is still correctly freed once unreferenced', async () => {
		const legacyWorkingSet = { id: 'legacy-handle', name: 'legacy-handle' };
		const controller = createDesktopController({
			chatLayoutEnabled: true,
			layoutState: [{ sessionResource: 'session:a', editorWorkingSet: legacyWorkingSet }],
		});
		await settle();

		const session = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		const key = controller.ownerKeyFor(session);
		assert.deepStrictEqual(controller.capturedWorkingSet(key), legacyWorkingSet, 'the frozen legacy working set must be copied forward into the enabled-mode owner on first load');

		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/new-main-content.txt')))];
		await settle();
		const other = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(other, undefined);
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [], 'overwriting a working set still referenced by the frozen legacy storage key must not call the destructive deleteWorkingSet API');
		const refreshedWorkingSet = controller.capturedWorkingSet(key);
		assert.notStrictEqual(refreshedWorkingSet?.id, legacyWorkingSet.id, 'the outgoing save must have captured a fresh working set distinct from the legacy-referenced one');

		harness.onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [refreshedWorkingSet!.id], 'a unique, unreferenced working-set handle must still be destroyed exactly once when its owner is actually removed');
	});

	test('[R8] deleting a session\'s main chat entity clears its own tracked working set like any other owner, but never destroys a handle still referenced by the frozen legacy storage key', async () => {
		const legacyWorkingSet = { id: 'legacy-handle', name: 'legacy-handle' };
		const controller = createDesktopController({
			chatLayoutEnabled: true,
			layoutState: [{ sessionResource: 'session:a', editorWorkingSet: legacyWorkingSet }],
		});
		await settle();

		const session = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		const key = controller.ownerKeyFor(session);
		assert.deepStrictEqual(controller.capturedWorkingSet(key), legacyWorkingSet, 'the frozen legacy working set must be copied forward into the enabled-mode owner on first load');

		const mainChatDeleted: IChatDeletedEvent = { session, sessionResource: session.resource, chatResource: session.mainChat.get().resource };
		harness.onDidDeleteChat.fire(mainChatDeleted);
		await settle();

		assert.strictEqual(controller.capturedWorkingSet(key), undefined, 'deleting the main chat entity must clear its own tracked working set like any other owner, per R8');
		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [], 'the destructive deleteWorkingSet API must not be called while the frozen legacy storage key still references the handle');

		harness.onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [], 'the session itself is removed after its main chat entity was already forgotten, so there is no live owner reference left to delete and the legacy-referenced handle must remain untouched');
	});

	test('[R8] a promotion that collapses a peer chat onto an already-used owner key never calls the destructive deleteWorkingSet API on the incoming handle, correctly frees the orphaned pre-existing destination handle it overwrites, and still cleans up the surviving handle exactly once on later removal', async () => {
		const controller = createDesktopController({ chatLayoutEnabled: true });
		await settle();

		const shared = makeSession(URI.parse('chat:shared'));
		harness.activeSessionObs.set(shared, undefined);
		await settle();
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/legacy-handle.txt')))];
		await settle();
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const legacyKey = controller.ownerKeyFor(shared);
		const preExistingDestinationWorkingSet = controller.capturedWorkingSet(legacyKey);
		assert.notStrictEqual(preExistingDestinationWorkingSet, undefined, 'the pre-promotion session\'s editor working set must be captured at the shared owner key');

		const draft = makeSession(URI.parse('session:draft'));
		const draftPeer = addPeerChat(draft, URI.parse('chat:shared'));
		harness.activeSessionObs.set(draft, undefined);
		await settle();
		setActiveChat(draft, draftPeer);
		await settle();
		harness.visibleEditorsList = [{} as never];
		harness.activeGroupEditors = [store.add(new TestStubEditorInput(URI.file('/draft-peer-handle.txt')))];
		await settle();
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const draftKey = controller.ownerKeyFor(draft);
		const peerWorkingSet = controller.capturedWorkingSet(draftKey);
		assert.notStrictEqual(peerWorkingSet, undefined, 'the draft peer chat\'s editor working set must be captured before promotion');
		assert.notStrictEqual(peerWorkingSet!.id, preExistingDestinationWorkingSet!.id, 'the promoted peer handle and the pre-existing destination handle must be genuinely distinct for this to be a meaningful collision test');

		harness.deleteWorkingSetCalls.length = 0;
		harness.onDidReplaceSession.fire({ from: draft, to: shared });
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [preExistingDestinationWorkingSet!.id], 'the promotion must never destroy the incoming peer handle it is installing, but the pre-existing destination handle it overwrites is now unreferenced by anything and must be correctly freed exactly once, not leaked');
		assert.deepStrictEqual(controller.capturedWorkingSet(legacyKey), peerWorkingSet, 'the promoted peer chat\'s working set becomes the tracked working set at the collapsed shared owner key');

		harness.onDidChangeSessions.fire({ added: [], removed: [shared], changed: [] });
		await settle();

		assert.deepStrictEqual(harness.deleteWorkingSetCalls, [preExistingDestinationWorkingSet!.id, peerWorkingSet!.id], 'removing the session later still correctly deletes its (now-promoted) surviving working-set handle exactly once, and does not re-delete the already-freed orphan');
	});

	test('[R7] a persisted peer-chat owner record survives before the peer is known to the session\'s chat catalog, and restores once the peer is observed and focused', async () => {
		const sessionResource = URI.parse('session:a');
		const peerResource = URI.parse('chat:peer');
		const peerKey = URI.from({
			scheme: 'vscode-chat-layout-owner',
			path: `/${encodeURIComponent(sessionResource.toString())}/${encodeURIComponent(peerResource.toString())}`,
		});

		harness = createTestHarness(store, { desktopLayout: true, chatLayoutEnabled: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		harness.storageService.store(
			CHAT_LAYOUT_STATE_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				entries: [{ sessionResource: peerKey.toString(), editorWorkingSet: { id: 'ws-peer', name: 'ws-peer' }, panelViewContainerId: 'view.peer', panelVisible: false }],
			}),
			StorageScope.WORKSPACE,
			0
		);
		harness.storageService.store(
			SIDE_PANE_COMPOSITION_STORAGE_KEY,
			JSON.stringify({ version: 1, entries: [[peerKey.toString(), { editor: false, auxiliaryBar: true }]] }),
			StorageScope.WORKSPACE,
			0
		);
		const controller = store.add(harness.instaService.createInstance(TestDesktopController));
		await settle();

		const session = makeSession(sessionResource);
		harness.activeSessionObs.set(session, undefined);
		await settle();

		assert.strictEqual(controller.capturedWorkingSet(peerKey)?.id, 'ws-peer', 'the persisted peer owner record must survive controller startup even though the peer chat is not yet present in the session\'s chat catalog');
		assert.strictEqual(controller.capturedPanelView(peerKey), 'view.peer', 'the persisted peer panel view must survive controller startup before the peer is known to the catalog');
		assert.strictEqual(controller.capturedPanelVisibility(peerKey), false, 'the persisted peer panel visibility must survive controller startup before the peer is known to the catalog');
		assert.deepStrictEqual(controller.composition(peerKey), { editor: false, auxiliaryBar: true }, 'the persisted peer composition must survive controller startup before the peer is known to the catalog');

		harness.applyWorkingSetCalls = [];
		const peer = addPeerChat(session, peerResource);
		setActiveChat(session, peer);
		await settle();

		assert.deepStrictEqual(harness.applyWorkingSetCalls, [{ id: 'ws-peer', name: 'ws-peer' }], 'once the peer actually appears in the session\'s chat catalog and is focused, its persisted editor working set is restored');
		assert.strictEqual(harness.partVisibility.get(Parts.PANEL_PART), false, 'the peer\'s persisted hidden panel visibility is applied on focus, not left at a default');
		assert.deepStrictEqual(controller.composition(controller.ownerKeyFor(session)), { editor: false, auxiliaryBar: true }, 'focusing the peer chat restores its own persisted composition, not a default');
	});
});

