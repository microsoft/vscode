/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, CODE_WORKSPACE_PATH, VSCODE_BUILD } from '../../spectron/application';
import { Window } from '../window';

describe('Multi Root', () => {
	let app: SpectronApplication = new SpectronApplication(void 0, CODE_WORKSPACE_PATH);
	if (app.build === VSCODE_BUILD.STABLE) {
		return;
	}

	before(() => app.start('Multi Root'));
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('shows results from all folders', async function () {
		await app.workbench.quickopen.openQuickOpen();

		await app.workbench.quickopen.type('*.*');

		await app.workbench.quickopen.waitForQuickOpenElements(6);
	});

	it('shows workspace name in title', async function () {
		const title = await new Window(app).getTitle();
		await app.screenCapturer.capture('window title');
		assert.ok(title.indexOf('smoketest (Workspace)') >= 0);
	});
});