/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, CODE_WORKSPACE_PATH } from '../../spectron/application';
import { QuickOpen } from '../quickopen/quickopen';
import { Window } from '../window';

describe('Multi Root', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [CODE_WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it('shows results from all folders', async function () {
		let quickOpen = new QuickOpen(app);
		await quickOpen.openQuickOpen();
		await app.type('*.*');
		const elements = await quickOpen.getQuickOpenElements();
		assert.equal(elements.length, 6);
	});

	it('shows workspace name in title', async function () {
		const title = await new Window(app).getTitle();
		assert.ok(title.indexOf('smoketest (Workspace)') >= 0);
	});
});