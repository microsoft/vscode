/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, raceCancellation, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IEditorWorkingSet } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { TERMINAL_VIEW_ID } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { BaseLayoutController } from '../../browser/baseSessionLayoutController.js';
import { waitForSessionSwitchPaint } from '../../browser/sessionLayoutScheduling.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makePaneComposite, makeSession } from './layoutControllerTestUtils.js';

suite('BaseLayoutController', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestBaseLayoutController extends BaseLayoutController {
		readonly preparedWorkingSets: (IEditorWorkingSet | 'empty')[] = [];
		protected override _waitForSessionSwitchPaint(token: CancellationToken): Promise<void> {
			return harness.waitForSessionSwitchPaint?.(token) ?? Promise.resolve();
		}
		protected override _onWillApplyWorkingSet(workingSet: IEditorWorkingSet | 'empty'): void {
			this.preparedWorkingSets.push(workingSet);
		}
		get isRestoring(): boolean { return this._isRestoringSessionLayout; }
		readonly onDidEndRestore = this.onDidEndSessionLayoutRestore;
		getWorkingSet(resource: URI): IEditorWorkingSet | undefined { return this._workingSets.get(resource); }
	}

	class TestWorkbenchPanelLayoutController extends TestBaseLayoutController {
		protected override get _isPanelVisibilityPerSession(): boolean { return false; }
	}

	function createController(options: ICreateOptions = {}): TestBaseLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestBaseLayoutController));
	}

	function createWorkbenchPanelController(options: ICreateOptions = {}): TestWorkbenchPanelLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestWorkbenchPanelLayoutController));
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- [B1] Panel visibility ---

	test('[B1] hides panel by default when no record exists', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART && c.hidden === true),
			'panel should be hidden by default'
		);
	});

	test('[B1] remembers panel visibility per session', () => {
		createController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });

		harness.activeSessionObs.set(session2, undefined);

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		const panelCall = harness.setPartHiddenCalls.find(c => c.part === Parts.PANEL_PART);
		assert.ok(panelCall);
		assert.strictEqual(panelCall!.hidden, false, 'panel should be visible for session 1');
	});

	test('[B1] hides panel when there is no active session', () => {
		createController();

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART && c.hidden === true),
			'panel should be hidden when no session'
		);
	});

	test('[B1] does not sync the panel on session switch when panel visibility is not per session', () => {
		createWorkbenchPanelController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		harness.activeSessionObs.set(session2, undefined);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART),
			'panel visibility should be left to the workbench, not synced on switch'
		);
	});

	test('[B1] does not restore a per-session panel record when panel visibility is not per session', () => {
		createWorkbenchPanelController();
		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		// Panel shown while on session 1 — must not be recorded against the session.
		harness.activeSessionObs.set(session1, undefined);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });

		harness.activeSessionObs.set(session2, undefined);
		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART),
			'returning to session 1 should not restore a per-session panel state'
		);
	});

	// --- [B6] Panel view (which view the panel shows) ---

	test('[B6] restores the session\'s panel view on switch while the panel is visible', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		harness.activeSessionObs.set(session2, undefined);
		harness.activePaneCompositeId = 'view.b';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.b'), viewContainerLocation: ViewContainerLocation.Panel });

		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }]);
	});

	test('[B6] does not force the panel view open while the panel is hidden', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		harness.partVisibility.set(Parts.PANEL_PART, false);
		harness.activeSessionObs.set(session2, undefined);
		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.deepStrictEqual(harness.openPaneCompositeCalls, [], 'the panel must not be forced open to restore a view');
	});

	test('[B6] restores the session\'s panel view when the panel is shown', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		// The panel is hidden and its active view diverges, then it is shown again.
		harness.partVisibility.set(Parts.PANEL_PART, false);
		harness.activePaneCompositeId = 'view.b';
		harness.openPaneCompositeCalls = [];
		harness.partVisibility.set(Parts.PANEL_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.PANEL_PART, visible: true });

		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }]);
	});

	test('[B6] persists the session\'s panel view', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session1, undefined);
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const stored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'layout state should be written');
		const entry = JSON.parse(stored!).find((e: any) => e.sessionResource === 'session:1');
		assert.strictEqual(entry.panelViewContainerId, 'view.a');
	});

	test('[B6] restores a persisted panel view on switch after reload', () => {
		const layoutState = [{ sessionResource: 'session:1', panelViewContainerId: 'view.a' }];
		createWorkbenchPanelController({ layoutState });
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));
		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(session1, undefined);

		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }]);
	});

	test('[B6] falls back to the Terminal when a session has no record, then prefers its remembered view', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const session1 = makeSession(URI.parse('session:1'));

		// No record for session 1 → the panel falls back to the Terminal.
		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: TERMINAL_VIEW_ID, location: ViewContainerLocation.Panel }]);

		// The user opens another view while on session 1, which is remembered.
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		const session2 = makeSession(URI.parse('session:2'));
		harness.activeSessionObs.set(session2, undefined);

		// Returning to session 1 restores its remembered view, not the default.
		harness.openPaneCompositeCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }]);
	});

	test('[B6] carries a draft\'s remembered panel view to its committed session on submit', () => {
		createWorkbenchPanelController();
		harness.partVisibility.set(Parts.PANEL_PART, true);

		const draft = makeSession(URI.parse('session:draft'));
		const committed = makeSession(URI.parse('session:committed'));

		// The user opens a view while on the draft — remembered against the draft.
		harness.activeSessionObs.set(draft, undefined);
		harness.activePaneCompositeId = 'view.a';
		harness.onDidPaneCompositeOpen.fire({ composite: makePaneComposite('view.a'), viewContainerLocation: ViewContainerLocation.Panel });

		// Submit atomically replaces the draft with its committed session: the
		// remembered view transfers so the panel does not fall back to the Terminal.
		harness.activeSessionObs.set(committed, undefined);
		harness.openPaneCompositeCalls = [];
		harness.onDidReplaceSession.fire({ from: draft, to: committed });

		assert.deepStrictEqual(harness.openPaneCompositeCalls, [{ id: 'view.a', location: ViewContainerLocation.Panel }]);
	});

	// --- [B2] Editor working sets ---

	test('[B2] does not reveal the editor part on reload when its working set is restored but the part was hidden', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];

		// Reload: a session has a saved working set (editors were kept open) but the
		// editor part was hidden by the user. The controller must not reveal it.
		const layoutState = [{
			sessionResource: 'session:1',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
			viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: undefined },
		}];
		createController({ useModal: 'some', workspaceFolders, layoutState });

		harness.partVisibility.set(Parts.EDITOR_PART, false);
		const session1 = makeSession(URI.parse('session:1'));
		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		// Flush the working-set sequencer (queued microtasks)
		await timeout(0);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should not be revealed on initial restore'
		);
	});

	test('[B2] does not reveal the editor part on switch when the session left it hidden', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createController({ useModal: 'some', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		// Session 1 keeps editors open but the user hid the editor part (e.g. by
		// closing the Side Panel). The [B2] listener captures this eagerly.
		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(session1, undefined);
		await timeout(0);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });

		// Switch away (captures session 1's working set + hidden editor part)…
		harness.activeSessionObs.set(session2, undefined);
		await timeout(0);

		// …and back: the working set is restored but the editor part stays hidden.
		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		await timeout(0);

		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should stay hidden when the session left it hidden'
		);
	});

	test('[B2][B5] does not capture the editor part hidden state while multiple sessions are visible', () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createController({ useModal: 'some', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		// Two sessions visible at once: the editor area is shared, so its
		// visibility is not a per-session choice — the [B2] listener must skip
		// capturing it even when the editor part visibility changes.
		harness.visibleEditorsList = [{}];
		harness.visibleSessionsObs.set([session1, session2], undefined);
		harness.activeSessionObs.set(session1, undefined);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });

		// Persist on shutdown.
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const stored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
		assert.ok(stored, 'layout state should be written');
		const entry = JSON.parse(stored!).find((e: any) => e.sessionResource === 'session:1');
		assert.ok(entry, 'session 1 entry should be persisted');
		assert.strictEqual(entry.editorPartHidden, undefined, 'editor part hidden state must not be captured while multiple sessions are visible');
	});

	test('[B2] restores the working set on switch without forcing the editor part visible in modal mode', async () => {
		const workspaceFolders = [{ uri: URI.file('/repo') }];

		// `useModal: 'all'` — editors are otherwise forced modal, but browser
		// tabs still dock in the shared grid editor part, so working sets must
		// still be captured/restored per session on switch.
		createController({ useModal: 'all', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		const session2 = makeSession(URI.parse('session:2'));

		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(session1, undefined);
		await timeout(0);

		// Switch away (captures session 1's working set)…
		harness.activeSessionObs.set(session2, undefined);
		await timeout(0);

		// …and back: the working set is restored, but the editor part is never
		// force-revealed in modal mode (modal editors manage their own visibility).
		harness.applyWorkingSetCalls = [];
		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session1, undefined);
		await timeout(0);

		assert.deepStrictEqual(
			harness.applyWorkingSetCalls,
			[{ id: `session-working-set:${session1.resource.toString()}`, name: `session-working-set:${session1.resource.toString()}` }],
			'working set should be restored on switch in modal mode'
		);
		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.EDITOR_PART && c.hidden === false),
			'editor part should not be revealed in modal mode'
		);
	});

	test('[B2] saves the outgoing session working set eagerly even when the incoming session workspace is not ready', async () => {
		// The workspace-gated `activeSessionForWorkingSet` derive holds back while
		// the incoming session's workspace folders resolve. The outgoing session's
		// working set must still be saved eagerly (on the raw active session change)
		// so it — including which editor was active — is restored on return, rather
		// than being lost because another autorun closed its editors during the lag.
		const workspaceFolders = [{ uri: URI.file('/repo') }];
		createController({ useModal: 'some', workspaceFolders });

		const session1 = makeSession(URI.parse('session:1'));
		// Session 2's workspace folder is not (yet) registered, so the gated derive
		// holds back and never fires an apply for it.
		const session2 = makeSession(URI.parse('session:2'), {
			workspace: {
				uri: URI.file('/other'),
				label: 'other',
				icon: Codicon.repo,
				folders: [{ root: URI.file('/other'), workingDirectory: URI.file('/other'), name: 'other', description: undefined, gitRepository: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			},
		});

		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(session1, undefined);
		await timeout(0);

		harness.saveWorkingSetCalls = [];
		harness.applyWorkingSetCalls = [];
		harness.activeSessionObs.set(session2, undefined);
		await timeout(0);

		assert.deepStrictEqual(
			harness.saveWorkingSetCalls,
			[`session-working-set:${session1.resource.toString()}`],
			'the outgoing session working set should be saved eagerly despite the gated apply holding back'
		);
		assert.deepStrictEqual(harness.applyWorkingSetCalls, [], 'the gated apply should hold back while the incoming workspace is not ready');
	});

	test('[B2] rapid A to B to C restores load only the latest working set', async () => {
		const workingSetB = { id: 'ws-b', name: 'B' };
		const workingSetC = { id: 'ws-c', name: 'C' };
		const controller = createController({
			layoutState: [
				{ sessionResource: 'session:b', editorWorkingSet: workingSetB },
				{ sessionResource: 'session:c', editorWorkingSet: workingSetC },
			],
		});
		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		const restored = Event.toPromise(controller.onDidEndRestore);

		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		harness.activeSessionObs.set(makeSession(URI.parse('session:c')), undefined);
		await restored;

		assert.deepStrictEqual({
			loaded: harness.applyWorkingSetCalls,
			prepared: controller.preparedWorkingSets,
			options: harness.applyWorkingSetOptions,
			saved: harness.saveWorkingSetCalls,
			savedB: controller.getWorkingSet(URI.parse('session:b')),
			restoring: controller.isRestoring,
		}, {
			loaded: [workingSetC],
			prepared: [workingSetC],
			options: [{ preserveFocus: true }],
			saved: ['session-working-set:session:a'],
			savedB: workingSetB,
			restoring: false,
		});
	});

	test('[B2] a newer session cancels the deferred paint wait before stale editors load', async () => {
		const workingSetC = { id: 'ws-c', name: 'C' };
		const controller = createController({
			layoutState: [
				{ sessionResource: 'session:b', editorWorkingSet: { id: 'ws-b', name: 'B' } },
				{ sessionResource: 'session:c', editorWorkingSet: workingSetC },
			],
		});
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		const paint = new DeferredPromise<void>();
		const waits = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const tokens: CancellationToken[] = [];
		harness.waitForSessionSwitchPaint = token => {
			tokens.push(token);
			void waits[tokens.length - 1].complete();
			return raceCancellation(paint.p, token);
		};

		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		await waits[0].p;
		harness.activeSessionObs.set(makeSession(URI.parse('session:c')), undefined);
		await waits[1].p;
		const beforePaint = [...harness.applyWorkingSetCalls];
		const restored = Event.toPromise(controller.onDidEndRestore);
		await paint.complete();
		await restored;

		assert.deepStrictEqual({
			beforePaint,
			cancelledWaits: tokens.map(token => token.isCancellationRequested),
			loaded: harness.applyWorkingSetCalls,
			prepared: controller.preparedWorkingSets,
		}, {
			beforePaint: [],
			cancelledWaits: [true, false],
			loaded: [workingSetC],
			prepared: [workingSetC],
		});
	});

	test('[B2] an obsolete in-flight apply cannot reveal the current session or overwrite saved state', async () => {
		const workingSetB = { id: 'ws-b', name: 'B' };
		const workingSetC = { id: 'ws-c', name: 'C' };
		const controller = createController({
			useModal: 'some',
			layoutState: [
				{ sessionResource: 'session:b', editorWorkingSet: workingSetB },
				{ sessionResource: 'session:c', editorWorkingSet: workingSetC, editorPartHidden: true },
			],
		});
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		harness.visibleEditorsList = [{}];
		const applyStarted = new DeferredPromise<void>();
		const finishApply = new DeferredPromise<void>();
		let lateAutoVisibilitySuppressed = false;
		harness.onApplyWorkingSet = async workingSet => {
			if (workingSet !== 'empty' && workingSet.id === workingSetB.id) {
				await applyStarted.complete();
				await finishApply.p;
				lateAutoVisibilitySuppressed = harness.layoutService.isEditorPartAutoVisibilitySuppressed();
				if (!lateAutoVisibilitySuppressed) {
					harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
				}
			}
		};

		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		await applyStarted.p;
		harness.activeSessionObs.set(makeSession(URI.parse('session:c')), undefined);
		harness.partVisibility.set(Parts.EDITOR_PART, false);
		harness.setPartHiddenCalls = [];
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const savedWhilePending = [...harness.saveWorkingSetCalls];
		const restored = Event.toPromise(controller.onDidEndRestore);
		await finishApply.complete();
		await restored;

		assert.deepStrictEqual({
			loaded: harness.applyWorkingSetCalls,
			options: harness.applyWorkingSetOptions,
			lateAutoVisibilitySuppressed,
			editorVisibilityChanges: harness.setPartHiddenCalls.filter(call => call.part === Parts.EDITOR_PART),
			savedWhilePending,
			savedB: controller.getWorkingSet(URI.parse('session:b')),
			suppressionDepth: harness.editorPartAutoVisibilitySuppressionDepth,
		}, {
			loaded: [workingSetB, workingSetC],
			options: [{ preserveFocus: true }, { preserveFocus: true }],
			lateAutoVisibilitySuppressed: true,
			editorVisibilityChanges: [],
			savedWhilePending: ['session-working-set:session:a'],
			savedB: workingSetB,
			suppressionDepth: 0,
		});
	});

	test('[B2] workspace readiness restores the latest target without saving intermediate sessions', async () => {
		const workingSetB = { id: 'ws-b', name: 'B' };
		const workingSetC = { id: 'ws-c', name: 'C' };
		const controller = createController({
			workspaceFolders: [{ uri: URI.file('/repo') }],
			layoutState: [
				{ sessionResource: 'session:b', editorWorkingSet: workingSetB },
				{ sessionResource: 'session:c', editorWorkingSet: workingSetC },
			],
		});
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		harness.visibleEditorsList = [{}];
		const workspace = (directory: string) => ({
			uri: URI.file(directory), label: directory, icon: Codicon.repo,
			folders: [{ root: URI.file(directory), workingDirectory: URI.file(directory), name: directory, description: undefined }],
			requiresWorkspaceTrust: false, isVirtualWorkspace: false,
		});
		harness.activeSessionObs.set(makeSession(URI.parse('session:b'), { workspace: workspace('/b') }), undefined);
		harness.activeSessionObs.set(makeSession(URI.parse('session:c'), { workspace: workspace('/c') }), undefined);
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const beforeWorkspaceReady = [...harness.applyWorkingSetCalls];

		const restored = Event.toPromise(controller.onDidEndRestore);
		harness.workspaceFolders = [{ uri: URI.file('/c') }];
		harness.onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		await restored;

		assert.deepStrictEqual({
			beforeWorkspaceReady,
			loaded: harness.applyWorkingSetCalls,
			saved: harness.saveWorkingSetCalls,
			savedB: controller.getWorkingSet(URI.parse('session:b')),
		}, {
			beforeWorkspaceReady: [],
			loaded: [workingSetC],
			saved: ['session-working-set:session:a'],
			savedB: workingSetB,
		});
	});

	test('[B2] returning to A before B workspace resolves restores A instead of leaving a cancelled target', async () => {
		const controller = createController({ workspaceFolders: [{ uri: URI.file('/repo') }] });
		const sessionA = makeSession(URI.parse('session:a'));
		harness.activeSessionObs.set(sessionA, undefined);
		harness.visibleEditorsList = [{}];
		harness.activeSessionObs.set(makeSession(URI.parse('session:b'), {
			workspace: {
				uri: URI.file('/b'), label: 'B', icon: Codicon.repo,
				folders: [{ root: URI.file('/b'), workingDirectory: URI.file('/b'), name: 'B', description: undefined }],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			},
		}), undefined);
		const restored = Event.toPromise(controller.onDidEndRestore);
		harness.activeSessionObs.set(sessionA, undefined);
		await restored;

		assert.deepStrictEqual({
			loaded: harness.applyWorkingSetCalls,
			saved: harness.saveWorkingSetCalls,
			restoring: controller.isRestoring,
		}, {
			loaded: [{ id: 'session-working-set:session:a', name: 'session-working-set:session:a' }],
			saved: ['session-working-set:session:a'],
			restoring: false,
		});
	});

	test('[B2] disposing cancels deferred restores without loading editors or publishing a settled layout', async () => {
		const controller = createController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		const paint = new DeferredPromise<void>();
		const waitStarted = new DeferredPromise<CancellationToken>();
		harness.waitForSessionSwitchPaint = token => {
			void waitStarted.complete(token);
			return raceCancellation(paint.p, token);
		};
		let settled = 0;
		store.add(controller.onDidEndRestore(() => settled++));
		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		const token = await waitStarted.p;
		controller.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			loaded: harness.applyWorkingSetCalls,
			prepared: controller.preparedWorkingSets,
			restoring: controller.isRestoring,
			suppressionDepth: harness.editorPartAutoVisibilitySuppressionDepth,
			settled,
		}, {
			cancelled: true,
			loaded: [],
			prepared: [],
			restoring: false,
			suppressionDepth: 0,
			settled: 0,
		});
	});

	test('[B2] queued restores never start paint waits after controller disposal', async () => {
		const controller = createController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		const scheduler = createPaintScheduler();
		let paintWaits = 0;
		harness.waitForSessionSwitchPaint = token => {
			paintWaits++;
			return scheduler.wait(token);
		};
		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		controller.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			paintWaits,
			scheduler: scheduler.snapshot(),
			loaded: harness.applyWorkingSetCalls,
			restoring: controller.isRestoring,
		}, {
			paintWaits: 0,
			scheduler: { frames: 0, idle: 0, scheduledFrames: 0, scheduledIdle: 0 },
			loaded: [],
			restoring: false,
		});
	});

	test('[B2] disposing an in-flight restore releases suppression and drops queued targets', async () => {
		const controller = createController();
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		const applyStarted = new DeferredPromise<void>();
		const finishApply = new DeferredPromise<void>();
		harness.onApplyWorkingSet = async () => {
			await applyStarted.complete();
			await finishApply.p;
		};
		let settled = 0;
		store.add(controller.onDidEndRestore(() => settled++));
		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		await applyStarted.p;
		harness.activeSessionObs.set(makeSession(URI.parse('session:c')), undefined);
		controller.dispose();
		const suppressionAfterDispose = harness.editorPartAutoVisibilitySuppressionDepth;
		harness.setPartHiddenCalls = [];
		await finishApply.complete();
		await timeout(0);

		assert.deepStrictEqual({
			loaded: harness.applyWorkingSetCalls,
			suppressionAfterDispose,
			suppressionAfterSettle: harness.editorPartAutoVisibilitySuppressionDepth,
			lateLayoutChanges: harness.setPartHiddenCalls,
			settled,
		}, {
			loaded: ['empty'],
			suppressionAfterDispose: 0,
			suppressionAfterSettle: 0,
			lateLayoutChanges: [],
			settled: 0,
		});
	});

	test('[B2] a vetoed restore keeps its saved working set instead of capturing another session editors', async () => {
		const workingSetB = { id: 'ws-b', name: 'B' };
		const controller = createController({
			layoutState: [{ sessionResource: 'session:b', editorWorkingSet: workingSetB }],
		});
		harness.activeSessionObs.set(makeSession(URI.parse('session:a')), undefined);
		harness.visibleEditorsList = [{}];
		harness.onApplyWorkingSet = () => false;
		const restored = Event.toPromise(controller.onDidEndRestore);
		harness.activeSessionObs.set(makeSession(URI.parse('session:b')), undefined);
		await restored;
		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		assert.deepStrictEqual({
			saved: harness.saveWorkingSetCalls,
			savedB: controller.getWorkingSet(URI.parse('session:b')),
		}, {
			saved: ['session-working-set:session:a'],
			savedB: workingSetB,
		});
	});

	function createPaintScheduler() {
		const frames = new Set<() => void>();
		const idle = new Set<() => void>();
		let scheduledFrames = 0;
		let scheduledIdle = 0;
		const schedule = (queue: Set<() => void>, callback: () => void) => {
			queue.add(callback);
			return toDisposable(() => queue.delete(callback));
		};
		const runNext = (queue: Set<() => void>) => {
			const callback = [...queue][0];
			assert.ok(callback);
			queue.delete(callback);
			callback();
		};
		return {
			wait: (token: CancellationToken) => waitForSessionSwitchPaint(mainWindow, token, (_window, callback) => {
				scheduledFrames++;
				return schedule(frames, callback);
			}, (_window, callback) => {
				scheduledIdle++;
				return schedule(idle, () => callback({ didTimeout: false, timeRemaining: () => 50 }));
			}),
			runFrame: () => runNext(frames),
			runIdle: () => runNext(idle),
			snapshot: () => ({ frames: frames.size, idle: idle.size, scheduledFrames, scheduledIdle }),
		};
	}

	test('[B2] editor restoration resumes after a frame and idle callback, not before paint', async () => {
		const scheduler = createPaintScheduler();
		const events: string[] = [];
		const restored = scheduler.wait(CancellationToken.None).then(() => events.push('editors'));
		scheduler.runFrame();
		events.push('paint opportunity');
		await Promise.resolve();
		const beforeIdle = [...events];
		scheduler.runIdle();
		await restored;

		assert.deepStrictEqual({ beforeIdle, events, scheduler: scheduler.snapshot() }, {
			beforeIdle: ['paint opportunity'],
			events: ['paint opportunity', 'editors'],
			scheduler: { frames: 0, idle: 0, scheduledFrames: 1, scheduledIdle: 1 },
		});
	});

	for (const phase of ['before scheduling', 'before frame', 'before idle'] as const) {
		test(`[B2] cancelling ${phase} synchronously disposes the pending paint callbacks`, async () => {
			const scheduler = createPaintScheduler();
			const cancellation = store.add(new CancellationTokenSource());
			if (phase === 'before scheduling') {
				cancellation.cancel();
			}
			const restored = scheduler.wait(cancellation.token);
			if (phase === 'before idle') {
				scheduler.runFrame();
			}
			cancellation.cancel();
			const immediatelyAfterCancellation = scheduler.snapshot();
			await restored;

			const expected = {
				frames: 0,
				idle: 0,
				scheduledFrames: phase === 'before scheduling' ? 0 : 1,
				scheduledIdle: phase === 'before idle' ? 1 : 0,
			};
			assert.deepStrictEqual([immediatelyAfterCancellation, scheduler.snapshot()], [expected, expected]);
		});
	}

	// --- [B3] Persistence & migration / [B4] Save ---

	test('[B3] migrates legacy sessions.workingSets key and [B4] persists to sessions.layoutState', () => {
		const legacyData = JSON.stringify([{
			sessionResource: 'session:legacy',
			editorWorkingSet: { id: 'ws-1', name: 'ws-1' },
			auxiliaryBarState: { visible: false, activeViewContainerId: 'legacy.view' },
		}]);

		harness = createTestHarness(store);
		harness.storageService.store('sessions.workingSets', legacyData, StorageScope.WORKSPACE, 0);

		const controller = store.add(harness.instaService.createInstance(TestBaseLayoutController));

		assert.strictEqual(
			harness.storageService.get('sessions.workingSets', StorageScope.WORKSPACE),
			undefined,
			'legacy key should be removed after migration'
		);

		harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const newStored = harness.storageService.get('sessions.layoutState', StorageScope.WORKSPACE);
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
});
