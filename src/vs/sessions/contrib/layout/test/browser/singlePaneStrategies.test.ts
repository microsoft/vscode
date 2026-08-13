/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { SinglePaneDetailPanelCoordinator } from '../../browser/singlePane/singlePaneDetailPanelCoordinator.js';
import { SinglePaneExistingSessionStrategy } from '../../browser/singlePane/singlePaneExistingSessionStrategy.js';
import { ISinglePaneLayoutContext } from '../../browser/singlePane/singlePaneLayoutStrategy.js';
import { SinglePaneNewSessionStrategy } from '../../browser/singlePane/singlePaneNewSessionStrategy.js';
import { SinglePaneQuickChatStrategy } from '../../browser/singlePane/singlePaneQuickChatStrategy.js';
import { SessionVisibilityProfile, SinglePaneVisibilityProfileStore } from '../../browser/singlePane/singlePaneVisibilityProfileStore.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeSession, TestStubEditorInput } from './layoutControllerTestUtils.js';

interface ITestContextState {
	isRestoringSessionLayout: boolean;
	togglingSidePane: boolean;
	setHasSavedWorkingSet(sessionResource: URI, hasSavedWorkingSet: boolean): void;
	endSessionLayoutRestore(): void;
}

function createStrategyTestContext(store: DisposableStore, harness: ITestLayoutHarness): { readonly ctx: ISinglePaneLayoutContext; readonly state: ITestContextState } {
	const onDidEndSessionLayoutRestore = store.add(new Emitter<void>());
	const savedWorkingSets = new Set<string>();
	const state: ITestContextState = {
		isRestoringSessionLayout: false,
		togglingSidePane: false,
		setHasSavedWorkingSet: (sessionResource, hasSavedWorkingSet) => {
			const key = sessionResource.toString();
			if (hasSavedWorkingSet) {
				savedWorkingSets.add(key);
			} else {
				savedWorkingSets.delete(key);
			}
		},
		endSessionLayoutRestore: () => onDidEndSessionLayoutRestore.fire(),
	};
	const ctx: ISinglePaneLayoutContext = {
		get isRestoringSessionLayout() { return state.isRestoringSessionLayout; },
		withSessionLayoutRestore: work => {
			const wasRestoring = state.isRestoringSessionLayout;
			state.isRestoringSessionLayout = true;
			const done = () => {
				state.isRestoringSessionLayout = wasRestoring;
				onDidEndSessionLayoutRestore.fire();
			};
			try {
				const result = work();
				if (result instanceof Promise) {
					void result.finally(done);
				} else {
					done();
				}
			} catch (error) {
				done();
				throw error;
			}
		},
		onDidEndSessionLayoutRestore: onDidEndSessionLayoutRestore.event,
		get togglingSidePane() { return state.togglingSidePane; },
		multipleSessionsVisibleObs: derived(reader => harness.visibleSessionsObs.read(reader).length > 1),
		activeSessionResourceObs: derived(reader => harness.activeSessionObs.read(reader)?.resource),
		hasSavedWorkingSet: sessionResource => savedWorkingSets.has(sessionResource.toString()),
	};
	return { ctx, state };
}

