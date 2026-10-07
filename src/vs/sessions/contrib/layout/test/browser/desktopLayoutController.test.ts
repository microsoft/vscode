/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { DesktopChangesEditorTransitionContext, DesktopChangesTabAvailableContext, DesktopChangesTabMissingContext, HasDockedDetailsContext, DesktopFilesTabAvailableContext, DesktopFilesTabMissingContext } from '../../../../common/contextkeys.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { CustomEditorInput } from '../../../../../workbench/contrib/customEditor/browser/customEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../../workbench/common/editor/diffEditorInput.js';
import { IEditorWillOpenEvent, isResourceEditorInput } from '../../../../../workbench/common/editor.js';
import { DesktopLayoutController, TOGGLE_DETAILS_COMMAND_ID } from '../../browser/desktopLayoutController.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import '../../../changes/browser/changesActions.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { NewChangesTabAction, NewFileTabAction } from '../../../editor/browser/addTabActions.js';
import { addPeerChat, createTestHarness, ICreateOptions, ITestLayoutHarness, makeChange, makeSession, setActiveChat, TestStubEditorInput } from './layoutControllerTestUtils.js';
import '../../../editor/browser/editor.contribution.js';

suite('DesktopLayoutController', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestDesktopController extends DesktopLayoutController {
		/** Runs `work` while a session-switch layout restore is held (see `_withSessionLayoutRestore`). */
		runWithRestore(work: () => void | Promise<unknown>): void {
			this._withSessionLayoutRestore(work);
		}
		getViewState(sessionResource: URI) {
			return this._viewStateBySession.get(sessionResource);
		}
	}

	function createDesktopController(options: ICreateOptions = {}): TestDesktopController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestDesktopController));
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

	function makeCustomEditor(resource: URI = URI.file('/repo/custom.editor')): CustomEditorInput {
		const editor = Object.create(CustomEditorInput.prototype) as CustomEditorInput;
		Object.defineProperty(editor, 'resource', { value: resource });
		return editor;
	}

	function openEditor(editor: EditorInput): void {
		const event: IEditorWillOpenEvent = { groupId: 1, editor };
		harness.onWillOpenEditor.fire(event);
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('[desktop] keeps editor and detail visibility unchanged when switching sessions', async () => {
		createDesktopController();
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

	test('[desktop] hides details for self-contained editors and restores them for files', async () => {
		createDesktopController({ activateAux: true });
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

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];
		harness.activeEditorInput = makeCustomEditor();
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'custom editor target should clear the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'custom editors should hide the detail panel'
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

		harness.setPartHiddenCalls = [];
		const pullRequestEditor = Object.create(WebviewInput.prototype) as WebviewInput;
		Object.defineProperties(pullRequestEditor, {
			viewType: { value: 'mainThreadWebview-PullRequestOverview' },
			providerId: { value: 'PullRequestOverview' },
		});
		harness.activeEditorInput = pullRequestEditor;
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'pull request target should clear the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'pull request editors should hide the detail panel'
		);

		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];
		const issueEditor = Object.create(WebviewInput.prototype) as WebviewInput;
		Object.defineProperties(issueEditor, {
			viewType: { value: 'mainThreadWebview-IssueOverview' },
			providerId: { value: 'IssueOverview' },
		});
		harness.activeEditorInput = issueEditor;
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'issue target should clear the editor chevron context');
		await timeout(0);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'issue editors should hide the detail panel'
		);

		harness.activeEditorInput = pullRequestEditor;
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.setPartHiddenCalls = [];
		harness.visibleSessionsObs.set([session, makeSession(URI.parse('session:2'))], undefined);
		await timeout(0);
		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
			'pull request editors should hide the detail panel when multiple sessions are visible'
		);

		harness.setPartHiddenCalls = [];
		harness.activeEditorInput = store.add(new EmptyFileEditorInput(undefined, harness.layoutService));
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
			'file editors should restore details after a pull request editor while multiple sessions are visible'
		);

		harness.activeEditorInput = pullRequestEditor;
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		harness.visibleSessionsObs.set([session], undefined);

		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();
		assert.strictEqual(hasDockedDetails(), false, 'maximized pull request editors should keep the editor chevron context clear');
		harness.editorMaximized = false;
		harness.onDidChangeEditorMaximized.fire();

		// A search tab (any non-changes/non-file editor) has no detail panel, so
		// the chevron context must clear just like the browser tab does.
		harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse('search-editor://test')));
		harness.onDidActiveEditorChange.fire();
		assert.strictEqual(hasDockedDetails(), false, 'search target should clear the editor chevron context');
	});

	test('[desktop] clears docked-details context when no session is active', async () => {
		createDesktopController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await timeout(0);
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), true);

		harness.activeSessionObs.set(undefined, undefined);
		await timeout(0);

		assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), false);
	});

	test('[desktop] Hide Editor while a Browser tab is active shows the Changes/Files fallback instead of hiding it again', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] hides the detail panel when the main editor part is empty and keeps it closed on tab open', async () => {
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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

	test('[cmd+n] hides details for saved and untitled custom editors', async () => {
		createDesktopController({ activateAux: true });
		await timeout(0);

		const session = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		harness.setPartHiddenCalls = [];

		harness.activeEditorInput = makeCustomEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
		}, {
			hasDockedDetails: false,
			detailVisible: false,
		});

		harness.openedViewContainers = [];
		harness.activeEditorInput = makeCustomEditor(URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' }));
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		assert.deepStrictEqual({
			hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			filesDetailsOpened: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		}, {
			hasDockedDetails: false,
			detailVisible: false,
			filesDetailsOpened: false,
		});
	});

	test('[desktop] keeps the detail panel closed by default when a file/changes editor is active', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] maps diff editors to Changes and workspace file editors to Files', async () => {
		createDesktopController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(0);

		const openedContainers: (string | undefined)[] = [];
		for (const editor of [makeDiffEditor(), makeMultiDiffEditor(), makeFileEditor('/repo/file.ts')]) {
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

	test('[desktop] hides Details for external files and utility editors', async () => {
		const controller = createDesktopController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.activeEditorInput = makeFileEditor();
		harness.onDidActiveEditorChange.fire();
		await timeout(0);

		harness.activeEditorInput = makeFileEditor('/outside/repo.txt');
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		const externalFile = {
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
		};

		harness.openedViewContainers = [];
		controller.toggleDetails();
		await timeout(0);
		const externalFileAfterToggle = {
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			filesDetailsOpened: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
		};

		harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse('runtime-extensions:/default')));
		harness.onDidActiveEditorChange.fire();
		await timeout(0);
		const utilityEditor = {
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
		};

		assert.deepStrictEqual({ externalFile, externalFileAfterToggle, utilityEditor }, {
			externalFile: {
				detailVisible: false,
				hasDockedDetails: true,
			},
			externalFileAfterToggle: {
				detailVisible: true,
				filesDetailsOpened: true,
			},
			utilityEditor: {
				detailVisible: false,
				hasDockedDetails: false,
			},
		});
	});

	test('[desktop] applies the active editor detail when the hidden detail panel is reopened', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] does not map resource-less Markdown preview editors to Files', async () => {
		createDesktopController({ activateAux: true });
		await timeout(0);

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
		await timeout(0);

		const detailsVisibility: (boolean | undefined)[] = [];
		for (const [viewType, providerId] of [
			['mainThreadWebview-markdown.preview', 'markdown.preview'],
			['vscode.markdown.editor', undefined],
			['vscode.markdown.preview.editor', undefined],
		] as const) {
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
			harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
			harness.activeEditorInput = makeWebviewEditor(viewType, providerId);
			harness.onDidActiveEditorChange.fire();
			await timeout(0);
			detailsVisibility.push(harness.partVisibility.get(Parts.AUXILIARYBAR_PART));
		}

		assert.deepStrictEqual(detailsVisibility, [false, false, false]);
	});

	test('[desktop] does not force-reveal the detail on editor activation, during or after a restore', async () => {
		const controller = createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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

	test('[desktop] carries an open side pane to the next session instead of restoring stale session state', async () => {
		createDesktopController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
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

	test('[desktop] retains the shared Existing profile through transient editor restoration on Existing-to-Existing navigation', async () => {
		const controller = createDesktopController({
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

	test('[desktop] switches Existing detail content only after the incoming editor restore settles', async () => {
		const controller = createDesktopController({ activateAux: true });
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

	test('[desktop] persists resize-driven Details visibility for Existing Sessions', async () => {
		createDesktopController({ activateAux: true });
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

	test('[D9] closing a maximized desktop exits maximize and hides both parts', () => {
		createDesktopController({ desktopLayout: true });
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

	test('[reopen default desktop] a created session opens the side pane to the editor with the detail closed', () => {
		createDesktopController({ desktopLayout: true });
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

	test('[reopen default desktop] a new-session view restores the Files detail from remembered parts', () => {
		createDesktopController({ desktopLayout: true });
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

	test('[desktop] entering a new-session view shows Files Details and hides Editor when Empty Files is the only input', async () => {
		createDesktopController({ activateAux: true });
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
			detailVisible: true,
			visibilityRestores: [
				{ part: Parts.AUXILIARYBAR_PART, hidden: false },
				{ part: Parts.EDITOR_PART, hidden: true },
			],
		});
	});

	test('[desktop] New Session opening rule does not re-run after a real editor opens', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] reopening the side pane after closing Empty Files restores dock-only Files', async () => {
		createDesktopController({ activateAux: true, desktopLayout: true });
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

	test('[desktop] closing the last non-Empty editor while Editor is hidden closes the side pane', async () => {
		createDesktopController({ activateAux: true, desktopLayout: true });
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
			hasFilesTab: false,
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('[desktop] closing the last visible file editor closes the side pane without opening Empty Files', async () => {
		createDesktopController({ activateAux: true, desktopLayout: true });
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
			hasFilesTab: false,
			editorVisible: false,
			auxiliaryBarVisible: false,
		});
	});

	test('[desktop] working-set restore does not change global editor visibility', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createDesktopController({ desktopLayout: true, workspaceFolders });
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

	test('[desktop] preserves current visibility when a draft is replaced on submit', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createDesktopController({ desktopLayout: true, workspaceFolders });
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

	test('[desktop] does not reveal the editor part for a created quick chat on switch', async () => {
		createDesktopController({ desktopLayout: true });
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

	test('[desktop] keeps the side pane visible when a quick chat is active among multiple sessions', async () => {
		createDesktopController({ desktopLayout: true, activateAux: true });
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

	test('[desktop] restores open side-pane parts when an existing session is opened to the side', async () => {
		createDesktopController({
			desktopLayout: true,
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

	test('[desktop] hides the side pane after switching to an editorless Quick Chat', async () => {
		createDesktopController({
			desktopLayout: true,
			activateAux: true,
			workspaceFolders: [{ uri: URI.file('/repo') }],
		});
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
		harness.onApplyWorkingSet = workingSet => {
			if (workingSet === 'empty') {
				harness.activeGroupEditors.length = 0;
				harness.activeEditorInput = undefined;
				harness.editorGroupsHaveContent = false;
			}
		};

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
				{ hidden: true, part: Parts.EDITOR_PART },
				{ hidden: true, part: Parts.AUXILIARYBAR_PART },
			],
		});
	});

	for (const composition of [
		{ editor: false, auxiliaryBar: true },
		{ editor: true, auxiliaryBar: true },
		{ editor: true, auxiliaryBar: false },
		{ editor: false, auxiliaryBar: false },
	]) {
		test(`[desktop] draft replacement preserves ${JSON.stringify(composition)} after managed tabs settle`, async () => {
			createDesktopController({ desktopLayout: true, activateAux: true });
			const workspace = makeSession(URI.parse('session:workspace'), { isCreated: false, status: SessionStatus.Untitled });
			const quickChat = makeSession(URI.parse('session:quick'), { isQuickChat: true, isCreated: false, status: SessionStatus.Untitled });
			const replacement = makeSession(URI.parse('session:replacement'), { isCreated: false, status: SessionStatus.Untitled });
			harness.activeSessionObs.set(workspace, undefined);
			await timeout(0);
			harness.partVisibility.set(Parts.EDITOR_PART, composition.editor);
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, composition.auxiliaryBar);
			harness.setPartHiddenCalls.length = 0;

			harness.activeSessionObs.set(quickChat, undefined);
			await timeout(0);
			harness.activeSessionObs.set(replacement, undefined);
			await timeout(0);

			assert.deepStrictEqual({
				editor: harness.partVisibility.get(Parts.EDITOR_PART),
				auxiliaryBar: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
				visibilityChanges: harness.setPartHiddenCalls,
			}, {
				...composition,
				visibilityChanges: [],
			});
		});
	}

	test('[desktop] restores the existing-session side pane profile after leaving a quick chat before managed tabs settle', async () => {
		createDesktopController({ desktopLayout: true, activateAux: true });
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

	for (const scenario of [
		{ name: 'closed pane', editor: undefined, visible: false, multiple: false },
		{ name: 'hidden browser', editor: 'browser', visible: false, multiple: false },
		{ name: 'visible browser', editor: 'browser', visible: true, multiple: false },
		{ name: 'visible file', editor: 'file', visible: true, multiple: false },
		{ name: 'closed pane with multiple sessions', editor: undefined, visible: false, multiple: true },
	]) {
		test(`[desktop] Quick Chat conversion preserves ${scenario.name}`, async () => {
			createDesktopController({
				desktopLayout: true,
				activateAux: true,
				sidePaneVisibilityState: {
					newSession: { editorVisible: false, auxiliaryBarVisible: true },
					existingSession: { editorVisible: true, auxiliaryBarVisible: true },
				},
			});
			const existing = makeSession(URI.parse('session:existing'));
			const isQuickChat = observableValue('isQuickChat', true);
			const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
			const session = { ...makeSession(URI.parse('session:quick')), isQuickChat, workspace };
			transaction(tx => {
				harness.activeSessionObs.set(session, tx);
				harness.visibleSessionsObs.set(scenario.multiple ? [existing, session] : [session], tx);
			});
			await timeout(0);
			harness.activeGroupEditors.length = 0;
			harness.activeEditorInput = undefined;
			harness.editorGroupsHaveContent = false;
			const editor = scenario.editor
				? store.add(new TestStubEditorInput(scenario.editor === 'browser' ? URI.parse('browser://quick-chat') : URI.file('/repo/file.ts')))
				: undefined;
			if (editor) {
				harness.activeGroupEditors.push(editor);
				harness.activeEditorInput = editor;
				harness.editorGroupsHaveContent = true;
				harness.onDidActiveEditorChange.fire();
			}
			harness.partVisibility.set(Parts.EDITOR_PART, scenario.visible);
			harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
			harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: scenario.visible });
			await timeout(0);
			harness.setPartHiddenCalls = [];
			harness.openedViewContainers = [];
			harness.applyWorkingSetCalls = [];

			transaction(tx => {
				workspace.set(existing.workspace.get(), tx);
				isQuickChat.set(false, tx);
			});
			await timeout(0);
			(session.mainChat.get().changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/repo/changed.ts')], undefined);
			await timeout(0);

			assert.deepStrictEqual({
				editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
				detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
				visibilityChanges: harness.setPartHiddenCalls,
				detailChanges: harness.openedViewContainers,
				workingSetChanges: harness.applyWorkingSetCalls,
				editorPreserved: !editor || harness.activeEditorInput === editor,
				sharedVisibility: JSON.parse(harness.storageService.get('sessions.singlePane.sidePaneVisibility', StorageScope.WORKSPACE) ?? '').existingSession,
			}, {
				editorVisible: scenario.visible,
				detailVisible: false,
				visibilityChanges: [],
				detailChanges: [],
				workingSetChanges: [],
				editorPreserved: true,
				sharedVisibility: { editorVisible: scenario.visible, auxiliaryBarVisible: false },
			});
		});
	}

	test('[desktop] Quick Chat conversion updates Details without waiting for a working-set restore', async () => {
		const controller = createDesktopController({ desktopLayout: true, activateAux: true });
		const existing = makeSession(URI.parse('session:existing'));
		harness.activeSessionObs.set(existing, undefined);
		await timeout(0);
		const isQuickChat = observableValue('isQuickChat', true);
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
		const session = { ...makeSession(URI.parse('session:quick')), isQuickChat, workspace };
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);
		harness.activeGroupEditors.length = 0;
		harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file('/repo/file.ts'))));
		const fileEditor = makeFileEditor('/repo/file.ts');
		harness.activeEditorInput = fileEditor;
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidActiveEditorChange.fire();
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await timeout(0);
		harness.setPartHiddenCalls = [];
		harness.openedViewContainers = [];

		isQuickChat.set(false, undefined);
		await timeout(0);
		workspace.set(existing.workspace.get(), undefined);
		await timeout(0);
		const conversionState = {
			visibilityChanges: [...harness.setPartHiddenCalls],
			detailChanges: [...harness.openedViewContainers],
			editorPreserved: harness.activeEditorInput === fileEditor,
		};
		controller.toggleDetails();
		await timeout(0);

		assert.deepStrictEqual({
			conversionState,
			detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			detailChanges: harness.openedViewContainers,
		}, {
			conversionState: { visibilityChanges: [], detailChanges: [], editorPreserved: true },
			detailVisible: true,
			detailChanges: [SESSIONS_FILES_CONTAINER_ID],
		});
	});

	test('[desktop] New Sessions ignore the stored New visibility profile', async () => {
		createDesktopController({
			desktopLayout: true,
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

	test('[desktop] background submit during Quick Chat does not overwrite visibility profiles', async () => {
		createDesktopController({
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

	function sidebarHiddenCalls(): boolean[] {
		return harness.setPartHiddenCalls.filter(c => c.part === Parts.SIDEBAR_PART).map(c => c.hidden);
	}

	// --- Desktop Toggle Details leaves the Sessions sidebar untouched ---

	test('[desktop] opening details does not hide the sessions list', () => {
		const controller = createDesktopController({ mainContainerWidth: 800 });
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

	test('[desktop] closing details does not show a manually hidden sessions list', () => {
		const controller = createDesktopController({ mainContainerWidth: 800 });
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

	test('[D7 desktop] contributes Toggle Details after Maximize with the editor title layout actions', () => {
		createDesktopController();

		const items = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === TOGGLE_DETAILS_COMMAND_ID);
		const maximizeItem = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agentSessions.maximizeMainEditorPart');

		assert.strictEqual(items.length, 1, 'exactly one Toggle Details item on the editor header');
		assert.ok(maximizeItem, 'Maximize item should be registered');
		const when = items[0].when?.serialize() ?? '';
		assert.deepStrictEqual({
			group: items[0].group,
			icon: ThemeIcon.isThemeIcon(items[0].command.icon) ? items[0].command.icon.id : undefined,
			order: items[0].order,
			afterMaximize: (items[0].order ?? 0) > (maximizeItem.order ?? 0),
			hasToggled: !!items[0].command.toggled,
			gatedOnEditorArea: when.includes(MainEditorAreaVisibleContext.key),
			gatedOnDockedDetails: when.includes(HasDockedDetailsContext.key),
		}, {
			group: 'navigation',
			icon: Codicon.listSelection.id,
			order: 10,
			afterMaximize: true,
			hasToggled: true,
			gatedOnEditorArea: true,
			gatedOnDockedDetails: true,
		});
	});

	test('[desktop reload] preserves Aux-only layout while the active session is still restoring', async () => {
		createDesktopController({
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

	test('[desktop reload] a fresh controller restores a session\'s composition, editor working set and panel view together', async () => {
		const sessionResource = URI.parse('session:a');
		const layoutState = [{
			sessionResource: 'session:a',
			editorWorkingSet: { id: 'ws-a', name: 'ws-a' },
			panelViewContainerId: 'view.a',
		}];
		harness = createTestHarness(store, {
			useModal: 'some',
			chatLayoutMode: 'chat',
			desktopLayout: true,
			workspaceFolders: [{ uri: URI.file('/repo') }],
			layoutState,
			initialPartVisibility: new Map([
				[Parts.EDITOR_PART, true],
				[Parts.AUXILIARYBAR_PART, true],
				[Parts.PANEL_PART, false],
			]),
		});
		harness.storageService.store(
			'sessions.chatLayout.sidePaneComposition',
			JSON.stringify({ version: 1, entries: [[sessionResource.toString(), { editor: false, auxiliaryBar: true }]] }),
			StorageScope.WORKSPACE,
			0
		);
		store.add(harness.instaService.createInstance(TestDesktopController));

		const session = makeSession(sessionResource);
		harness.setPartHiddenCalls = [];
		harness.applyWorkingSetCalls = [];
		harness.activeSessionObs.set(session, undefined);
		await timeout(0);

		assert.deepStrictEqual(
			{
				editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
				auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
			},
			{ editorVisible: false, auxiliaryBarVisible: true },
			'the persisted composition must be restored on the first visit after a fresh restart'
		);
		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			[{ id: 'ws-a', name: 'ws-a' }],
			'the persisted editor working set must be restored alongside the composition'
		);

		harness.openPaneCompositeCalls = [];
		harness.partVisibility.set(Parts.PANEL_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });

		assert.deepStrictEqual(
			harness.openPaneCompositeCalls,
			[{ id: 'view.a', location: ViewContainerLocation.Panel }],
			'the persisted panel view must be restored once the panel becomes visible, even though this legacy-migrated entry carries no persisted panelVisible of its own'
		);
	});

	// --- [D10] Toggle Side Panel with an empty aux bar ---


	// --- Desktop managed docked tabs (Changes + Files placeholder) ---

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

	test('[managed tabs / session switch] keeps the Changes header active while the working set replaces its editor', async () => {
		createDesktopController({ activateAux: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		await settle();

		const first = makeSession(URI.parse('session:first'));
		harness.activeSessionObs.set(first, undefined);
		await settle();
		const firstChangesResource = harness.sessionChangesService.getChangesEditorResource(first.resource);
		harness.activeEditorInput = harness.activeGroupEditors.find(editor => editor.resource && isEqual(editor.resource, firstChangesResource));
		assert.ok(harness.activeEditorInput);
		harness.onDidActiveEditorChange.fire();

		const before = harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key);
		const during: boolean[] = [];
		harness.onApplyWorkingSet = () => {
			harness.activeEditorInput = undefined;
			harness.onDidActiveEditorChange.fire();
			during.push(harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key) === true);
		};
		harness.activeSessionObs.set(makeSession(URI.parse('session:second')), undefined);
		await settle();
		const after = harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key);

		assert.deepStrictEqual({ before, during, after }, {
			before: false,
			during: [true],
			after: false,
		});
	});

	test('[managed tabs / session switch] keeps the Changes header while workspace folders delay the restore', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		const first = makeSession(URI.parse('session:first'));
		harness.activeSessionObs.set(first, undefined);
		await settle();
		const firstChangesResource = harness.sessionChangesService.getChangesEditorResource(first.resource);
		harness.activeEditorInput = harness.activeGroupEditors.find(editor => editor.resource && isEqual(editor.resource, firstChangesResource));
		assert.ok(harness.activeEditorInput);
		harness.onDidActiveEditorChange.fire();

		harness.activeSessionObs.set(makeSession(URI.parse('session:second')), undefined);
		await settle();
		harness.activeEditorInput = undefined;
		harness.onDidActiveEditorChange.fire();
		const whileWaitingForWorkspace = {
			workingSetsApplied: harness.applyWorkingSetCalls.length,
			keepChangesHeader: harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key),
		};
		harness.activeEditorInput = store.add(new TestStubEditorInput(URI.file('/repo/file.ts')));
		harness.onDidActiveEditorChange.fire();
		const whileFileIsActive = harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key);
		harness.activeSessionObs.set(undefined, undefined);
		const afterLeaving = harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key);

		assert.deepStrictEqual({ whileWaitingForWorkspace, whileFileIsActive, afterLeaving }, {
			whileWaitingForWorkspace: { workingSetsApplied: 0, keepChangesHeader: true },
			whileFileIsActive: false,
			afterLeaving: false,
		});
	});

	for (const editorVisible of [false, true]) {
		test(`[managed tabs / session switch] preserves the Changes header until workspace hydration restores defaults into an empty group with Editor visible=${editorVisible}`, async () => {
			createDesktopController({ activateAux: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
			await settle();

			const first = makeSession(URI.parse('session:first'));
			harness.activeSessionObs.set(first, undefined);
			await settle();
			const firstChangesResource = harness.sessionChangesService.getChangesEditorResource(first.resource);
			harness.activeEditorInput = harness.activeGroupEditors.find(editor => editor.resource && isEqual(editor.resource, firstChangesResource));
			assert.ok(harness.activeEditorInput);
			harness.onDidActiveEditorChange.fire();
			harness.layoutService.setPartHidden(!editorVisible, Parts.EDITOR_PART);

			const workspace = observableValue<ISessionWorkspace | undefined>('pendingWorkspace', undefined);
			const base = makeSession(URI.parse('session:pending'));
			const chat = { ...base.activeChat.get(), workspace };
			const pending = {
				...base,
				workspace,
				activeChat: observableValue('activeChat', chat),
				mainChat: constObservable(chat),
				chats: observableValue('chats', [chat]),
				openChats: observableValue('openChats', [chat]),
				visibleChatTabs: constObservable([chat]),
			};
			harness.activeSessionObs.set(pending, undefined);
			await settle();
			harness.activeEditorInput = undefined;
			harness.onDidActiveEditorChange.fire();
			harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			const beforeHydration = harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key);
			workspace.set(first.workspace.get(), undefined);
			await settle();
			const afterHydration = {
				keepChangesHeader: harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key),
				editorVisible: harness.layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
				detailsVisible: harness.layoutService.isVisible(Parts.AUXILIARYBAR_PART),
				hasIncomingChangesTab: harness.activeGroupEditors.some(editor =>
					!!editor.resource && isEqual(harness.sessionChangesService.getSessionResource(editor.resource), pending.resource)),
			};

			assert.deepStrictEqual({ beforeHydration, afterHydration }, {
				beforeHydration: true,
				afterHydration: { keepChangesHeader: false, editorVisible, detailsVisible: true, hasIncomingChangesTab: true },
			});
		});
	}

	test('[managed tabs / session switch] does not retain the Changes header for a quick chat', async () => {
		createDesktopController({ activateAux: true, workspaceFolders: [{ uri: URI.file('/repo') }] });
		await settle();

		const first = makeSession(URI.parse('session:first'));
		harness.activeSessionObs.set(first, undefined);
		await settle();
		const firstChangesResource = harness.sessionChangesService.getChangesEditorResource(first.resource);
		harness.activeEditorInput = harness.activeGroupEditors.find(editor => editor.resource && isEqual(editor.resource, firstChangesResource));
		assert.ok(harness.activeEditorInput);
		harness.onDidActiveEditorChange.fire();

		harness.activeSessionObs.set(makeSession(URI.parse('session:quick'), { isQuickChat: true }), undefined);

		assert.strictEqual(harness.contextKeyService.getContextKeyValue(DesktopChangesEditorTransitionContext.key), false);
	});

	test('[managed tabs] ensures the Changes and Files tabs for a created session under suppression', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();

		const filesTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput);
		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			filesResource: filesTab?.resource,
			filesWorkingDirectory: filesTab?.workspace?.folders[0]?.workingDirectory.toString()
		}, {
			hasChangesTab: true,
			filesResource: undefined,
			filesWorkingDirectory: URI.file('/repo').toString()
		});
	});

	test('[managed tabs] keeps a closed side pane empty so opening a file opens only that file', async () => {
		createDesktopController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, false]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: false },
				existingSession: { editorVisible: false, auxiliaryBarVisible: false },
			},
		});
		await settle();

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		assert.strictEqual(harness.activeGroupEditors.length, 0);

		const file = store.add(new TestStubEditorInput(URI.file('/repo/opened.ts')));
		openEditor(file);
		harness.layoutService.revealEditorPartExplicitly();
		harness.activeGroupEditors.push(file);
		harness.activeEditorInput = file;
		harness.onDidActiveEditorChange.fire();
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual(harness.activeGroupEditors.map(editor => editor.resource?.toString()), [
			URI.file('/repo/opened.ts').toString(),
		]);
	});

	test('[managed tabs / submit] keeps a closed side pane empty when changes arrive before a plan file opens', async () => {
		createDesktopController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, false]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: false },
				existingSession: { editorVisible: false, auxiliaryBarVisible: false },
			},
		});
		await settle();

		const session = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);
		await settle();

		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);
		(session.mainChat.get().changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/plan.md')], undefined);
		await settle();
		assert.strictEqual(harness.activeGroupEditors.length, 0);

		const plan = store.add(new TestStubEditorInput(URI.file('/repo/plan.md')));
		openEditor(plan);
		harness.layoutService.revealEditorPartExplicitly();
		harness.activeGroupEditors.push(plan);
		harness.activeEditorInput = plan;
		harness.onDidActiveEditorChange.fire();
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual(harness.activeGroupEditors.map(editor => editor.resource?.toString()), [
			URI.file('/repo/plan.md').toString(),
		]);
	});

	test('[managed tabs] updates the Files root when the active session changes', async () => {
		createDesktopController({ activateAux: true });
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
		assert.deepStrictEqual(filesTabs.map(editor => ({
			resource: editor.resource,
			workingDirectory: editor.workspace?.folders[0]?.workingDirectory.toString()
		})), [{
			resource: undefined,
			workingDirectory: URI.file('/repo/second').toString()
		}]);
	});

	test('[managed tabs / Changes pill] opens only Changes when the session defaults are still pending', async () => {
		createDesktopController({
			activateAux: true,
			initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, false]]),
			sidePaneVisibilityState: {
				newSession: { editorVisible: false, auxiliaryBarVisible: false },
				existingSession: { editorVisible: false, auxiliaryBarVisible: false },
			},
		});
		await settle();

		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);
		await settle();
		assert.strictEqual(harness.activeGroupEditors.length, 0);
		harness.setPartHiddenCalls = [];

		const handler = CommandsRegistry.getCommand('workbench.agentSessions.action.viewChanges')?.handler;
		assert.ok(handler, 'Changes pill command should be registered');

		await handler(harness.instaService, session);
		await settle();

		assert.deepStrictEqual({
			editorRevealed: harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			editorCount: harness.activeGroupEditors.length,
		}, {
			editorRevealed: true,
			hasChangesTab: true,
			hasFilesTab: false,
			editorCount: 1,
		});
	});

	test('[managed tabs / Scenario 9] shows Changes and Files for a new-session view', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(DesktopChangesTabMissingContext.key),
		}, {
			hasChangesTab: true,
			hasFilesTab: true,
			changesTabMissing: false,
		});
	});

	test('[managed tabs / new session] restores Changes after a delayed different-folder restore', async () => {
		const controller = createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:created')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		harness.activeSessionObs.set(undefined, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });

		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// A different default folder delays this restore until after the draft reconcile.
		const filesTab = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput);
		assert.ok(filesTab);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, filesTab);
			harness.activeEditorInput = filesTab;
			harness.onDidEditorsChange.fire();
		});
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});

	for (const mode of ['session-shared', 'chat'] as const) {
		test(`[managed tabs / submit] ${mode} activates Changes only after a submitted session reports changes`, async () => {
			createDesktopController({ desktopLayout: true, activateAux: true, chatLayoutMode: mode });
			await settle();

			const session = makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false });
			harness.activeSessionObs.set(session, undefined);
			await settle();
			assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

			// Submit from the Files tab: visibility and the active tab stay unchanged.
			harness.activeEditorInput = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput);
			(session.isCreated as ISettableObservable<boolean>).set(true, undefined);
			await settle();

			const changesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
			const changesActiveBeforeChanges = !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource);
			(session.mainChat.get().changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
			await settle();

			assert.deepStrictEqual({
				chatOwnershipActive: harness.chatLayoutPresentation.state.get().active,
				hasChangesTab: hasChangesTab(),
				hasFilesTab: hasFilesTab(),
				changesActiveBeforeChanges,
				changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource),
			}, { chatOwnershipActive: mode === 'chat', hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
		});
	}

	test('[managed tabs / chat switch] a peer does not inherit the main chat\'s pending submit activation', async () => {
		createDesktopController({ desktopLayout: true, activateAux: true, chatLayoutMode: 'chat' });
		const session = makeSession(URI.parse('session:pending-submit'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(session, undefined);
		await settle();
		(session.isCreated as ISettableObservable<boolean>).set(true, undefined);
		await settle();
		const peer = addPeerChat(session, URI.parse('chat:pending-submit-peer'));
		setActiveChat(session, peer);
		await settle();
		harness.activeEditorInput = harness.activeGroupEditors.find(editor => editor instanceof EmptyFileEditorInput);
		harness.openChangesEditorCalls = [];
		(peer.changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/peer.ts')], undefined);
		await settle();
		assert.deepStrictEqual({
			chatOwnershipActive: harness.chatLayoutPresentation.state.get().active,
			activeChangesRequests: harness.openChangesEditorCalls.filter(call => call.active),
			filesActive: harness.activeEditorInput instanceof EmptyFileEditorInput,
		}, { chatOwnershipActive: true, activeChangesRequests: [], filesActive: true });
	});

	test('[managed tabs / submit] activates Changes after changes arrive on a resource-replace submit', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		// New-session draft active: Changes and Files are present.
		const draft = makeSession(URI.parse('session:draft'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(draft, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

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
		(committed.mainChat.get().changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			hasFilesTab: hasFilesTab(),
			changesActiveBeforeChanges,
			changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource),
		}, { hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
	});

	test('[managed tabs / session switch] does not leak a superseded submit\'s "activate Changes" intent onto the switched-to session', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		// Session A is a new-session draft with Changes and Files.
		const sessionA = makeSession(URI.parse('session:a'), { status: SessionStatus.Untitled, isCreated: false });
		harness.activeSessionObs.set(sessionA, undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

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
		(sessionA.mainChat.get().changes as ISettableObservable<readonly ISessionFileChange[]>).set([makeChange('/file.ts')], undefined);
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
		createDesktopController({ activateAux: true });
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

	test('[managed tabs / dispose] a reconcile stalled mid-open opens no further editors once the controller is disposed', async () => {
		const controller = createDesktopController({ activateAux: true });
		await settle();

		// Pause the reconcile at the first Changes open so it stalls before the Files tab opens.
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

		// The created session's reconcile stalls awaiting the gated Changes open before the Files tab.
		harness.activeSessionObs.set(makeSession(URI.parse('session:1'), { isCreated: true, changes: [makeChange('/file.ts')] }), undefined);
		await settle();
		assert.strictEqual(hasFilesTab(), false, 'reconcile should be stalled before opening the Files tab');

		// Dispose while stalled: the generation bump on dispose must make the resumed reconcile bail before any later editor open.
		controller.dispose();
		releaseChangesOpen();
		await settle();

		assert.strictEqual(hasFilesTab(), false, 'a reconcile resumed after dispose must not open further editors');
	});

	test('[managed tabs / dispose] ignores an in-flight editor replacement failure after the controller is disposed', async () => {
		const originalUnexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const unexpectedErrors: Error[] = [];
		errorHandler.setUnexpectedErrorHandler(error => unexpectedErrors.push(error));
		try {
			const controller = createDesktopController({ activateAux: true });
			await settle();
			harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
			await settle();

			let replaceStarted = false;
			let rejectReplace!: (error: Error) => void;
			const replaceGate = new Promise<void>((_, reject) => { rejectReplace = reject; });
			harness.onReplaceEditors = replacements => {
				replaceStarted = true;
				store.add(replacements[0].replacement);
				return replaceGate;
			};

			harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
			await settle();
			assert.strictEqual(replaceStarted, true, 'the reconcile should be stalled replacing the outgoing Changes editor');

			controller.dispose();
			rejectReplace(new Error('InstantiationService has been disposed'));
			await settle();

			assert.deepStrictEqual(unexpectedErrors, []);
		} finally {
			errorHandler.setUnexpectedErrorHandler(originalUnexpectedErrorHandler);
		}
	});

	test('[managed tabs / dispose] ignores an in-flight editor replacement failure after the target group is disposed', async () => {
		const originalUnexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const unexpectedErrors: Error[] = [];
		errorHandler.setUnexpectedErrorHandler(error => unexpectedErrors.push(error));
		try {
			createDesktopController({ activateAux: true });
			await settle();
			harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
			await settle();

			let replaceStarted = false;
			let rejectReplace!: (error: Error) => void;
			const replaceGate = new Promise<void>((_, reject) => { rejectReplace = reject; });
			harness.onReplaceEditors = replacements => {
				replaceStarted = true;
				store.add(replacements[0].replacement);
				return replaceGate;
			};

			harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
			await settle();
			assert.strictEqual(replaceStarted, true, 'the reconcile should be stalled replacing the outgoing Changes editor');

			harness.onWillDisposeActiveGroup.fire();
			rejectReplace(new Error('InstantiationService has been disposed'));
			await settle();

			assert.deepStrictEqual(unexpectedErrors, []);
		} finally {
			errorHandler.setUnexpectedErrorHandler(originalUnexpectedErrorHandler);
		}
	});

	test('[managed tabs / errors] reports an editor replacement failure while the reconcile is active', async () => {
		const originalUnexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const unexpectedErrors: Error[] = [];
		errorHandler.setUnexpectedErrorHandler(error => unexpectedErrors.push(error));
		try {
			createDesktopController({ activateAux: true });
			await settle();
			harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
			await settle();

			const failure = new Error('replace failed');
			harness.onReplaceEditors = replacements => {
				store.add(replacements[0].replacement);
				throw failure;
			};

			harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
			await settle();

			assert.deepStrictEqual(unexpectedErrors, [failure]);
		} finally {
			errorHandler.setUnexpectedErrorHandler(originalUnexpectedErrorHandler);
		}
	});

	test('[managed tabs / details-only] always restores both docked inputs while only details are visible', async () => {
		createDesktopController({
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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

	test('[managed tabs / new session] re-opens managed tabs when a working-set apply empties the group during the switch', async () => {
		const controller = createDesktopController({ activateAux: true });
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

		// Changes and Files are restored for the uncreated session.
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});

	test('[managed tabs / new session] re-opens managed tabs on restore-end even if no editor-change fires during the restore', async () => {
		const controller = createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:created')), undefined);
		await settle();
		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });

		// Switch to a new (uncreated) session; the working-set apply empties the
		// group during the restore but the transient editor-change is NOT observed
		// (it races the async close). Only the settled restore-end must re-open the
		// managed tabs.
		harness.activeSessionObs.set(makeSession(URI.parse('session:new'), { status: SessionStatus.Untitled, isCreated: false }), undefined);
		controller.runWithRestore(() => {
			harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
		});
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});

	test('[managed tabs / Scenario 9] removes the Files tab while a real editor is open and does not re-add it when that file closes', async () => {
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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

	test('[desktop] closes non-managed tabs when the editor area hides and reopens them when shown', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] closes non-managed tabs restored while only details are visible', async () => {
		const controller = createDesktopController({
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

	test('[desktop] closes and reopens non-managed tabs added while only details are visible', async () => {
		createDesktopController({
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

	test('[desktop] closes a non-restorable non-docked tab (e.g. untitled Search) when the editor area hides, without restoring it', async () => {
		createDesktopController({ activateAux: true });
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

	test('[desktop] does NOT close editors when the whole side pane is closed (editor + aux hidden)', async () => {
		createDesktopController({ activateAux: true });
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

		// Close through the real whole-side-pane lifecycle. No editors must be closed.
		harness.layoutService.hideSidePane();
		await settle();

		assert.deepStrictEqual({
			anyEditorClosed: harness.closedEditors.length > 0,
			fileStillPresent: harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, fileResource)),
		}, {
			anyEditorClosed: false,
			fileStillPresent: true,
		});
	});

	for (const mode of ['session-shared', 'chat-shared', 'chat'] as const) {
		test(`[desktop] ignores queued details-only collapse after the whole pane hides (${mode})`, async () => {
			createDesktopController({ desktopLayout: true, activateAux: true, chatLayoutMode: mode });
			await settle();
			harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
			await settle();

			const fileResource = URI.file('/repo/retained.ts');
			harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
			harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
			harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			await settle();
			harness.closedEditors = [];

			harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
			harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			await settle();

			assert.deepStrictEqual({
				fileClosed: harness.closedEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource)),
				fileRetained: harness.activeGroupEditors.some(editor => editor.resource && isEqual(editor.resource, fileResource)),
			}, {
				fileClosed: false,
				fileRetained: true,
			});
		});
	}

	test('[managed tabs / lifecycle removal] does not re-open a missing managed tab while the group stays non-empty', async () => {
		createDesktopController({ activateAux: true });
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
		const controller = createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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

	test('[managed tabs / add-tab] a missing Changes tab flips DesktopChangesTabMissingContext', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const changesTab = harness.activeGroupEditors.find(e => !(e instanceof EmptyFileEditorInput) && e.resource !== undefined)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(DesktopChangesTabMissingContext.key), false);

		// Simulate an internal lifecycle removal of the non-closeable Changes tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
		harness.onDidCloseEditor.fire({ editor: changesTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasChangesTab: hasChangesTab(),
			changesTabAvailable: harness.contextKeyService.getContextKeyValue(DesktopChangesTabAvailableContext.key),
			changesTabMissing: harness.contextKeyService.getContextKeyValue(DesktopChangesTabMissingContext.key)
		}, { hasChangesTab: false, changesTabAvailable: true, changesTabMissing: true });
	});

	test('[managed tabs / add-tab] a missing Files tab flips DesktopFilesTabMissingContext', async () => {
		createDesktopController({ activateAux: true });
		await settle();

		harness.activeSessionObs.set(makeSession(URI.parse('session:1')), undefined);
		await settle();
		const fileTab = harness.activeGroupEditors.find(e => e instanceof EmptyFileEditorInput)!;
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(DesktopFilesTabMissingContext.key), false);

		// Simulate lifecycle removal of the non-closeable Files tab.
		harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
		harness.onDidCloseEditor.fire({ editor: fileTab });
		harness.onDidEditorsChange.fire();
		await settle();

		assert.deepStrictEqual({
			hasFilesTab: hasFilesTab(),
			filesTabAvailable: harness.contextKeyService.getContextKeyValue(DesktopFilesTabAvailableContext.key),
			filesTabMissing: harness.contextKeyService.getContextKeyValue(DesktopFilesTabMissingContext.key)
		}, { hasFilesTab: false, filesTabAvailable: true, filesTabMissing: true });
	});

	test('[managed tabs / add-tab] reopening the Changes tab clears the missing context and is retained', async () => {
		createDesktopController({ activateAux: true });
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
		assert.strictEqual(harness.contextKeyService.getContextKeyValue(DesktopChangesTabMissingContext.key), true);

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
			changesTabMissing: harness.contextKeyService.getContextKeyValue(DesktopChangesTabMissingContext.key)
		}, { hasChangesTab: true, changesTabMissing: false });
	});

	test('[managed tabs / add-tab] reopening managed tabs from the plus menu adds them at the end', async () => {
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true, initialPartVisibility: new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
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
		createDesktopController({ activateAux: true });
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
		createDesktopController({ activateAux: true });
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
		harness.partVisibility.set(Parts.EDITOR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		harness.onDidRevealSidePane.fire();
		await settle();

		assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
	});
});
