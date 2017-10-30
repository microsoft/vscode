/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

describe('Multiroot', () => {

	before(async function () {
		this.app.suiteName = 'Multiroot';

		const app = this.app as SpectronApplication;

		await app.restart([app.workspaceFilePath]);

		// for some reason Code opens 2 windows at this point
		// so let's select the last one
		await app.client.windowByIndex(2);
	});

	it('shows results from all folders', async function () {
		const app = this.app as SpectronApplication;
		await app.workbench.quickopen.openQuickOpen('*.*');

		await app.workbench.quickopen.waitForQuickOpenElements(names => names.length >= 6);
		await app.workbench.quickopen.closeQuickOpen();
	});

	it('shows workspace name in title', async function () {
		const app = this.app as SpectronApplication;
		const title = await app.client.getTitle();
		await app.screenCapturer.capture('window title');
		assert.ok(title.indexOf('smoketest (Workspace)') >= 0);
	});
});