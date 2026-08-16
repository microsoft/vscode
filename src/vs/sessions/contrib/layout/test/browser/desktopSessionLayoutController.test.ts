/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { ISessionFileChange, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, HasDockedDetailsContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../../workbench/common/editor/diffEditorInput.js';
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
		readonly sidePaneToggles: { collapsed: boolean; previousAuxiliaryBarVisible: boolean; auxiliaryBarVisible: boolean }[] = [];
		get isTogglingSidePane(): boolean { return this._togglingSidePane; }
		protected override _onSidePaneToggled(collapsed: boolean, previousAuxiliaryBarVisible: boolean, auxiliaryBarVisible: boolean): void {
			this.sidePaneToggles.push({ collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible });
			super._onSidePaneToggled(collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible);
		}
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

	function makeFileEditor(path: string = '/repo/package.json'): FileEditorInput {
		const fileEditor = Object.create(FileEditorInput.prototype) as FileEditorInput;
		Object.defineProperty(fileEditor, 'resource', { value: URI.file(path) });
		return fileEditor;
	}

	function makeDiffEditor(): DiffEditorInput {
		return Object.create(DiffEditorInput.prototype) as DiffEditorInput;
	}

	function makeMultiDiffEditor(): MultiDiffEditorInput {
		return Object.create(MultiDiffEditorInput.prototype) as MultiDiffEditorInput;
	}

	function makeWebviewEditor(viewType: string, providerId?: string): WebviewInput {
		const editor = Object.create(WebviewInput.prototype) as WebviewInput;
		Object.defineProperty(editor, 'viewType', { value: viewType });
		Object.defineProperty(editor, 'providerId', { value: providerId });
		return editor;
	}

	function openEditor(editor: EditorInput): void {
		const event: IEditorWillOpenEvent = { groupId: 1, editor };
		harness.onWillOpenEditor.fire(event);
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

	test('[D3d] defaults to Files while the session has no changes', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(session, undefined);

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: true,
			openedChanges: false,
		});
	});

	test('[D3d] defaults to Changes once one of the session chats has a change', () => {
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
			openedFiles: false,
			openedChanges: true,
		});
	});

	test('[D3d] does not switch a side pane that is already showing Files when a change lands', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(session, undefined);
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;

		harness.openedViews = [];
		harness.openedViewContainers = [];
		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: false,
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

	test('[single-pane] keeps editor and detail visibility unchanged when switching sessions', async () => {
		createSinglePaneController();
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);
		harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(sessionB, undefined);
		harness.visibleSessionsObs.set([sessionB], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			visibilityRestores: harness.setPartHiddenCalls.filter(call =>
				call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART),
		}, {
			editorVisible: true,
			detailVisible: false,
			visibilityRestores: [],
		});
	});

	test('[single-pane] restores the detail panel after a browser tab hides it', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);

		assert.strictEqual(hasDockedDetails(), false, 'hidden target should clear the editor chevron context');

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		assert.strictEqual(hasDockedDetails(), true, 'changes target should enable the editor chevron context');

		const browserEditor = Object.create(BrowserEditorInput.prototype) as BrowserEditorInput;
		Object.defineProperty(browserEditor, 'resource', { value: URI.parse('browser://test') });

		harness.activeEditorInput = browserEditor;
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'browser target should clear the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'browser tabs should hide the detail panel'
		);
		harness.activeSessionObs.set(makeSession(URI.parse('session:2')), undefined);
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = store.add(new EmptyFileEditorInput(undefined, harness.layoutService));
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), true, 'files target should enable the editor chevron context');
		await timeout(0);

		assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), true,
			'file tabs should leave the restored detail panel visible');
		assert.ok(
			harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			'file tabs should reopen the Files container after browser hides it'
		);

		// A search tab (any non-changes/non-file editor) has no detail panel, so
		// the chevron context must clear just like the browser tab does.
		harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse('search-editor://test')));
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'search target should clear the editor chevron context');
	});

	test('[single-pane] clears docked-details context when no session is active', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await timeout(0);
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), true);

		harness.activeSessionObs.set(undefined, undefined);
		await timeout(0);

		assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), false);
	});

	test('[single-pane] Hide Editor while a Browser tab is active shows the Changes/Files fallback instead of hiding it again', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		const browserEditor = Object.create(BrowserEditorInput.prototype) as BrowserEditorInput;
		Object.defineProperty(browserEditor, 'resource', { value: URI.parse('browser://test') });
		harness.activeEditorInput = browserEditor;
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), false, 'browser tab should hide the detail panel while the editor area is visible');

		// Mirror HideMainEditorPartAction.run(): reveal the auxiliary bar, then hide the editor part.
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		await timeout(0);

		assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), true, 'the detail panel must stay revealed once the editor area is hidden, not be forced shut again');
		assert.strictEqual(hasDockedDetails(), true, 'the Changes/Files fallback should enable the editor chevron context');
		assert.ok(harness.openedViewContainers.includes(CHANGES_VIEW_CONTAINER_ID), 'a created session should fall back to the Changes container');

		// Show Editor while still on Browser must restore the "Browser hides the detail" invariant.
		harness.setPartHiddenCalls = [];
		harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		await timeout(0);
		assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), false, 'the detail panel should hide again once Browser is active with the editor area visible');
	});

	test('[single-pane] hides the detail panel when the main editor part is empty and keeps it closed on tab open', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);
		assert.strictEqual(hasDockedDetails(), true, 'non-empty no-active-editor fallback should keep contextual detail active');

		harness.setPartHiddenCalls = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.editorGroupsHaveContent = false;
		harness.activeEditorInput = undefined;
		harness.onDidEditorsChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			hasDockedDetails: hasDockedDetails(),
			hiddenCalls: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length,
		}, {
			hasDockedDetails: false,
			hiddenCalls: 1,
		});

		// A real file tab re-opens: the context key flips back on and Details is restored.
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.editorGroupsHaveContent = true;
		harness.activeEditorInput = makeFileEditor();
		harness.onDidEditorsChange.fire();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			hasDockedDetails: hasDockedDetails(),
			reveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		}, {
			hasDockedDetails: true,
			reveals: 1,
			openedFiles: true,
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

		// Detail closed by the global visibility choice, not a browser-tab hide.
		harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		await timeout(0);

		// A file tab becomes active: the detail must stay closed (no force-reveal).
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = makeFileEditor();
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

	test('[single-pane] maps all diff editors to Changes and all file editors to Files', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(0);

		const openedContainers: (string | undefined)[] = [];
		for (const editor of [makeDiffEditor(), makeMultiDiffEditor(), makeFileEditor('/outside/repo.txt')]) {
			harness.openedViewContainers = [];
			harness.activeEditorInput = editor;
			harness.onDidActiveEditorChange.fire();
			await timeout(0);
			openedContainers.push(harness.openedViewContainers[harness.openedViewContainers.length - 1]);
		}

		assert.deepStrictEqual(openedContainers, [
			CHANGES_VIEW_CONTAINER_ID,
			CHANGES_VIEW_CONTAINER_ID,
			SESSIONS_FILES_CONTAINER_ID,
		]);
	});

	test('[single-pane] applies the active editor detail when the hidden detail panel is reopened', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.activeEditorInput = makeFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		harness.openedViewContainers = [];
		harness.activeEditorInput = makeDiffEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		const openedWhileHidden = [...harness.openedViewContainers];
		harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await timeout(0);

		assert.deepStrictEqual({
			openedWhileHidden,
			openedAfterReveal: harness.openedViewContainers,
		}, {
			openedWhileHidden: [],
			openedAfterReveal: [CHANGES_VIEW_CONTAINER_ID],
		});
	});

	test('[single-pane] maps Markdown preview editors to Files', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(0);

		const openedContainers: (string | undefined)[] = [];
		for (const [viewType, providerId] of [
			['mainThreadWebview-markdown.preview', 'markdown.preview'],
			['vscode.markdown.editor', undefined],
			['vscode.markdown.preview.editor', undefined],
		] as const) {
			harness.openedViewContainers = [];
			harness.activeEditorInput = makeWebviewEditor(viewType, providerId);
			harness.onDidActiveEditorChange.fire();
			await timeout(0);
			openedContainers.push(harness.openedViewContainers[harness.openedViewContainers.length - 1]);
		}

		assert.deepStrictEqual(openedContainers, [
			SESSIONS_FILES_CONTAINER_ID,
			SESSIONS_FILES_CONTAINER_ID,
			SESSIONS_FILES_CONTAINER_ID,
		]);
	});

	test('[single-pane] does not force-reveal the detail on editor activation, during or after a restore', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		// The detail is hidden while the editor remains visible.
		harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		await timeout(0);

		// Hold a session-switch restore open. The restore makes a file editor
		// active; that editor change must NOT reveal the detail.
		let releaseRestore!: () => void;
		const restoreGate = new Promise<void>(resolve => { releaseRestore = resolve; });
		controller.runWithRestore(() => restoreGate);

		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];
		harness.activeEditorInput = makeFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0,
			'the detail must stay closed during a session-switch restore');

		// After the restore ends, a plain editor activation still does not reveal
		// the globally hidden detail.
		releaseRestore();
		await restoreGate;
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.activeEditorInput = makeFileEditor();
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
		harness.activeEditorInput = store.add(new EmptyFileEditorInput(undefined, harness.layoutService));
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.strictEqual(
			harness.setPartHiddenCalls.filter(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
			0);
	});

	test('[single-pane] carries an open side pane to the next session instead of restoring stale session state', async () => {
		createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		await timeout(0);
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleSessionsObs.set([sessionA], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(sessionB, undefined);
		harness.visibleSessionsObs.set([sessionB], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			aux: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			editor: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			aux: true,
			editor: true,
		});
	});

	test('[single-pane] retains the shared Existing profile through transient editor restoration on Existing-to-Existing navigation', async () => {
		const controller = createSinglePaneController({
			activateAux: true,
			workspaceFolders: [{ uri: URI.file('/repo') }],
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: true },
			},
		});
		await timeout(0);
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));

		harness.activeSessionObs.set(sessionA, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		harness.onApplyWorkingSet = () => {
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
			harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
			harness.editorGroupsHaveContent = false;
			harness.onDidEditorsChange.fire();
		};
		harness.activeSessionObs.set(sessionB, undefined);
		await timeout(0);

		harness.setPartHiddenCalls = [];
		harness.editorGroupsHaveContent = true;
		harness.onDidEditorsChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			auxiliaryBarReveals: harness.setPartHiddenCalls.filter(call => call.part === Parts.AUXILIARYBAR_PART && !call.hidden).length,
			perSessionViewState: controller.getViewState(sessionB.resource),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: false,
			auxiliaryBarReveals: 0,
			perSessionViewState: undefined,
		});
	});

	test('[single-pane] switches Existing detail content only after the incoming editor restore settles', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await settle();
		const sessionA = makeSession(URI.parse('session:a'));
		const sessionB = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(sessionA, undefined);
		harness.activeEditorInput = makeFileEditor();
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.onDidActiveEditorChange.fire();
		await settle();

		let releaseRestore!: () => void;
		const restoreGate = new Promise<void>(resolve => releaseRestore = resolve);
		controller.runWithRestore(() => restoreGate);
		harness.openedViewContainers = [];
		harness.activeSessionObs.set(sessionB, undefined);
		harness.activeEditorInput = store.add(new TestStubEditorInput(harness.sessionChangesService.getChangesEditorResource(sessionB.resource)));
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual(harness.openedViewContainers, [CHANGES_VIEW_CONTAINER_ID],
			'a concrete incoming editor may select its content before restore-end without opening outgoing Files');

		releaseRestore();
		await restoreGate;
		await settle();

		assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
		assert.strictEqual(harness.openedViewContainers.at(-1), CHANGES_VIEW_CONTAINER_ID);
	});

	test('[single-pane] persists resize-driven Details visibility for Existing Sessions', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		harness.activeSessionObs.set(makeSession(URI.parse('session:existing')), undefined);
		await timeout(0);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false, source: 'resize' });

		assert.deepStrictEqual(
			JSON.parse(harness.storageService.get('sessions.singlePane.sidePaneVisibility', StorageScope.WORKSPACE) ?? ''),
			{
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: false },
			}
		);
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

	test('[D4] keeps the open side pane on its current view when a new session is submitted', () => {
		const controller = createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// Aux bar is open on the new-session view, showing Files.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		harness.setPartHiddenCalls = [];
		harness.openedViews = [];
		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);

		assert.deepStrictEqual({
			hidden: harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
			viewState: controller.getViewState(session.resource),
		}, {
			hidden: false,
			openedChanges: false,
			viewState: {
				auxiliaryBarVisible: true,
				auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID,
			},
		});
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

	test('[D4] shows Files when a hidden side pane is opened after a change-free session is submitted', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);

		harness.openedViewContainers = [];
		harness.openedViews = [];
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: true,
			openedChanges: false,
		});
	});

	test('[D4] shows Changes when a hidden side pane is opened after the session produced a change', () => {
		createController();
		const session = makeSession(URI.parse('session:1'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);
		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);

		harness.openedViewContainers = [];
		harness.openedViews = [];
		harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
		}, {
			openedFiles: false,
			openedChanges: true,
		});
	});

	test('[D4] records Files when a change-free session falls back from an invalid saved container', () => {
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
		harness.openedViewContainers = [];
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });

		assert.deepStrictEqual({
			openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
			viewState: controller.getViewState(session.resource),
		}, {
			openedFiles: true,
			viewState: {
				auxiliaryBarVisible: true,
				auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID,
			},
		});
	});

	test('[D4] records Changes when a session with changes falls back from an invalid saved container', () => {
		const session = makeSession(URI.parse('session:1'), { changes: [makeChange('/file.ts')] });
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
		harness.openedViewContainers = [];
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

	test('[D9] Toggle Side Panel command calls the workbench layout service directly', async () => {
		createController();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		const handler = CommandsRegistry.getCommand('workbench.action.agentToggleSidePanel')?.handler;
		assert.ok(handler, 'Toggle Side Panel command should be registered');

		await handler(harness.instaService);

		assert.deepStrictEqual({
			toggleSidePaneCalls: harness.toggleSidePaneCalls,
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			toggleSidePaneCalls: 1,
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('[D9] controller derives the toggling state from workbench events', () => {
		const controller = createController();
		const togglingStates: boolean[] = [];
		store.add(harness.onDidChangePartVisibility.event(() => togglingStates.push(controller.isTogglingSidePane)));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		harness.layoutService.toggleSidePane();

		assert.deepStrictEqual({
			togglingStates,
			afterToggle: controller.isTogglingSidePane,
		}, {
			togglingStates: [true, true],
			afterToggle: false,
		});
	});

	// --- [D9b] Closing the whole side pane on a new (uncreated) session ---

	test('[D9b] closing the whole side pane on a new session keeps it closed for the next new session', () => {
		createController();
		const untitled1 = makeSession(URI.parse('session:untitled1'), { status: SessionStatus.Untitled });
		const existing = makeSession(URI.parse('session:existing'));
		const untitled2 = makeSession(URI.parse('session:untitled2'), { status: SessionStatus.Untitled });

		// Open a new (untitled) session — aux bar shows the Files view.
		harness.activeSessionObs.set(untitled1, undefined);
		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User closes the whole side pane (editor + aux bar) via the toggle.
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.layoutService.toggleSidePane();

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
		createController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });
		const other = makeSession(URI.parse('session:other'), { status: SessionStatus.Untitled });

		// Compose a new session — aux bar shows the Files view.
		harness.activeSessionObs.set(untitled, undefined);
		assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));

		// User closes the whole side pane while still composing the new session.
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.layoutService.toggleSidePane();

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
		createController({ revealAuxiliaryBarOnOpen: true });
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
		harness.layoutService.toggleSidePane();

		// Re-clicking Changes re-reveals the (still-active, just hidden) editor part
		// without firing an active-editor change; the side pane opens again (the
		// close was not remembered as an aux-bar choice).
		harness.openedViews = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), 'reopening Changes after closing the whole side pane should reveal the Changes view again');
	});

	test('[D9] reopening the side pane restores the parts that were visible when it was closed', () => {
		createController();
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		// Closing hides both parts.
		const visibleAfterClose = harness.layoutService.toggleSidePane();
		assert.strictEqual(visibleAfterClose, false, 'side pane should be hidden after closing');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true), 'aux bar should be hidden');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === true), 'editor should be hidden');

		// Reopening restores both parts that were visible before.
		harness.setPartHiddenCalls.length = 0;
		const visibleAfterOpen = harness.layoutService.toggleSidePane();
		assert.strictEqual(visibleAfterOpen, true, 'side pane should be visible after reopening');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false), 'editor should be restored');
		assert.ok(harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false), 'aux bar should be restored');
	});

	test('[D9] reopening reports the resulting auxiliary bar visibility', () => {
		const controller = createController();
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.layoutService.toggleSidePane();

		assert.deepStrictEqual(controller.sidePaneToggles, [{
			collapsed: false,
			previousAuxiliaryBarVisible: false,
			auxiliaryBarVisible: true,
		}]);
	});

	test('[D9] closing a maximized single-pane exits maximize and hides both parts', () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true });
		harness.editorMaximized = true;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		harness.layoutService.toggleSidePane();

		assert.deepStrictEqual({
			setEditorMaximizedCalls: harness.setEditorMaximizedCalls,
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			setEditorMaximizedCalls: [false],
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('[reopen default single-pane] a created session opens the side pane to the editor with the detail closed', () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true });
		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.editorGroupsHaveContent = true;

		// The side pane starts fully closed with no remembered parts (e.g. after a reload).
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		harness.layoutService.toggleSidePane();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, { editorVisible: true, detailVisible: false });
	});

	test('[reopen default single-pane] a new-session view restores the Files detail from remembered parts', () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true });
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		harness.editorGroupsHaveContent = true;

		// The workbench remembers this detail-only composition.
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		// Closing remembers { editor: false, auxiliaryBar: true } ...
		harness.layoutService.toggleSidePane();
		harness.setPartHiddenCalls = [];
		// ... so reopening restores exactly the Files detail (not the layout default).
		harness.layoutService.toggleSidePane();

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, { editorVisible: false, detailVisible: true });
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

	test('[single-pane] entering a new-session view hides only Editor when Empty Files is the only input', async () => {
		createSinglePaneController({ activateAux: true });
		await timeout(0);
		const existing = makeSession(URI.parse('session:existing'));
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(untitled, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			visibilityRestores: harness.setPartHiddenCalls.filter(call =>
				call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART),
		}, {
			editorVisible: false,
			detailVisible: false,
			visibilityRestores: [
				{ part: Parts.EDITOR_PART, hidden: true },
			],
		});
	});

	test('[single-pane] New Session opening rule does not re-run after a real editor opens', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		assert.strictEqual(harness.partVisibility.get(Parts.EDITOR_PART), false);

		const realEditor = store.add(new TestStubEditorInput(URI.file('/repo/a.ts')));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		openEditor(realEditor);
		harness.activeGroupEditors.push(realEditor);
		harness.onDidEditorsChange.fire();
		await settle();

		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
		harness.onDidEditorsChange.fire();
		await settle();

		assert.strictEqual(harness.partVisibility.get(Parts.EDITOR_PART), true);
	});

	test('[single-pane] reopening the side pane after closing Empty Files restores dock-only Files', async () => {
		createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
		await settle();
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput);
		assert.ok(filesTab);
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidCloseEditor.fire({ editor: filesTab });
		harness.onDidEditorsChange.fire();

		harness.layoutService.toggleSidePane();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			hasFilesTab: true,
			editorVisible: false,
			auxiliaryBarVisible: true,
		});
	});

	test('[single-pane] closing the last non-Empty editor while Editor is hidden opens Empty Files', async () => {
		createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
		await settle();
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();

		const lastEditor = store.add(new TestStubEditorInput(URI.parse('search-editor://last')));
		harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, lastEditor);
		harness.activeEditorInput = lastEditor;
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);

		harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor: lastEditor, groupId: 1 });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			hasFilesTab: true,
			editorVisible: false,
			auxiliaryBarVisible: true,
		});
	});

	test('[single-pane] closing the last visible file editor opens Empty Files and keeps Editor visible', async () => {
		createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
		await settle();
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();

		const lastEditor = store.add(new TestStubEditorInput(URI.file('/repo/last.ts')));
		harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, lastEditor);
		harness.activeEditorInput = lastEditor;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);

		harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
		harness.editorGroupsHaveContent = false;
		harness.onDidCloseEditor.fire({ editor: lastEditor, groupId: 1 });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			hasFilesTab: true,
			editorVisible: true,
			auxiliaryBarVisible: true,
		});
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

	test('[single-pane] working-set restore does not change global editor visibility', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
		const first = makeSession(URI.parse('session:first'));
		const existing = makeSession(URI.parse('session:existing'));

		harness.activeSessionObs.set(first, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			editorVisibilityChanges: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART),
		}, {
			editorVisible: false,
			editorVisibilityChanges: [],
		});
	});

	test('[single-pane] preserves current visibility when a draft is replaced on submit', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		const created = makeSession(URI.parse('session:created'));

		harness.activeSessionObs.set(draft, undefined);
		harness.visibleSessionsObs.set([draft], undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });

		harness.setPartHiddenCalls = [];
		transaction(tx => {
			(draft.isCreated as ISettableObservable<boolean>).set(true, tx);
			harness.activeSessionObs.set(created, tx);
		});
		harness.onDidReplaceSession.fire({ from: draft, to: created });
		harness.visibleSessionsObs.set([created], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorReveals: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden === false).length,
			editorHides: harness.setPartHiddenCalls.filter(c => c.part === Parts.EDITOR_PART && c.hidden === true).length,
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			editorReveals: 0,
			editorHides: 0,
			detailVisible: true,
			editorVisible: false,
		});
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

	test('[single-pane] keeps the side pane visible when a quick chat is active among multiple sessions', async () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
		const workspaceSession = makeSession(URI.parse('session:workspace'));
		const quickChat = makeSession(URI.parse('session:quick'), { isQuickChat: true });

		harness.activeSessionObs.set(workspaceSession, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		transaction(tx => {
			harness.visibleSessionsObs.set([workspaceSession, quickChat], tx);
			harness.activeSessionObs.set(quickChat, tx);
		});
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hideCalls: harness.setPartHiddenCalls.filter(call => call.hidden),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: true,
			hideCalls: [],
		});
	});

	test('[single-pane] restores open side-pane parts when an existing session is opened to the side', async () => {
		createSinglePaneController({
			singlePaneLayoutEnabled: true,
			activateAux: true,
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: true },
			},
		});
		const quickChat = makeSession(URI.parse('session:quick'), { isQuickChat: true });
		const existingSession = makeSession(URI.parse('session:existing'));

		harness.activeSessionObs.set(quickChat, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.setPartHiddenCalls = [];

		transaction(tx => {
			harness.visibleSessionsObs.set([quickChat, existingSession], tx);
			harness.activeSessionObs.set(existingSession, tx);
		});
		await timeout(0);
		harness.activeEditorInput = makeFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
			revealCalls: harness.setPartHiddenCalls.filter(call => !call.hidden),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: true,
			hasDockedDetails: true,
			revealCalls: [
				{ part: Parts.AUXILIARYBAR_PART, hidden: false },
				{ part: Parts.EDITOR_PART, hidden: false },
			],
		});
	});

	test('[single-pane] hides the side pane once when switching to Quick Chat', async () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
		await timeout(0);
		harness.activeSessionObs.set(makeSession(URI.parse('session:workspace')), undefined);
		await timeout(0);
		const outgoingEditor = store.add(new TestStubEditorInput(URI.parse('search-editor://outgoing')));
		harness.activeGroupEditors.push(outgoingEditor);
		harness.activeEditorInput = outgoingEditor;
		harness.editorGroupsHaveContent = true;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(makeSession(URI.parse('session:qc'), { isQuickChat: true }), undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hideOrder: harness.setPartHiddenCalls.filter(call =>
				call.hidden && (call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART)),
		}, {
			editorVisible: false,
			auxiliaryBarVisible: false,
			hideOrder: [
				{ part: Parts.EDITOR_PART, hidden: true },
				{ part: Parts.AUXILIARYBAR_PART, hidden: true },
			],
		});
	});

	test('[single-pane] restores the existing-session side pane profile after leaving a quick chat before managed tabs settle', async () => {
		createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
		await timeout(0);
		const workspaceSession = makeSession(URI.parse('session:workspace'));
		const quickChat = makeSession(URI.parse('session:qc'), { isQuickChat: true });

		harness.activeSessionObs.set(workspaceSession, undefined);
		await timeout(0);
		harness.editorGroupsHaveContent = false;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });

		harness.activeSessionObs.set(quickChat, undefined);
		await timeout(0);
		harness.setPartHiddenCalls = [];

		harness.activeSessionObs.set(workspaceSession, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			editorVisible: true,
			detailVisible: false,
		});
	});

	test('[single-pane] New Sessions ignore the stored New visibility profile', async () => {
		createSinglePaneController({
			singlePaneLayoutEnabled: true,
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: false },
			},
		});
		const existing = makeSession(URI.parse('session:existing'));
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });

		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);
		const existingState = {
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		};

		harness.activeSessionObs.set(draft, undefined);
		await timeout(0);
		const newState = {
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		};

		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			existingState,
			newState,
			restoredExistingState: {
				editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
				detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			},
		}, {
			existingState: { editorVisible: true, detailVisible: false },
			newState: { editorVisible: true, detailVisible: false },
			restoredExistingState: { editorVisible: true, detailVisible: false },
		});
	});

	test('[single-pane] background submit during Quick Chat does not overwrite visibility profiles', async () => {
		createSinglePaneController({
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: true },
			},
		});
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		const quickChat = makeSession(URI.parse('session:quick'), { isQuickChat: true });
		const committed = makeSession(URI.parse('session:committed'), { isCreated: true });

		harness.activeSessionObs.set(draft, undefined);
		await timeout(0);
		harness.activeSessionObs.set(quickChat, undefined);
		await timeout(0);
		(draft.isCreated as ISettableObservable<boolean>).set(true, undefined);
		harness.activeSessionObs.set(committed, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			profiles: JSON.parse(harness.storageService.get('sessions.singlePane.sidePaneVisibility', StorageScope.WORKSPACE) ?? ''),
		}, {
			editorVisible: true,
			auxiliaryBarVisible: true,
			profiles: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: true, auxiliaryBarVisible: true },
			},
		});
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
		harness.layoutService.toggleSidePane();
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
		harness.layoutService.toggleSidePane();
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
		harness.layoutService.toggleSidePane();
		harness.layoutService.toggleSidePane();

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
		createController({
			mainContainerWidth: 800,
			initialPartVisibility: new Map<Parts, boolean>([
				[Parts.SIDEBAR_PART, false],
				[Parts.EDITOR_PART, false],
				[Parts.AUXILIARYBAR_PART, false],
			]),
		});
		harness.setPartHiddenCalls = [];

		// Open the side pane (becomes space constrained), then close it again.
		harness.layoutService.toggleSidePane();
		harness.layoutService.toggleSidePane();

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

	// --- Single-pane Toggle Details leaves the Sessions sidebar untouched ---

	test('[single-pane] opening details does not hide the sessions list', () => {
		const controller = createSinglePaneController({ mainContainerWidth: 800 });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.setPartHiddenCalls = [];

		controller.toggleDetails();

		assert.deepStrictEqual({
			detailsVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			sidebarHiddenCalls: sidebarHiddenCalls(),
		}, {
			detailsVisible: true,
			sidebarHiddenCalls: [],
		});
	});

	test('[single-pane] closing details does not show a manually hidden sessions list', () => {
		const controller = createSinglePaneController({ mainContainerWidth: 800 });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.partVisibility.set(Parts.SIDEBAR_PART, false);
		harness.setPartHiddenCalls = [];

		controller.toggleDetails();

		assert.deepStrictEqual({
			detailsVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			sidebarHiddenCalls: sidebarHiddenCalls(),
		}, {
			detailsVisible: false,
			sidebarHiddenCalls: [],
		});
	});

	test('[D7 single-pane] contributes Toggle Details in the trailing editor header group', () => {
		createSinglePaneController();

		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === TOGGLE_DETAILS_COMMAND_ID);

		assert.strictEqual(items.length, 1, 'exactly one Toggle Details item on the editor header');
		const when = items[0].when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: items[0].group,
			icon: ThemeIcon.isThemeIcon(items[0].command.icon) ? items[0].command.icon.id : undefined,
			order: items[0].order,
			hasToggled: !!items[0].command.toggled,
			gatedOnEditorArea: when.includes(MainEditorAreaVisibleContext.key),
			gatedOnDockedDetails: when.includes(HasDockedDetailsContext.key),
		}, {
			group: 'navigation',
			icon: Codicon.listSelection.id,
			order: 10,
			hasToggled: true,
			gatedOnEditorArea: true,
			gatedOnDockedDetails: true,
		});
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

	test('[single-pane reload] preserves Aux-only layout while the active session is still restoring', async () => {
		createSinglePaneController({
			activateAux: true,
			initialPartVisibility: new Map([
				[Parts.EDITOR_PART, false],
				[Parts.AUXILIARYBAR_PART, true],
			]),
		});
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			editorReveals: harness.setPartHiddenCalls.filter(call => call.part === Parts.EDITOR_PART && !call.hidden).length,
			auxiliaryBarHides: harness.setPartHiddenCalls.filter(call => call.part === Parts.AUXILIARYBAR_PART && call.hidden).length,
		}, {
			editorVisible: false,
			auxiliaryBarVisible: true,
			editorReveals: 0,
			auxiliaryBarHides: 0,
		});
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

		const filesTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput);
		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			filesResource: filesTab?.resource?.toString()
		}, {
			hasChangesTab: true,
			filesResource: URI.file('/repo').toString()
		});
	});

	test('[managed tabs] updates the Files root when the active session changes', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const first = makeSession(URI.parse('session:1'), {
			workspace: {
				uri: URI.file('/repo/first'),
				label: 'first',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/repo'), workingDirectory: URI.file('/repo/first'), name: 'first', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false
			}
		});
		const second = makeSession(URI.parse('session:2'), {
			workspace: {
				uri: URI.file('/repo/second'),
				label: 'second',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/repo'), workingDirectory: URI.file('/repo/second'), name: 'second', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false
			}
		});

		harness.activeSessionObs.set(first, undefined);
		await settle();
		harness.activeSessionObs.set(second, undefined);
		await settle();

		const filesTabs = harness.activeGroupEditors.filter(e => e instanceof EmptyFileEditorInput);
		assert.deepStrictEqual(filesTabs.map(editor => editor.resource?.toString()), [URI.file('/repo/second').toString()]);
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

	test('[managed tabs / Scenario 9] shows only Files for a new-session view', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key),
		}, {
			hasChangesTab: false,
			hasFilesTab: true,
			changesTabMissing: false,
		});
	});

	test('[managed tabs / new session] keeps Changes unavailable after a delayed different-folder restore', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:created')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		harness.activeSessionObs.set(undefined, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		// A different default folder delays this restore until after the draft reconcile.
		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput);
		assert.ok(filesTab);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, filesTab);
			harness.activeEditorInput = filesTab;
			harness.onDidEditorsChange.fire();
		});
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
	});

	test('[managed tabs / submit] activates Changes only after a submitted session reports changes', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		// Submit from the Files tab: visibility and the active tab stay unchanged.
		harness.activeEditorInput = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput);
		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);
		await settle();

		const changesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		const changesActiveBeforeChanges = !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource);
		(session.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			changesActiveBeforeChanges,
			changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource),
		}, { hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
	});

	test('[managed tabs / submit] activates Changes after changes arrive on a resource-replace submit', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		// New-session draft active: only Files is present.
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(draft, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		// The provider commits the draft by replacing it with a new created resource.
		const committedResource = URI.parse('session:committed');
		const committed = makeSession(committedResource, { isCreated: true });
		transaction(tx => {
			(draft.isCreated as ISettableObservable<boolean>).set(true, tx);
			harness.activeSessionObs.set(committed, tx);
		});
		await settle();

		const changesResource = harness.sessionChangesService.getChangesEditorResource(committedResource);
		const changesActiveBeforeChanges = !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource);
		(committed.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			changesActiveBeforeChanges,
			changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource),
		}, { hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
	});

	test('[managed tabs / session switch] does not leak a superseded submit\'s "activate Changes" intent onto the switched-to session', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		// Session A is a new-session draft with only Files.
		const sessionA = makeSession(URI.parse('session:a'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		// Pause the very next Changes open so A's submit reconcile stalls mid-open.
		let releaseChangesOpen!: () => void;
		const changesOpenGate = new Promise<void>(resolve => { releaseChangesOpen = resolve; });
		let gateArmed = true;
		harness.onOpenChangesEditor = () => {
			if (gateArmed) {
				gateArmed = false;
				return changesOpenGate;
			}
			return undefined;
		};

		// Submit A: this queues a reconcile that opens the Changes tab *active*; it
		// stalls awaiting the gated open.
		(sessionA.isCreated as ISettableObservable<boolean>).set(true, undefined);
		(sessionA.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
		await settle();
		const aActiveCalls = harness.openChangesEditorCalls.filter(c => isEqual(c.sessionResource, sessionA.resource) && c.active);
		assert.strictEqual(aActiveCalls.length, 1, 'A\'s submit should open its Changes tab active (and stall on the gate)');

		// While A\'s submit reconcile is stalled, switch to a different created
		// session B (a plain switch — never a submit).
		const sessionB = makeSession(URI.parse('session:b'), { isCreated: true });
		harness.activeSessionObs.set(sessionB, undefined);
		await settle();

		// Release the gate: A\'s reconcile resumes, finds itself superseded, and must
		// NOT hand its "activate Changes" intent to B.
		releaseChangesOpen();
		await settle();

		// B, being a plain switch, must never have its Changes tab opened *active*.
		const bActiveCalls = harness.openChangesEditorCalls.filter(c => isEqual(c.sessionResource, sessionB.resource) && c.active);
		assert.deepStrictEqual({ bChangesOpenedActive: bActiveCalls.length }, { bChangesOpenedActive: 0 });
	});

	test('[managed tabs / session switch] does not publish workspace from a superseded reconcile', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'), {
			workspace: {
				uri: URI.file('/repo/a'),
				label: 'a',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/repo/a'), workingDirectory: URI.file('/repo/a'), name: 'a', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}
		});
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();

		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput)!;
		const publishedWorkspaces: string[] = [];
		store.add(filesTab.onDidChangeLabel(() => {
			const label = filesTab.workspace?.label;
			if (label) {
				publishedWorkspaces.push(label);
			}
		}));

		let releaseClose!: () => void;
		const closeGate = new Promise<void>(resolve => { releaseClose = resolve; });
		let gateArmed = true;
		harness.onReplaceEditors = () => {
			if (gateArmed) {
				gateArmed = false;
				return closeGate;
			}
			return undefined;
		};

		const sessionB = makeSession(URI.parse('session:b'), {
			workspace: {
				uri: URI.file('/repo/b'),
				label: 'b',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/repo/b'), workingDirectory: URI.file('/repo/b'), name: 'b', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}
		});
		harness.activeSessionObs.set(sessionB, undefined);
		await settle();

		const sessionC = makeSession(URI.parse('session:c'), {
			workspace: {
				uri: URI.file('/repo/c'),
				label: 'c',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/repo/c'), workingDirectory: URI.file('/repo/c'), name: 'c', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}
		});
		harness.activeSessionObs.set(sessionC, undefined);
		releaseClose();
		await settle();

		assert.deepStrictEqual(publishedWorkspaces, ['c']);
	});

	test('[managed tabs / details-only] always restores both docked inputs while only details are visible', async () => {
		createSinglePaneController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: false, auxiliaryBarVisible: true },
			},
		});
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// Simulate lifecycle removal of Files while Changes keeps the group non-empty.
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});

	test('[managed tabs / details-only] restores Files when the editor area hides without an editor change', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await settle();

		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await settle();

		assert.strictEqual(hasFilesTab(), true);
	});

	test('[managed tabs / details-only] an editor reveal does NOT force back a closed managed tab', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		// Simulate lifecycle removal of Files while Changes remains.
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		// Reopen the side pane with the editor area visible (not details-only): the
		// close is respected, so Files is not forced back.
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.onDidRevealSidePane.fire();
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: false });
	});

	test('[managed tabs / new session] re-opens Files when a working-set apply empties the group during the switch', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await settle();

		// A created session with its docked tabs.
		harness.activeSessionObs.set(makeSession(URI.parse('session:created')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// Switch to a new (uncreated) session. Its empty working set closes the
		// previous session's docked tabs, emptying the group — this happens under a
		// layout restore, not a user close.
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
			harness.onDidEditorsChange.fire();
		});
		await settle();

		// Only Files is restored for the uncreated session.
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
	});

	test('[managed tabs / new session] re-opens Files on restore-end even if no editor-change fires during the restore', async () => {
		const controller = createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:created')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// Switch to a new (uncreated) session; the working-set apply empties the
		// group during the restore but the transient editor-change is NOT observed
		// (it races the async close). Only the settled restore-end must re-open the
		// Files tab.
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
		});
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
	});

	test('[managed tabs / Scenario 9] removes the Files tab while a real editor is open and does not re-add it when that file closes', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		assert.strictEqual(hasFilesTab(), true);

		// A real file opens into a visible editor area. Production fires
		// onWillOpenEditor *before* the editor is added to the group.
		const realEditor = store.add(new TestStubEditorInput(URI.file('/repo/a.ts')));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		openEditor(realEditor);
		harness.activeGroupEditors.push(realEditor);
		harness.onDidEditorsChange.fire();
		await settle();
		const filesRemoved = !hasFilesTab();

		// Closing the file leaves the Changes tab (group non-empty), so the Files
		// placeholder is NOT re-added — the defaults return only when the group
		// empties and the side pane is reopened.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			filesRemoved,
			filesReadded: hasFilesTab(),
		}, {
			filesRemoved: true,
			filesReadded: false,
		});
	});

	test('[managed tabs / Scenario 9] keeps a Files tab the user adds via `+` while a real file is open', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		// A real file opens and tidies away the auto Files placeholder. Production
		// fires onWillOpenEditor *before* the editor is added to the group.
		const realEditor = store.add(new TestStubEditorInput(URI.file('/repo/a.ts')));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		openEditor(realEditor);
		harness.activeGroupEditors.push(realEditor);
		harness.onDidEditorsChange.fire();
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		// The user explicitly adds the Files tab via `+` (opens an EmptyFileEditorInput).
		const userFilesTab = store.add(new EmptyFileEditorInput(undefined, harness.layoutService));
		openEditor(userFilesTab);
		harness.activeGroupEditors.push(userFilesTab);
		harness.onDidEditorsChange.fire();
		await settle();

		// It must NOT be tidied away — the `+` add is not a real-file open.
		assert.strictEqual(hasFilesTab(), true, 'a user-added Files tab stays while a real file is open');

		// Re-activating the already-open real file (e.g. selecting its tab) fires
		// onWillOpenEditor while it is still in the group; the guard must treat this
		// as an activation, not a new open, so the user-added Files tab survives.
		openEditor(realEditor);
		harness.onDidActiveEditorChange.fire();
		await settle();
		assert.strictEqual(hasFilesTab(), true, 're-activating an open file must not tidy the user-added Files tab');
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
		openEditor(browserEditor);
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

		// Hide the editor area while the detail (aux bar) stays open — a detail-only
		// collapse. The real file tab closes, the managed Files tab stays.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
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

	test('[single-pane] closes non-managed tabs restored while only details are visible', async () => {
		const controller = createSinglePaneController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: false, auxiliaryBarVisible: true },
			},
		});
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		const fileResource = URI.file('/repo/restored.ts');
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
			harness.onDidEditorsChange.fire();
		});
		await settle();

		assert.deepStrictEqual({
			closedFile: harness.closedEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource)),
			fileTabVisible: harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource)),
			filesTabVisible: hasFilesTab(),
		}, {
			closedFile: true,
			fileTabVisible: false,
			filesTabVisible: true,
		});
	});

	test('[single-pane] closes and reopens non-managed tabs added while only details are visible', async () => {
		createSinglePaneController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: true },
				existingSession: { editorVisible: false, auxiliaryBarVisible: true },
			},
		});
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		const fileResource = URI.file('/repo/added.ts');
		harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
		harness.onDidEditorsChange.fire();
		await settle();

		const fileTabVisibleWhileDetailsOnly = harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource));

		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();

		assert.deepStrictEqual({
			closedFile: harness.closedEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource)),
			fileTabVisibleWhileDetailsOnly,
			reopenedFile: harness.openedEditors.some(editor => isResourceEditorInput(editor) && isEqual(editor.resource, fileResource)),
		}, {
			closedFile: true,
			fileTabVisibleWhileDetailsOnly: false,
			reopenedFile: true,
		});
	});

	test('[single-pane] closes a non-restorable non-docked tab (e.g. untitled Search) when the editor area hides, without restoring it', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		// A dirty, non-restorable editor (like an untitled Search editor) opens
		// between the managed tabs while the editor area is visible.
		const searchResource = URI.parse('search-editor:/Untitled-1');
		harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(searchResource, { dirty: true, nonRestorable: true })));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();

		// Hide the editor area while the detail (aux bar) stays open — a detail-only
		// collapse. The non-docked tab closes even though it is dirty and cannot be
		// captured; only the managed Files tab remains.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await settle();

		const closedSearch = harness.closedEditors.some(e => isEqual(e.resource!, searchResource));
		const searchTabGone = !harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, searchResource));

		// Show the editor area again: the non-restorable tab is NOT reopened.
		harness.openedEditors = [];
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();

		assert.deepStrictEqual({
			closedSearch,
			searchTabGone,
			filesTabKept: hasFilesTab(),
			reopenedSearch: harness.openedEditors.some(e => isResourceEditorInput(e) && isEqual(e.resource, searchResource)),
		}, {
			closedSearch: true,
			searchTabGone: true,
			filesTabKept: true,
			reopenedSearch: false,
		});
	});

	test('[single-pane] does NOT close editors when the whole side pane is closed (editor + aux hidden)', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		// A real file is open between the managed tabs, both parts visible.
		const fileResource = URI.file('/repo/a.ts');
		harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await settle();
		harness.closedEditors = [];

		// Close the whole side pane: the aux bar is hidden first, then the editor
		// area (matching toggleSidePane's order). No editors must be closed.
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		await settle();

		assert.deepStrictEqual({
			anyEditorClosed: harness.closedEditors.length > 0,
			fileStillPresent: harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, fileResource)),
		}, {
			anyEditorClosed: false,
			fileStillPresent: true,
		});
	});

	test('[managed tabs / lifecycle removal] does not re-open a missing managed tab while the group stays non-empty', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.ok(fileTab);

		// Simulate lifecycle removal of the non-closeable Files tab.
		const index = harness.activeGroupEditors.indexOf(fileTab);
		harness.activeGroupEditors.splice(index, 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.strictEqual(hasFilesTab(), false, 'the closed Files tab stays closed');
	});

	test('[managed tabs / close] re-opens the default tabs for the new session after switching (empty group)', async () => {
		const controller = createSinglePaneController({ activateAux: true });
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

		// The switched-to session's working set closes the previous session's tabs,
		// leaving an empty group when the restore settles.
		harness.activeSessionObs.set(makeSession(URI.parse('session:2')), undefined);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.length = 0;
			harness.activeEditorInput = undefined;
			harness.onDidEditorsChange.fire();
		});
		await settle();

		assert.strictEqual(hasFilesTab(), true, 'the default tabs are opened for the new session');
	});

	test('[managed tabs / session switch] preserves a dismissed Files tab while replacing Changes in place', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session1 = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session1, undefined);
		await settle();
		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
		harness.onDidCloseEditor.fire({ editor: filesTab });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: false });

		const session2 = makeSession(URI.parse('session:2'));
		harness.activeSessionObs.set(session2, undefined);
		await settle();

		const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(session2.resource);
		assert.deepStrictEqual({
			hasIncomingChangesTab: harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, incomingChangesResource)),
			hasFilesTab: hasFilesTab(),
			editorCount: harness.activeGroupEditors.length,
		}, {
			hasIncomingChangesTab: true,
			hasFilesTab: false,
			editorCount: 1,
		});
	});

	test('[managed tabs / session switch] removes a dismissed Files tab restored by a previously visited session', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();

		const sessionB = makeSession(URI.parse('session:b'));
		harness.activeSessionObs.set(sessionB, undefined);
		await settle();
		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput)!;
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
		harness.onDidCloseEditor.fire({ editor: filesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		harness.onApplyWorkingSet = workingSet => {
			if (workingSet === 'empty' || workingSet.name !== `session-working-set:${sessionA.resource.toString()}`) {
				return;
			}
			harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, sessionA.workspace.get())));
			harness.onDidEditorsChange.fire();
		};
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();

		const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(sessionA.resource);
		assert.deepStrictEqual({
			hasIncomingChangesTab: harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, incomingChangesResource)),
			hasFilesTab: hasFilesTab(),
		}, {
			hasIncomingChangesTab: true,
			hasFilesTab: false,
		});
	});

	test('[managed tabs / session switch] keeps restored Files after a transiently empty group', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const sessionA = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		await settle();

		harness.activeGroupEditors.length = 0;
		harness.activeEditorInput = undefined;
		harness.onDidEditorsChange.fire();
		harness.onApplyWorkingSet = workingSet => {
			if (workingSet === 'empty' || workingSet.name !== `session-working-set:${sessionA.resource.toString()}`) {
				return;
			}
			harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, sessionA.workspace.get())));
			harness.onDidEditorsChange.fire();
		};
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();

		assert.strictEqual(hasFilesTab(), true);
	});

	test('[managed tabs / add-tab] a missing Changes tab flips SinglePaneChangesTabMissingContext', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), false);

		// Simulate an internal lifecycle removal of the non-closeable Changes tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			changesTabAvailable: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabAvailableContext.key),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
		}, { hasChangesTab: false, changesTabAvailable: true, changesTabMissing: true });
	});

	test('[managed tabs / add-tab] a missing Files tab flips SinglePaneFilesTabMissingContext', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key), false);

		// Simulate lifecycle removal of the non-closeable Files tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			filesTabAvailable: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabAvailableContext.key),
			filesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key)
		}, { hasFilesTab: false, filesTabAvailable: true, filesTabMissing: true });
	});

	test('[managed tabs / add-tab] reopening the Changes tab clears the missing context and is retained', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = URI.parse('session:1');
		harness.activeSessionObs.set(makeSession(session), undefined);
		await settle();
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;

		// Simulate an internal lifecycle removal of the non-closeable Changes tab.
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

		// The re-added tab makes the group non-empty, so a later routine sync
		// retains it and the missing context stays false.
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

	test('[managed tabs / session switch] replaces a stale Changes tab in place', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		// A stale Changes tab for a previous session is restored into the group.
		const staleChangesResource = harness.sessionChangesService.getChangesEditorResource(URI.parse('session:stale'));
		harness.activeGroupEditors.push(store.add(new TestStubEditorInput(staleChangesResource)));

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await settle();

		const staleClosed = harness.closedEditors.some(e => e.resource && isEqual(e.resource, staleChangesResource));
		const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
		const incomingPresent = harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, incomingChangesResource));
		assert.deepStrictEqual({ staleClosed, incomingPresent, editorCount: harness.activeGroupEditors.length }, {
			staleClosed: false,
			incomingPresent: true,
			editorCount: 1,
		});
	});

	test('[managed tabs / Issue 1] re-ensures the Files tab when the side pane is reopened via the aux bar alone', async () => {
		createSinglePaneController({ activateAux: true, initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.ok(fileTab);

		// Simulate lifecycle removal of Files followed by the side pane hiding.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		await settle();
		assert.strictEqual(hasFilesTab(), false);

		// Reopen the side pane by revealing ONLY the aux bar (editor stays hidden).
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.onDidRevealSidePane.fire();
		await settle();

		assert.strictEqual(hasFilesTab(), true, 'reopening via the aux bar re-ensures the Files tab');
	});

	test('[managed tabs / Issue 2] opening a file after the side pane was closed does not re-force the managed tabs', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = URI.parse('session:1');
		harness.activeSessionObs.set(makeSession(session), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// Simulate lifecycle cleanup removing both managed tabs and closing the side pane.
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		const filesTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		for (const tab of [changesTab, filesTab]) {
			harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
			harness.onDidCloseEditor.fire({ editor: tab });
		}
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });

		// The user opens a file: the side pane opens (editor part revealed) and a
		// real editor is added. Production fires onDidRevealSidePane on the reveal,
		// but the file is a real editor so the managed Changes/Files tabs must NOT
		// be re-forced.
		const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
		harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file('/repo/opened.ts'))));
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.onDidRevealSidePane.fire();
		harness.onDidActiveEditorChange.fire();
		harness.onDidEditorsChange.fire();
		await settle();

		const hasManagedChangesTab = harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, changesResource));
		assert.deepStrictEqual({ hasManagedChangesTab, hasFilesTab: hasFilesTab() }, { hasManagedChangesTab: false, hasFilesTab: false });
	});

	test('[managed tabs / Issue 2] toggling the empty side pane open re-populates the default managed tabs', async () => {
		createSinglePaneController({ activateAux: true });
		await settle();

		const session = URI.parse('session:1');
		harness.activeSessionObs.set(makeSession(session), undefined);
		await settle();

		// Simulate lifecycle cleanup removing both managed tabs and closing the side pane.
		for (const tab of [...harness.activeGroupEditors]) {
			harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
			harness.onDidCloseEditor.fire({ editor: tab });
		}
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
		harness.onDidEditorsChange.fire();
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });

		// The user reopens the side pane via the toggle action while the editor
		// group is empty: the default managed tabs must be re-populated.
		harness.onDidRevealSidePane.fire();
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});
});
