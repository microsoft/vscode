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
import { SinglePaneVisibilityProfileStore } from '../../browser/singlePane/singlePaneVisibilityProfileStore.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeSession, TestStubEditorInput } from './layoutControllerTestUtils.js';

interface ITestContextState {
	isRestoringSessionLayout: boolean;
	togglingSidePane: boolean;
	endSessionLayoutRestore(): void;
}

function createStrategyTestContext(store: DisposableStore, harness: ITestLayoutHarness): { readonly ctx: ISinglePaneLayoutContext; readonly state: ITestContextState } {
	const onDidEndSessionLayoutRestore = store.add(new Emitter<void>());
	const state: ITestContextState = {
		isRestoringSessionLayout: false,
		togglingSidePane: false,
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

	function createDetailPanel(ctx: ISinglePaneLayoutContext): SinglePaneDetailPanelCoordinator {
		return store.add(harness.instaService.createInstance(SinglePaneDetailPanelCoordinator, ctx));
	}

	test('Existing Session toggles only the detail panel', () => {
		const ctx = setup();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		const strategy = store.add(harness.instaService.createInstance(
			SinglePaneExistingSessionStrategy,
			ctx,
			harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
			createDetailPanel(ctx)
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
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel(ctx)));
		harness.setPartHiddenCalls.length = 0;

		activate(session);

		assert.deepStrictEqual(harness.setPartHiddenCalls.filter(call => call.part === Parts.EDITOR_PART), [
			{ hidden: true, part: Parts.EDITOR_PART },
		]);
	});

	test('New Session close fallback replaces the last file and preserves visibility', async () => {
		const ctx = setup();
		const session = makeSession(URI.parse('session:/new'), { status: SessionStatus.Untitled, isCreated: false });
		const editor = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.activeGroupEditors.push(editor);
		store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel(ctx)));
		activate(session);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.onWillCloseEditor.fire({ editor });
		harness.activeGroupEditors.length = 0;
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidCloseEditor.fire({ editor, groupId: 1 });
		await Promise.resolve();

		assert.deepStrictEqual({
			hasEmptyFiles: harness.activeGroupEditors.some(input => input instanceof EmptyFileEditorInput),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			hasEmptyFiles: true,
			editorVisible: true,
			auxiliaryBarVisible: false,
		});
	});

	test('Quick Chat hides both side-pane regions after a workspace session', () => {
		const ctx = setup();
		store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(ctx)));
		activate(makeSession(URI.parse('session:/workspace')));
		harness.setPartHiddenCalls.length = 0;

		activate(makeSession(URI.parse('session:/quick'), { isQuickChat: true }));

		assert.deepStrictEqual(harness.setPartHiddenCalls.filter(call =>
			call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART), [
			{ hidden: true, part: Parts.EDITOR_PART },
			{ hidden: true, part: Parts.AUXILIARYBAR_PART },
		]);
	});
});
