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
import { ISinglePaneLayoutContext, SinglePaneDockedTabsCoordinator } from '../../browser/singlePane/singlePaneLayoutStrategy.js';
import { SinglePaneDetailsStrategy } from '../../browser/singlePane/singlePaneDetailsStrategy.js';
import { SinglePaneDetailPanelStrategy } from '../../browser/singlePane/singlePaneDetailPanelStrategy.js';
import { SinglePaneManagedTabsStrategy } from '../../browser/singlePane/singlePaneManagedTabsStrategy.js';
import { SinglePaneEditorAreaCollapseStrategy } from '../../browser/singlePane/singlePaneEditorAreaCollapseStrategy.js';
import { SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { timeout } from '../../../../../base/common/async.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeSession, TestStubEditorInput } from './layoutControllerTestUtils.js';

/**
 * Mutable state backing a test {@link ISinglePaneLayoutContext}. Tests flip these
 * flags to reproduce the coordination the real controller drives.
 */
interface ITestContextState {
	isRestoringSessionLayout: boolean;
	togglingSidePane: boolean;
	/** Fires the settled-restore signal strategies reconcile off ([Trigger D]). */
	endSessionLayoutRestore(): void;
}

/**
 * Builds an {@link ISinglePaneLayoutContext} backed by the shared test harness so
 * a strategy can be instantiated in isolation via `createInstance(Strategy, ctx)`.
 * The returned `state` lets tests toggle the coordination flags the controller
 * would otherwise own.
 */
function createStrategyTestContext(store: DisposableStore, harness: ITestLayoutHarness): { readonly ctx: ISinglePaneLayoutContext; readonly state: ITestContextState } {
	const onDidEndSessionLayoutRestore = store.add(new Emitter<void>());
	const state: ITestContextState = {
		isRestoringSessionLayout: false,
		togglingSidePane: false,
		endSessionLayoutRestore: () => onDidEndSessionLayoutRestore.fire(),
	};

	const activeSessionResourceObs = derived(reader => harness.activeSessionObs.read(reader)?.resource);
	const multipleSessionsVisibleObs = derived(reader => harness.visibleSessionsObs.read(reader).length > 1);

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
					result.finally(done);
				} else {
					done();
				}
			} catch (e) {
				done();
				throw e;
			}
		},
		onDidEndSessionLayoutRestore: onDidEndSessionLayoutRestore.event,
		get togglingSidePane() { return state.togglingSidePane; },
		multipleSessionsVisibleObs,
		activeSessionResourceObs,
	};

	return { ctx, state };
}

