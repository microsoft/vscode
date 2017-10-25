/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, CODE_WORKSPACE_PATH, VSCODE_BUILD } from '../../spectron/application';

describe('Multiroot', () => {
	let app: SpectronApplication = new SpectronApplication(void 0, CODE_WORKSPACE_PATH);
	if (app.build === VSCODE_BUILD.STABLE) {
		return;
	}

	before(() => app.start('Multi Root'));
	after(() => app.stop());

	it('shows results from all folders', async function () {
		await app.workbench.quickopen.openQuickOpen('*.*');

		await app.workbench.quickopen.waitForQuickOpenElements(names => names.length >= 6);
		await app.workbench.quickopen.closeQuickOpen();
	});

	it('shows workspace name in title', async function () {
		const title = await app.client.getTitle();
		await app.screenCapturer.capture('window title');
		assert.ok(title.indexOf('smoketest (Workspace)') >= 0);
	});
});