suite('SinglePane layout strategies', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: ICreateOptions = {}): ISinglePaneLayoutContext {
		harness = createTestHarness(store, options);
		return createStrategyTestContext(store, harness).ctx;
	}

	function activate(session: IActiveSession | undefined): void {
		harness.activeSessionObs.set(session, undefined);
		harness.visibleSessionsObs.set(session ? [session] : [], undefined);
	}

	function createDetailPanel(): SinglePaneDetailPanelCoordinator {
		return store.add(harness.instaService.createInstance(SinglePaneDetailPanelCoordinator));
	}

	function createVisibilityStore(): SinglePaneVisibilityProfileStore {
		return harness.instaService.createInstance(SinglePaneVisibilityProfileStore);
	}

	test('Existing Session toggles only the detail panel', () => {
		const ctx = setup();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		const strategy = store.add(harness.instaService.createInstance(
			SinglePaneExistingSessionStrategy,
			ctx,
			harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
			createDetailPanel()
		));
		harness.setPartHiddenCalls.length = 0;

		const nowVisible = strategy.toggleDetails();

		assert.deepStrictEqual({ nowVisible, calls: harness.setPartHiddenCalls }, {
			nowVisible: true,
			calls: [{ hidden: false, part: Parts.AUXILIARYBAR_PART }],
		});
	});

	test('New Session entry hides Editor when Empty Files is the only input', () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/new'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, session.workspace.get())));
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
		harness.setPartHiddenCalls.length = 0;

		activate(session);

		assert.deepStrictEqual(harness.setPartHiddenCalls.filter(call => call.part === Parts.EDITOR_PART), [
			{ hidden: true, part: Parts.EDITOR_PART },
		]);
	});

	test('New Session close fallback replaces the last file and opens Details', async () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/new'), { status: SessionStatus.Untitled, isCreated: false });
		const editor = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
		activate(session);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.activeGroupEditors.length = 0;
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });
		const replacementDuringClose = harness.activeGroupEditors.find(input => input instanceof EmptyFileEditorInput);
		harness.onDidEditorsChange.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			replacementPreservedAfterClose: replacementDuringClose === harness.activeGroupEditors[0],
			editorsAfterCloseCompleted: harness.activeGroupEditors.map(input => input.typeId),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			replacementPreservedAfterClose: true,
			editorsAfterCloseCompleted: [EmptyFileEditorInput.ID],
			editorVisible: true,
			auxiliaryBarVisible: true,
		});
	});

	test('New Session closes the side pane when Empty Files is closed', () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/new'), { status: SessionStatus.Untitled, isCreated: false });
		const editor = store.add(harness.instaService.createInstance(EmptyFileEditorInput, session.workspace.get()));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
		activate(session);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		harness.activeGroupEditors.length = 0;
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('New Session rules are inert outside the New Session view', async () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/existing'));
		const editor = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
		activate(session);
		harness.setPartHiddenCalls.length = 0;
		harness.openedViewContainers.length = 0;

		harness.activeGroupEditors.length = 0;
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });
		harness.onDidToggleSidePane.fire({
			before: { editor: false, auxiliaryBar: false },
			after: { editor: true, auxiliaryBar: false },
		});
		harness.onWillOpenEditor.fire({ editor, groupId: 1 });
		await Promise.resolve();

		assert.deepStrictEqual({
			hasEmptyFiles: harness.activeGroupEditors.some(input => input instanceof EmptyFileEditorInput),
			partVisibilityChanges: harness.setPartHiddenCalls,
			openedViewContainers: harness.openedViewContainers,
		}, {
			hasEmptyFiles: false,
			partVisibilityChanges: [],
			openedViewContainers: [],
		});
	});

	test('Existing Session closes the side pane when its last editor closes', async () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/existing'));
		const editor = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(
			SinglePaneExistingSessionStrategy,
			ctx,
			harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
			createDetailPanel()
		));
		activate(session);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		harness.activeGroupEditors.length = 0;
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });
		harness.onDidEditorsChange.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('Existing Session keeps the side pane open when multiple sessions are visible', async () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/existing'));
		const otherSession = makeSession(URI.parse('session:/other'));
		const editor = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(
			SinglePaneExistingSessionStrategy,
			ctx,
			harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
			createDetailPanel()
		));
		harness.activeSessionObs.set(session, undefined);
		harness.visibleSessionsObs.set([session, otherSession], undefined);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls.length = 0;

		harness.activeGroupEditors.length = 0;
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });
		harness.onDidEditorsChange.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			visibilityChanges: harness.setPartHiddenCalls,
		}, {
			editorVisible: true,
			auxiliaryBarVisible: true,
			visibilityChanges: [],
		});
	});

	test('Quick Chat hides the side pane once on entry', async () => {
		const ctx = setup();
		const editor = store.add(new TestStubEditorInput(URI.parse('search-editor://outgoing')));
		harness.activeGroupEditors.push(editor);
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = editor;
		store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), createVisibilityStore()));
		activate(makeSession(URI.parse('session:/workspace')));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls.length = 0;

		activate(makeSession(URI.parse('session:/quick'), { isQuickChat: true }));
		await Promise.resolve();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hideOrder: harness.setPartHiddenCalls.filter(call => call.hidden),
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
			hideOrder: [
				{ part: Parts.EDITOR_PART, hidden: true },
				{ part: Parts.AUXILIARYBAR_PART, hidden: true },
			],
		});

		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.setPartHiddenCalls.length = 0;
		harness.onDidEditorsChange.fire();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			visibilityChanges: harness.setPartHiddenCalls,
		}, {
			editorVisible: true,
			visibilityChanges: [],
		});
	});

	test('Quick Chat reveals its restored editors after layout restoration settles', () => {
		harness = createTestHarness(store);
		const { ctx, state } = createStrategyTestContext(store, harness);
		const quickChat = makeSession(URI.parse('session:/quick'), { isQuickChat: true });
		state.setHasSavedWorkingSet(quickChat.resource, true);
		const visibilityStore = createVisibilityStore();
		visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: false });
		store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));

		activate(makeSession(URI.parse('session:/workspace')));
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		activate(quickChat);
		const restoredEditor = store.add(new TestStubEditorInput(URI.parse('browser://restored')));
		harness.activeGroupEditors.push(restoredEditor);
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = restoredEditor;
		harness.setPartHiddenCalls.length = 0;

		state.endSessionLayoutRestore();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			visibilityChanges: harness.setPartHiddenCalls,
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
			visibilityChanges: [],
		});

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls.length = 0;
		state.endSessionLayoutRestore();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			visibilityChanges: harness.setPartHiddenCalls,
		}, {
			editorVisible: false,
			visibilityChanges: [],
		});
	});

	test('Quick Chat records a newly opened editor before its first switch', () => {
		harness = createTestHarness(store);
		const { ctx, state } = createStrategyTestContext(store, harness);
		const newQuickChat = makeSession(URI.parse('session:/new-quick'), { isQuickChat: true });
		const restoredQuickChat = makeSession(URI.parse('session:/restored-quick'), { isQuickChat: true });
		state.setHasSavedWorkingSet(restoredQuickChat.resource, true);
		const visibilityStore = createVisibilityStore();
		visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: false });
		store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));

		activate(newQuickChat);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		const openedEditor = store.add(new TestStubEditorInput(URI.parse('browser://new')));
		harness.activeGroupEditors.push(openedEditor);
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = openedEditor;
		harness.onDidEditorsChange.fire();

		activate(restoredQuickChat);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: false,
			sharedVisibility: { editorVisible: true, auxiliaryBarVisible: false },
		});
	});

	test('Quick Chat shares side-pane visibility without persisting an editorless hide', () => {
		harness = createTestHarness(store);
		const { ctx, state } = createStrategyTestContext(store, harness);
		const emptyQuickChat = makeSession(URI.parse('session:/empty-quick'), { isQuickChat: true });
		const editorQuickChat = makeSession(URI.parse('session:/editor-quick'), { isQuickChat: true });
		state.setHasSavedWorkingSet(editorQuickChat.resource, true);
		const visibilityStore = createVisibilityStore();
		visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: true });
		store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));

		activate(makeSession(URI.parse('session:/workspace')));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls.length = 0;

		activate(emptyQuickChat);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing),
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
			sharedVisibility: { editorVisible: false, auxiliaryBarVisible: true },
		});

		activate(editorQuickChat);
		const restoredEditor = store.add(new TestStubEditorInput(URI.parse('browser://restored')));
		harness.activeGroupEditors.push(restoredEditor);
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = restoredEditor;
		harness.setPartHiddenCalls.length = 0;

		state.endSessionLayoutRestore();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			visibilityChanges: harness.setPartHiddenCalls,
			sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: false,
			visibilityChanges: [],
			sharedVisibility: { editorVisible: false, auxiliaryBarVisible: true },
		});

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });

		assert.deepStrictEqual(visibilityStore.get(SessionVisibilityProfile.Existing), {
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});
});