suite('SinglePane layout strategies', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: ICreateOptions = {}): { readonly ctx: ISinglePaneLayoutContext; readonly state: ITestContextState } {
		harness = createTestHarness(store, options);
		return createStrategyTestContext(store, harness);
	}

	/** Makes the given session the single active + visible session. */
	function activate(session: IActiveSession | undefined): void {
		harness.activeSessionObs.set(session, undefined);
		harness.visibleSessionsObs.set(session ? [session] : [], undefined);
	}

	/** Flushes the shared docked-tab / detail sequencers (several chained microtasks). */
	async function settle(): Promise<void> {
		for (let i = 0; i < 6; i++) {
			await timeout(0);
		}
	}

	// --- Toggle Details owns only the detail panel (the sessions list is never touched) ---
	suite('DetailsStrategy', () => {

		function create(ctx: ISinglePaneLayoutContext) {
			return store.add(harness.instaService.createInstance(SinglePaneDetailsStrategy, ctx));
		}

		test('toggleDetails reveals a hidden detail without touching the sessions list', () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
			harness.partVisibility.set(Parts.SIDEBAR_PART, true);
			const strategy = create(ctx);
			harness.setPartHiddenCalls.length = 0;

			const nowVisible = strategy.toggleDetails();

			assert.deepStrictEqual({ nowVisible, calls: harness.setPartHiddenCalls }, {
				nowVisible: true,
				calls: [{ hidden: false, part: Parts.AUXILIARYBAR_PART }],
			});
		});

		test('toggleDetails hides a visible detail without touching the sessions list', () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.partVisibility.set(Parts.SIDEBAR_PART, true);
			const strategy = create(ctx);
			harness.setPartHiddenCalls.length = 0;

			const nowVisible = strategy.toggleDetails();

			assert.deepStrictEqual({ nowVisible, calls: harness.setPartHiddenCalls }, {
				nowVisible: false,
				calls: [{ hidden: true, part: Parts.AUXILIARYBAR_PART }],
			});
		});
	});

	// --- Detail container (Changes / Files) follows the active editor ---
	suite('DetailPanelStrategy', () => {

		const S = URI.parse('session:/s');

		function create(ctx: ISinglePaneLayoutContext) {
			return store.add(harness.instaService.createInstance(SinglePaneDetailPanelStrategy, ctx));
		}

		function changesEditor(): TestStubEditorInput {
			const resource = harness.sessionChangesService.getChangesEditorResource(S);
			return store.add(new TestStubEditorInput(resource));
		}

		function auxHiddenCalls() {
			return harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART);
		}

		test('hides the detail for a quick chat', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			create(ctx);

			activate(makeSession(S, { isQuickChat: true }));
			await timeout(0);

			assert.deepStrictEqual(auxHiddenCalls(), [{ hidden: true, part: Parts.AUXILIARYBAR_PART }]);
		});

		test('hides the detail when a created session has an empty editor group', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = false;
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(auxHiddenCalls(), [{ hidden: true, part: Parts.AUXILIARYBAR_PART }]);
		});

		test('preserves the detail for an empty group during a session restore', async () => {
			const { ctx, state } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = false;
			state.isRestoringSessionLayout = true;
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(auxHiddenCalls(), []);
		});

		test('opens Changes for a created session with no active editor', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = true;
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(harness.openedViewContainers, [CHANGES_VIEW_CONTAINER_ID]);
		});

		test('opens Files for an uncreated session with no active editor', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = true;
			create(ctx);

			activate(makeSession(S, { status: SessionStatus.Untitled }));
			await timeout(0);

			assert.deepStrictEqual(harness.openedViewContainers, [SESSIONS_FILES_CONTAINER_ID]);
		});

		test('forces Changes when a changes editor is active', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = true;
			harness.activeEditorInput = changesEditor();
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(harness.openedViewContainers, [CHANGES_VIEW_CONTAINER_ID]);
		});

		test('forces Files when the empty landing editor is active', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = true;
			harness.activeEditorInput = store.add(new EmptyFileEditorInput(undefined, harness.layoutService));
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(harness.openedViewContainers, [SESSIONS_FILES_CONTAINER_ID]);
		});

		test('does not reveal a hidden detail when a changes editor becomes active', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
			harness.editorGroupsHaveContent = true;
			harness.activeEditorInput = changesEditor();
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual({ hidden: auxHiddenCalls(), opened: harness.openedViewContainers }, { hidden: [], opened: [] });
		});

		test('forces Changes while the editor is maximized', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.editorGroupsHaveContent = true;
			harness.editorMaximized = true;
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await timeout(0);

			assert.deepStrictEqual(harness.openedViewContainers, [CHANGES_VIEW_CONTAINER_ID]);
		});
	});

	// --- Managed docked tabs (Changes multi-diff + Files placeholder) ---
	suite('ManagedTabsStrategy', () => {

		const S = URI.parse('session:/s');

		function create(ctx: ISinglePaneLayoutContext) {
			const coordinator = store.add(new SinglePaneDockedTabsCoordinator(harness.instaService.get(ISessionChangesService)));
			return store.add(harness.instaService.createInstance(SinglePaneManagedTabsStrategy, ctx, coordinator));
		}

		/** Classifies the managed group's editors: 'changes' | 'files' | 'other'. */
		function editorKinds(): string[] {
			return harness.activeGroupEditors.map(e => {
				if (e instanceof EmptyFileEditorInput) {
					return 'files';
				}
				return e.resource && harness.sessionChangesService.getSessionResource(e.resource) ? 'changes' : 'other';
			});
		}

		function filesTabMissing(): boolean {
			return !!harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key);
		}

		test('ensures the Changes and Files tabs for a created session', async () => {
			const { ctx } = setup();
			create(ctx);

			activate(makeSession(S, { isCreated: true }));
			await settle();

			assert.deepStrictEqual(editorKinds(), ['changes', 'files']);
		});

		test('ensures the Changes and Files tabs for an uncreated (new-session) view', async () => {
			const { ctx } = setup();
			create(ctx);

			activate(makeSession(S, { status: SessionStatus.Untitled }));
			await settle();

			assert.deepStrictEqual(editorKinds(), ['changes', 'files']);
		});

		test('ensures no managed tabs for a quick chat', async () => {
			const { ctx } = setup();
			create(ctx);

			activate(makeSession(S, { isQuickChat: true }));
			await settle();

			assert.deepStrictEqual(editorKinds(), []);
		});

		test('remembers a user Files-tab dismissal and offers the + Files entry', async () => {
			const { ctx } = setup();
			create(ctx);
			activate(makeSession(S, { isCreated: true }));
			await settle();

			const placeholder = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
			harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(placeholder), 1);
			harness.onDidCloseEditor.fire({ editor: placeholder });
			harness.onDidEditorsChange.fire();
			await settle();

			assert.deepStrictEqual({ kinds: editorKinds(), filesMissing: filesTabMissing() }, { kinds: ['changes'], filesMissing: true });
		});

		test('re-ensures a dismissed Files tab after the side pane is reopened', async () => {
			const { ctx } = setup();
			create(ctx);
			activate(makeSession(S, { isCreated: true }));
			await settle();

			// User dismisses the Files placeholder.
			const placeholder = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
			harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(placeholder), 1);
			harness.onDidCloseEditor.fire({ editor: placeholder });
			harness.onDidEditorsChange.fire();
			await settle();

			// Fully close the side pane, then reopen it.
			harness.partVisibility.set(Parts.EDITOR_PART, false);
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
			harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
			await settle();
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
			await settle();

			assert.deepStrictEqual(editorKinds(), ['changes', 'files']);
		});

		test('removes the Files placeholder while a workspace file is open in a visible editor', async () => {
			const { ctx } = setup();
			create(ctx);
			activate(makeSession(S, { isCreated: true }));
			await settle();

			harness.partVisibility.set(Parts.EDITOR_PART, true);
			const file = store.add(new TestStubEditorInput(URI.file('/repo/a.ts')));
			// The tidy strip reacts to a genuinely new file open, not to the group contents.
			harness.onWillOpenEditor.fire({ groupId: 1, editor: file });
			harness.activeGroupEditors.push(file);
			harness.onDidEditorsChange.fire();
			await settle();

			assert.strictEqual(harness.activeGroupEditors.some(e => e instanceof EmptyFileEditorInput), false);
		});
	});

	// --- Editor-area collapse (hide real editors while detail-only) ---
	suite('EditorAreaCollapseStrategy', () => {

		function create(ctx: ISinglePaneLayoutContext) {
			const coordinator = store.add(new SinglePaneDockedTabsCoordinator(harness.instaService.get(ISessionChangesService)));
			const strategy = store.add(harness.instaService.createInstance(SinglePaneEditorAreaCollapseStrategy, ctx, coordinator));
			return { strategy, coordinator };
		}

		function hideEditorArea(): void {
			harness.partVisibility.set(Parts.EDITOR_PART, false);
			harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		}

		function showEditorArea(): void {
			harness.partVisibility.set(Parts.EDITOR_PART, true);
			harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		}

		test('collapses non-managed editors when the editor area is hidden', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.EDITOR_PART, true);
			const { coordinator } = create(ctx);
			harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file('/repo/a.ts'))));

			hideEditorArea();
			await settle();

			assert.deepStrictEqual({ editors: harness.activeGroupEditors.length, captured: coordinator.collapsedEditors?.length }, { editors: 0, captured: 1 });
		});

		test('restores collapsed editors when the editor area is shown again', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.EDITOR_PART, true);
			const { coordinator } = create(ctx);
			harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file('/repo/a.ts'))));

			hideEditorArea();
			await settle();
			showEditorArea();
			await settle();

			assert.deepStrictEqual({ editors: harness.activeGroupEditors.length, captured: coordinator.collapsedEditors }, { editors: 1, captured: undefined });
		});

		test('skips the collapse during a session-switch restore', async () => {
			const { ctx, state } = setup();
			harness.partVisibility.set(Parts.EDITOR_PART, true);
			const { coordinator } = create(ctx);
			harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file('/repo/a.ts'))));
			state.isRestoringSessionLayout = true;

			hideEditorArea();
			await settle();

			assert.deepStrictEqual({ editors: harness.activeGroupEditors.length, captured: coordinator.collapsedEditors }, { editors: 1, captured: undefined });
		});

		test('does not collapse the managed placeholder tab', async () => {
			const { ctx } = setup();
			harness.partVisibility.set(Parts.EDITOR_PART, true);
			const { coordinator } = create(ctx);
			harness.activeGroupEditors.push(store.add(new EmptyFileEditorInput(undefined, harness.layoutService)));

			hideEditorArea();
			await settle();

			assert.deepStrictEqual({ editors: harness.activeGroupEditors.length, captured: coordinator.collapsedEditors }, { editors: 1, captured: undefined });
		});
	});

});
