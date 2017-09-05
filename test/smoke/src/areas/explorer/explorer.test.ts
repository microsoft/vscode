/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

describe('Explorer', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it('quick open search produces correct result', async function () {
		await app.workbench.quickopen.openQuickOpen();
		await app.client.type('.js');
		const elements = await app.workbench.quickopen.getQuickOpenElements();
		await app.client.keys(['Escape', 'NULL']);

		assert.equal(elements.length, 7, 'There are 7 elements in quick open');
	});

	it('quick open respects fuzzy matching', async function () {
		await app.workbench.quickopen.openQuickOpen();
		await app.client.type('a.s');

		const elements = await app.workbench.quickopen.getQuickOpenElements();
		await app.client.keys(['Escape', 'NULL']);

		assert.equal(elements.length, 3, 'There are 3 elements in quick open');
	});
});