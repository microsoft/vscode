/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { ISessionFileChange, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SinglePaneChangesTabMissingContext, SinglePaneDetailChangesOrFilesActiveContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorWillOpenEvent, isResourceEditorInput } from '../../../../../workbench/common/editor.js';
import { LayoutController } from '../../browser/desktopSessionLayoutController.js';
import { SinglePaneLayoutController, TOGGLE_DETAILS_COMMAND_ID } from '../../browser/singlePaneLayoutController.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
import '../../../changes/browser/changesActions.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { NewChangesTabAction, NewFileTabAction } from '../../../editor/browser/addTabActions.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeChange, makeSession, TestStubEditorInput } from './layoutControllerTestUtils.js';

suite('LayoutController (desktop)', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestLayoutController extends LayoutController {
		getViewState(sessionResource: URI) {
			return this._viewStateBySession.get(sessionResource);
		}
		getEditorPartHidden(sessionResource: URI): boolean | undefined {
			return this._editorPartHiddenBySession.get(sessionResource);
		}
		runWithRestore(work: () => void | Promise<unknown>): void {
			this._withSessionLayoutRestore(work);
		}
	}

	class TestSinglePaneController extends SinglePaneLayoutController {
		/** Runs `work` while a session-switch layout restore is held (see `_withSessionLayoutRestore`). */
		runWithRestore(work: () => void | Promise<unknown>): void {
			this._withSessionLayoutRestore(work);
		}
		getViewState(sessionResource: URI) {
			return this._viewStateBySession.get(sessionResource);
		}
		getEditorPartHidden(sessionResource: URI): boolean | undefined {
			return this._editorPartHiddenBySession.get(sessionResource);
		}
	}

	function createController(options: ICreateOptions = {}): TestLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestLayoutController));
	}

	function createSinglePaneController(options: ICreateOptions = {}): TestSinglePaneController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestSinglePaneController));
	}

	/** A stub real file editor whose resource lives under the session's `/repo` workspace folder. */
	function makeWorkspaceFileEditor(path: string = '/repo/package.json'): FileEditorInput {
		const fileEditor = Object.create(FileEditorInput.prototype) as FileEditorInput;
		Object.defineProperty(fileEditor, 'resource', { value: URI.file(path) });
		return fileEditor;
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- [D3] Auxiliary bar restore ---

	test('[D3c] hides side pane for existing session without saved state', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should be hidden'
		);
		assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID), 'should not auto-open the Files view');
	});

	test('[D6] does not auto-open side pane for existing session with changes', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), {
			changes: [makeChange('/file.ts')],
		});
		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should be hidden'
		);
		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), 'should not auto-open the Changes view');
	});

	test('[D3b] shows files view for untitled session', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(session, undefined);

		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
	});

	test('[D3d] keeps Files as the default for an uncreated session with changes', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), {
			status: SessionStatus.Untitled,
			changes: [makeChange('/file.ts')],
		});
		harness.activeSessionObs.set(session, undefined);

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: true,
			openedChanges: false,
		});
	});

	test('[D3d] does not force-open Files when the Files pane is hidden', () => {
		createController();
		// User has hidden / unpinned the Files pane.
		harness.pinnedAuxiliaryBarContainerIds = [CHANGES_VIEW_CONTAINER_ID];
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });

		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not open the hidden Files pane'
		);
		assert.ok(
			harness.openedViews.includes(CHANGES_VIEW_ID),
			'should fall back to Changes when Files is hidden'
		);
	});

	test('[D3a] does not open views when session has no workspace', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), {
			workspace: { uri: URI.file('/repo'), label: 'test', icon: Codicon.repo, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false },
		});
		harness.activeSessionObs.set(session, undefined);

		assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID));
	});

	// --- [D1] Capture / restore on switch ---

	test('[D1] remembers aux bar hidden state on session switch', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.activeSessionObs.set(session2, undefined);

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should be hidden when returning to session 1'
		);
	});

	test('[D1] remembers active view container on session switch', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'some.custom.view';
		harness.pinnedAuxiliaryBarContainerIds = [...harness.pinnedAuxiliaryBarContainerIds, 'some.custom.view'];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		harness.activeSessionObs.set(session2, undefined);

		harness.openedViewContainers = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.ok(
			harness.openedViewContainers.includes('some.custom.view'),
			'should restore active view container when returning to session 1'
		);
	});

	test('[D3c] restores an explicit Files choice on session switch even when the session has changes', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'), { changes: [makeChange('/file.ts')] });
		const session2 = makeSession(URI.parse('session:2'));

		// The user explicitly opens the (pinned) Files pane for session 1.
		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.activeSessionObs.set(session2, undefined);

		harness.openedViewContainers = [];
		harness.openedViews = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.ok(
			harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should restore the user\'s explicit Files choice'
		);
		assert.ok(
			!harness.openedViews.includes(CHANGES_VIEW_ID),
			'should not override the explicit Files choice with Changes'
		);
	});

	test('[D3c/single-pane] restores aux-bar hidden state even when external reveal fires during working-set apply', async () => {
		// Scenario 4: Session A (created) has detail closed (aux-bar hidden, editor visible).
		// Session B (created) has both visible. Switch A->B, then B->A. External component
		// (the single-pane detail panel) reveals aux-bar during working-set restore. A's
		// hidden state must still be restored.
		createSinglePaneController();
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		// Session A active, user hides the detail panel (aux-bar) while editor is open.
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, true);

		// Switch to session B (both editor and aux-bar visible).
		harness.activeSessionObs.set(sessionB, undefined);
		harness.visibleSessionsObs.set([sessionB], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		// Simulate the single-pane detail panel revealing the aux-bar during
		// working-set restore (while _isRestoringSessionLayout is true).
		harness.onApplyWorkingSet = () => {
			if (!harness.partVisibility.get(Parts.AUXILIARYBAR_PART)) {
				harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
				harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
			}
		};

		// Switch back to session A.
		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);

		// Clean up hook.
		harness.onApplyWorkingSet = undefined;

		// The aux-bar should be hidden to match session A's saved state. The external
		// reveal during working-set apply must NOT overwrite the per-session state.
		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux-bar should be hidden when returning to session A (detail-closed state)'
		);
	});

	test('[single-pane] restores the detail panel after a browser tab hides it', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const isChangesOrFilesActive = () => harness.contextKeyService.getContextKeyValue(SinglePaneDetailChangesOrFilesActiveContext.key);

		assert.strictEqual(isChangesOrFilesActive(), false, 'hidden target should clear the editor chevron context');

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		assert.strictEqual(isChangesOrFilesActive(), true, 'changes target should enable the editor chevron context');

		const browserEditor = Object.create(BrowserEditorInput.prototype) as BrowserEditorInput;
		Object.defineProperty(browserEditor, 'resource', { value: URI.parse('browser://test') });

		harness.activeEditorInput = browserEditor;
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(isChangesOrFilesActive(), false, 'browser target should clear the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'browser tabs should hide the detail panel'
		);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(isChangesOrFilesActive(), true, 'files target should enable the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'file tabs should restore the detail panel after browser hides it'
		);
		assert.ok(
			harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'file tabs should reopen the Files container after browser hides it'
		);

		// A search tab (any non-changes/non-file editor) has no detail panel, so
		// the chevron context must clear just like the browser tab does.
		harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse('search-editor://test')));
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(isChangesOrFilesActive(), false, 'search target should clear the editor chevron context');
	});

	test('[single-pane] hides the detail panel when the main editor part is empty and keeps it closed on tab open', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const isChangesOrFilesActive = () => harness.contextKeyService.getContextKeyValue(SinglePaneDetailChangesOrFilesActiveContext.key);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);
		assert.strictEqual(isChangesOrFilesActive(), true, 'non-empty no-active-editor fallback should keep contextual detail active');

		harness.setPartHiddenCalls = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.editorGroupsHaveContent = false;
		harness.activeEditorInput = undefined;
		harness.onDidEditorsChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			isChangesOrFilesActive: isChangesOrFilesActive(),
			hiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length,
		}, {
			isChangesOrFilesActive: false,
			hiddenCalls: 1,
		});

		// A real file tab re-opens: the context key flips back on, but the detail is
		// NOT force-revealed (a created session defaults to the editor with the detail closed).
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = makeWorkspaceFileEditor();
		harness.onDidEditorsChange.fire();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			isChangesOrFilesActive: isChangesOrFilesActive(),
			reveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		}, {
			isChangesOrFilesActive: true,
			reveals: 0,
			openedFiles: false,
		});
	});

	test('[cmd+n] keeps the detail panel visible for a new-session view with a transiently empty editor group', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		// The Files tab is being (re)ensured, so the editor group is transiently empty.
		harness.editorGroupsHaveContent = false;
		harness.activeEditorInput = undefined;
		harness.onDidEditorsChange.fire();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		// The detail must NOT be hidden for the new-session view (unlike a created
		// session, where an empty group means the whole side pane was closed).
		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length,
			0);
	});

	test('[single-pane] keeps the detail panel closed by default when a file/changes editor is active', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		// Detail closed (the created-session default, not a browser-tab hide).
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		await timeout(0);

		// A file tab becomes active: the detail must stay closed (no force-reveal).
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = makeWorkspaceFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			reveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		}, {
			reveals: 0,
			openedFiles: false,
		});
	});

	test('[single-pane] reveals the Files detail when the empty Files placeholder becomes active', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		// Detail closed (the created-session default) with the editor visible.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		await timeout(0);

		// The user opens the Files placeholder (it becomes the active editor): the
		// Files detail is revealed and the Files container is opened.
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			reveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length > 0,
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		}, {
			reveals: true,
			openedFiles: true,
		});

		// The user hides the detail: it must NOT be re-revealed while the
		// placeholder stays active (the reveal is keyed on the active-editor change).
		harness.setPartHiddenCalls = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0,
			'hiding the detail while the placeholder is active must stick');

		// A session-switch restore that makes the placeholder active must not reveal.
		let releaseRestore!: () => void;
		const restoreGate = new Promise<void>(resolve => { releaseRestore = resolve; });
		controller.runWithRestore(() => restoreGate);
		harness.setPartHiddenCalls = [];
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		releaseRestore();
		await restoreGate;
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0,
			'a restore-driven placeholder activation must not reveal the detail');
	});

	test('[per-session detail] does not force-reveal the detail on editor activation, during or after a restore', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		// Session's detail is closed (the created-session default) with its editor visible.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		await timeout(0);

		// Hold a session-switch restore open. The restore makes a file editor
		// active; that editor change must NOT reveal the detail.
		let releaseRestore!: () => void;
		const restoreGate = new Promise<void>(resolve => { releaseRestore = resolve; });
		controller.runWithRestore(() => restoreGate);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = makeWorkspaceFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0,
			'the detail must stay closed during a session-switch restore');

		// After the restore ends, a plain editor activation still does not reveal
		// the detail (a created session defaults to the editor with the detail closed).
		releaseRestore();
		await restoreGate;
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.activeEditorInput = makeWorkspaceFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0,
			'the detail stays closed by default after the restore');
	});

	test('[Scenario C] does not re-reveal the detail on reload when the whole side pane was closed', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		// Whole side pane closed (as persisted across a reload): both the editor
		// content and the detail are hidden.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];

		// The restored managed tab becomes active; the detail must NOT re-reveal.
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0);
	});

	test('[per-session detail] keeps the whole side pane closed when returning to a session that had it closed', async () => {
		// Session A had the whole side pane closed (editor + detail hidden). Switch
		// to session B (side pane open), then back to A. The detail panel must not
		// re-reveal A's aux bar: returning to A must restore its closed side pane.
		createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		await timeout(0);
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		// Session A active with the whole side pane closed.
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await timeout(0);

		// Switch to session B (side pane open).
		harness.activeSessionObs.set(sessionB, undefined);
		harness.visibleSessionsObs.set([sessionB], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);

		// Switch back to A. The restore makes A's managed file editor active while
		// B's aux bar is still visible (the detail autorun captures it as visible).
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			aux: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			editor: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			aux: false,
			editor: false,
		});
	});

	test('[per-session detail] restores detail visibility on session switch despite a stale queued detail sync', async () => {
		createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		await timeout(0);
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		await timeout(0);

		harness.activeSessionObs.set(sessionB, undefined);
		harness.visibleSessionsObs.set([sessionB], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(0);

		harness.activeEditorInput = makeWorkspaceFileEditor();
		harness.onDidActiveEditorChange.fire();
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);

		assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), false,
			'session A detail-hidden state must win over any queued detail-container sync');
	});

	test('[per-session detail] persists detail visibility and restores it after reload', async () => {
		let controller = createSinglePaneController({ activateAux: true });
		await timeout(0);
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.storageService.flush(WillSaveStateReason.SHUTDOWN);
		const persisted = JSON.parse(harness.storageService.get('sessions.singlePane.layoutState', StorageScope.WORKSPACE) ?? '[]') as { sessionResource: string; viewState?: { auxiliaryBarVisible: boolean } }[];
		assert.deepStrictEqual(persisted.map(entry => ({ sessionResource: entry.sessionResource, auxiliaryBarVisible: entry.viewState?.auxiliaryBarVisible })),
			[{ sessionResource: session.resource.toString(), auxiliaryBarVisible: false }]);

		store.clear();

		controller = createSinglePaneController({
			activateAux: true,
			revealAuxiliaryBarOnOpen: true,
			initialPartVisibility: new Map([[Parts.AUXILIARYBAR_PART, true], [Parts.EDITOR_PART, true]]),
			layoutState: persisted,
		});
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			auxVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			viewState: controller.getViewState(session.resource)?.auxiliaryBarVisible,
		}, {
			auxVisible: false,
			viewState: false,
		});
	});

	test('[B2] captures editor-part hidden state eagerly when the user closes the side pane', () => {
		const controller = createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// User closes the side pane (editor part hidden) while on the session.
		setPartVisible(Parts.EDITOR_PART, false);

		assert.strictEqual(controller.getEditorPartHidden(session.resource), true,
			'editor-part hidden must be captured at the moment the user closes it');

		// User reopens it.
		setPartVisible(Parts.EDITOR_PART, true);
		assert.strictEqual(controller.getEditorPartHidden(session.resource), false,
			'editor-part hidden must update when the user reopens it');
	});

	test('[B2] a later transient editor reveal does not overwrite a session\'s captured closed state during a switch', () => {
		const controller = createController();
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(sessionA, undefined);

		// A: user closes the editor part -> captured hidden.
		setPartVisible(Parts.EDITOR_PART, false);
		assert.strictEqual(controller.getEditorPartHidden(sessionA.resource), true);

		// Simulate the switch-time race: while switching to B the editor part is
		// revealed by B's layout restore (the capture listener ignores changes
		// during a restore). A's captured closed state must be preserved.
		controller.runWithRestore(() => {
			harness.activeSessionObs.set(sessionB, undefined);
			setPartVisible(Parts.EDITOR_PART, true);
		});

		assert.strictEqual(controller.getEditorPartHidden(sessionA.resource), true,
			'a restore-driven editor reveal must not overwrite session A\'s captured closed state');
	});

	test('[D4] keeps the open side pane and shows Changes when a new session is submitted', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// Aux bar is open on the new-session view.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];
		harness.openedViews = [];
		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'side pane should remain open after the new session is submitted'
		);
		assert.ok(
			harness.openedViews.includes(CHANGES_VIEW_ID),
			'Changes view should be shown after the new session is submitted'
		);
	});

	test('[D4] keeps the side pane closed when a new session is submitted with the aux bar hidden', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		// User hides the aux bar on the new-session view.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		harness.setPartHiddenCalls = [];
		harness.openedViews = [];
		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'side pane should stay closed after the new session is submitted'
		);
		assert.ok(
			!harness.openedViews.includes(CHANGES_VIEW_ID),
			'Changes view should not be shown when the aux bar is hidden'
		);
	});

	test('[D4] shows Changes when a hidden side pane is opened after the session is submitted', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);

		harness.openedViewContainers = [];
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.ok(
			harness.openedViewContainers.includes(CHANGES_VIEW_CONTAINER_ID),
			'Changes should be the active view when the side pane is opened later'
		);
	});

	test('[D4] records Changes when a hidden side pane falls back from an invalid saved container', () => {
		const session = makeSession(URI.parse('session:1'));
		const controller = createController({
			layoutState: [{
				sessionResource: session.resource.toString(),
				viewState: {
					auxiliaryBarVisible: false,
					auxiliaryBarActiveViewContainerId: 'missing.view',
				},
			}],
		});
		harness.activeSessionObs.set(session, undefined);

		harness.openedViews = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.deepStrictEqual({
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
			viewState: controller.getViewState(session.resource),
		}, {
			openedChanges: true,
			viewState: {
				auxiliaryBarVisible: true,
				auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID,
			},
		});
	});

	test('[D4] remembers Files when the user chooses it after the session is submitted', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		const session2 = makeSession(URI.parse('session:2'));
		harness.activeSessionObs.set(session1, undefined);

		(session1.isCreated as ISettableObservable<boolean>).set(true, undefined);
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;

		harness.activeSessionObs.set(session2, undefined);

		harness.openedViews = [];
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: true,
			openedChanges: false,
		});
	});

	// --- [D2] Live visibility tracking (new-session shared state) ---

	test('[D2] remembers hidden aux bar across new (untitled) sessions', () => {
		createController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		const existing = makeSession(URI.parse('session:existing'));
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		// Open a new (untitled) session — aux bar shows the Files view.
		harness.activeSessionObs.set(untitled1, undefined);
		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User hides the aux bar on the new-session view.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		// Switch to an existing session and back to a brand new (untitled) session.
		harness.activeSessionObs.set(existing, undefined);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(untitled2, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden on the next new session'
		);
		assert.ok(
			!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not re-open the Files view on the next new session'
		);
	});

	test('[D2] persists hidden new-session aux bar to storage and restores it after reload', () => {
		// First lifetime: user hides the aux bar on the new-session view.
		createController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(untitled1, undefined);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		assert.deepStrictEqual(
			JSON.parse(harness.storageService.get('sessions.newSessionViewState', StorageScope.WORKSPACE) ?? ''),
			{ auxiliaryBarVisible: false },
			'state should be persisted to storage'
		);

		store.clear();

		// Second lifetime (reload): a fresh controller with the persisted state.
		createController({ newSessionViewState: { auxiliaryBarVisible: false } });
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(untitled2, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden after reload'
		);
		assert.ok(
			!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not re-open the Files view after reload'
		);
	});

	test('[D3b] ignores malformed persisted new-session state and does not force-hide the aux bar', () => {
		// Persisted object is missing the `auxiliaryBarVisible` boolean.
		createController({ newSessionViewStateRaw: JSON.stringify({ foo: 'bar' }) });
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });

		harness.activeSessionObs.set(untitled, undefined);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'malformed state must not force-hide the aux bar'
		);
		assert.ok(
			harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should fall back to the default Files view'
		);
		assert.strictEqual(
			harness.storageService.get('sessions.newSessionViewState', StorageScope.WORKSPACE),
			undefined,
			'malformed state should be removed from storage'
		);
	});

	test('[D6] does not re-reveal aux bar after user hides it when session changes state updates', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// User hides the aux bar (Side Panel) without switching sessions.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		harness.openedViews = [];
		harness.openedViewContainers = [];
		harness.setPartHiddenCalls = [];

		// Changes appear, which re-triggers the aux bar sync autorun.
		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);

		assert.ok(
			!harness.openedViews.includes(CHANGES_VIEW_ID) && !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'aux bar must stay hidden after the user hid it, even when changes appear'
		);
	});

	// --- [D9b] Closing the whole side pane on a new (uncreated) session ---

	test('[D9b] closing the whole side pane on a new session keeps it closed for the next new session', () => {
		const controller = createController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		const existing = makeSession(URI.parse('session:existing'));
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		// Open a new (untitled) session — aux bar shows the Files view.
		harness.activeSessionObs.set(untitled1, undefined);
		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User closes the whole side pane (editor + aux bar) via the toggle.
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		controller.toggleSidePane();

		// The closed state is recorded for the shared new-session view.
		assert.deepStrictEqual(
			JSON.parse(harness.storageService.get('sessions.newSessionViewState', StorageScope.WORKSPACE) ?? ''),
			{ auxiliaryBarVisible: false },
			'closing the whole side pane on a new session should record the closed choice'
		);

		// Switch via an existing session to the next new (untitled) session.
		harness.activeSessionObs.set(existing, undefined);
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(untitled2, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden on the next new session'
		);
		assert.ok(
			!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not re-open the Files view on the next new session'
		);
	});

	test('[D9b] closing the whole side pane while composing a new session does not reopen it when the session re-syncs', () => {
		const controller = createController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });
		const other = makeSession(URI.parse('session:other'), { status: SessionStatus.Untitled });

		// Compose a new session — aux bar shows the Files view.
		harness.activeSessionObs.set(untitled, undefined);
		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User closes the whole side pane while still composing the new session.
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		controller.toggleSidePane();

		// The same uncreated session re-syncs (e.g. a multi-session view collapses
		// back to it). This must not reopen the aux bar the user just closed.
		harness.visibleSessionsObs.set([untitled, other], undefined);
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.visibleSessionsObs.set([untitled], undefined);

		assert.ok(
			!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'should not reopen the Files view when the same new session re-syncs'
		);
		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should stay hidden when the same new session re-syncs'
		);
	});

	// --- [D8] First Changes editor open ---

	test('[D8] reveals the Changes view the first time a Changes editor is opened, then remembers the choice', () => {
		createController({ revealAuxiliaryBarOnOpen: true });
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// First open of the Changes editor reveals the Changes view in the side pane.
		harness.openedViews = [];
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		harness.onDidActiveEditorChange.fire();
		assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), 'first Changes open should reveal the Changes view');

		// User hides only the side pane (aux bar) while the editor stays open; the choice is remembered.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		// Opening the Changes editor again respects the remembered closed choice.
		harness.openedViews = [];
		harness.onDidActiveEditorChange.fire();
		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), 'later Changes opens should not re-reveal the side pane');
	});

	test('[D9] closing the whole side pane is not remembered, so reopening Changes reveals it again', () => {
		const controller = createController({ revealAuxiliaryBarOnOpen: true });
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// The first Changes open reveals the side pane (captured as open).
		harness.openedViews = [];
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidActiveEditorChange.fire();
		assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), 'first Changes open should reveal the Changes view');

		// User closes the whole side pane via the controller-owned toggle, which
		// hides the editor and aux bar together. This must not be remembered as a
		// per-session aux-bar choice.
		controller.toggleSidePane();

		// Re-clicking Changes re-reveals the (still-active, just hidden) editor part
		// without firing an active-editor change; the side pane opens again (the
		// close was not remembered as an aux-bar choice).
		harness.openedViews = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), 'reopening Changes after closing the whole side pane should reveal the Changes view again');
	});

	test('[D9] reopening the side pane restores the parts that were visible when it was closed', () => {
		const controller = createController();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		// Closing hides both parts.
		const visibleAfterClose = controller.toggleSidePane();
		assert.strictEqual(visibleAfterClose, false, 'side pane should be hidden after closing');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true), 'aux bar should be hidden');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === true), 'editor should be hidden');

		// Reopening restores both parts that were visible before.
		harness.setPartHiddenCalls.length = 0;
		const visibleAfterOpen = controller.toggleSidePane();
		assert.strictEqual(visibleAfterOpen, true, 'side pane should be visible after reopening');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false), 'editor should be restored');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false), 'aux bar should be restored');
	});

	test('[reopen default single-pane] a created session opens the side pane to the editor with the detail closed', () => {
		const controller = createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.editorGroupsHaveContent = true;

		// The side pane starts fully closed with no remembered parts (e.g. after a reload).
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		controller.toggleSidePane();

		assert.deepStrictEqual({
			editorRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			detailRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
		}, { editorRevealed: true, detailRevealed: false });
	});

	test('[reopen default single-pane] a new-session view opens the side pane to the Files detail', () => {
		const controller = createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		harness.editorGroupsHaveContent = true;

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		controller.toggleSidePane();

		assert.deepStrictEqual({
			editorRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			detailRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
		}, { editorRevealed: false, detailRevealed: true });
	});

	test('[D8] does not reveal the Changes view for an untitled session', () => {
		createController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(untitled, undefined);

		harness.openedViews = [];
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(untitled.resource);
		harness.onDidActiveEditorChange.fire();

		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), 'untitled sessions are governed by D3b/D4, not D8');
	});

	test('[R1] single-pane hides the editor on entering a new-session view but keeps an explicit in-session reveal', async () => {
		createSinglePaneController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled, isCreated: false });
		const existing = makeSession(URI.parse('session:existing'));
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeSessionObs.set(untitled1, undefined);
		await timeout(0);

		const firstReveal = {
			editorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		};

		// An *explicit* editor reveal in the same new-session view (opening a file,
		// toggling details off) must stick.
		harness.setPartHiddenCalls = [];
		harness.editorRevealedExplicitly = true;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);
		const explicitRevealEditorHiddenCalls = harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden);

		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.editorRevealedExplicitly = false;

		harness.activeSessionObs.set(untitled2, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			firstReveal,
			explicitRevealEditorHiddenCalls,
			secondRevealEditorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
		}, {
			firstReveal: {
				editorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }],
				openedFiles: true,
			},
			explicitRevealEditorHiddenCalls: [],
			secondRevealEditorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }],
		});
	});

	test('[R1] single-pane re-hides the editor on an automatic reveal in a new-session view', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		// An automatic reveal (working-set restore, an inherited-visible editor, a
		// layout race) is not explicit, so R1 re-hides it.
		harness.editorRevealedExplicitly = false;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			[{ part: Parts.EDITOR_PART, hidden: true }]);
	});

	test('[R1] single-pane hides the editor when the managed empty File tab is the active editor', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
		}, {
			editorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }],
		});
	});

	test('[R1/T2] single-pane does not hide the editor when a real file is the active editor', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		const fileEditor = Object.create(FileEditorInput.prototype) as FileEditorInput;
		Object.defineProperty(fileEditor, 'resource', { value: URI.file('/repo/file.ts') });
		harness.activeEditorInput = fileEditor;
		harness.onDidActiveEditorChange.fire();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		// A spurious visibility signal must still not re-hide while real content is active.
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);

		assert.deepStrictEqual({
			editorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
		}, {
			editorHiddenCalls: [],
		});
	});

	test('[R1/T4] single-pane keeps the editor open when a file is opened before it becomes active', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		// New-session view starts with the managed empty tab active and the editor hidden.
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		// Opening a file reveals the editor (onWillOpenEditor) *before* the file
		// becomes the active editor, marking the reveal explicit. R1 must not undo it.
		harness.editorRevealedExplicitly = true;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);
		const beforeActiveEditor = harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden);

		const fileEditor = Object.create(FileEditorInput.prototype) as FileEditorInput;
		Object.defineProperty(fileEditor, 'resource', { value: URI.file('/repo/package.json') });
		harness.activeEditorInput = fileEditor;
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			beforeActiveEditor,
			afterActiveEditor: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			beforeActiveEditor: [],
			afterActiveEditor: [],
			editorVisible: true,
		});
	});

	test('[R1] single-pane keeps the editor open when switching to the Files tab while the editor is already visible', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		// New-session view; the user opens a file, so the editor is revealed and visible.
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		harness.editorRevealedExplicitly = true;
		const fileEditor = Object.create(FileEditorInput.prototype) as FileEditorInput;
		Object.defineProperty(fileEditor, 'resource', { value: URI.file('/repo/package.json') });
		harness.activeEditorInput = fileEditor;
		harness.onDidActiveEditorChange.fire();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);
		harness.setPartHiddenCalls = [];

		// The user switches to the managed Files placeholder tab. The editor is
		// already visible, so switching tabs must NOT hide the editor area — even
		// though the reveal is no longer flagged explicit (the flag is cleared when
		// the reveal-sync suppression is re-armed for non-real content).
		harness.editorRevealedExplicitly = false;
		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			editorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			editorHiddenCalls: [],
			editorVisible: true,
		});
	});

	test('[R1/T2] single-pane keeps the editor open when details is toggled off in a new-session view', async () => {
		createSinglePaneController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeEditorInput = store.add(new EmptyFileEditorInput());
		harness.onDidActiveEditorChange.fire();
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		// Toggling details off reveals the empty editor (so the side pane does not
		// vanish). The active editor stays the managed empty tab, but the reveal is
		// explicit; R1 must not re-hide the editor it was just asked to show.
		harness.editorRevealedExplicitly = true;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);

		assert.deepStrictEqual({
			editorHiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			editorHiddenCalls: [],
			editorVisible: true,
		});
	});

	test('[R1] single-pane hides the editor when entering a new-session view with an inherited-visible editor', async () => {
		createSinglePaneController();
		const existing = makeSession(URI.parse('session:existing'));
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		// Start on a created session with the editor visible and left explicitly revealed.
		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.editorRevealedExplicitly = true;
		harness.setPartHiddenCalls = [];

		// Entering the new-session view must reset to editor-closed, even though the
		// inherited editor was explicitly revealed for the previous session.
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			[{ part: Parts.EDITOR_PART, hidden: true }]);
	});

	test('[D3b] standard controller does not hide the editor on new-session side-pane reveal', async () => {
		createController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden),
			[]
		);
	});

	test('[D8] does not reveal the Changes view while multiple sessions are visible', () => {
		createController();
		const a = makeSession(URI.parse('session:a'));
		const b = makeSession(URI.parse('session:b'));
		harness.visibleSessionsObs.set([a, b], undefined);
		harness.activeSessionObs.set(a, undefined);

		harness.openedViews = [];
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(a.resource);
		harness.onDidActiveEditorChange.fire();

		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), 'multi-session mode manages the side pane separately');
	});

	// --- [D5] Editor maximized ---

	test('[D5] shows the Changes view when the editor area is maximized', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		harness.openedViews = [];

		// Maximize the editor area.
		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();

		assert.ok(
			harness.openedViews.includes(CHANGES_VIEW_ID),
			'Changes view should be shown when the editor is maximized'
		);
	});

	test('[D5] restores the previous aux bar visibility when the editor is un-maximized', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// Aux bar hidden before maximizing.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		// Maximize — Changes view shown (aux bar revealed).
		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();

		harness.setPartHiddenCalls = [];

		// Restore — aux bar should be hidden again.
		harness.editorMaximized = false;
		harness.onDidChangeEditorMaximized.fire();

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should be restored to hidden after un-maximizing'
		);
	});

	test('[D5] does not capture forced aux bar visibility while the editor is maximized', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		// Aux bar hidden before maximizing.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();

		// Simulate the aux bar being revealed while maximized.
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		// Switching away from the session should not have remembered the forced
		// visible state: switching back keeps the aux bar hidden.
		harness.editorMaximized = false;
		harness.onDidChangeEditorMaximized.fire();

		const session2 = makeSession(URI.parse('session:2'));
		harness.activeSessionObs.set(session2, undefined);

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should remain hidden for the session after the editor was maximized'
		);
	});

	test('[D5] keeps the Changes view shown while maximized regardless of the session state', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session1, undefined);

		// Maximize — Changes view shown.
		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();

		harness.setPartHiddenCalls = [];
		harness.openedViews = [];

		// While still maximized, switch to another existing session that would
		// normally keep the aux bar hidden. It must stay showing the Changes view.
		const session2 = makeSession(URI.parse('session:2'));
		harness.activeSessionObs.set(session2, undefined);

		assert.ok(
			harness.openedViews.includes(CHANGES_VIEW_ID),
			'Changes view should stay shown while maximized'
		);
		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should not be hidden while the editor is maximized'
		);
	});

	// --- [D1] + [B2] Editor / auxiliary bar invariant ---

	test('[D1] does not force auxiliary bar visible when restoring editor working set on session switch', async () => {
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));
		createController({
			useModal: 'some',
			workspaceFolders: [{ uri: URI.file('/repo') }],
			layoutState: [{
				sessionResource: 'session:1',
				editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
				viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: undefined },
			}],
		});

		// Start on a different session, then switch to the one with a saved working set.
		harness.activeSessionObs.set(session2, undefined);
		await timeout(0);

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(session1, undefined);
		// Flush the working-set sequencer (queued microtasks)
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should be revealed by the working set restore'
		);
		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'auxiliary bar must not be forced visible during working set restore'
		);
	});

	test('[single-pane] reveals the editor part for a created session on switch, even with useModal all (Editor-only default)', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
		const untitled = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
		const existing = makeSession(URI.parse('session:existing'));

		// On the new-session view the editor part is hidden.
		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];

		// Navigating to the existing (created) session reveals the editor part to
		// show the managed Changes editor (the side pane is no longer left closed).
		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should be revealed for the created session'
		);
	});

	test('[single-pane] preserves detail-only layout when an active new session is replaced by its created session', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		const controller = createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		const created = makeSession(URI.parse('session:created'));

		// The new-session view starts Files/detail-only: detail visible, editor hidden.
		harness.activeSessionObs.set(draft, undefined);
		harness.visibleSessionsObs.set([draft], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		assert.strictEqual(controller.getEditorPartHidden(draft.resource), true);

		harness.setPartHiddenCalls = [];
		harness.openedViews = [];
		// The provider commits the draft as a new resource, then the visible slot updates.
		harness.onDidReplaceSession.fire({ from: draft, to: created });
		harness.activeSessionObs.set(created, undefined);
		harness.visibleSessionsObs.set([created], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorReveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden === false).length,
			editorHides: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden === true).length,
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
			editorPartHidden: controller.getEditorPartHidden(created.resource),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			editorReveals: 0,
			editorHides: 0,
			openedChanges: true,
			editorPartHidden: true,
			detailVisible: true,
			editorVisible: false,
		});
	});

	test('[single-pane] preserves editor-hidden layout on submit even when the draft state was never captured', async () => {
		// Mirrors the real app: the new-session editor starts hidden with no
		// visible→hidden transition, so `_editorPartHiddenBySession` is never
		// captured for the draft. The fix must still keep the editor hidden on
		// submit (via the draft→committed replacement preserve), not reveal it.
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		const created = makeSession(URI.parse('session:created'));

		// Detail-only on-screen, but WITHOUT firing the editor-visibility capture event.
		harness.activeSessionObs.set(draft, undefined);
		harness.visibleSessionsObs.set([draft], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);

		harness.setPartHiddenCalls = [];
		// The provider commits the draft, then the visible slot updates.
		harness.onDidReplaceSession.fire({ from: draft, to: created });
		harness.activeSessionObs.set(created, undefined);
		harness.visibleSessionsObs.set([created], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorReveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden === false).length,
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			editorReveals: 0,
			editorVisible: false,
		});
	});

	test('[single-pane] does not reveal the editor part for a created session whose editor was explicitly hidden', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createSinglePaneController({
			singlePaneLayoutEnabled: true,
			workspaceFolders,
			layoutState: [{ sessionResource: 'session:existing', editorPartHidden: true }],
		});
		const untitled = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
		const existing = makeSession(URI.parse('session:existing'));

		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'the editor part must stay hidden for a session whose editor was explicitly hidden'
		);
	});

	test('[single-pane] does not reveal the editor part for a created quick chat on switch', async () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true });
		const untitled = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
		const quickChat = makeSession(URI.parse('session:qc'), { isQuickChat: true });

		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];

		// A quick chat has no side pane, so switching to it must never auto-reveal
		// the editor part even though the session is created.
		harness.activeSessionObs.set(quickChat, undefined);
		await timeout(0);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'the editor part must not be revealed for a quick chat'
		);
	});

	test('[single-pane] hides a visible editor part when switching to a quick chat with an empty editor group', async () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
		await timeout(0);
		// A prior session left the editor part visible; the quick chat's editor
		// group is empty (no managed tabs), so the whole side pane must collapse.
		harness.editorGroupsHaveContent = false;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === true),
			'the editor part should hide for a quick chat with an empty editor group'
		);
	});

	// --- [B4] + [D1] Persistence ---

	test('[B4] persists aux-bar view state to sessions.layoutState key', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'custom.view';

		harness.activeSessionObs.set(session2, undefined);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const stored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'state should be persisted');

		const parsed = JSON.parse(stored!);
		const session1Entry = parsed.find((e: any) => e.sessionResource === 'session:1');
		assert.ok(session1Entry, 'session 1 entry should exist');
		assert.deepStrictEqual(session1Entry.viewState, {
			auxiliaryBarVisible: false,
			auxiliaryBarActiveViewContainerId: 'custom.view',
		});
	});

	test('[D1] keeps aux bar hidden after reload when a session with editors closes both editor and aux bar', () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createController({ useModal: 'some', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		// Session 1 active with an editor open so a working set is saved on switch-away.
		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(session1, undefined);
		harness.activeSessionObs.set(session2, undefined);

		// Back to session 1 and hide the aux bar (captured immediately as hidden view state).
		harness.activeSessionObs.set(session1, undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		// Close all editors, then switch away so the now-empty working set is saved.
		harness.visibleEditorsList = [];
		harness.activeSessionObs.set(session2, undefined);

		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const stored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'state should be persisted');

		// Reload: a fresh controller restores from the persisted state.
		store.clear();
		createController({ useModal: 'some', workspaceFolders, layoutState: JSON.parse(stored!) });
		const reloadedSession1 = makeSession(URI.parse('session:1'));
		harness.setPartHiddenCalls = [];
		harness.openedViews = [];
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(reloadedSession1, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux bar should remain hidden after reload'
		);
	});

	function reloadWithSidePaneToggledClosed(): void {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		const controller = createController({ useModal: 'some', workspaceFolders, revealAuxiliaryBarOnOpen: true });
		const session = makeSession(URI.parse('session:1'));
		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(session, undefined);

		// Open the Changes editor so the editor + aux bar are both visible and the
		// session's aux-bar visible choice is captured.
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();
		assert.deepStrictEqual(controller.getViewState(session.resource)?.auxiliaryBarVisible, true);

		// User closes the whole side pane (editor + aux bar) via the toggle, then reloads.
		controller.toggleSidePane();
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const stored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'state should be persisted');

		store.clear();
		createController({ useModal: 'some', workspaceFolders, layoutState: JSON.parse(stored!), revealAuxiliaryBarOnOpen: true });
		const reloadedSession = makeSession(URI.parse('session:1'));

		// Reload restores the side pane closed (both parts hidden).
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.activeSessionObs.set(reloadedSession, undefined);
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(reloadedSession.resource);
	}

	test('[D9] does not auto-reveal the side pane when the Changes editor is restored on reload', () => {
		reloadWithSidePaneToggledClosed();

		// The working set restore can make the Changes editor active again while
		// the editor part is still hidden — this must NOT auto-reveal the side pane.
		harness.openedViews = [];
		harness.onDidActiveEditorChange.fire();

		assert.ok(
			!harness.openedViews.includes(CHANGES_VIEW_ID),
			'restoring the Changes editor on reload must not auto-reveal the side pane'
		);
	});

	test('[D9] reveals the Changes view when opening Changes after reloading a session whose side pane was toggled closed', () => {
		reloadWithSidePaneToggledClosed();

		// Clicking Open Changes opens the Changes editor (revealing the editor
		// part); the aux bar must be revealed too because the whole-pane collapse
		// was not an explicit aux-bar-hidden choice.
		harness.openedViews = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();

		assert.ok(
			harness.openedViews.includes(CHANGES_VIEW_ID),
			'opening Changes after reload should reveal the Changes view'
		);
	});

	test('[D9] does not turn an explicit aux-bar hide into a collapse when another session is collapsed', () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		const controller = createController({ useModal: 'some', workspaceFolders, revealAuxiliaryBarOnOpen: true });
		const sessionExplicit = makeSession(URI.parse('session:explicit'));
		const sessionCollapse = makeSession(URI.parse('session:collapse'));
		harness.visibleEditorsList = [{}];

		// Session A: open Changes (editor + aux visible), then explicitly hide just
		// the aux bar while the editor stays open — an explicit aux-bar choice.
		harness.activeSessionObs.set(sessionExplicit, undefined);
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(sessionExplicit.resource);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, undefined);

		// Session B: collapse the whole side pane (marks B as collapse-hidden).
		harness.activeSessionObs.set(sessionCollapse, undefined);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		controller.toggleSidePane();
		assert.strictEqual(controller.getViewState(sessionCollapse.resource)?.auxiliaryBarHiddenByCollapse, true);

		// Switching back to A captures it again — its explicit hide must remain
		// explicit (no collapse marker leaking from session B's collapse).
		harness.activeSessionObs.set(sessionExplicit, undefined);
		harness.activeSessionObs.set(sessionCollapse, undefined);
		assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, undefined);
	});

	test('[D9] re-opening the side pane to editor-only does not mark an explicit aux-bar hide as a collapse', () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		const controller = createController({ useModal: 'some', workspaceFolders, revealAuxiliaryBarOnOpen: true });
		const session = makeSession(URI.parse('session:1'));
		harness.visibleEditorsList = [{}];

		// Open Changes (editor + aux visible), then explicitly hide just the aux bar.
		harness.activeSessionObs.set(session, undefined);
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, undefined);

		// Collapse the whole side pane, then re-open it: it restores the editor-only
		// state (aux bar stays hidden because it was explicitly hidden before).
		controller.toggleSidePane();
		controller.toggleSidePane();

		// The explicit aux-bar hide must not have become a collapse-driven hide.
		assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, undefined);

		// Opening Changes must therefore not re-reveal the aux bar.
		harness.openedViews = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();
		assert.ok(
			!harness.openedViews.includes(CHANGES_VIEW_ID),
			'an explicit aux-bar hide must not re-reveal after a collapse + editor-only re-open'
		);
	});

	// --- [D7] Responsive sessions sidebar ---

	function setPartVisible(part: Parts, visible: boolean): void {
		harness.partVisibility.set(part, visible);
		harness.onDidChangePartVisibility.fire({ partId: part, visible });
	}

	function resizeWindow(width: number): void {
		harness.mainContainerWidth = width;
		harness.onDidLayoutMainContainer.fire({ width, height: 1000 });
	}

	function sidebarHiddenCalls(): boolean[] {
		return harness.setPartHiddenCalls.filter(c => c.part === Parts.SIDEBAR_PART).map(c => c.hidden);
	}

	test('[D7] hides the sidebar on a small window when editor and aux bar are both open', () => {
		createController();
		harness.setPartHiddenCalls = [];

		resizeWindow(800);

		assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
	});

	test('[D7] does not touch the sidebar on a large window', () => {
		createController();
		harness.setPartHiddenCalls = [];

		resizeWindow(2000);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7] shows the sidebar again once the aux bar closes', () => {
		createController();
		resizeWindow(800);
		harness.setPartHiddenCalls = [];

		setPartVisible(Parts.AUXILIARYBAR_PART, false);

		assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
	});

	test('[D7] shows the sidebar again once the window grows back', () => {
		createController();
		resizeWindow(800);
		harness.setPartHiddenCalls = [];

		resizeWindow(2000);

		assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
	});

	test('[D7] does not auto-show the sidebar after the user closed it manually', () => {
		createController();
		// User manually closes the sidebar on a large window.
		setPartVisible(Parts.SIDEBAR_PART, false);
		harness.setPartHiddenCalls = [];

		// Become space constrained, then relieve the constraint.
		resizeWindow(800);
		setPartVisible(Parts.AUXILIARYBAR_PART, false);

		assert.ok(
			!sidebarHiddenCalls().includes(false),
			'sidebar must not be auto-shown while the user-closed preference holds'
		);
	});

	test('[D7] resumes auto-management after the user opens the sidebar again', () => {
		createController();
		// User manually closes, then re-opens the sidebar — auto-management resumes.
		setPartVisible(Parts.SIDEBAR_PART, false);
		setPartVisible(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// A constrain → un-constrain cycle should now auto-hide then auto-show again.
		resizeWindow(800);
		setPartVisible(Parts.AUXILIARYBAR_PART, false);

		assert.deepStrictEqual(sidebarHiddenCalls(), [true, false]);
	});

	test('[D7] does not auto-show the sidebar the user closed before reloading', () => {
		// Simulate the restored state after a reload: the sidebar and the whole side
		// pane (editor + aux bar) are hidden, on a small window. The controller only
		// auto-reveals a sidebar it auto-hid, so a sidebar the user closed before the
		// reload (already hidden here) must stay closed.
		const controller = createController({
			mainContainerWidth: 800,
			initialPartVisibility: new Map<Parts, boolean>([
				[Parts.SIDEBAR_PART, false],
				[Parts.EDITOR_PART, false],
				[Parts.AUXILIARYBAR_PART, false],
			]),
		});
		harness.setPartHiddenCalls = [];

		// Open the side pane (becomes space constrained), then close it again.
		controller.toggleSidePane();
		controller.toggleSidePane();

		assert.ok(
			!sidebarHiddenCalls().includes(false),
			'sidebar must not be auto-shown when it was closed before the reload'
		);
	});

	test('[D7] does not manage the sidebar while the editor is maximized', () => {
		createController();
		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();
		harness.setPartHiddenCalls = [];

		resizeWindow(800);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7] does not manage the sidebar when the experimental setting is disabled', () => {
		createController({ responsiveSidebar: false });
		harness.setPartHiddenCalls = [];

		resizeWindow(800);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7] does not hide the sidebar when navigating to a session that restores the side panel', () => {
		const sessionB = URI.parse('session:2');
		createController({
			revealAuxiliaryBarOnOpen: true,
			layoutState: [{
				sessionResource: sessionB.toString(),
				viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID },
			}],
		});
		// Small window with the side panel closed: the sidebar is shown (not constrained).
		setPartVisible(Parts.AUXILIARYBAR_PART, false);
		resizeWindow(800);
		harness.setPartHiddenCalls = [];

		// Navigate to a session whose restore re-opens the side panel.
		harness.activeSessionObs.set(makeSession(sessionB), undefined);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7] does not hide the sidebar when navigating to a session whose working set reveals the editor', async () => {
		const session1 = URI.parse('session:1');
		const session2 = URI.parse('session:2');
		createController({
			useModal: 'some',
			workspaceFolders: [{ uri: URI.file('/repo') }],
			layoutState: [{
				sessionResource: session1.toString(),
				editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
				viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID },
			}],
		});

		// Start on a session without a working set.
		harness.activeSessionObs.set(makeSession(session2), undefined);
		await timeout(0);

		// Small window, aux bar open, editor closed: not constrained yet (editor hidden).
		setPartVisible(Parts.AUXILIARYBAR_PART, true);
		setPartVisible(Parts.EDITOR_PART, false);
		resizeWindow(800);
		harness.setPartHiddenCalls = [];

		// Navigate to the session whose working set reveals the editor (async).
		harness.activeSessionObs.set(makeSession(session1), undefined);
		await timeout(0);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7] does not manage the sidebar while multiple sessions are visible', () => {
		createController();
		harness.visibleSessionsObs.set([
			makeSession(URI.parse('session:1')),
			makeSession(URI.parse('session:2')),
		], undefined);
		harness.setPartHiddenCalls = [];

		resizeWindow(800);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	// --- [D7 single-pane] Auto-hide the sessions list only on explicit details open ---

	test('[D7 single-pane] hides the sessions list when details is opened via the toggle action', () => {
		const controller = createSinglePaneController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		controller.toggleDetails();

		assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
	});

	test('[D7 single-pane] restores the sessions list when details is closed via the toggle action', () => {
		const controller = createSinglePaneController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		controller.toggleDetails();
		harness.setPartHiddenCalls = [];

		// Details now open -> toggling again closes it and restores the auto-hidden list.
		controller.toggleDetails();

		assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
	});

	test('[D7 single-pane] does not touch the sessions list on automatic details opens', () => {
		createSinglePaneController();
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// A programmatic aux-bar visibility change (submit/restore) is not the
		// toggle action, so the sessions list stays as-is.
		setPartVisible(Parts.AUXILIARYBAR_PART, true);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7 single-pane] does not manage the sessions list while multiple sessions are visible', () => {
		const controller = createSinglePaneController();
		harness.visibleSessionsObs.set([
			makeSession(URI.parse('session:1')),
			makeSession(URI.parse('session:2')),
		], undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		controller.toggleDetails();

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7 single-pane] does not restore a sessions list the user reopened manually', () => {
		const controller = createSinglePaneController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		controller.toggleDetails();

		// User manually reopens the sessions list -> control handed back.
		setPartVisible(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// Closing details must now not touch the sessions list.
		controller.toggleDetails();

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7 single-pane] restores an auto-hidden sessions list once the side pane is fully hidden', () => {
		const controller = createSinglePaneController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		// Opening details auto-hides the sessions list (only the aux bar is visible).
		controller.toggleDetails();
		harness.setPartHiddenCalls = [];

		// The whole side pane is later hidden by other means (e.g. switching to a
		// quick chat, which has no side pane). The list must not be left collapsed
		// while the side pane is hidden, so restore it.
		setPartVisible(Parts.AUXILIARYBAR_PART, false);

		assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
	});

	test('[D7 single-pane] does not restore a manually-hidden sessions list when the side pane is hidden', () => {
		createSinglePaneController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		// User manually closes the sessions list (not an auto-hide).
		setPartVisible(Parts.SIDEBAR_PART, false);
		harness.setPartHiddenCalls = [];

		// The side pane later fully closes; a user-closed list must stay closed.
		setPartVisible(Parts.AUXILIARYBAR_PART, false);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[D7 single-pane] contributes the Toggle Details command to the editor title layout cluster', () => {
		createSinglePaneController();

		const items = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === TOGGLE_DETAILS_COMMAND_ID);

		assert.strictEqual(items.length, 1, 'exactly one Toggle Details item on the editor title layout cluster');
		const when = items[0].when?.serialize() ?? '';
		assert.deepStrictEqual({
			icon: ThemeIcon.isThemeIcon(items[0].command.icon) ? items[0].command.icon.id : undefined,
			order: items[0].order,
			hasToggled: !!items[0].command.toggled,
			gatedOnEditorArea: when.includes(MainEditorAreaVisibleContext.key),
			gatedOnChangesOrFilesTab: when.includes(SinglePaneDetailChangesOrFilesActiveContext.key),
		}, {
			icon: Codicon.listSelection.id,
			// Conditional (hidden for tab types with no detail, e.g. browser and
			// search), but keeps its trailing position after the always-present
			// maximize (order 10) and hide-editor (order 20) items.
			order: 30,
			hasToggled: true,
			gatedOnEditorArea: true,
			gatedOnChangesOrFilesTab: true,
		});
	});

	// --- [Scenario 8] Auto-hide the sessions list when opening a file ---

	function openEditor(editor: EditorInput): void {
		const event: IEditorWillOpenEvent = { groupId: 1, editor };
		harness.onWillOpenEditor.fire(event);
	}

	test('[Scenario 8] hides the sessions list when a real file is opened in a created session with the editor closed', async () => {
		createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		openEditor(Object.create(FileEditorInput.prototype) as FileEditorInput);

		assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
	});

	test('[Scenario 8] does not hide the sessions list in a new (uncreated) session', async () => {
		createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		openEditor(Object.create(FileEditorInput.prototype) as FileEditorInput);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[Scenario 8] does not hide the sessions list when the editor area is already open', async () => {
		createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		openEditor(Object.create(FileEditorInput.prototype) as FileEditorInput);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[Scenario 8] does not hide the sessions list when a managed empty tab is opened', async () => {
		createSinglePaneController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		openEditor(store.add(new EmptyFileEditorInput()));

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	test('[Scenario 8] does not hide the sessions list on file open while multiple sessions are visible', () => {
		createSinglePaneController();
		harness.visibleSessionsObs.set([
			makeSession(URI.parse('session:1')),
			makeSession(URI.parse('session:2')),
		], undefined);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];

		openEditor(Object.create(FileEditorInput.prototype) as FileEditorInput);

		assert.deepStrictEqual(sidebarHiddenCalls(), []);
	});

	// --- [D10] Auxiliary bar part hidden when it has no active view containers ---

	test('[D10] hides the aux-bar part for a quick chat when its view containers are gated off', async () => {
		createController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);
		harness.activeAuxViewContainerIds = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// A quick chat gates off Changes + Files, so the aux bar has no active
		// view containers — the part must hide instead of showing an empty column.
		harness.onDidChangeActiveViewDescriptors.fire();

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux-bar part should hide when a quick chat has no active view containers'
		);
	});

	test('[D10] does not hide the aux bar during early reload when there is no active session yet', () => {
		createController({ activeAuxViewContainerIds: [] });
		// Startup/reload: aux restored visible (persisted) but no active session yet;
		// its containers are transiently inactive. Hiding here is the reload flicker
		// (opens then closes) — D10 must leave it alone until a session settles.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.onDidChangeActiveViewDescriptors.fire();

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			[],
			'aux-bar part must not be hidden by D10 while there is no active session'
		);
	});

	test('[D10] does not hide the aux bar for a workspace session with transiently empty containers', async () => {
		createController({ activeAuxViewContainerIds: [] });
		// A real workspace session whose Files/Changes context keys have not settled
		// yet (containers transiently inactive). D10 must not collapse its side pane.
		harness.activeSessionObs.set(makeSession(URI.parse('session:ws')), undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.onDidChangeActiveViewDescriptors.fire();

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			[],
			'aux-bar part must not be hidden by D10 for a workspace session with transiently empty containers'
		);
	});

	test('[D10] never reveals an empty aux-bar part', async () => {
		createController({ activeAuxViewContainerIds: [] });
		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		harness.onDidChangeActiveViewDescriptors.fire();

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'aux-bar part should never be revealed when it has no active view containers'
		);
	});

	test('[D10] re-hides the aux-bar part if a switch to a quick chat left it visible with no containers', async () => {
		createController({ activeAuxViewContainerIds: [] });
		// Mirror a switch to a workspace-less quick chat where D3a returned early
		// (no workspace) and left a previously-visible aux bar showing.
		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.onDidChangeViewContainerVisibility.fire({ id: CHANGES_VIEW_CONTAINER_ID, visible: false, location: ViewContainerLocation.AuxiliaryBar });

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux-bar part should be hidden reactively when a quick chat has no active view containers'
		);
	});

	test('[D10] leaves the aux-bar part alone when it has active view containers', () => {
		createController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// Changes + Files still active (default) — the reactive sync must not touch the part.
		harness.onDidChangeActiveViewDescriptors.fire();

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART),
			[],
			'aux-bar part should be left as-is while it has active view containers'
		);
	});

	test('[D10] hides the aux-bar part when a quick chat becomes visible with no active containers', async () => {
		createController({ activeAuxViewContainerIds: [] });
		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		// The part became visible (e.g. a bare detail toggle that shows the column
		// before any container is opened) without any container-/descriptor-change
		// signal firing. For a quick chat D10 must still reconcile the empty column
		// away so the toggle/context key never reads "on" over a blank panel.
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'aux-bar part should hide when a quick chat becomes visible with no active view containers'
		);
	});

	test('[D10] leaves the aux-bar part visible when it becomes visible with active containers', () => {
		createController();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART),
			[],
			'aux-bar part should stay visible when it becomes visible with active view containers'
		);
	});

	// --- [D10] Toggle Side Panel with an empty aux bar ---

	test('[D10] toggling the side pane with no aux containers reveals the editor, not an empty aux bar', () => {
		const controller = createController({ activeAuxViewContainerIds: [] });
		// Side pane fully closed; editors exist but no aux view containers.
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.editorGroupsHaveContent = true;
		harness.setPartHiddenCalls = [];

		controller.toggleSidePane();

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'toggle should reveal the editor part'
		);
		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'toggle should never reveal an empty aux bar'
		);
	});

	test('[D10] toggling the side pane with neither editors nor aux containers reveals nothing', () => {
		const controller = createController({ activeAuxViewContainerIds: [] });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.editorGroupsHaveContent = false;
		harness.setPartHiddenCalls = [];

		controller.toggleSidePane();

		assert.deepStrictEqual(
			harness.setPartHiddenCalls.filter(c => c.hidden === false),
			[],
			'toggle should reveal nothing when there is no content on either side'
		);
	});

	// --- Single-pane managed docked tabs (Changes + Files placeholder) ---

	async function settle(): Promise<void> {
		for (let i = 0; i < 6; i++) {
			await timeout(0);
		}
	}

	function hasFilesTab(): boolean {
		return harness.activeGroupEditors.some(e => e instanceof EmptyFileEditorInput);
	}

	function hasChangesTab(): boolean {
		return harness.activeGroupEditors.some(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined);
	}

	test('[managed tabs] ensures the Changes and Files tabs for a created session under suppression', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});

	test('[managed tabs / Changes pill] reveals the editor area before opening the managed Changes editor', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];

		const handler = CommandsRegistry.getCommand('workbench.agentSessions.action.viewChanges')?.handler;
		assert.ok(handler, 'Changes pill command should be registered');

		await handler(harness.instaService, session);
		await settle();

		assert.deepStrictEqual({
			editorRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			hasChangesTab: hasChangesTab(),
		}, {
			editorRevealed: true,
			hasChangesTab: true,
		});
	});

	test('[managed tabs / Scenario 9] shows only the Files tab for a new-session view', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
	});

	test('[managed tabs / Scenario 9] removes the Files tab while a real editor is open and re-adds it when none remain', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		assert.strictEqual(hasFilesTab(), true);

		// A real file opens into a visible editor area.
		const realEditor = store.add(new TestStubEditorInput(URI.file('/repo/a.ts')));
		harness.activeGroupEditors.push(realEditor);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidEditorsChange.fire();
		await settle();
		const filesRemoved = !hasFilesTab();

		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			filesRemoved,
			filesReadded: hasFilesTab(),
		}, {
			filesRemoved: true,
			filesReadded: true,
		});
	});

	test('[managed tabs / Scenario 9] keeps the Files tab when a non-file editor (e.g. the browser) opens', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		assert.strictEqual(hasFilesTab(), true);

		// A non-file editor (the integrated browser uses the browserView scheme) opens
		// into a visible editor area. It must NOT collapse the Files placeholder.
		const browserEditor = store.add(new TestStubEditorInput(URI.parse('browserView://host/page')));
		harness.activeGroupEditors.push(browserEditor);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidEditorsChange.fire();
		await settle();

		assert.strictEqual(hasFilesTab(), true, 'a non-file editor must not remove the Files tab');
	});

	test('[single-pane] closes non-managed tabs when the editor area hides and reopens them when shown', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		// A real file opens between the managed tabs while the editor area is visible.
		const fileResource = URI.file('/repo/a.ts');
		harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();
		const originalIndex = harness.activeGroupEditors.findIndex(e => e.resource && isEqual(e.resource, fileResource));

		// Hide the editor area: the real file tab closes, the managed Files tab stays.
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await settle();

		const closedFile = harness.closedEditors.some(e => isEqual(e.resource!, fileResource));
		const filesTabKept = hasFilesTab();
		const fileTabGone = !harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, fileResource));

		// Show the editor area again: the file tab is reopened at its original position.
		harness.openedEditors = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();

		assert.deepStrictEqual({
			closedFile,
			filesTabKept,
			fileTabGone,
			reopenedFile: harness.openedEditors.some(e => isResourceEditorInput(e) && isEqual(e.resource, fileResource)),
			restoredAtOriginalIndex: harness.activeGroupEditors.findIndex(e => e.resource && isEqual(e.resource, fileResource)) === originalIndex,
		}, {
			closedFile: true,
			filesTabKept: true,
			fileTabGone: true,
			reopenedFile: true,
			restoredAtOriginalIndex: true,
		});
	});

	test('[managed tabs / Change 2] does not re-ensure a managed tab after the user closes it', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.ok(fileTab);

		// User closes the Files tab.
		const index = harness.activeGroupEditors.indexOf(fileTab);
		harness.activeGroupEditors.splice(index, 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.strictEqual(hasFilesTab(), false, 'the dismissed Files tab stays closed');
	});

	test('[managed tabs / Change 2] re-ensures a dismissed tab after switching sessions', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		const index = harness.activeGroupEditors.indexOf(fileTab);
		harness.activeGroupEditors.splice(index, 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		// Switching sessions clears dismissals and re-populates.
		harness.activeSessionObs.set(makeSession(URI.parse('session:2')), undefined);
		await settle();

		assert.strictEqual(hasFilesTab(), true, 'a dismissed tab is re-ensured for the new session');
	});

	test('[managed tabs / add-tab] closing the Changes tab flips SinglePaneChangesTabMissingContext', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), false);

		// User closes the Changes tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
		}, { hasChangesTab: false, changesTabMissing: true });
	});

	test('[managed tabs / add-tab] closing the Files tab flips SinglePaneFilesTabMissingContext', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key), false);

		// User closes the Files tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			filesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key)
		}, { hasFilesTab: false, filesTabMissing: true });
	});

	test('[managed tabs / add-tab] reopening the Changes tab clears its dismissal and the missing context', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = URI.parse('session:1');
		harness.activeSessionObs.set(makeSession(session), undefined);
		await settle();
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;

		// User closes the Changes tab -> dismissed, context becomes true.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), true);

		// Reopen it (as the `+` "Changes" entry does): the Changes editor reappears.
		const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
		harness.activeGroupEditors.push(store.add(new TestStubEditorInput(changesResource)));
		harness.onDidEditorsChange.fire();
		await settle();

		// The dismissal is cleared so the controller resumes managing the tab: a
		// later routine sync retains it and the missing context stays false.
		harness.onDidEditorsChange.fire();
		await settle();
		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
		}, { hasChangesTab: true, changesTabMissing: false });
	});

	test('[managed tabs / add-tab] reopening managed tabs from the plus menu adds them at the end', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = URI.parse('session:1');
		harness.activeSessionObs.set(makeSession(session), undefined);
		await settle();

		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		const filesTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		const extraEditor = store.add(new TestStubEditorInput(URI.file('/repo/extra.ts')));
		harness.activeGroupEditors.push(extraEditor);

		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
		harness.onDidCloseEditor.fire({ editor: filesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		await new NewChangesTabAction().run(harness.instaService);
		await new NewFileTabAction().run(harness.instaService);

		assert.deepStrictEqual(harness.activeGroupEditors.map(editor => {
			if (editor === extraEditor) {
				return 'extra';
			}
			if (editor instanceof EmptyFileEditorInput) {
				return 'files';
			}
			if (editor.resource && isEqual(editor.resource, harness.sessionChangesService.getChangesEditorResource(session))) {
				return 'changes';
			}
			return 'other';
		}), ['extra', 'changes', 'files']);
	});

	test('[managed tabs / reload] closing a stale Changes tab happens under editor-visibility suppression', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		// A stale Changes tab for a previous session is restored into the group.
		const staleChangesResource = harness.sessionChangesService.getChangesEditorResource(URI.parse('session:stale'));
		harness.activeGroupEditors.push(store.add(new TestStubEditorInput(staleChangesResource)));

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		const staleClosed = harness.closedEditors.some(e => e.resource && isEqual(e.resource, staleChangesResource));
		const allClosesSuppressed = harness.closeSuppressionFlags.every(flag => flag);
		assert.deepStrictEqual({ staleClosed, allClosesSuppressed }, { staleClosed: true, allClosesSuppressed: true });
	});

	test('[managed tabs / Issue 1] re-ensures the Files tab when the side pane is reopened via the aux bar alone', async () => {
		createSinglePaneController({ activateAux: true, initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.ok(fileTab);

		// User closes the Files tab; the whole side pane closes (aux hidden).
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		// Reopen the side pane by revealing ONLY the aux bar (editor stays hidden).
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await settle();

		assert.strictEqual(hasFilesTab(), true, 'reopening via the aux bar re-ensures the Files tab');
	});
});
