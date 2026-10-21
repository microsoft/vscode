/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { MobileLayoutController } from '../../browser/mobileSessionLayoutController.js';
import { createTestHarness, ICreateOptions, ITestLayoutHarness, makeChange, makeSession } from './layoutControllerTestUtils.js';

suite('MobileLayoutController', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	function createController(options: ICreateOptions = {}): MobileLayoutController {
		harness = createTestHarness(store, options);
		return store.add(harness.instaService.createInstance(MobileLayoutController));
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// --- [M2] No auxiliary-bar management ---

	test('[M2] does not manage the auxiliary bar for untitled or existing sessions', () => {
		createController();

		// Untitled session: the desktop controller would open the Files view here.
		const untitled = makeSession(URI.parse('session:untitled'), { status: SessionStatus.Untitled, changes: [makeChange('/file.ts')] });
		harness.activeSessionObs.set(untitled, undefined);

		// Existing session: the desktop controller would hide the aux bar here.
		const existing = makeSession(URI.parse('session:existing'));
		harness.activeSessionObs.set(existing, undefined);

		assert.strictEqual(harness.openedViews.length, 0, 'should never open a view in the auxiliary bar');
		assert.strictEqual(harness.openedViewContainers.length, 0, 'should never open a view container in the auxiliary bar');
		assert.ok(
			!harness.setPartHiddenCalls.some(c => c.part === Parts.AUXILIARYBAR_PART),
			'should never toggle the auxiliary bar visibility'
		);
	});

	test('[M2] ignores auxiliary bar maximize events', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));
		harness.activeSessionObs.set(session, undefined);

		harness.openedViews = [];
		harness.editorMaximized = true;
		harness.onDidChangeEditorMaximized.fire();

		assert.strictEqual(harness.openedViews.length, 0, 'maximizing the editor must not open the Changes view on mobile');
	});

	// --- [M1] Inherits base behaviour ---

	test('[M1] still hides the panel by default (base behaviour)', () => {
		createController();
		const session = makeSession(URI.parse('session:1'));

		harness.setPartHiddenCalls = [];
		harness.activeSessionObs.set(session, undefined);

		assert.ok(
			harness.setPartHiddenCalls.some(c => c.part === Parts.PANEL_PART && c.hidden === true),
			'panel should be hidden by default'
		);
	});
});
