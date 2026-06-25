/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { BaseLayoutController } from '../../browser/baseSessionLayoutController.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeSession } from './layoutControllerTestUtils.js';

/** Concrete, behaviourless subclass so the abstract base (its view-state hook is a no-op) can be instantiated. */
class TestBaseLayoutController extends BaseLayoutController { }

suite('BaseLayoutController', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	function createController(options: ICreateOptions = {}): TestBaseLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(TestBaseLayoutController));
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
