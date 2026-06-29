/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionFileChange, SessionStatus } from '../../../../services/sessions/common/session.js';
import { LayoutController } from '../../browser/desktopSessionLayoutController.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeChange, makeSession } from './layoutControllerTestUtils.js';

suite('LayoutController (desktop)', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestLayoutController extends LayoutController {
		getViewState(sessionResource: URI) {
			return this._viewStateBySession.get(sessionResource);
		}
	}

	function createController(options: ICreateOptions = {}): TestLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestLayoutController));
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

	// --- [D4] New-session submit ---

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

	test('[D8] does not reveal the Changes view for an untitled session', () => {
		createController();
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled });
		harness.activeSessionObs.set(untitled, undefined);

		harness.openedViews = [];
		harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(untitled.resource);
		harness.onDidActiveEditorChange.fire();

		assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), 'untitled sessions are governed by D3b/D4, not D8');
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
});
